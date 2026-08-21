import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], { cwd: root, env: { ...process.env }, encoding: "utf8" });
assert(build.status === 0, `desktop static builder failed: ${build.stderr || build.stdout}`);

const outputDir = path.join(root, "desktop-dist");
for (const filename of ["index.html", "styles.css", "app.js", "config.js", "backend/provider-boundary.js", "backend/gateway/gateway-session-provider.js", "backend/gateway/gateway-remote-provider.js", "backend/local/local-work-data-provider.js", "backend/bridge/transition-provider.js", "backend/backend.js", "reference-compiler.js"]) {
  assert(fs.existsSync(path.join(outputDir, filename)), `desktop-dist/${filename} missing`);
}
assert(!fs.existsSync(path.join(outputDir, "backend", "legacy")), "clean-cut Desktop output must not contain legacy backend assets");

const configText = fs.readFileSync(path.join(outputDir, "config.js"), "utf8");
assert(configText.includes('"surface":"desktop"'), "desktop config must declare desktop surface");
assert(configText.includes('"runtime_contract_version":"mv-desktop-runtime-v2"'), "desktop runtime contract version mismatch");
assert(configText.includes('"architecture_stage":"MV-EXIT-3-CLEAN-CUT"'), "desktop clean-cut stage missing");
assert(configText.includes('"release_track":"0.1.3"'), "desktop release track mismatch");

const runtimeIndex = fs.readFileSync(path.join(outputDir, "index.html"), "utf8");
for (const asset of ["./backend/provider-boundary.js", "./backend/gateway/gateway-session-provider.js", "./backend/gateway/gateway-remote-provider.js", "./backend/local/local-work-data-provider.js", "./reference-compiler.js", "./backend/bridge/transition-provider.js", "./backend/backend.js", "./app.js"]) {
  assert(runtimeIndex.includes(asset), `desktop runtime asset missing: ${asset}`);
}
assert(!runtimeIndex.includes("backend/legacy"), "Desktop runtime index must not load legacy assets");
assert(runtimeIndex.indexOf("./backend/backend.js") < runtimeIndex.indexOf("./app.js"), "backend composition must load before app consumer");

const appText = fs.readFileSync(path.join(outputDir, "app.js"), "utf8");
assert(appText.includes("window.MASTERV_BACKEND"), "desktop shell must consume backend provider boundary");
assert(appText.includes('dataset.architectureStage = "MV-EXIT-3-CLEAN-CUT"'), "desktop app clean-cut authority marker missing");
assert(!appText.includes("localStorage") && !appText.includes("sessionStorage"), "Desktop auth/session must not use browser persistent storage");

const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
assert(tauriConfig.build?.frontendDist === "../desktop-dist", "Tauri frontendDist mismatch");
const csp = String(tauriConfig.app?.security?.csp || "");
assert(csp.includes("connect-src 'self'"), "Tauri CSP must permit only application self transport from WebView");
assert(!csp.includes("wss://") && !/connect-src[^;]*https:\/\//.test(csp), "Tauri WebView must not retain external runtime network allowances");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_SHELL_CLEAN_CUT_PASS",
  architecture_stage: "MV-EXIT-3-CLEAN-CUT",
  release_track: "0.1.3",
  backend_provider_boundary: true,
  gateway_primary: true,
  local_sqlite_primary: true,
  legacy_runtime_assets: 0,
  external_webview_network_allowances: 0,
  browser_persistent_auth_storage: false
}));
