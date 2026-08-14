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

const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], {
  cwd: root,
  env,
  encoding: "utf8"
});

assert(build.status === 0, `desktop static builder failed: ${build.stderr || build.stdout}`);

const outputDir = path.join(root, "desktop-dist");
for (const filename of ["index.html", "styles.css", "app.js", "config.js"]) {
  assert(fs.existsSync(path.join(outputDir, filename)), `desktop-dist/${filename} missing`);
}

const configText = fs.readFileSync(path.join(outputDir, "config.js"), "utf8");
assert(configText.includes('"surface":"desktop"'), "desktop config must declare desktop surface");
assert(configText.includes('"api_contract_version":"mv-hosted-api-v1"'), "desktop config contract version mismatch");
assert(!configText.includes("service_role"), "desktop public config must never contain service-role material");
assert(!configText.includes("GEMINI_API_KEY"), "desktop public config must never contain Gemini credentials");
assert(!configText.includes("YOUTUBE_DATA_API_KEY"), "desktop public config must never contain YouTube credentials");

const appText = fs.readFileSync(path.join(outputDir, "app.js"), "utf8");
assert(!appText.includes('fetch("/api/'), "desktop shell must not call local Next /api routes");
assert(appText.includes("masterv-api-boundary"), "desktop shell must probe the hosted API boundary");

const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
assert(tauriConfig.build?.frontendDist === "../desktop-dist", "Tauri frontendDist must point to static desktop output");
assert(tauriConfig.bundle?.active === false, "3B must not claim installer bundling yet");
assert(String(tauriConfig.app?.security?.csp || "").includes("https://euqkjrmrhhvnyzasppnd.supabase.co"), "Tauri CSP must explicitly allow the MasterV Supabase origin");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_SHELL_CONTRACT_PASS",
  frontend_dist: tauriConfig.build.frontendDist,
  bundle_active: tauriConfig.bundle.active,
  local_next_api_calls: 0,
  provider_secrets_embedded: 0
}));
