import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_contract_fixture",
  NEXT_PUBLIC_MASTERV_API_BASE_URL: "https://example.supabase.co/functions/v1",
  MASTERV_DESKTOP_REQUIRE_CONFIG: "1"
};
const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], { cwd: root, env, encoding: "utf8" });
assert(build.status === 0, `desktop static builder failed: ${build.stderr || build.stdout}`);

const outputDir = path.join(root, "desktop-dist");
for (const filename of ["index.html", "styles.css", "app.js", "config.js"]) assert(fs.existsSync(path.join(outputDir, filename)), `desktop-dist/${filename} missing`);
for (const filename of ["backend/provider-boundary.js", "backend/legacy/runtime-config.js", "backend/legacy/supabase-session-provider.js", "backend/legacy/supabase-work-data-provider.js", "backend/legacy/hosted-api-client.js", "backend/backend.js"]) assert(fs.existsSync(path.join(outputDir, filename)), `desktop-dist/${filename} missing`);

const iconPath = path.join(root, "src-tauri", "icons", "icon.png");
assert(fs.existsSync(iconPath), "generated Tauri icon missing");
const icon = fs.readFileSync(iconPath);
assert(icon.length > 24, "generated Tauri icon is unexpectedly small");
assert(icon.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "generated Tauri icon must be a PNG");
assert(icon.readUInt32BE(16) === 128 && icon.readUInt32BE(20) === 128, "generated Tauri icon must be 128x128");
const windowsIconPath = path.join(root, "src-tauri", "icons", "icon.ico");
assert(fs.existsSync(windowsIconPath), "generated Windows Tauri icon missing");
const windowsIcon = fs.readFileSync(windowsIconPath);
assert(windowsIcon.length > 22, "generated Windows icon is unexpectedly small");
assert(windowsIcon.readUInt16LE(0) === 0, "ICO reserved field must be zero");
assert(windowsIcon.readUInt16LE(2) === 1, "ICO type must be icon");
assert(windowsIcon.readUInt16LE(4) >= 1, "ICO must contain at least one image");
assert(windowsIcon.readUInt8(6) === 128 && windowsIcon.readUInt8(7) === 128, "generated Windows icon must contain a 128x128 image");
assert(windowsIcon.subarray(22, 30).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "ICO payload must contain PNG image data");

const configText = fs.readFileSync(path.join(outputDir, "config.js"), "utf8");
assert(configText.includes('"surface":"desktop"'), "desktop config must declare desktop surface");
assert(configText.includes('"runtime_contract_version":"mv-desktop-runtime-v1"'), "desktop runtime contract version mismatch");
assert(configText.includes('"backend_provider_contract_version":"mv-backend-provider-v1"'), "desktop provider contract version mismatch");
for (const forbidden of ["supabase_url", "supabase_publishable_key", "api_base_url", "api_contract_version", "NEXT_PUBLIC_SUPABASE", "service_role", "GEMINI_API_KEY", "YOUTUBE_DATA_API_KEY"]) {
  assert(!configText.includes(forbidden), `desktop generic config must remain vendor-neutral: ${forbidden}`);
}

const legacyConfigText = fs.readFileSync(path.join(outputDir, "backend", "legacy", "runtime-config.js"), "utf8");
assert(legacyConfigText.includes("MASTERV_LEGACY_RUNTIME_CONFIG"), "legacy runtime config asset missing");
assert(legacyConfigText.includes('"supabase_url":"https://example.supabase.co"'), "legacy runtime Supabase URL fixture missing");
assert(legacyConfigText.includes('"supabase_publishable_key":"sb_publishable_contract_fixture"'), "legacy runtime publishable key fixture missing");
assert(legacyConfigText.includes('"api_contract_version":"mv-hosted-api-v1"'), "legacy hosted API contract version mismatch");
assert(!legacyConfigText.includes("service_role"), "legacy public runtime config must never contain service-role material");
assert(!legacyConfigText.includes("GEMINI_API_KEY"), "legacy public runtime config must never contain Gemini credentials");
assert(!legacyConfigText.includes("YOUTUBE_DATA_API_KEY"), "legacy public runtime config must never contain YouTube credentials");

const appText = fs.readFileSync(path.join(outputDir, "app.js"), "utf8");
const remoteText = fs.readFileSync(path.join(outputDir, "backend", "legacy", "hosted-api-client.js"), "utf8");
assert(!appText.includes('fetch("/api/'), "desktop shell must not call local Next /api routes");
assert(appText.includes("window.MASTERV_BACKEND"), "desktop shell must consume the backend provider boundary");
assert(appText.includes("backend.remoteOperations.probeCapabilities"), "desktop shell must probe capabilities through the backend provider");
assert(!appText.includes("masterv-api-boundary"), "desktop shell consumer must not know the hosted API endpoint");
assert(remoteText.includes("masterv-api-boundary"), "legacy hosted adapter must retain current hosted API endpoint authority");

const runtimeIndex = fs.readFileSync(path.join(outputDir, "index.html"), "utf8");
for (const asset of ["./backend/provider-boundary.js", "./backend/legacy/runtime-config.js", "./backend/legacy/supabase-session-provider.js", "./backend/legacy/supabase-work-data-provider.js", "./backend/legacy/hosted-api-client.js", "./backend/backend.js", "./app.js"]) {
  assert(runtimeIndex.includes(asset), `desktop runtime asset missing: ${asset}`);
}
assert(runtimeIndex.indexOf("./backend/legacy/runtime-config.js") < runtimeIndex.indexOf("./backend/legacy/supabase-session-provider.js"), "legacy runtime config must load before legacy session provider");
assert(runtimeIndex.indexOf("./backend/legacy/runtime-config.js") < runtimeIndex.indexOf("./backend/backend.js"), "legacy runtime config must load before backend composition");
assert(runtimeIndex.indexOf("./backend/backend.js") < runtimeIndex.indexOf("./app.js"), "backend composition must load before app consumer");

const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
assert(tauriConfig.build?.frontendDist === "../desktop-dist", "Tauri frontendDist must point to static desktop output");
assert(tauriConfig.bundle?.active === false, "3B must not claim installer bundling yet");
assert(String(tauriConfig.app?.security?.csp || "").includes("https://euqkjrmrhhvnyzasppnd.supabase.co"), "Tauri CSP must explicitly allow the current MasterV Supabase origin");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_SHELL_CONTRACT_PASS",
  frontend_dist: tauriConfig.build.frontendDist,
  bundle_active: tauriConfig.bundle.active,
  backend_provider_boundary: true,
  desktop_config_vendor_neutral: true,
  legacy_runtime_config_isolated: true,
  app_direct_hosted_endpoint_knowledge: false,
  tauri_icon_png: true,
  tauri_icon_size: "128x128",
  tauri_windows_icon_ico: true,
  local_next_api_calls: 0,
  provider_secrets_embedded: 0
}));
