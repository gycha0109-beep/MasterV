import crypto from "node:crypto";
import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

for (const [path, expected] of Object.entries(expectedBlobs)) {
  assert(gitBlobSha(path) === expected, `${path} changed without updating hosted Deep Analysis source pin`);
}

const coreText = fs.readFileSync("lib/gemini-deep-core.ts", "utf8");
const wrapperText = fs.readFileSync("lib/gemini.ts", "utf8");
assert(coreText.includes("export async function analyzeYouTubeVideoWithKey"), "runtime-portable canonical deep analyzer missing");
assert(coreText.includes("new GoogleGenAI({ apiKey })"), "canonical deep core must own Gemini provider client");
assert(coreText.includes("ANALYSIS_PROMPT"), "canonical deep prompt missing");
assert(coreText.includes("videoAnalysisJsonSchema"), "canonical deep schema binding missing");
assert(coreText.includes("validateVideoAnalysis"), "canonical deep validation missing");
assert(!coreText.includes("process.env"), "canonical deep core must not depend on Node process.env");
assert(wrapperText.includes("analyzeYouTubeVideoWithKey"), "Web Gemini wrapper must delegate to canonical deep core");
assert(wrapperText.includes("process.env.GEMINI_API_KEY"), "Web wrapper must retain server-side Gemini secret resolution");
assert(!wrapperText.includes("new GoogleGenAI"), "Web wrapper must not duplicate provider implementation");

const deno = JSON.parse(fs.readFileSync("supabase/functions/masterv-api-boundary/deno.json", "utf8"));
assert(deno.imports?.["@google/genai"] === "npm:@google/genai@2.17.1", "hosted Gemini SDK must be pinned exactly");
for (const path of Object.keys(expectedBlobs)) {
  assert(Object.values(deno.imports || {}).some((value) => typeof value === "string" && value.includes(`/${SOURCE_COMMIT}/${path}`)), `deno import pin missing ${path}`);
}
assert(deno.imports?.["@masterv/gemini-deep-core"]?.includes(`/${SOURCE_COMMIT}/lib/gemini-deep-core.ts`), "hosted canonical Deep Analysis core import pin missing");

const functionText = fs.readFileSync("supabase/functions/masterv-api-boundary/index.ts", "utf8");
assert(functionText.includes('body.operation === "youtube_deep_analysis"'), "hosted Deep Analysis POST operation missing");
assert(functionText.includes('Deno.env.get("GEMINI_API_KEY")'), "Gemini credential must be hosted runtime secret");
assert(functionText.includes('Deno.env.get("GEMINI_MODEL")'), "Gemini model authority must remain hosted runtime controlled");
assert(functionText.includes('deep_analysis_route: true'), "hosted Deep Analysis route capability missing");
assert(functionText.includes('deep_analysis: deepAnalysisReady'), "hosted Deep Analysis readiness must reflect hosted secret");
assert(functionText.includes('analyze: false'), "legacy analyze capability must remain separate from 3H boundary");
assert(functionText.includes('provider_authority: "hosted-secret"'), "Deep Analysis provider authority marker missing");
assert(functionText.includes('compute_authority: "hosted-deep-analysis"'), "Deep Analysis compute authority marker missing");
assert(functionText.includes('analysis_tier: "deep"'), "Deep Analysis tier marker missing");
assert(functionText.includes('persistence_authority: "none"'), "3H must not imply persistence");
assert(functionText.includes('gemini_requests: 1'), "hosted Deep Analysis diagnostics must report provider request");
assert(functionText.includes('persistence_writes: 0'), "3H diagnostics must report zero persistence writes");
assert(!functionText.includes("body.api_key"), "Deep Analysis must not accept provider credential from caller");
assert(!functionText.includes("body.gemini_api_key"), "Deep Analysis must not accept provider credential alias from caller");
assert(!functionText.includes("body.model"), "Desktop must not choose hosted Gemini model");
assert(!functionText.includes("service_role"), "Deep Analysis must not introduce service-role authority");

