import crypto from "node:crypto";
import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const SOURCE_COMMIT = "b8a0d4dd34e5080919d75b23b08c12d3e2293efb";
const expectedBlobs = {
  "lib/youtube-discovery-core.ts": "43c2d5a62b3ae99595ad10ba98be39ecfd86f5ae",
  "lib/discovery.ts": "97ee872c5f7380f28c72eb6d319fc9e2e40a9c84",
  "lib/source-identity.ts": "0c32bba93eae5b479c3bb948d24725f7f08c17d5",
  "lib/tiered-analysis.ts": "edac18694a12a81043ab0b3b1a22f654a5c9aef1"
};

function gitBlobSha(path) {
  const body = fs.readFileSync(path);
  return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex");
}

for (const [path, expected] of Object.entries(expectedBlobs)) {
  assert(gitBlobSha(path) === expected, `${path} changed without updating hosted YouTube discovery source pin`);
}

const deno = JSON.parse(fs.readFileSync("supabase/functions/masterv-api-boundary/deno.json", "utf8"));
const imports = deno.imports || {};
for (const path of Object.keys(expectedBlobs)) {
  assert(Object.values(imports).some((value) => typeof value === "string" && value.includes(`/${SOURCE_COMMIT}/${path}`)), `deno import pin missing ${path}`);
}
assert(imports["@masterv/youtube-discovery-core"]?.includes(`/${SOURCE_COMMIT}/lib/youtube-discovery-core.ts`), "hosted canonical YouTube core import pin missing");

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
assert(functionText.includes('discoverYouTubeCandidatesWithKey'), "hosted function must import canonical YouTube candidate discovery core");
assert(functionText.includes('body.operation === "youtube_discovery"'), "hosted YouTube discovery POST operation missing");
assert(functionText.includes('Deno.env.get("YOUTUBE_DATA_API_KEY")'), "provider credential must be read only from hosted runtime environment");
assert(functionText.includes('provider_authority: "hosted-secret"'), "hosted discovery response must identify provider credential authority");
assert(functionText.includes('analysis_authority: "metadata-only"'), "3G discovery response must remain metadata-only");
assert(functionText.includes('youtube_discovery_route: true'), "hosted capability must expose discovery route availability");
assert(functionText.includes('youtube_discovery: youtubeDiscoveryReady'), "hosted capability must truthfully reflect provider-secret readiness");
assert(functionText.includes('DISCOVERY_OPTION_KEYS'), "hosted discovery options whitelist missing");
assert(functionText.includes('unsupported discovery option'), "hosted discovery must reject unknown option keys");
assert(!functionText.includes("GEMINI_API_KEY"), "hosted discovery must not introduce Gemini dependency");
assert(!functionText.includes("body.api_key"), "hosted discovery must not accept provider credential from caller body");
assert(!functionText.includes("body.youtube_api_key"), "hosted discovery must not accept provider credential alias from caller body");
assert(!functionText.includes("service_role"), "hosted discovery must not introduce service-role authority");

const htmlText = fs.readFileSync("desktop/index.html", "utf8");
for (const id of ["discovery-panel", "discovery-form", "discovery-query", "discovery-region", "discovery-language", "discovery-duration", "discovery-search", "discovery-status", "discovery-count", "discovery-provider", "discovery-results"]) {
  assert(htmlText.includes(`id="${id}"`), `desktop discovery UI missing #${id}`);
}
assert(htmlText.includes("metadata only"), "Desktop discovery surface must disclose metadata-only scope");
assert(htmlText.includes("Deep Analysis"), "Desktop roadmap must retain Deep Analysis boundary");

const appText = fs.readFileSync("desktop/app.js", "utf8");
assert(appText.includes("async function discoverHostedYouTube"), "desktop hosted discovery client missing");
const hostedStart = appText.indexOf("async function discoverHostedYouTube");
const hostedEnd = appText.indexOf("async function loadReferenceLibrary", hostedStart);
const hostedBlock = appText.slice(hostedStart, hostedEnd);
assert(hostedBlock.includes('method: "POST"'), "desktop discovery request must use POST");
assert(hostedBlock.includes('operation: "youtube_discovery", query, options'), "desktop discovery request must send operation/query/options only");
assert(!hostedBlock.includes("workspace_id"), "desktop discovery request must not send workspace authority");
assert(!hostedBlock.includes("analysis:"), "desktop discovery request must not send analysis payload");
assert(!hostedBlock.includes("api_key"), "desktop discovery request must not send provider credential");
assert(appText.includes('discoveryPanel.dataset.providerAuthority = "hosted-secret"'), "desktop hosted provider authority marker missing");
assert(appText.includes('discoveryPanel.dataset.providerCredentialsInClient = "false"'), "desktop provider credential boundary marker missing");
assert(appText.includes('discoveryPanel.dataset.analysisAuthority = "metadata-only"'), "desktop metadata-only authority marker missing");
assert(appText.includes("dataset.discoverySourceId"), "desktop discovery result identity marker missing");
assert(appText.includes("clearDiscoveryState({ hide: true, clearQuery: true })"), "logout must clear Desktop discovery state");
assert(!appText.includes("YOUTUBE_DATA_API_KEY"), "desktop app must not contain YouTube provider credential name");
assert(!appText.includes("www.googleapis.com/youtube"), "desktop app must not call YouTube provider directly");
assert(!appText.includes('fetch("/api/discover'), "desktop app must not call local Next discovery route");
assert(!appText.includes("localStorage"), "desktop discovery must not persist session/provider state in localStorage");
assert(!appText.includes("thumbnail_url"), "Desktop discovery must not expand remote image CSP for thumbnails in 3G");

console.log(JSON.stringify({
  status: "MASTERV_HOSTED_YOUTUBE_DISCOVERY_CONTRACT_PASS",
  canonical_source_commit: SOURCE_COMMIT,
  canonical_blob_count: Object.keys(expectedBlobs).length,
  provider_authority: "hosted-secret",
  desktop_provider_credentials: false,
  analysis_authority: "metadata-only",
  local_next_api_required: false,
  gemini_dependency: false
}));
