import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tauriConfig = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
const localWork = fs.readFileSync("desktop/backend/local/local-work-data-provider.js", "utf8");
const gatewaySession = fs.readFileSync("desktop/backend/gateway/gateway-session-provider.js", "utf8");
const gatewayRemote = fs.readFileSync("desktop/backend/gateway/gateway-remote-provider.js", "utf8");

assert(tauriConfig.app?.withGlobalTauri === true, "Vanilla Desktop adapters require app.withGlobalTauri=true for window.__TAURI__");
for (const [label, source] of [
  ["local work-data", localWork],
  ["gateway session", gatewaySession],
  ["gateway remote", gatewayRemote]
]) {
  assert(source.includes("window.__TAURI__?.core?.invoke"), `${label} adapter must use the native Tauri invoke boundary`);
}

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_2C_TAURI_RUNTIME_BRIDGE_PASS",
  with_global_tauri: true,
  local_sqlite_native_invoke: true,
  gateway_native_invoke: true
}));
