import crypto from "node:crypto";
import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const SOURCE_COMMIT = "796e0469b20159f6057d625d0f03d33478a8767e";
const expectedBlobs = {
  "lib/analysis-schema.ts": "5292023ee739488f9d0d29b96c4c01717abd3956",
  "lib/derived-metrics.ts": "f9d51039d0d746954da38c26bdacded819361167",
  "lib/reference-compare.ts": "705732247718ec191fbc24c5613608d9737e93ce",
  "lib/evidence-rules.ts": "8dcfaa54b34246e8c163dfed68ceaedbca076913"
};

function gitBlobSha(path) {
  const body = fs.readFileSync(path);
  return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex");
}

for (const [path, expected] of Object.entries(expectedBlobs)) {
  assert(gitBlobSha(path) === expected, `${path} changed without updating hosted canonical source pin`);
}

const deno = JSON.parse(fs.readFileSync("supabase/functions/masterv-api-boundary/deno.json", "utf8"));
const imports = deno.imports || {};
for (const path of Object.keys(expectedBlobs)) {
  const filename = path.split("/").at(-1);
  assert(Object.values(imports).some((value) => typeof value === "string" && value.includes(`/${SOURCE_COMMIT}/${path}`)), `deno import pin missing canonical ${filename}`);
}

const functionText = fs.readFileSync("supabase/functions/masterv-api-boundary/index.ts", "utf8");
assert(functionText.includes('import { compareVideoAnalyses } from "@masterv/reference-compare"'), "hosted function must import canonical comparison compiler");
assert(functionText.includes('import { compileEvidenceRules } from "@masterv/evidence-rules"'), "hosted function must import canonical evidence compiler");
assert(functionText.includes('req.method === "POST"'), "hosted compiler POST boundary missing");
assert(functionText.includes('body.operation !== "reference_workflow"'), "hosted compiler operation guard missing");
assert(functionText.includes('const workspaceId = `user:${userId}`'), "hosted workspace must derive from authenticated JWT subject");
assert(functionText.includes('/rest/v1/reference_library_entries'), "hosted compiler must read persisted Reference Library rows");
assert(functionText.includes('params.set("workspace_id", `eq.${workspaceId}`)'), "hosted persisted read must scope workspace");
assert(functionText.includes('params.set("source_id", `eq.${sourceId}`)'), "hosted persisted read must scope source id");
assert(functionText.includes('comparison: "canonical"'), "hosted response must identify canonical comparison authority");
assert(functionText.includes('evidence: "canonical"'), "hosted response must identify canonical evidence authority");
assert(!functionText.includes("service_role"), "hosted compiler must not introduce service-role authority");
assert(!functionText.includes("GEMINI_API_KEY"), "hosted compiler must not depend on Gemini credentials");
assert(!functionText.includes("YOUTUBE_DATA_API_KEY"), "hosted compiler must not depend on YouTube credentials");

const appText = fs.readFileSync("desktop/app.js", "utf8");
assert(appText.includes("async function compileHostedReferenceWorkflow"), "desktop hosted compiler client missing");
const hostedStart = appText.indexOf("async function compileHostedReferenceWorkflow");
const hostedEnd = appText.indexOf("async function loadReferenceLibrary", hostedStart);
const hostedBlock = appText.slice(hostedStart, hostedEnd);
assert(hostedBlock.includes('method: "POST"'), "desktop compiler request must use POST");
assert(hostedBlock.includes('operation: "reference_workflow"'), "desktop compiler operation missing");
assert(hostedBlock.includes("source_ids: sourceIds"), "desktop compiler must send selected canonical source ids");
assert(!hostedBlock.includes("workspace_id"), "desktop compiler request must not send workspace authority");
assert(!hostedBlock.includes("analysis:"), "desktop compiler request must not send raw analysis payload");

const compareStart = appText.indexOf("async function loadReferenceComparison");
const compareEnd = appText.indexOf("async function deleteReferenceLibraryEntry", compareStart);
const compareBlock = appText.slice(compareStart, compareEnd);
assert(compareBlock.includes("sourceIds.length < 2"), "desktop canonical compare must require at least two references");
assert(compareBlock.includes("compileHostedReferenceWorkflow(session, sourceIds)"), "desktop compare must invoke hosted canonical workflow");
assert(!compareBlock.includes("fetchReferenceDetail"), "desktop compare must not load raw persisted analysis directly");
assert(!compareBlock.includes("Promise.all"), "desktop compare must not fan out raw detail reads");
assert(!appText.includes("compareVideoAnalyses("), "canonical comparison implementation must not be copied into desktop app");
assert(!appText.includes("compileEvidenceRules("), "canonical evidence implementation must not be copied into desktop app");
assert(appText.includes('comparePanel.dataset.compiler = "hosted-canonical"'), "desktop compare runtime authority marker missing");
assert(appText.includes('dataset.compilerAuthority = "canonical"'), "desktop rendered compiler authority marker missing");
assert(appText.includes("ruleSet.rules"), "desktop must render deterministic evidence rules");

console.log(JSON.stringify({
  status: "MASTERV_HOSTED_REFERENCE_COMPILER_CONTRACT_PASS",
  canonical_source_commit: SOURCE_COMMIT,
  canonical_blob_count: Object.keys(expectedBlobs).length,
  workspace_authority: "jwt-derived",
  persisted_read_authority: "user-jwt-rls",
  desktop_compare_raw_analysis_fetch: false,
  comparison_compiler: "canonical",
  evidence_compiler: "canonical",
  provider_credentials_required: false
}));
