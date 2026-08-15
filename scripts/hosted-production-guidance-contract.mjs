import crypto from "node:crypto";
import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const SOURCE_COMMIT = "9ded32bb278f6f873166ea3d0ec6cb484122becf";
const expectedBlobs = {
  "lib/product-truth-interpreter-core.ts": "b0f81590547f70d73de1fe4deeeb11c0df966f05",
  "lib/product-truth-interpretation.ts": "00f9934f69ff5a461cf77ca8f85c05c6183aa047",
  "lib/reference-adaptation.ts": "95d5650b93e29ff8d87864da3a3319be8028b7a8",
  "lib/single-video-production.ts": "c70e6112e7face6a1b87d02ff10b06f5585155d2"
};

function gitBlobSha(path) {
  const body = fs.readFileSync(path);
  return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex");
}

for (const [path, expected] of Object.entries(expectedBlobs)) {
  assert(gitBlobSha(path) === expected, `${path} changed without updating hosted Production Guidance source pin`);
}

const coreText = fs.readFileSync("lib/product-truth-interpreter-core.ts", "utf8");
const wrapperText = fs.readFileSync("lib/product-truth-interpreter.ts", "utf8");
assert(coreText.includes("export async function interpretProductTruthAgainstReferenceWithKey"), "runtime-portable Product Truth interpreter missing");
assert(coreText.includes("new GoogleGenAI({ apiKey })"), "Product Truth core must own Gemini provider client");
assert(coreText.includes("productTruthInterpretationJsonSchema"), "Product Truth core schema binding missing");
assert(coreText.includes("matched_facts"), "Product Truth fact-preservation validation missing");
assert(!coreText.includes("process.env"), "Product Truth core must not depend on Node process.env");
assert(wrapperText.includes("interpretProductTruthAgainstReferenceWithKey"), "Web Product Truth wrapper must delegate to portable core");
assert(wrapperText.includes("process.env.GEMINI_API_KEY"), "Web Product Truth wrapper must retain server-side secret resolution");
assert(!wrapperText.includes("new GoogleGenAI"), "Web Product Truth wrapper must not duplicate provider implementation");

const deno = JSON.parse(fs.readFileSync("supabase/functions/masterv-api-boundary/deno.json", "utf8"));
assert(deno.imports?.["@google/genai"] === "npm:@google/genai@2.17.1", "hosted Gemini SDK must remain pinned exactly");
for (const path of Object.keys(expectedBlobs)) {
  assert(Object.values(deno.imports || {}).some((value) => typeof value === "string" && value.includes(`/${SOURCE_COMMIT}/${path}`)), `3I deno source pin missing ${path}`);
}
assert(deno.imports?.["@masterv/product-truth-interpreter-core"]?.includes(`/${SOURCE_COMMIT}/lib/product-truth-interpreter-core.ts`), "hosted Product Truth core pin missing");
assert(deno.imports?.["@masterv/single-video-production"]?.includes(`/${SOURCE_COMMIT}/lib/single-video-production.ts`), "hosted production guide compiler pin missing");

const functionText = fs.readFileSync("supabase/functions/masterv-api-boundary/index.ts", "utf8");
assert(functionText.includes('body.operation === "production_guidance"'), "hosted Production Guidance POST operation missing");
assert(functionText.includes("validateVideoAnalysis(body.analysis as VideoAnalysis)"), "transit analysis must be schema validated server-side");
assert(functionText.includes("deriveVideoMetrics(input.analysis)"), "Production Guidance metrics must be derived server-side");
assert(functionText.includes("compileSingleVideoProductionGuide(input.analysis, derivedMetrics"), "canonical production guide compiler missing");
assert(functionText.includes("initialGuide.reference_mechanisms"), "reference mechanisms must be derived from canonical analysis compiler");
assert(functionText.includes("interpretProductTruthAgainstReferenceWithKey"), "hosted Product Truth semantic matcher missing");
assert(functionText.includes('Deno.env.get("GEMINI_API_KEY")'), "Product Truth Gemini credential must remain hosted secret");
assert(functionText.includes('Deno.env.get("GEMINI_PRODUCT_TRUTH_MODEL")'), "Product Truth model authority must remain hosted");
assert(functionText.includes('product_truth_route: true'), "Product Truth route capability missing");
assert(functionText.includes('production_guidance_route: true'), "Production Guidance route capability missing");
assert(functionText.includes('product_truth: deepAnalysisReady'), "Product Truth readiness must reflect hosted Gemini secret");
assert(functionText.includes('production_guidance: deepAnalysisReady'), "Production Guidance readiness must reflect hosted Gemini secret");
assert(functionText.includes('compute_authority: "hosted-production-guidance"'), "Production Guidance compute authority marker missing");
assert(functionText.includes('product_truth_authority: "user-input-raw"'), "Product Truth authority marker missing");
assert(functionText.includes('reference_analysis_authority: "validated-hosted-result-transit"'), "transit analysis authority marker missing");
assert(functionText.includes('metrics_authority: "server-derived"'), "server-derived metrics marker missing");
assert(functionText.includes('persistence_authority: "none"'), "3I must not imply persistence");
assert(functionText.includes('background_batch_requests: 0'), "3I must report zero Background Batch requests");
assert(functionText.includes('persistence_writes: 0'), "3I must report zero persistence writes");
assert(!functionText.includes("body.interpretation"), "caller must not supply semantic interpretation authority");
assert(!functionText.includes("body.reference_mechanisms"), "caller must not supply reference mechanism authority");
assert(!functionText.includes("body.derived_metrics"), "caller must not supply derived metrics authority");
assert(!functionText.includes("body.api_key"), "caller must not supply provider credential");
assert(!functionText.includes("body.gemini_api_key"), "caller must not supply provider credential alias");
assert(!functionText.includes("body.model"), "caller must not choose hosted Gemini model");
assert(!functionText.includes("service_role"), "3I must not introduce service-role authority");

