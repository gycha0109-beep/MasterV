import type { VideoAnalysis } from "../lib/analysis-schema";
import { DEEP_MEDIA_RESOLUTION, DEEP_PROMPT_VERSION, DEEP_SCHEMA_VERSION } from "../lib/analysis-versions";
import { bootstrapPersonalReferenceWorkspace, createSessionReferenceLibraryStore } from "../lib/reference-library-session";
import { signInWithPassword, type SupabasePublicConfig } from "../lib/supabase-auth";
import { canonicalizeYouTubeSource } from "../lib/source-identity";
import { buildAnalysisCacheKey } from "../lib/tiered-analysis";
import fs from "node:fs/promises";
import path from "node:path";

function required(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeAnalysis(label: string): VideoAnalysis {
  return {
    summary: `${label} synthetic persistence smoke`,
    structure_label: "hook → demo → CTA",
    duration_seconds: 12,
    hook: { type: "visual", text: "", visual: "synthetic", duration_seconds: 2 },
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
    tags: ["synthetic-smoke"],
    confidence_notes: ["Synthetic persistence smoke fixture; not a real video analysis."]
  };
}

async function writeArtifact(payload: Record<string, unknown>) {
  const target = path.resolve("artifacts/reference-library-live-smoke.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(payload, null, 2));
}

async function verifyHostedBoundary(config: SupabasePublicConfig, accessToken: string) {
  const response = await fetch(`${config.project_url.replace(/\/+$/, "")}/functions/v1/masterv-api-boundary`, {
    method: "GET",
    headers: {
      apikey: config.publishable_key,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const body = await response.json() as {
    service?: string;
    contract_version?: string;
    authenticated?: boolean;
    capabilities?: Record<string, boolean>;
  };
  assert(response.status === 200, `hosted API boundary must return 200, got ${response.status}`);
  assert(body.service === "masterv-hosted-api", "hosted API service identity mismatch");
  assert(body.contract_version === "mv-hosted-api-v1", "hosted API contract version mismatch");
  assert(body.authenticated === true, "hosted API must report authenticated boundary");
  assert(body.capabilities?.boundary_probe === true, "hosted API boundary probe capability missing");
  assert(body.capabilities?.analyze === false, "Deep analyze must not be claimed migrated in 3A");
  assert(body.capabilities?.youtube_discovery === false, "YouTube discovery must not be claimed migrated in 3A");
  return true;
}

async function run() {
  const config: SupabasePublicConfig = {
    project_url: required("NEXT_PUBLIC_SUPABASE_URL"),
    publishable_key: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  };
  const session = await signInWithPassword(
    config,
    required("SUPABASE_TEST_EMAIL"),
    required("SUPABASE_TEST_PASSWORD")
  );
  const workspaceId = await bootstrapPersonalReferenceWorkspace(config, session);
  const store = createSessionReferenceLibraryStore(config, session);
  const mode = process.env.REFERENCE_LIBRARY_SMOKE_MODE?.trim().toLowerCase() || "seed";
  const url = "https://www.youtube.com/watch?v=MVpersist01";
  const source = canonicalizeYouTubeSource(url);
  const cacheKey = buildAnalysisCacheKey({
    provider: "youtube",
    source_id: source.source_id,
    analyzer_tier: "deep",
    schema_version: DEEP_SCHEMA_VERSION,
    prompt_version: DEEP_PROMPT_VERSION,
    model: "persistence-smoke-v1",
    media_resolution: DEEP_MEDIA_RESOLUTION
  });

  if (mode === "cleanup") {
    const removed = await store.delete(workspaceId, source.source_id);
    await writeArtifact({ status: "REFERENCE_LIBRARY_LIVE_CLEANUP", removed, source_id: source.source_id });
    console.log(JSON.stringify({ status: "REFERENCE_LIBRARY_LIVE_CLEANUP", removed, source_id: source.source_id }));
    return;
  }

  const hostedBoundaryVerified = await verifyHostedBoundary(config, session.access_token);

  await store.delete(workspaceId, source.source_id);
  const first = await store.upsert({
    workspace_id: workspaceId,
    url,
    label: "Persistence smoke v1",
    analysis: makeAnalysis("v1"),
    analysis_cache_key: cacheKey,
    analysis_provenance: "replay"
  });
  assert(first.revision === 1, `first live save revision must be 1, got ${first.revision}`);

  const second = await store.upsert({
    workspace_id: workspaceId,
    url,
    label: "Persistence smoke v2",
    analysis: makeAnalysis("v2"),
    analysis_cache_key: cacheKey,
    analysis_provenance: "replay"
  });
  assert(second.revision === 2, `second live save revision must be 2, got ${second.revision}`);
  assert(second.first_saved_at === first.first_saved_at, "first_saved_at must survive DB upsert revision");
  assert(second.updated_at >= first.updated_at, "updated_at must advance or remain monotonic");

  const listed = await store.list(workspaceId);
  const found = listed.find((record) => record.source.source_id === source.source_id);
  assert(found?.revision === 2, "live list must return persisted revision 2 record");

  const foreignWorkspaceId = "user:00000000-0000-0000-0000-000000000000";
  let crossWorkspaceWriteDenied = false;
  try {
    await store.upsert({
      workspace_id: foreignWorkspaceId,
      url,
      label: "must be denied",
      analysis: makeAnalysis("denied"),
      analysis_cache_key: cacheKey,
      analysis_provenance: "replay"
    });
  } catch {
    crossWorkspaceWriteDenied = true;
  }
  assert(crossWorkspaceWriteDenied, "RLS must deny writes to an unowned workspace");

  const payload = {
    status: "REFERENCE_LIBRARY_LIVE_SMOKE_PASS",
    workspace_id: workspaceId,
    source_id: source.source_id,
    revision: second.revision,
    first_saved_at_preserved: second.first_saved_at === first.first_saved_at,
    cross_workspace_write_denied: crossWorkspaceWriteDenied,
    hosted_api_boundary_verified: hostedBoundaryVerified,
    hosted_api_contract_version: "mv-hosted-api-v1",
    hosted_api_analyze_migrated: false,
    hosted_api_youtube_discovery_migrated: false,
    gemini_requests_executed: 0,
    youtube_requests_executed: 0
  };
  await writeArtifact(payload);
  console.log(JSON.stringify(payload));
}

run().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await writeArtifact({ status: "REFERENCE_LIBRARY_LIVE_SMOKE_FAIL", error: message }).catch(() => undefined);
  console.error(message);
  process.exitCode = 1;
});
