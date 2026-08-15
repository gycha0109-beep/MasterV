import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const checkoutSha = "11d5960a326750d5838078e36cf38b85af677262";
const setupNodeSha = "49933ea5288caeca8642d1e84afbd3f7d6820020";
const rustToolchainSha = "4360b52568e2003a75bf9bc1d59f33a8e3fc893c";
const uploadArtifactSha = "ea165f8d65b6e75b540449e92b4886f43607fa02";
const workflowPaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/runtime-smoke.yml",
  ".github/workflows/coarse-bundle-calibration.yml",
  ".github/workflows/real-product-pilot.yml",
  ".github/workflows/desktop-release-readiness.yml"
];

assert(fs.existsSync("package-lock.json"), "package-lock.json is required");
assert(fs.existsSync("src-tauri/Cargo.lock"), "src-tauri/Cargo.lock is required");
assert(!fs.existsSync(".github/workflows/dependency-lock-bootstrap.yml"), "temporary dependency bootstrap workflow must not remain");

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
assert(packageJson.scripts?.["test:desktop-build-determinism"] === "node scripts/desktop-build-determinism-contract.mjs", "3K package script wiring missing");
assert(packageLock.lockfileVersion === 3, "npm lockfileVersion must be 3");
assert(packageLock.packages?.["node_modules/@google/genai"]?.version === "2.17.1", "locked @google/genai version drifted");
assert(packageLock.packages?.["node_modules/next"]?.version === "16.3.1", "locked Next version drifted");
assert(packageLock.packages?.["node_modules/@tauri-apps/cli"]?.version === "2.11.4", "locked Tauri CLI version drifted");

const cargoLock = fs.readFileSync("src-tauri/Cargo.lock", "utf8");
function cargoVersion(name) {
  const match = cargoLock.match(new RegExp(`\\[\\[package\\]\\]\\r?\\nname = "${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"\\r?\\nversion = "([^"]+)"`));
  return match?.[1] || "";
}
assert(cargoVersion("tauri") === "2.11.5", "locked tauri version drifted");
assert(cargoVersion("tauri-build") === "2.6.3", "locked tauri-build version drifted");
assert(cargoVersion("tauri-runtime") === "2.11.3", "locked tauri-runtime version drifted");
assert(cargoVersion("tauri-runtime-wry") === "2.11.4", "locked tauri-runtime-wry version drifted");
assert(cargoVersion("wry") === "0.55.1", "locked wry version drifted");

const rustToolchain = fs.readFileSync("rust-toolchain.toml", "utf8");
assert(/channel\s*=\s*"1\.97\.1"/.test(rustToolchain), "Rust toolchain must be pinned to 1.97.1");
assert(/profile\s*=\s*"minimal"/.test(rustToolchain), "Rust toolchain profile must be minimal");

for (const path of workflowPaths) {
  const source = fs.readFileSync(path, "utf8");
  assert(!/\bnpm install\b/.test(source), `${path} must not use npm install`);
  assert(!/node-version:\s*24\s*$/m.test(source), `${path} must not float Node 24`);
  assert(!/dtolnay\/rust-toolchain@stable/.test(source), `${path} must not float Rust stable`);
  assert(!/actions\/checkout@v\d+/.test(source), `${path} must pin actions/checkout by SHA`);
  assert(!/actions\/setup-node@v\d+/.test(source), `${path} must pin actions/setup-node by SHA`);
  assert(!/actions\/upload-artifact@v\d+/.test(source), `${path} must pin actions/upload-artifact by SHA`);
  if (source.includes("actions/checkout@")) assert(source.includes(`actions/checkout@${checkoutSha}`), `${path} checkout SHA mismatch`);
  if (source.includes("actions/setup-node@")) assert(source.includes(`actions/setup-node@${setupNodeSha}`), `${path} setup-node SHA mismatch`);
  if (source.includes("dtolnay/rust-toolchain@")) assert(source.includes(`dtolnay/rust-toolchain@${rustToolchainSha}`), `${path} rust-toolchain action SHA mismatch`);
  if (source.includes("actions/upload-artifact@")) assert(source.includes(`actions/upload-artifact@${uploadArtifactSha}`), `${path} upload-artifact SHA mismatch`);
  if (source.includes("actions/setup-node@")) assert(/node-version:\s*24\.19\.0/.test(source), `${path} must use Node 24.19.0`);
}

const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
assert((ci.match(/\bnpm ci\b/g) || []).length >= 3, "CI must install the locked npm graph in all main jobs");
assert((ci.match(/cargo metadata --locked --manifest-path src-tauri\/Cargo\.toml --no-deps/g) || []).length >= 2, "desktop jobs must verify Cargo.lock with --locked");
assert((ci.match(/git diff --exit-code -- package-lock\.json src-tauri\/Cargo\.lock/g) || []).length >= 2, "desktop jobs must fail on lockfile drift");
assert(ci.includes("npm run test:desktop-build-determinism"), "CI must run the 3K determinism contract");
assert(ci.includes(`dtolnay/rust-toolchain@${rustToolchainSha}`) && /toolchain:\s*1\.97\.1/.test(ci), "CI Rust setup must be exact");

const batchIndex = ci.indexOf("Run native WebView2 Guarded Background Batch runtime smoke");
const installerIndex = ci.indexOf("Build unsigned NSIS installer smoke");
const legacyDeepIndex = ci.indexOf("Run native WebView2 Hosted Deep Analysis runtime smoke");
const providerDeepIndex = ci.indexOf("Observe Hosted Deep Analysis provider health");
const deepIndex = legacyDeepIndex >= 0 ? legacyDeepIndex : providerDeepIndex;
assert(batchIndex >= 0 && installerIndex > batchIndex && deepIndex > installerIndex, "unsigned installer determinism must be verified before live Gemini regression/provider-health smoke");
assert(!ci.includes("TAURI_SIGNING_PRIVATE_KEY:"), "3K must not configure signing credentials");
assert(!/\bupdater\b/i.test(ci), "3K must not activate an updater");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_BUILD_DETERMINISM_CONTRACT_PASS",
  node: "24.19.0",
  rust: "1.97.1",
  npm_lockfile_version: packageLock.lockfileVersion,
  locked_google_genai: packageLock.packages["node_modules/@google/genai"].version,
  locked_next: packageLock.packages["node_modules/next"].version,
  locked_tauri_cli: packageLock.packages["node_modules/@tauri-apps/cli"].version,
  locked_tauri: cargoVersion("tauri"),
  locked_wry: cargoVersion("wry"),
  activation: false
}));
