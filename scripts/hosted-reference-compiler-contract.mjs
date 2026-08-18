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
assert(functionText.includes('import { compareVideoAnalyses } from "@masterv/reference-compare"'), "hosted function must import canonical comparison compiler");
assert(functionText.includes('import { compileEvidenceRules } from "@masterv/evidence-rules"'), "hosted function must import canonical evidence compiler");
assert(functionText.includes('req.method === "POST"'), "hosted compiler POST boundary missing");
assert(functionText.includes('body.operation === "reference_workflow"'), "hosted compiler operation dispatch missing");
assert(functionText.includes('const workspaceId = `user:${userId}`'), "hosted workspace must derive from authenticated JWT subject");
assert(functionText.includes('/rest/v1/reference_library_entries'), "hosted compiler must read persisted Reference Library rows");
assert(functionText.includes('params.set("workspace_id", `eq.${workspaceId}`)'), "hosted persisted read must scope workspace");
assert(functionText.includes('params.set("source_id", `eq.${sourceId}`)'), "hosted persisted read must scope source id");
assert(functionText.includes('comparison: "canonical"'), "hosted response must identify canonical comparison authority");
assert(functionText.includes('evidence: "canonical"'), "hosted response must identify canonical evidence authority");
assert(!functionText.includes("service_role"), "hosted compiler must not introduce service-role authority");
const referenceStart = functionText.indexOf("async function compileReferenceWorkflow");
const referenceEnd = functionText.indexOf("async function discoverYouTube", referenceStart);
const referenceBlock = functionText.slice(referenceStart, referenceEnd);
assert(referenceStart >= 0 && referenceEnd > referenceStart, "reference compiler function block missing");
assert(!referenceBlock.includes("YOUTUBE_DATA_API_KEY"), "reference compiler operation must remain independent from YouTube credentials");
assert(!referenceBlock.includes("GEMINI_API_KEY"), "reference compiler operation must remain independent from Gemini credentials");
assert(!referenceBlock.includes("discoverYouTubeCandidatesWithKey"), "reference compiler operation must remain independent from YouTube discovery");
assert(!referenceBlock.includes("analyzeYouTubeVideoWithKey"), "reference compiler operation must remain independent from Deep Analysis compute");

const appText = fs.readFileSync("desktop/app.js", "utf8");
const remoteText = fs.readFileSync("desktop/backend/legacy/hosted-api-client.js", "utf8");
assert(appText.includes("backend.remoteOperations.compileReferenceWorkflow(session, sourceIds)"), "desktop compare must delegate canonical workflow through RemoteOperationClient");
assert(!appText.includes("masterv-api-boundary"), "desktop app consumer must not own hosted endpoint");
assert(!appText.includes('operation: "reference_workflow"'), "desktop app consumer must not own hosted operation transport payload");
const hostedStart = remoteText.indexOf("async function compileReferenceWorkflow");
const hostedEnd = remoteText.indexOf("async function discoverYouTube", hostedStart);
const hostedBlock = remoteText.slice(hostedStart, hostedEnd);
assert(hostedStart >= 0 && hostedEnd > hostedStart, "legacy hosted compiler adapter function missing");
assert(hostedBlock.includes('requestBoundary(session, "POST"'), "legacy hosted compiler request must use POST");
assert(hostedBlock.includes('operation: "reference_workflow"'), "legacy hosted compiler operation missing");
assert(hostedBlock.includes("source_ids: sourceIds"), "legacy hosted compiler must send selected canonical source ids");
assert(!hostedBlock.includes("workspace_id"), "desktop transport must not send workspace authority");
assert(!hostedBlock.includes("analysis:"), "desktop transport must not send raw analysis payload");
const compareStart = appText.indexOf("async function loadReferenceComparison");
const compareEnd = appText.indexOf("async function deleteReferenceLibraryEntry", compareStart);
const compareBlock = appText.slice(compareStart, compareEnd);
assert(compareBlock.includes("sourceIds.length < 2"), "desktop canonical compare must require at least two references");
assert(compareBlock.includes("backend.remoteOperations.compileReferenceWorkflow(session, sourceIds)"), "desktop compare must invoke provider canonical workflow");
assert(!compareBlock.includes("fetchReferenceDetail"), "desktop compare must not load raw persisted analysis directly");
assert(!compareBlock.includes("Promise.all"), "desktop compare must not fan out raw detail reads");
assert(!appText.includes("compareVideoAnalyses("), "canonical comparison implementation must not be copied into desktop app");
assert(!appText.includes("compileEvidenceRules("), "canonical evidence implementation must not be copied into desktop app");
assert(appText.includes('comparePanel.dataset.compiler = "hosted-canonical"'), "desktop compare runtime authority marker missing");
assert(appText.includes('dataset.compilerAuthority = "canonical"'), "desktop rendered compiler authority marker missing");
assert(appText.includes("ruleSet.rules"), "desktop must render deterministic evidence rules");
console.log(JSON.stringify({ status: "MASTERV_HOSTED_REFERENCE_COMPILER_CONTRACT_PASS", canonical_source_commit: SOURCE_COMMIT, canonical_blob_count: Object.keys(expectedBlobs).length, workspace_authority: "jwt-derived", persisted_read_authority: "user-jwt-rls", desktop_compare_raw_analysis_fetch: false, desktop_transport_owner: "remote-operation-provider", comparison_compiler: "canonical", evidence_compiler: "canonical", reference_operation_provider_credentials_required: false }));
