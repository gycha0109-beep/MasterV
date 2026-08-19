import crypto from "node:crypto";
import fs from "node:fs";

function assert(condition, message) { if (!condition) throw new Error(message); }

const SOURCE_COMMIT = "99dcb2fd99bf21be668a2d7fd2e647311e5e6c47";
const expectedBlobs = {
  "lib/gemini-deep-core.ts": "d11af538abff998e924120dbc163c8fac939b24c",
  "lib/analysis-validation.ts": "7b027bc24f5af757c5c6634e649de18f315279ff",
  "lib/gemini-error.ts": "4bec006dc0a17541eb2e8f2f85f9b08d19434d63"
};
function gitBlobSha(path) {
  const body = fs.readFileSync(path);
  return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex");
}
for (const [path, expected] of Object.entries(expectedBlobs)) assert(gitBlobSha(path) === expected, `${path} changed without updating hosted Deep Analysis source pin`);

const coreText = fs.readFileSync("lib/gemini-deep-core.ts", "utf8");
const wrapperText = fs.readFileSync("lib/gemini.ts", "utf8");
assert(coreText.includes("export async function analyzeYouTubeVideoWithKey"), "runtime-portable canonical deep analyzer missing");
assert(coreText.includes("new GoogleGenAI({ apiKey })"), "canonical deep core must own Gemini provider client");
assert(coreText.includes("ANALYSIS_PROMPT") && coreText.includes("videoAnalysisJsonSchema") && coreText.includes("validateVideoAnalysis"), "canonical deep analysis contract incomplete");
assert(!coreText.includes("process.env"), "canonical deep core must remain runtime-portable");
assert(wrapperText.includes("analyzeYouTubeVideoWithKey") && wrapperText.includes("process.env.GEMINI_API_KEY"), "Web wrapper secret delegation missing");
assert(!wrapperText.includes("new GoogleGenAI"), "Web wrapper must not duplicate provider implementation");

const deno = JSON.parse(fs.readFileSync("supabase/functions/masterv-api-boundary/deno.json", "utf8"));
assert(deno.imports?.["@google/genai"] === "npm:@google/genai@2.17.1", "legacy hosted Gemini SDK pin drifted");
for (const path of Object.keys(expectedBlobs)) assert(Object.values(deno.imports || {}).some((value) => typeof value === "string" && value.includes(`/${SOURCE_COMMIT}/${path}`)), `legacy hosted source pin missing ${path}`);

const functionText = fs.readFileSync("supabase/functions/masterv-api-boundary/index.ts", "utf8");
for (const required of ['body.operation === "youtube_deep_analysis"', 'Deno.env.get("GEMINI_API_KEY")', 'Deno.env.get("GEMINI_MODEL")', 'deep_analysis_route: true', 'provider_authority: "hosted-secret"', 'compute_authority: "hosted-deep-analysis"', 'persistence_authority: "none"', 'persistence_writes: 0']) assert(functionText.includes(required), `legacy hosted Deep Analysis implementation regression: ${required}`);
assert(!functionText.includes("body.api_key") && !functionText.includes("body.gemini_api_key") && !functionText.includes("body.model"), "caller/provider authority boundary regressed");

const htmlText = fs.readFileSync("desktop/index.html", "utf8");
for (const id of ["cap-deep-analysis", "deep-analysis-panel", "deep-analysis-form", "deep-analysis-url", "deep-analysis-submit", "deep-analysis-status", "deep-analysis-model", "deep-analysis-source", "deep-analysis-content"]) assert(htmlText.includes(`id="${id}"`), `Desktop Deep Analysis UI missing #${id}`);
assert(htmlText.includes("Gateway에서 실행하고 결과는 Local SQLite에 저장합니다."), "EXIT-2C Deep Analysis authority disclosure missing");

const desktopText = fs.readFileSync("desktop/deep-analysis.js", "utf8");
const backendText = fs.readFileSync("desktop/backend/backend.js", "utf8");
const transitionText = fs.readFileSync("desktop/backend/bridge/transition-provider.js", "utf8");
const remoteText = fs.readFileSync("desktop/backend/legacy/hosted-api-client.js", "utf8");
assert(desktopText.includes("backend.remoteOperations.analyzeYouTube(session, url)"), "Desktop Deep Analysis provider delegation missing");
assert(desktopText.includes("backend.session.subscribe") && desktopText.includes("backend.remoteOperations.subscribeCapabilities"), "Desktop neutral session/capability boundary missing");
assert(remoteText.includes('{ operation: "youtube_deep_analysis", url }'), "legacy hosted adapter request shape must remain available until EXIT-3");
assert(backendText.includes('deepPanel.dataset.providerAuthority = "masterv-gateway"'), "EXIT-2C Deep Analysis provider authority override missing");
assert(backendText.includes('deepPanel.dataset.persistenceAuthority = "local-sqlite"'), "EXIT-2C Deep Analysis persistence authority override missing");
assert(transitionText.includes("gatewayRemote.analyzeYouTube(requireGatewaySession(activeSession)"), "EXIT-2C Deep Analysis must execute through Gateway");
assert(transitionText.includes("localWorkData.saveAnalysisResult"), "EXIT-2C Deep Analysis result must persist locally");
assert(!/\bfetch\s*\(/.test(desktopText) && !desktopText.includes("GEMINI_API_KEY") && !desktopText.includes("generativelanguage.googleapis.com") && !desktopText.includes("localStorage"), "Desktop Deep Analysis secret/transport boundary regressed");

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert(packageJson.scripts?.["test:hosted-deep-analysis"] === "node scripts/hosted-deep-analysis-contract.mjs", "hosted Deep Analysis regression command missing");

console.log(JSON.stringify({
  status: "MASTERV_HOSTED_DEEP_ANALYSIS_CONTRACT_PASS",
  canonical_source_commit: SOURCE_COMMIT,
  canonical_blob_count: Object.keys(expectedBlobs).length,
  legacy_hosted_implementation_preserved: true,
  visible_execution_authority: "masterv-gateway",
  visible_persistence_authority: "local-sqlite",
  desktop_provider_credentials: false,
  local_next_api_required: false
}));
