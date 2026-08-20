import crypto from "node:crypto";
import fs from "node:fs";

function assert(condition, message) { if (!condition) throw new Error(message); }
const SOURCE_COMMIT = "796e0469b20159f6057d625d0f03d33478a8767e";
const expectedBlobs = {
  "lib/analysis-schema.ts": "5292023ee739488f9d0d29b96c4c01717abd3956",
  "lib/derived-metrics.ts": "f9d51039d0d746954da38c26bdacded819361167",
  "lib/reference-compare.ts": "705732247718ec191fbc24c5613608d9737e93ce",
  "lib/evidence-rules.ts": "8dcfaa54b34246e8c163dfed68ceaedbca076913"
};
function gitBlobSha(path) { const body = fs.readFileSync(path); return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex"); }
for (const [path, expected] of Object.entries(expectedBlobs)) assert(gitBlobSha(path) === expected, `${path} changed without updating hosted canonical source pin`);
const deno = JSON.parse(fs.readFileSync("supabase/functions/masterv-api-boundary/deno.json", "utf8"));
const imports = deno.imports || {};
for (const path of Object.keys(expectedBlobs)) { const filename = path.split("/").at(-1); assert(Object.values(imports).some((value) => typeof value === "string" && value.includes(`/${SOURCE_COMMIT}/${path}`)), `deno import pin missing canonical ${filename}`); }
const functionText = fs.readFileSync("supabase/functions/masterv-api-boundary/index.ts", "utf8");
assert(functionText.includes('import { compareVideoAnalyses } from "@masterv/reference-compare"'), "legacy hosted function must retain canonical comparison compiler during 0.1.2 migration bridge");
assert(functionText.includes('import { compileEvidenceRules } from "@masterv/evidence-rules"'), "legacy hosted function must retain canonical evidence compiler during 0.1.2 migration bridge");
assert(functionText.includes('req.method === "POST"'), "legacy hosted compiler POST boundary missing");
assert(functionText.includes('body.operation === "reference_workflow"'), "legacy hosted compiler operation dispatch missing");
assert(functionText.includes('const workspaceId = `user:${userId}`'), "legacy hosted workspace must derive from authenticated JWT subject");
assert(functionText.includes('/rest/v1/reference_library_entries'), "legacy hosted compiler must read persisted Reference Library rows");
assert(functionText.includes('params.set("workspace_id", `eq.${workspaceId}`)'), "legacy hosted persisted read must scope workspace");
assert(functionText.includes('params.set("source_id", `eq.${sourceId}`)'), "legacy hosted persisted read must scope source id");
assert(functionText.includes('comparison: "canonical"'), "legacy hosted response must identify canonical comparison authority");
assert(functionText.includes('evidence: "canonical"'), "legacy hosted response must identify canonical evidence authority");
assert(!functionText.includes("service_role"), "legacy hosted compiler must not introduce service-role authority");
const referenceStart = functionText.indexOf("async function compileReferenceWorkflow");
const referenceEnd = functionText.indexOf("async function discoverYouTube", referenceStart);
const referenceBlock = functionText.slice(referenceStart, referenceEnd);
assert(referenceStart >= 0 && referenceEnd > referenceStart, "legacy hosted reference compiler function block missing");
assert(!referenceBlock.includes("YOUTUBE_DATA_API_KEY"), "legacy reference compiler operation must remain independent from YouTube credentials");
assert(!referenceBlock.includes("GEMINI_API_KEY"), "legacy reference compiler operation must remain independent from Gemini credentials");
assert(!referenceBlock.includes("discoverYouTubeCandidatesWithKey"), "legacy reference compiler operation must remain independent from YouTube discovery");
assert(!referenceBlock.includes("analyzeYouTubeVideoWithKey"), "legacy reference compiler operation must remain independent from Deep Analysis compute");

const appText = fs.readFileSync("desktop/app.js", "utf8");
const transitionText = fs.readFileSync("desktop/backend/bridge/transition-provider.js", "utf8");
const remoteText = fs.readFileSync("desktop/backend/legacy/hosted-api-client.js", "utf8");
assert(appText.includes("backend.remoteOperations.compileReferenceWorkflow(null, sourceIds)"), "EXIT-2C desktop compare must delegate through the provider boundary without requiring a Gateway session");
assert(!appText.includes("masterv-api-boundary"), "desktop app consumer must not own hosted endpoint");
assert(!appText.includes('operation: "reference_workflow"'), "desktop app consumer must not own hosted operation transport payload");
assert(appText.includes('comparePanel.dataset.compiler = "local-canonical"'), "desktop compare runtime authority must be local canonical");
assert(appText.includes('dataset.compilerAuthority = "local-canonical"'), "desktop rendered compiler authority marker must be local canonical");
assert(appText.includes("ruleSet.rules"), "desktop must render deterministic evidence rules");
assert(!appText.includes("compareVideoAnalyses("), "canonical comparison implementation must not be copied into desktop app");
assert(!appText.includes("compileEvidenceRules("), "canonical evidence implementation must not be copied into desktop app");

const transitionStart = transitionText.indexOf("async compileReferenceWorkflow");
const transitionEnd = transitionText.indexOf("discoverYouTube(activeSession", transitionStart);
const transitionBlock = transitionText.slice(transitionStart, transitionEnd);
assert(transitionStart >= 0 && transitionEnd > transitionStart, "EXIT-2C local reference compiler provider block missing");
assert(transitionBlock.includes("localWorkData.bootstrapPersonalWorkspace(null)"), "EXIT-2C compare must resolve the Local SQLite workspace");
assert(transitionBlock.includes("localWorkData.fetchReferenceDetail(null, workspaceId, sourceId)"), "EXIT-2C compare must read selected analyses from Local SQLite");
assert(transitionBlock.includes("requireCompiler().compile(records)"), "EXIT-2C compare must invoke the local canonical Compare/Evidence compiler");
assert(transitionBlock.includes("localWorkData.saveComparisonEntry"), "EXIT-2C compare must persist comparison output to Local SQLite");
assert(transitionBlock.includes("gateway_requests: 0"), "EXIT-2C compare must declare zero Gateway requests");
assert(!transitionBlock.includes("gatewayRemote."), "EXIT-2C compare must not call the Gateway");
assert(!transitionBlock.includes("legacyRemote."), "EXIT-2C compare must not call legacy hosted runtime");
assert(!transitionBlock.includes("requireGatewaySession"), "EXIT-2C local compare must remain available without paid Gateway entitlement");

const hostedStart = remoteText.indexOf("async function compileReferenceWorkflow");
const hostedEnd = remoteText.indexOf("async function discoverYouTube", hostedStart);
const hostedBlock = remoteText.slice(hostedStart, hostedEnd);
assert(hostedStart >= 0 && hostedEnd > hostedStart, "0.1.2 legacy hosted compiler adapter function missing");
assert(hostedBlock.includes('requestBoundary(session, "POST"'), "legacy hosted compiler request must use POST");
assert(hostedBlock.includes('operation: "reference_workflow"'), "legacy hosted compiler operation missing");
assert(hostedBlock.includes("source_ids: sourceIds"), "legacy hosted compiler must send selected canonical source ids");
assert(!hostedBlock.includes("workspace_id"), "legacy desktop transport must not send workspace authority");
assert(!hostedBlock.includes("analysis:"), "legacy desktop transport must not send raw analysis payload");

console.log(JSON.stringify({
  status: "MASTERV_HOSTED_REFERENCE_COMPILER_CONTRACT_PASS",
  canonical_source_commit: SOURCE_COMMIT,
  canonical_blob_count: Object.keys(expectedBlobs).length,
  legacy_hosted_compiler_retained_for_0_1_2: true,
  visible_desktop_compare_authority: "local-canonical",
  visible_desktop_persistence_authority: "local-sqlite",
  visible_desktop_gateway_requests: 0,
  local_compare_subscription_gated: false,
  desktop_transport_owner: "provider-boundary",
  comparison_compiler: "canonical",
  evidence_compiler: "canonical",
  provider_credentials_required_for_visible_compare: false
}));
