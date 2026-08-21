import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assert, attachMasterV, delay, execute } from "./windows-webview2-attach.mjs";

if (process.platform !== "win32") throw new Error("Gateway build binding verification must run on Windows");

for (const forbidden of [
  "MASTERV_GATEWAY_BASE_URL",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "POLAR_ACCESS_TOKEN",
  "POLAR_ORGANIZATION_ID",
  "GATEWAY_CREDENTIAL_SIGNING_SECRET",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
]) {
  assert(!process.env[forbidden], `Gateway build binding runtime must not receive environment value: ${forbidden}`);
}

const appBinary = path.resolve("src-tauri", "target", "release", "masterv-desktop.exe");
assert(fs.existsSync(appBinary), `Gateway-bound Desktop probe binary is missing: ${appBinary}`);

const evidenceDir = path.resolve("artifacts", "desktop-gateway-build-binding");
fs.rmSync(evidenceDir, { recursive: true, force: true });
fs.mkdirSync(evidenceDir, { recursive: true });

const runtimeDataDir = path.join(
  process.env.RUNNER_TEMP?.trim() || os.tmpdir(),
  `masterv-gateway-build-binding-webview-${process.pid}`
);
fs.rmSync(runtimeDataDir, { recursive: true, force: true });

async function invokeJson(runtime, command, args = {}) {
  const key = `gatewaybinding${Math.random().toString(36).slice(2)}`;
  const started = await execute(runtime.driverPort, runtime.sessionId, `
    const key = arguments[0];
    const root = document.documentElement;
    root.dataset[key + 'State'] = 'pending';
    root.dataset[key + 'Result'] = '';
    window.__TAURI__.core.invoke(arguments[1], arguments[2] || {})
      .then((value) => {
        root.dataset[key + 'State'] = 'ok';
        root.dataset[key + 'Result'] = JSON.stringify(value);
      })
      .catch((error) => {
        root.dataset[key + 'State'] = 'error';
        root.dataset[key + 'Result'] = String(error);
      });
    return true;
  `, [key, command, args]);
  assert(started === true, `${command} did not start`);

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const snapshot = await execute(runtime.driverPort, runtime.sessionId, `
      const key = arguments[0];
      const root = document.documentElement;
      return { state: root.dataset[key + 'State'] || 'pending', result: root.dataset[key + 'Result'] || '' };
    `, [key]);
    if (snapshot.state === "error") throw new Error(`${command} failed: ${snapshot.result}`);
    if (snapshot.state === "ok") return snapshot.result ? JSON.parse(snapshot.result) : null;
    await delay(250);
  }
  throw new Error(`${command} timed out`);
}

let runtime = null;
try {
  runtime = await attachMasterV(appBinary, evidenceDir, "masterv-gateway-build-binding", {
    dataDir: runtimeDataDir,
    reuseDataDir: false
  });

  const gateway = await invokeJson(runtime, "desktop_gateway_status");
  assert(gateway?.configured === true, `Compile-time Gateway binding was not preserved: ${JSON.stringify(gateway)}`);
  assert(gateway?.authority === "masterv-gateway", `Unexpected Gateway authority: ${gateway?.authority}`);
  assert(gateway?.transport === "native-https-json", `Unexpected Gateway transport: ${gateway?.transport}`);
  assert(gateway?.product_key_bearer_allowed === false, "Product Key must not become a normal Gateway bearer");
  assert(gateway?.device_credential_persisted === true, "Device credential persistence contract changed unexpectedly");
  assert(gateway?.session_credential_persisted === false, "Session credential must remain memory-only");

  const evidence = {
    status: "MASTERV_DESKTOP_GATEWAY_BUILD_BINDING_PASS",
    build_gateway_url_authority: "compile-time-option-env",
    probe_gateway_hostname: "api.masterv.example",
    runtime_gateway_env_injected: false,
    gateway_configured: true,
    gateway_authority: gateway.authority,
    gateway_transport: gateway.transport,
    product_key_bearer_allowed: gateway.product_key_bearer_allowed,
    device_credential_persisted: gateway.device_credential_persisted,
    session_credential_persisted: gateway.session_credential_persisted,
    product_key_submitted: false,
    activation_called: false,
    provider_operation_executed: false,
    polar_mutation: false,
    application_credentials_used: false,
    signing_credentials_used: false,
    release_mutation: false,
    gateway_deployment_mutation: false,
    external_human_pilot_executed: false
  };
  fs.writeFileSync(path.join(evidenceDir, "gateway-build-binding-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  if (runtime) await runtime.close().catch(() => undefined);
  fs.rmSync(runtimeDataDir, { recursive: true, force: true });
}
