import crypto from "node:crypto";
import fs from "node:fs";

function assert(condition, message) { if (!condition) throw new Error(message); }
const SOURCE_COMMIT = "b8a0d4dd34e5080919d75b23b08c12d3e2293efb";
const expectedBlobs = {
  "lib/youtube-discovery-core.ts": "43c2d5a62b3ae99595ad10ba98be39ecfd86f5ae",
  "lib/discovery.ts": "97ee872c5f7380f28c72eb6d319fc9e2e40a9c84",
  "lib/source-identity.ts": "0c32bba93eae5b479c3bb948d24725f7f08c17d5",
  "lib/tiered-analysis.ts": "edac18694a12a81043ab0b3b1a22f654a5c9aef1"
};
function gitBlobSha(path) { const body = fs.readFileSync(path); return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex"); }
for (const [path, expected] of Object.entries(expectedBlobs)) assert(gitBlobSha(path) === expected, `${path} changed without updating hosted YouTube discovery source pin`);
const deno = JSON.parse(fs.readFileSync("supabase/functions/masterv-api-boundary/deno.json", "utf8"));
const imports = deno.imports || {};
for (const path of Object.keys(expectedBlobs)) assert(Object.values(imports).some((value) => typeof value === "string" && value.includes(`/${SOURCE_COMMIT}/${path}`)), `deno import pin missing ${path}`);
assert(imports["@masterv/youtube-discovery-core"]?.includes(`/${SOURCE_COMMIT}/lib/youtube-discovery-core.ts`), "legacy hosted canonical YouTube core import pin missing");
const coreText = fs.readFileSync("lib/youtube-discovery-core.ts", "utf8");
const wrapperText = fs.readFileSync("lib/youtube-discovery.ts", "utf8");
assert(coreText.includes("export async function discoverYouTubeCandidatesWithKey"), "runtime-portable canonical candidate discovery core missing");
assert(coreText.includes("https://www.googleapis.com/youtube/v3/search"), "canonical core must own YouTube search.list provider URL");
assert(coreText.includes("https://www.googleapis.com/youtube/v3/videos"), "canonical core must own YouTube videos.list provider URL");
assert(!coreText.includes("process.env"), "runtime-portable canonical core must not depend on Node process.env");
assert(!coreText.includes("GEMINI_API_KEY"), "candidate discovery core must not depend on Gemini");
assert(wrapperText.includes("discoverYouTubeCandidatesWithKey"), "web wrapper must delegate candidate discovery to canonical core");
assert(wrapperText.includes("process.env.YOUTUBE_DATA_API_KEY"), "web wrapper must retain existing server-side provider-key resolution");
assert(!wrapperText.includes("www.googleapis.com/youtube"), "web wrapper must not duplicate provider implementation");

const functionText = fs.readFileSync("supabase/functions/masterv-api-boundary/index.ts", "utf8");
assert(functionText.includes('discoverYouTubeCandidatesWithKey'), "0.1.2 legacy hosted function must retain canonical YouTube discovery core");
assert(functionText.includes('body.operation === "youtube_discovery"'), "legacy hosted YouTube discovery POST operation missing");
assert(functionText.includes('Deno.env.get("YOUTUBE_DATA_API_KEY")'), "legacy hosted provider credential must remain server-side");
assert(functionText.includes('provider_authority: "hosted-secret"'), "legacy hosted discovery response must identify provider credential authority");
assert(functionText.includes('analysis_authority: "metadata-only"'), "legacy hosted discovery response must remain metadata-only");
assert(functionText.includes('DISCOVERY_OPTION_KEYS'), "legacy hosted discovery options whitelist missing");
assert(functionText.includes('unsupported discovery option'), "legacy hosted discovery must reject unknown option keys");
assert(!functionText.includes("body.api_key"), "legacy hosted discovery must not accept provider credential from caller body");
assert(!functionText.includes("body.youtube_api_key"), "legacy hosted discovery must not accept provider credential alias from caller body");
assert(!functionText.includes("service_role"), "legacy hosted discovery must not introduce service-role authority");
const discoveryStart = functionText.indexOf("async function discoverYouTube");
const discoveryEndCandidate = functionText.indexOf("async function analyzeYouTubeDeep", discoveryStart);
const discoveryEnd = discoveryEndCandidate >= 0 ? discoveryEndCandidate : functionText.indexOf("Deno.serve", discoveryStart);
const discoveryBlock = functionText.slice(discoveryStart, discoveryEnd);
assert(discoveryStart >= 0 && discoveryEnd > discoveryStart, "legacy hosted discovery operation block missing");
assert(!discoveryBlock.includes("GEMINI_API_KEY"), "YouTube discovery operation must remain independent from Gemini credentials");
assert(!discoveryBlock.includes("analyzeYouTubeVideoWithKey"), "YouTube discovery operation must remain independent from Deep Analysis compute");

const htmlText = fs.readFileSync("desktop/index.html", "utf8");
for (const id of ["discovery-panel", "discovery-form", "discovery-query", "discovery-region", "discovery-language", "discovery-duration", "discovery-search", "discovery-status", "discovery-count", "discovery-provider", "discovery-results"]) assert(htmlText.includes(`id="${id}"`), `desktop discovery UI missing #${id}`);
assert(htmlText.includes("YouTube provider secret은 Desktop에 포함되지 않습니다."), "Desktop discovery surface must disclose that provider secrets stay off-device");
assert(htmlText.includes("Deep Analysis"), "Desktop roadmap must retain Deep Analysis boundary");

const appText = fs.readFileSync("desktop/app.js", "utf8");
const gatewayText = fs.readFileSync("desktop/backend/gateway/gateway-remote-provider.js", "utf8");
const remoteText = fs.readFileSync("desktop/backend/legacy/hosted-api-client.js", "utf8");
assert(appText.includes("backend.remoteOperations.discoverYouTube(session, query, options)"), "EXIT-2C desktop discovery must delegate through the provider boundary");
assert(!appText.includes("masterv-api-boundary"), "desktop discovery consumer must not own hosted endpoint");
assert(!appText.includes('operation: "youtube_discovery"'), "desktop discovery consumer must not own legacy hosted operation payload");
assert(appText.includes('discoveryPanel.dataset.providerAuthority = "masterv-gateway"'), "desktop discovery provider authority marker must identify MasterV Gateway");
assert(appText.includes('discoveryPanel.dataset.providerCredentialsInClient = "false"'), "desktop provider credential boundary marker missing");
assert(appText.includes('discoveryPanel.dataset.analysisAuthority = "metadata-only"'), "desktop metadata-only authority marker missing");
assert(appText.includes("dataset.discoverySourceId"), "desktop discovery result identity marker missing");
assert(appText.includes("clearDiscoveryState({ hide: true, clearQuery: true })"), "logout must clear Desktop discovery state");
assert(!appText.includes("YOUTUBE_DATA_API_KEY"), "desktop app must not contain YouTube provider credential name");
assert(!appText.includes("www.googleapis.com/youtube"), "desktop app must not call YouTube provider directly");
assert(!appText.includes('fetch("/api/discover'), "desktop app must not call local Next discovery route");
assert(!appText.includes("localStorage"), "desktop discovery must not persist session/provider state in localStorage");

const gatewayStart = gatewayText.indexOf("async function discoverYouTube");
const gatewayEnd = gatewayText.indexOf("async function analyzeYouTube", gatewayStart);
const gatewayBlock = gatewayText.slice(gatewayStart, gatewayEnd);
assert(gatewayStart >= 0 && gatewayEnd > gatewayStart, "Gateway discovery adapter missing");
assert(gatewayBlock.includes('invoke("desktop_gateway_discover"'), "EXIT-2C discovery must use the native Gateway transport command");
assert(gatewayBlock.includes("requireSession(session)"), "EXIT-2C discovery must require a Product-Key Gateway session");
assert(!gatewayBlock.includes("YOUTUBE_DATA_API_KEY"), "Gateway Desktop adapter must not know the YouTube provider credential");
assert(!gatewayBlock.includes("www.googleapis.com/youtube"), "Gateway Desktop adapter must not call YouTube directly");

const hostedStart = remoteText.indexOf("async function discoverYouTube");
const hostedEnd = remoteText.indexOf("async function analyzeYouTube", hostedStart);
const hostedBlock = remoteText.slice(hostedStart, hostedEnd);
assert(hostedStart >= 0 && hostedEnd > hostedStart, "0.1.2 legacy hosted discovery adapter missing");
assert(hostedBlock.includes('requestBoundary(session, "POST"'), "legacy hosted discovery adapter request must use POST");
assert(hostedBlock.includes('operation: "youtube_discovery", query, options'), "legacy hosted discovery adapter must send operation/query/options only");
assert(!hostedBlock.includes("workspace_id"), "legacy desktop discovery request must not send workspace authority");
assert(!hostedBlock.includes("analysis:"), "legacy desktop discovery request must not send analysis payload");
assert(!hostedBlock.includes("api_key"), "legacy desktop discovery request must not send provider credential");

console.log(JSON.stringify({
  status: "MASTERV_HOSTED_YOUTUBE_DISCOVERY_CONTRACT_PASS",
  canonical_source_commit: SOURCE_COMMIT,
  canonical_blob_count: Object.keys(expectedBlobs).length,
  legacy_hosted_discovery_retained_for_0_1_2: true,
  visible_desktop_provider_authority: "masterv-gateway",
  desktop_provider_credentials: false,
  desktop_transport_owner: "gateway-provider-boundary",
  analysis_authority: "metadata-only",
  local_next_api_required: false,
  gemini_dependency: false
}));