const htmlText = fs.readFileSync("desktop/index.html", "utf8");
for (const id of ["cap-deep-analysis", "deep-analysis-panel", "deep-analysis-form", "deep-analysis-url", "deep-analysis-submit", "deep-analysis-status", "deep-analysis-model", "deep-analysis-source", "deep-analysis-content"]) {
  assert(htmlText.includes(`id="${id}"`), `Desktop Deep Analysis UI missing #${id}`);
}
assert(htmlText.indexOf('<script src="./deep-analysis.js"></script>') < htmlText.indexOf('<script src="./app.js"></script>'), "Deep Analysis token boundary script must load before app.js");
assert(htmlText.includes("자동 persistence를 수행하지 않습니다"), "Desktop Deep Analysis non-persistence disclosure missing");

const desktopText = fs.readFileSync("desktop/deep-analysis.js", "utf8");
assert(desktopText.includes("window.fetch = async function masterVDesktopFetch"), "Desktop Deep Analysis hosted auth bridge missing");
assert(desktopText.includes('JSON.stringify({ operation: "youtube_deep_analysis", url })'), "Desktop Deep Analysis request must send operation and URL only");
assert(desktopText.includes('providerAuthority = "hosted-secret"'), "Desktop Deep Analysis provider authority marker missing");
assert(desktopText.includes('providerCredentialsInClient = "false"'), "Desktop Deep Analysis credential boundary marker missing");
assert(desktopText.includes('computeAuthority = "hosted-deep-analysis"'), "Desktop Deep Analysis compute authority marker missing");
assert(desktopText.includes('persistenceAuthority = "none"'), "Desktop Deep Analysis persistence boundary marker missing");
assert(desktopText.includes("logout.addEventListener(\"click\", clearState)"), "logout must clear Deep Analysis token/state");
assert(!desktopText.includes("GEMINI_API_KEY"), "Desktop Deep Analysis must not contain Gemini credential name");
assert(!desktopText.includes("generativelanguage.googleapis.com"), "Desktop Deep Analysis must not contact Gemini provider directly");
assert(!desktopText.includes('fetch("/api/analyze'), "Desktop Deep Analysis must not call local Next analyze route");
assert(!desktopText.includes("localStorage"), "Desktop Deep Analysis must not persist access token/state");
assert(!desktopText.includes("workspace_id"), "3H request must not carry workspace authority");

const copyText = fs.readFileSync("scripts/copy-desktop-deep-analysis.mjs", "utf8");
assert(copyText.includes('"deep-analysis.js"'), "Desktop build must copy Deep Analysis asset");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert(packageJson.scripts?.["desktop:prepare"]?.includes("copy-desktop-deep-analysis.mjs"), "desktop:prepare must include Deep Analysis asset copy");
assert(packageJson.scripts?.["test:hosted-deep-analysis"] === "node scripts/hosted-deep-analysis-contract.mjs", "hosted Deep Analysis contract script missing");
assert(packageJson.scripts?.["test:desktop-deep-analysis-windows"] === "node scripts/desktop-deep-analysis-windows-smoke.mjs", "Windows Deep Analysis smoke script missing");

const ciText = fs.readFileSync(".github/workflows/ci.yml", "utf8");
assert((ciText.match(/npm run test:hosted-deep-analysis/g) || []).length >= 2, "Deep Analysis static contract must run in validate and desktop-shell");
assert(ciText.includes("npm run test:desktop-deep-analysis-windows"), "Windows Deep Analysis runtime smoke missing from CI");
assert(ciText.includes("artifacts/desktop-deep-analysis"), "Deep Analysis runtime evidence artifact path missing");

console.log(JSON.stringify({
  status: "MASTERV_HOSTED_DEEP_ANALYSIS_CONTRACT_PASS",
  canonical_source_commit: SOURCE_COMMIT,
  canonical_blob_count: Object.keys(expectedBlobs).length,
  provider_authority: "hosted-secret",
  compute_authority: "hosted-deep-analysis",
  desktop_provider_credentials: false,
  persistence_authority: "none",
  local_next_api_required: false
}));
