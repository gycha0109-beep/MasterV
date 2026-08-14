import type { VideoAnalysis } from "../lib/analysis-schema";
import { SupabaseReferenceLibraryStore } from "../lib/reference-library-supabase";
import { buildAnalysisCacheKey } from "../lib/tiered-analysis";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeAnalysis(label: string): VideoAnalysis {
  return {
    summary: `${label} summary`,
    structure_label: `${label} structure`,
    duration_seconds: 8,
    hook: { type: "hook", text: "", visual: "", duration_seconds: 1 },
    product_presentation: {
      first_seen_seconds: 1,
      demonstration_present: true,
      before_after_present: false,
      comparison_present: false,
      result_visual_present: false,
      face_present: false,
      hand_present: true
    },
    persuasion: {
      problem: "",
      solution: "",
      benefit: "",
      proof: "",
      social_proof: "",
      offer: "",
      cta: "",
      emotional_trigger: ""
    },
    presentation: {
      format: "",
      presenter_type: "",
      caption_style: "",
      visual_style: "",
      music_role: ""
    },
    transcript: { full: "", segments: [] },
    scenes: [],
    observation_segments: [],
    tags: [],
    confidence_notes: []
  };
}

function deepKey(sourceId: string) {
  return buildAnalysisCacheKey({
    provider: "youtube",
    source_id: sourceId,
    analyzer_tier: "deep",
    schema_version: "deep-v2",
    prompt_version: "deep-prompt-v5",
    model: "gemini-test",
    media_resolution: "default"
  });
}

const analysis = makeAnalysis("persisted");
const row = {
  workspace_id: "workspace:owner",
  source_platform: "youtube",
  source_id: "yt:abc123",
  native_id: "abc123",
  canonical_url: "https://www.youtube.com/watch?v=abc123",
  label: "Saved reference",
  analysis,
  analysis_cache_key: deepKey("yt:abc123"),
  analysis_provenance: "live",
  schema_version: "reference-library-v1",
  revision: 2,
  first_saved_at: "2026-08-14T00:00:00.000Z",
  updated_at: "2026-08-14T01:00:00.000Z"
} as const;

type CapturedRequest = { url: string; init: RequestInit };

async function run() {
  const calls: CapturedRequest[] = [];
  const fakeFetch: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const method = init.method ?? "GET";

    if (method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      assert(body.workspace_id === "workspace:owner", "upsert should send workspace scope");
      assert(body.source_id === "yt:abc123", "upsert should send canonical source id");
      assert(body.canonical_url === "https://www.youtube.com/watch?v=abc123", "upsert should canonicalize URL");
      assert(!("revision" in body), "revision must remain database-owned");
      assert(!("first_saved_at" in body), "first_saved_at must remain database-owned");
      assert(!("updated_at" in body), "updated_at must remain database-owned");
      assert(!("derived_metrics" in body), "derived metrics must not be persisted");
      return Response.json([row], { status: 201 });
    }

    if (method === "DELETE") return Response.json([row], { status: 200 });
    return Response.json([row], { status: 200 });
  };

  const store = new SupabaseReferenceLibraryStore({
    project_url: "https://example-project.supabase.co/",
    api_key: "publishable-test-key",
    access_token: "user-access-token",
    fetch_impl: fakeFetch
  });

  const listed = await store.list("workspace:owner");
  assert(listed.length === 1, "list should map one row");
  assert(listed[0].revision === 2, "list should preserve database revision");
  assert(listed[0].source.source_id === "yt:abc123", "list should map canonical identity");

  const fetched = await store.get("workspace:owner", "yt:abc123");
  assert(fetched?.source.native_id === "abc123", "get should map native id");

  const saved = await store.upsert({
    workspace_id: "workspace:owner",
    url: "https://youtu.be/abc123?si=test",
    label: "Saved reference",
    analysis,
    analysis_cache_key: deepKey("yt:abc123"),
    analysis_provenance: "live"
  });
  assert(saved.revision === 2, "upsert should trust database-owned revision result");

  assert(await store.delete("workspace:owner", "yt:abc123"), "delete should report returned row");
  assert(calls.length === 4, "contract should issue exactly four REST requests");

  for (const call of calls) {
    const headers = new Headers(call.init.headers);
    assert(headers.get("apikey") === "publishable-test-key", "request should send configured API key");
    assert(headers.get("authorization") === "Bearer user-access-token", "request should send authenticated bearer token");
    assert(call.url.startsWith("https://example-project.supabase.co/rest/v1/reference_library_entries?"), "request should stay on project REST endpoint");
  }

  assert(calls[0].url.includes("workspace_id=eq.%3A") === false, "workspace filter must retain full workspace value");
  assert(calls[0].url.includes("workspace_id=eq.workspace%3Aowner"), "workspace filter should be encoded by URLSearchParams");
  assert(calls[2].url.includes("on_conflict=workspace_id%2Csource_id"), "upsert should target natural-key conflict columns");
  assert(new Headers(calls[2].init.headers).get("prefer") === "resolution=merge-duplicates,return=representation", "upsert should request atomic merge and returned row");

  let exposedSecret = false;
  const failingStore = new SupabaseReferenceLibraryStore({
    project_url: "https://example-project.supabase.co",
    api_key: "secret-api-key",
    access_token: "secret-access-token",
    fetch_impl: async () => Response.json({ code: "42501", message: "permission denied" }, { status: 403 })
  });
  try {
    await failingStore.list("workspace:owner");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    exposedSecret = message.includes("secret-api-key") || message.includes("secret-access-token");
    assert(/42501/.test(message) && /permission denied/.test(message), "Supabase error should preserve safe upstream diagnostics");
  }
  assert(!exposedSecret, "Supabase errors must not expose configured credentials");

  console.log("SUPABASE_REFERENCE_LIBRARY_CONTRACT_PASS");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
