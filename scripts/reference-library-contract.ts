import type { VideoAnalysis } from "../lib/analysis-schema";
import {
  InMemoryReferenceLibraryStore,
  REFERENCE_LIBRARY_SCHEMA_VERSION,
  createReferenceLibraryRecord,
  parseDeepAnalysisCacheKey,
  referenceLibraryRecordToComparisonInput
} from "../lib/reference-library";
import { buildAnalysisCacheKey } from "../lib/tiered-analysis";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => unknown, pattern: RegExp, message: string) {
  try {
    run();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (pattern.test(text)) return;
    throw new Error(`${message}: unexpected error: ${text}`);
  }
  throw new Error(`${message}: expected error`);
}

function makeAnalysis(label: string): VideoAnalysis {
  return {
    summary: `${label} summary`,
    structure_label: `${label} structure`,
    duration_seconds: 10,
    hook: { type: "훅", text: "", visual: "", duration_seconds: 2 },
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

function deepKey(sourceId: string, model = "gemini-test") {
  return buildAnalysisCacheKey({
    provider: "youtube",
    source_id: sourceId,
    analyzer_tier: "deep",
    schema_version: "deep-v2",
    prompt_version: "deep-prompt-v5",
    model,
    media_resolution: "default"
  });
}

const parsed = parseDeepAnalysisCacheKey(deepKey("yt:abc123"));
assert(parsed.provider === "youtube", "cache key provider should parse");
assert(parsed.source_id === "yt:abc123", "encoded source_id should decode");
assert(parsed.analyzer_tier === "deep", "deep tier should parse");

assertThrows(
  () => parseDeepAnalysisCacheKey(buildAnalysisCacheKey({
    provider: "youtube",
    source_id: "yt:abc123",
    analyzer_tier: "coarse",
    schema_version: "coarse-v2",
    prompt_version: "coarse-prompt-v1",
    model: "gemini-test",
    media_resolution: "default"
  })),
  /deep analysis snapshot/,
  "coarse cache keys must not enter the reference library"
);

const first = createReferenceLibraryRecord({
  workspace_id: "workspace:test",
  url: "https://www.youtube.com/shorts/abc123?feature=share",
  label: "첫 저장",
  analysis: makeAnalysis("first"),
  analysis_cache_key: deepKey("yt:abc123"),
  analysis_provenance: "live",
  now: new Date("2026-08-14T00:00:00.000Z")
});

assert(first.schema_version === REFERENCE_LIBRARY_SCHEMA_VERSION, "schema version should freeze");
assert(first.source.source_id === "yt:abc123", "shorts URL should canonicalize to source_id");
assert(first.source.canonical_url === "https://www.youtube.com/watch?v=abc123", "URL should canonicalize");
assert(first.revision === 1, "first save should be revision 1");
assert(!("derived_metrics" in first), "derived metrics must not be persisted in reference record");

assertThrows(
  () => createReferenceLibraryRecord({
    workspace_id: "workspace:test",
    url: "https://www.youtube.com/watch?v=abc123",
    analysis: makeAnalysis("bad"),
    analysis_cache_key: deepKey("yt:different"),
    analysis_provenance: "cache"
  }),
  /source identity.*cache key/,
  "cache key/source mismatch must fail"
);

assertThrows(
  () => createReferenceLibraryRecord({
    workspace_id: "bad workspace",
    url: "https://www.youtube.com/watch?v=abc123",
    analysis: makeAnalysis("bad-workspace"),
    analysis_cache_key: deepKey("yt:abc123"),
    analysis_provenance: "cache"
  }),
  /workspace_id 형식/,
  "workspace id must be constrained"
);

async function run() {
  const store = new InMemoryReferenceLibraryStore();

  const saved1 = await store.upsert({
    workspace_id: "workspace:a",
    url: "https://youtu.be/abc123",
    label: "A old",
    analysis: makeAnalysis("old"),
    analysis_cache_key: deepKey("yt:abc123", "gemini-old"),
    analysis_provenance: "cache",
    now: new Date("2026-08-14T01:00:00.000Z")
  });
  assert(saved1.revision === 1, "initial upsert should use revision 1");

  const saved2 = await store.upsert({
    workspace_id: "workspace:a",
    url: "https://www.youtube.com/watch?v=abc123&utm_source=test",
    label: "A refreshed",
    analysis: makeAnalysis("refreshed"),
    analysis_cache_key: deepKey("yt:abc123", "gemini-new"),
    analysis_provenance: "live",
    now: new Date("2026-08-14T02:00:00.000Z")
  });

  assert(saved2.revision === 2, "same canonical source should update one record");
  assert(saved2.first_saved_at === "2026-08-14T01:00:00.000Z", "first_saved_at must be preserved");
  assert(saved2.updated_at === "2026-08-14T02:00:00.000Z", "updated_at must advance");
  assert(saved2.analysis.structure_label === "refreshed structure", "latest analysis snapshot should replace old snapshot");
  assert(saved2.analysis_provenance === "live", "latest provenance should replace old provenance");

  await store.upsert({
    workspace_id: "workspace:a",
    url: "https://www.youtube.com/watch?v=second456",
    label: "B",
    analysis: makeAnalysis("second"),
    analysis_cache_key: deepKey("yt:second456"),
    analysis_provenance: "replay",
    now: new Date("2026-08-14T03:00:00.000Z")
  });

  const listA = await store.list("workspace:a");
  assert(listA.length === 2, "workspace A should contain two canonical sources");
  assert(listA[0].source.source_id === "yt:second456", "list should sort newest update first");
  assert(listA[1].source.source_id === "yt:abc123", "updated source should remain unique");

  await store.upsert({
    workspace_id: "workspace:b",
    url: "https://www.youtube.com/watch?v=abc123",
    label: "same video different workspace",
    analysis: makeAnalysis("isolated"),
    analysis_cache_key: deepKey("yt:abc123"),
    analysis_provenance: "cache",
    now: new Date("2026-08-14T04:00:00.000Z")
  });
  assert((await store.list("workspace:b")).length === 1, "workspace B should be isolated");
  assert((await store.list("workspace:a")).length === 2, "workspace B must not alter workspace A");

  const fetched = await store.get("workspace:a", "yt:abc123");
  assert(fetched, "saved record should be retrievable");
  fetched.analysis.summary = "mutated caller copy";
  const fetchedAgain = await store.get("workspace:a", "yt:abc123");
  assert(fetchedAgain?.analysis.summary === "refreshed summary", "store must not expose mutable internal records");

  const comparisonInput = referenceLibraryRecordToComparisonInput(saved2);
  assert(comparisonInput.id === "yt:abc123", "comparison input must use canonical source_id");
  assert(comparisonInput.url === "https://www.youtube.com/watch?v=abc123", "comparison input must use canonical URL");
  assert(comparisonInput.label === "A refreshed", "comparison label should be preserved");

  assert(await store.delete("workspace:a", "yt:abc123"), "scoped delete should remove existing record");
  assert(!(await store.delete("workspace:a", "yt:abc123")), "second delete should report missing record");
  assert((await store.list("workspace:b")).length === 1, "delete in workspace A must not affect workspace B");

  console.log("reference library contract: PASS");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
