import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

function assert(condition, message) { if (!condition) throw new Error(message); }

const FOUNDATION_SOURCE_COMMIT = "9ded32bb278f6f873166ea3d0ec6cb484122becf";
const PRODUCT_TRUTH_CORE_SOURCE_COMMIT = "4b34b3b51225c7ec6177b3dad45a2bb0d2efca1c";
const expectedSources = {
  "lib/product-truth-interpreter-core.ts": { sha: "86f84d3ef84c178f14cc6c70eb8ea0cd3ccc058c", commit: PRODUCT_TRUTH_CORE_SOURCE_COMMIT },
  "lib/product-truth-interpretation.ts": { sha: "00f9934f69ff5a461cf77ca8f85c05c6183aa047", commit: FOUNDATION_SOURCE_COMMIT },
  "lib/reference-adaptation.ts": { sha: "95d5650b93e29ff8d87864da3a3319be8028b7a8", commit: FOUNDATION_SOURCE_COMMIT },
  "lib/single-video-production.ts": { sha: "c70e6112e7face6a1b87d02ff10b06f5585155d2", commit: FOUNDATION_SOURCE_COMMIT }
};
function gitBlobSha(path) {
  const body = fs.readFileSync(path);
  return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex");
}
for (const [path, source] of Object.entries(expectedSources)) assert(gitBlobSha(path) === source.sha, `${path} changed without updating hosted Production Guidance source pin`);

const coreText = fs.readFileSync("lib/product-truth-interpreter-core.ts", "utf8");
const wrapperText = fs.readFileSync("lib/product-truth-interpreter.ts", "utf8");
for (const required of ["sanitizeProductTruthInterpretation", "interpretProductTruthAgainstReferenceDetailedWithKey", "nonmatched_fact_link_removed", "generated_fact_removed", "matched_without_valid_fact_downgraded", "source_facts_replaced_with_user_authority", "duplicate_mechanism_downgraded", "missing_mechanism_filled", "unknown_mechanism_ignored", "new GoogleGenAI({ apiKey })", "productTruthInterpretationJsonSchema"]) assert(coreText.includes(required), `Product Truth canonical safety contract missing: ${required}`);
assert(!coreText.includes("process.env"), "Product Truth core must remain runtime-portable");
assert(wrapperText.includes("interpretProductTruthAgainstReferenceWithKey") && wrapperText.includes("process.env.GEMINI_API_KEY"), "Web Product Truth wrapper delegation missing");
assert(!wrapperText.includes("new GoogleGenAI"), "Web Product Truth wrapper must not duplicate provider implementation");

const safetyCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const safety = spawnSync(safetyCommand, ["--no-install", "tsx", "scripts/product-truth-safety-contract.ts"], { encoding: "utf8", env: process.env });
assert(safety.status === 0 && safety.stdout.includes("MASTERV_PRODUCT_TRUTH_SAFETY_CONTRACT_PASS"), `Product Truth safety contract failed:\n${safety.stdout}\n${safety.stderr}`);

const deno = JSON.parse(fs.readFileSync("supabase/functions/masterv-api-boundary/deno.json", "utf8"));
assert(deno.imports?.["@google/genai"] === "npm:@google/genai@2.17.1", "legacy hosted Gemini SDK pin drifted");
for (const [path, source] of Object.entries(expectedSources)) assert(Object.values(deno.imports || {}).some((value) => typeof value === "string" && value.includes(`/${source.commit}/${path}`)), `legacy hosted source pin missing ${path}`);

const functionText = fs.readFileSync("supabase/functions/masterv-api-boundary/index.ts", "utf8");
for (const required of ['body.operation === "production_guidance"', "validateVideoAnalysis(body.analysis as VideoAnalysis)", "deriveVideoMetrics(input.analysis)", "compileSingleVideoProductionGuide(input.analysis, derivedMetrics", "interpretProductTruthAgainstReferenceWithKey", 'Deno.env.get("GEMINI_API_KEY")', 'Deno.env.get("GEMINI_PRODUCT_TRUTH_MODEL")', 'compute_authority: "hosted-production-guidance"', 'persistence_authority: "none"', 'persistence_writes: 0']) assert(functionText.includes(required), `legacy hosted Production Guidance implementation regression: ${required}`);
assert(!functionText.includes("body.interpretation") && !functionText.includes("body.reference_mechanisms") && !functionText.includes("body.derived_metrics") && !functionText.includes("body.api_key") && !functionText.includes("body.model"), "Production Guidance caller authority boundary regressed");

const htmlText = fs.readFileSync("desktop/index.html", "utf8");
for (const id of ["production-guidance-panel","product-truth-form","product-truth-name","product-truth-target","product-truth-price","product-truth-facts","production-guidance-submit","production-guidance-status","production-guidance-model","production-guidance-content"]) assert(htmlText.includes(`id="${id}"`), `Desktop Production Guidance UI missing #${id}`);
assert(htmlText.includes("유료 사용 판정은 Gateway가 수행하고 결과는 Local SQLite에 저장합니다."), "EXIT-2C Production Guidance authority disclosure missing");

const desktopText = fs.readFileSync("desktop/deep-analysis.js", "utf8");
const backendText = fs.readFileSync("desktop/backend/backend.js", "utf8");
const transitionText = fs.readFileSync("desktop/backend/bridge/transition-provider.js", "utf8");
assert(desktopText.includes('const request = { operation: "production_guidance", analysis: latestAnalysis, product_truth: productTruth };'), "Desktop Production Guidance request shape missing");
assert(desktopText.includes('productTruthAuthority = "user-input-raw"') && desktopText.includes('metricsAuthority = "server-derived"'), "Product Truth/metrics authority markers missing");
assert(desktopText.includes("compiledProductTruthSnapshot") && desktopText.includes("상품 정보가 변경되었습니다. 기존 프롬프트는 사용할 수 없습니다."), "stale Product Truth prompt blocking regressed");
assert(backendText.includes('guidancePanel.dataset.providerAuthority = "masterv-gateway"'), "EXIT-2C Production Guidance provider authority override missing");
assert(backendText.includes('guidancePanel.dataset.persistenceAuthority = "local-sqlite"'), "EXIT-2C Production Guidance persistence authority override missing");
assert(backendText.includes('guidancePanel.dataset.backgroundBatchMigrated = "true"'), "EXIT-2C Background operation migration marker missing");
assert(transitionText.includes("gatewayRemote.generateProductionGuidance(requireGatewaySession(activeSession)"), "Production Guidance must execute through Gateway");
assert(transitionText.includes("localWorkData.saveProductionGuidance"), "Production Guidance result must persist locally");
assert(!desktopText.includes("GEMINI_API_KEY") && !desktopText.includes("generativelanguage.googleapis.com") && !desktopText.includes("localStorage") && !desktopText.includes("workspace_id"), "Desktop Production Guidance secret/persistence boundary regressed");

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert(packageJson.scripts?.["test:hosted-production-guidance"] === "node scripts/hosted-production-guidance-contract.mjs", "hosted Production Guidance regression command missing");

console.log(JSON.stringify({
  status: "MASTERV_HOSTED_PRODUCTION_GUIDANCE_CONTRACT_PASS",
  foundation_source_commit: FOUNDATION_SOURCE_COMMIT,
  product_truth_core_source_commit: PRODUCT_TRUTH_CORE_SOURCE_COMMIT,
  legacy_hosted_implementation_preserved: true,
  product_truth_safe_degradation: true,
  visible_execution_authority: "masterv-gateway",
  visible_persistence_authority: "local-sqlite",
  background_operations_migrated: true,
  desktop_provider_credentials: false
}));