const htmlText = fs.readFileSync("desktop/index.html", "utf8");
for (const id of [
  "production-guidance-panel",
  "product-truth-form",
  "product-truth-name",
  "product-truth-target",
  "product-truth-price",
  "product-truth-facts",
  "production-guidance-submit",
  "production-guidance-status",
  "production-guidance-model",
  "production-guidance-content"
]) {
  assert(htmlText.includes(`id="${id}"`), `Desktop Production Guidance UI missing #${id}`);
}
assert(htmlText.includes("사용자가 입력한 원문만 Product Truth authority"), "Product Truth user-input authority disclosure missing");
assert(htmlText.includes("자동 persistence와 Background Batch는 수행하지 않습니다"), "3I non-persistence/non-batch disclosure missing");
assert(htmlText.includes("Product Truth / Production Guidance</span><strong>current"), "3I roadmap marker missing");
assert(htmlText.includes("Background Batch</span><strong>not migrated"), "Background Batch non-migration marker missing");

const desktopText = fs.readFileSync("desktop/deep-analysis.js", "utf8");
assert(desktopText.includes('const request = { operation: "production_guidance", analysis: latestAnalysis, product_truth: productTruth };'), "Desktop Production Guidance request shape missing");
assert(desktopText.includes('productTruthAuthority = "user-input-raw"'), "Desktop Product Truth authority marker missing");
assert(desktopText.includes('referenceAnalysisAuthority = "validated-hosted-result-transit"'), "Desktop transit analysis authority marker missing");
assert(desktopText.includes('metricsAuthority = "server-derived"'), "Desktop server metrics authority marker missing");
assert(desktopText.includes('computeAuthority = "hosted-production-guidance"'), "Desktop Production Guidance compute marker missing");
assert(desktopText.includes('backgroundBatchMigrated = "false"'), "Desktop Background Batch non-migration marker missing");
assert(desktopText.includes('persistenceAuthority = "none"'), "Desktop Production Guidance persistence marker missing");
assert(desktopText.includes("latestAnalysis = analysis"), "3H result must remain process-memory transit input for 3I");
assert(desktopText.includes("latestAnalysis = null"), "Desktop must clear transit analysis state");
assert(desktopText.includes("logout.addEventListener(\"click\", clearState)"), "logout must clear Product Truth/Production Guidance state");
assert(!desktopText.includes("GEMINI_API_KEY"), "Desktop Production Guidance must not contain Gemini credential name");
assert(!desktopText.includes("generativelanguage.googleapis.com"), "Desktop Production Guidance must not contact Gemini directly");
assert(!desktopText.includes('/api/interpret-product-truth'), "Desktop Production Guidance must not use local Next Product Truth route");
assert(!desktopText.includes("localStorage"), "Desktop Production Guidance must not persist access token/analysis/Product Truth state");
assert(!desktopText.includes("reference_mechanisms:"), "Desktop must not submit reference mechanism authority");
assert(!desktopText.includes("derived_metrics:"), "Desktop must not submit derived metrics authority");
assert(!desktopText.includes("interpretation:"), "Desktop must not submit semantic interpretation authority");
assert(!desktopText.includes("workspace_id"), "3I request must not carry workspace authority");

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert(packageJson.scripts?.["test:hosted-production-guidance"] === "node scripts/hosted-production-guidance-contract.mjs", "hosted Production Guidance contract script missing");
assert(packageJson.scripts?.["test:desktop-production-guidance-windows"] === "node scripts/desktop-production-guidance-windows-smoke.mjs", "Windows Production Guidance smoke script missing");

const ciText = fs.readFileSync(".github/workflows/ci.yml", "utf8");
assert((ciText.match(/npm run test:hosted-production-guidance/g) || []).length >= 2, "Production Guidance static contract must run in validate and desktop-shell");
assert(ciText.includes("npm run test:desktop-production-guidance-windows"), "Windows Production Guidance runtime smoke missing from CI");
assert(ciText.includes("artifacts/desktop-production-guidance"), "Production Guidance runtime evidence artifact path missing");

console.log(JSON.stringify({
  status: "MASTERV_HOSTED_PRODUCTION_GUIDANCE_CONTRACT_PASS",
  canonical_source_commit: SOURCE_COMMIT,
  canonical_blob_count: Object.keys(expectedBlobs).length,
  provider_authority: "hosted-secret",
  compute_authority: "hosted-production-guidance",
  product_truth_authority: "user-input-raw",
  reference_analysis_authority: "validated-hosted-result-transit",
  metrics_authority: "server-derived",
  desktop_provider_credentials: false,
  persistence_authority: "none",
  background_batch_migrated: false,
  local_next_api_required: false
}));
