import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assert, attachMasterV, delay, execute } from "./windows-webview2-attach.mjs";

const EVIDENCE_DIR = path.resolve("artifacts", "desktop-lic-1-sandbox-e2e");
const APP_BINARY = path.resolve("src-tauri", "target", "release", "masterv-desktop.exe");
const REQUIRED_GATEWAY_PROVIDERS = ["license", "billing", "credential", "entitlement", "usage"];
const FORBIDDEN_SERVER_SECRETS = [
  "POLAR_ACCESS_TOKEN",
  "POLAR_ORGANIZATION_ID",
  "POLAR_AI_METER_ID",
  "GATEWAY_CREDENTIAL_SIGNING_SECRET",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
];

function required(name) {
  const value = process.env[name]?.trim() || "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boolEnv(name) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function redactedError(error, secret) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(secret ? message.split(secret).join("[REDACTED]") : message);
}

function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  return String(result.stdout || "").trim();
}

function trackedWorkingTreeState() {
  return git("status", "--porcelain", "--untracked-files=no");
}

function validateSandboxGateway(value) {
  const parsed = new URL(value);
  assert(parsed.protocol === "https:", "Sandbox Gateway must use HTTPS");
  assert(parsed.hostname.toLowerCase().endsWith(".deno.net"), "Sandbox Gateway must use an explicit temporary *.deno.net host");
  assert(!parsed.username && !parsed.password, "Sandbox Gateway URL must not contain credentials");
  assert(!parsed.port, "Sandbox Gateway URL must not contain a custom port");
  assert(parsed.pathname === "/" || parsed.pathname === "", "Sandbox Gateway base URL must not contain a path");
  assert(!parsed.search && !parsed.hash, "Sandbox Gateway base URL must not contain query or fragment components");
  return `${parsed.protocol}//${parsed.hostname}`;
}

async function readHealth(gatewayUrl, guidanceChargeAllowed) {
  const response = await fetch(`${gatewayUrl}/v1/health`, { redirect: "error", cache: "no-store" });
  assert(response.ok, `Sandbox Gateway health failed: HTTP ${response.status}`);
  const body = await response.json();
  assert(body?.service === "masterv-gateway", "Sandbox health service identity mismatch");
  assert(body?.contract_version === "mv-gateway-v1", `Unexpected Gateway contract: ${body?.contract_version}`);
  assert(body?.architecture?.stateless === true, "Sandbox Gateway must remain stateless");
  assert(body?.architecture?.db_less === true, "Sandbox Gateway must remain DB-less");
  assert(body?.architecture?.user_work_data_storage === false, "Sandbox Gateway must not store user work data");
  for (const provider of REQUIRED_GATEWAY_PROVIDERS) {
    assert(body?.providers?.[provider] === true, `Sandbox Gateway provider is not active: ${provider}`);
  }
  if (guidanceChargeAllowed) assert(body?.providers?.ai === true, "Sandbox Guidance charge requested but AI provider is inactive");
  return body;
}

function prepareEphemeralAppDataDir() {
  const root = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `masterv-lic1-sandbox-appdata-${process.pid}`);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  return root;
}

async function invokeJson(runtime, command, args = {}) {
  const key = `lic1${Math.random().toString(36).slice(2)}`;
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

async function uiState(runtime) {
  return await execute(runtime.driverPort, runtime.sessionId, `return {
    href: location.href,
    readyState: document.readyState,
    surface: window.MASTERV_DESKTOP_CONFIG?.surface || '',
    auth: document.querySelector('#auth-status')?.textContent?.trim() || '',
    api: document.querySelector('#api-status')?.textContent?.trim() || '',
    message: document.querySelector('#message')?.textContent?.trim() || '',
    workspace: document.querySelector('#library-workspace')?.textContent?.trim() || '',
    libraryStatus: document.querySelector('#library-status')?.textContent?.trim() || '',
    productKeyValue: document.querySelector('#product-key')?.value || '',
    entitlementHidden: document.querySelector('#entitlement-panel')?.hidden === true,
    entitlementAuthority: document.querySelector('#entitlement-panel')?.dataset?.authority || '',
    entitlementDesktopAuthority: document.querySelector('#entitlement-panel')?.dataset?.desktopAuthority || '',
    entitlementLocalAuthority: document.querySelector('#entitlement-panel')?.dataset?.localDataAuthority || '',
    entitlementPaidAuthority: document.querySelector('#entitlement-panel')?.dataset?.paidOperationAuthority || '',
    entitlementStatus: document.querySelector('#entitlement-status')?.textContent?.trim() || '',
    plan: document.querySelector('#entitlement-plan')?.textContent?.trim() || '',
    license: document.querySelector('#entitlement-license')?.textContent?.trim() || '',
    subscription: document.querySelector('#entitlement-subscription')?.textContent?.trim() || '',
    credits: document.querySelector('#entitlement-credits')?.textContent?.trim() || '',
    deviceLimit: document.querySelector('#entitlement-device-limit')?.textContent?.trim() || '',
    periodEnd: document.querySelector('#entitlement-period-end')?.textContent?.trim() || '',
    sessionExpiry: document.querySelector('#entitlement-session-expiry')?.textContent?.trim() || '',
    localKeys: Object.keys(localStorage),
    sessionKeys: Object.keys(sessionStorage)
  };`);
}

async function waitState(runtime, predicate, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await uiState(runtime);
    if (predicate(last)) return last;
    await delay(350);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

function numericCredits(value, label) {
  const number = Number(value);
  assert(Number.isFinite(number), `${label} must be a finite BASIC credit balance, got ${value}`);
  return number;
}

async function submitProductKey(runtime, productKey) {
  const started = await execute(runtime.driverPort, runtime.sessionId, `
    const input = document.querySelector('#product-key');
    const form = document.querySelector('#activation-form');
    if (!input || !form) return false;
    input.value = arguments[0];
    input.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    return true;
  `, [productKey]);
  assert(started === true, "Desktop activation form was not available");
}

async function invokeGuidance(runtime, analysis, productTruth) {
  const key = `lic1guidance${Math.random().toString(36).slice(2)}`;
  const started = await execute(runtime.driverPort, runtime.sessionId, `
    const key = arguments[0];
    const root = document.documentElement;
    root.dataset[key + 'State'] = 'pending';
    root.dataset[key + 'Result'] = '';
    window.MASTERV_BACKEND.remoteOperations.generateProductionGuidance(null, arguments[1], arguments[2])
      .then((value) => {
        root.dataset[key + 'State'] = 'ok';
        root.dataset[key + 'Result'] = JSON.stringify({ charged_units: value?.usage?.charged_units ?? null });
      })
      .catch((error) => {
        root.dataset[key + 'State'] = 'error';
        root.dataset[key + 'Result'] = String(error);
      });
    return true;
  `, [key, analysis, productTruth]);
  assert(started === true, "Sandbox Guidance operation did not start");

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const snapshot = await execute(runtime.driverPort, runtime.sessionId, `
      const key = arguments[0];
      const root = document.documentElement;
      return { state: root.dataset[key + 'State'] || 'pending', result: root.dataset[key + 'Result'] || '' };
    `, [key]);
    if (snapshot.state === "error") throw new Error(`Sandbox Guidance failed: ${snapshot.result}`);
    if (snapshot.state === "ok") return snapshot.result ? JSON.parse(snapshot.result) : null;
    await delay(350);
  }
  throw new Error("Sandbox Guidance timed out");
}

function assertSecretAbsent(root, secret) {
  if (!secret || !fs.existsSync(root)) return;
  const visit = (target) => {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const full = path.join(target, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        const content = fs.readFileSync(full);
        assert(!content.includes(Buffer.from(secret)), `Sandbox Product Key leaked into evidence file: ${entry.name}`);
      }
    }
  };
  visit(root);
}

const fixtureAnalysis = Object.freeze({
  summary: "MV-DESKTOP-LIC-1 Sandbox lifecycle fixture",
  structure_label: "hook → demo → CTA",
  duration_seconds: 12,
  hook: Object.freeze({ type: "visual", text: "", visual: "synthetic", duration_seconds: 2 }),
  product_presentation: Object.freeze({ first_seen_seconds: 1, demonstration_present: true, before_after_present: false, comparison_present: false, result_visual_present: false, face_present: false, hand_present: true }),
  persuasion: Object.freeze({ problem: "", solution: "", benefit: "", proof: "", social_proof: "", offer: "", cta: "", emotional_trigger: "" }),
  presentation: Object.freeze({ format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" }),
  transcript: Object.freeze({ full: "", segments: Object.freeze([]) }),
  scenes: Object.freeze([]),
  observation_segments: Object.freeze([]),
  tags: Object.freeze(["mv-desktop-lic-1-sandbox"]),
  confidence_notes: Object.freeze(["Synthetic credential-safe Sandbox lifecycle fixture"])
});

const fixtureProductTruth = Object.freeze({
  product_name: "MasterV Sandbox Fixture",
  verified_facts: "Synthetic validation fixture for Desktop entitlement and usage lifecycle.",
  target_customer: "",
  price_offer: ""
});

async function main() {
  if (process.platform !== "win32") throw new Error("MV-DESKTOP-LIC-1 Sandbox E2E must run on Windows");
  assert(boolEnv("MASTERV_SANDBOX_E2E_EPHEMERAL_WINDOWS"), "Refusing to touch Desktop local state without MASTERV_SANDBOX_E2E_EPHEMERAL_WINDOWS=true");
  assert(boolEnv("MASTERV_SANDBOX_E2E_ALLOW_NEW_ACTIVATION"), "Sandbox activation is a real external mutation; set MASTERV_SANDBOX_E2E_ALLOW_NEW_ACTIVATION=true explicitly");

  for (const name of FORBIDDEN_SERVER_SECRETS) {
    assert(!process.env[name]?.trim(), `Sandbox Desktop E2E must not receive server/signing credential: ${name}`);
  }

  const gatewayUrl = validateSandboxGateway(required("MASTERV_GATEWAY_BASE_URL"));
  const requestedSourceSha = required("MASTERV_SANDBOX_E2E_SOURCE_SHA").toLowerCase();
  assert(/^[0-9a-f]{40}$/.test(requestedSourceSha), "MASTERV_SANDBOX_E2E_SOURCE_SHA must be an exact 40-character commit SHA");
  const productKey = required("MASTERV_SANDBOX_PRODUCT_KEY");
  const guidanceChargeAllowed = boolEnv("MASTERV_SANDBOX_E2E_ALLOW_GUIDANCE_CHARGE");
  delete process.env.MASTERV_SANDBOX_PRODUCT_KEY;

  let first = null;
  let second = null;
  let third = null;
  let localDataDir = null;
  try {
    const sourceSha = git("rev-parse", "HEAD").toLowerCase();
    assert(sourceSha === requestedSourceSha, `Exact-head mismatch: requested ${requestedSourceSha}, actual ${sourceSha}`);
    assert(trackedWorkingTreeState() === "", "Sandbox E2E requires a clean tracked working tree");

    const health = await readHealth(gatewayUrl, guidanceChargeAllowed);
    delete process.env.MASTERV_GATEWAY_BASE_URL;

    fs.rmSync(EVIDENCE_DIR, { recursive: true, force: true });
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

    assert(fs.existsSync(APP_BINARY), `Prebuilt Desktop candidate binary missing: ${APP_BINARY}`);
    assert(trackedWorkingTreeState() === "", "Prebuilt Desktop candidate source tree is not clean");

    localDataDir = prepareEphemeralAppDataDir();

    const webviewDataDir = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `masterv-lic1-sandbox-webview-${process.pid}`);
    first = await attachMasterV(APP_BINARY, EVIDENCE_DIR, "masterv-lic1-sandbox-activation", {
      dataDir: webviewDataDir,
      appDataDir: localDataDir,
      reuseDataDir: false,
      driverVerbose: false,
      recordDriverLog: false
    });

    const gatewayStatus = await invokeJson(first, "desktop_gateway_status");
    assert(gatewayStatus?.configured === true, "Exact-head Desktop candidate did not retain build-time Sandbox Gateway binding");
    assert(gatewayStatus?.authority === "masterv-gateway", `Unexpected Desktop Gateway authority: ${gatewayStatus?.authority}`);
    assert(gatewayStatus?.transport === "native-https-json", `Unexpected Desktop Gateway transport: ${gatewayStatus?.transport}`);
    assert(gatewayStatus?.product_key_bearer_allowed === false, "Product Key bearer boundary regressed");
    assert(gatewayStatus?.session_credential_persisted === false, "Session Credential persistence boundary regressed");

    const localStatus = await invokeJson(first, "desktop_local_persistence_status");
    assert(localStatus?.local_sqlite_authority_active === true, "Local SQLite authority is unavailable before activation");
    assert(localStatus?.workspace_id === "local:masterv", `Unexpected local workspace: ${localStatus?.workspace_id}`);

    const freshSecure = await invokeJson(first, "desktop_device_secure_store_status");
    assert(freshSecure?.available === true && freshSecure?.backend === "windows-dpapi", "Windows DPAPI secure store is unavailable");
    assert(freshSecure?.record_present === false, "Ephemeral first run unexpectedly has a persisted device credential");

    const fresh = await waitState(first, (value) =>
      value.href.startsWith("https://tauri.localhost/") &&
      value.readyState !== "loading" &&
      value.surface === "desktop" &&
      value.auth === "LOCAL ONLY" &&
      value.workspace === "local:masterv" &&
      value.libraryStatus === "READY / LOCAL" &&
      value.entitlementHidden === true,
      "Sandbox fresh Desktop state"
    );
    assert(fresh.localKeys.length === 0 && fresh.sessionKeys.length === 0, "Fresh Desktop unexpectedly contains browser persistent auth state");

    await submitProductKey(first, productKey);
    const activated = await waitState(first, (value) =>
      value.auth === "ACTIVATED" &&
      value.api === "CONNECTED" &&
      value.productKeyValue === "" &&
      value.entitlementHidden === false &&
      value.entitlementStatus === "ENTITLED" &&
      value.plan === "BASIC" &&
      value.license === "ACTIVE" &&
      value.deviceLimit === "1" &&
      value.sessionExpiry && value.sessionExpiry !== "—",
      "Sandbox Product Key activation",
      90_000
    );
    assert(activated.entitlementAuthority === "gateway-polar-readback", "Entitlement projection authority regressed");
    assert(activated.entitlementDesktopAuthority === "projection-only", "Desktop entitlement became an authorization authority");
    assert(activated.entitlementLocalAuthority === "local-sqlite", "Entitlement UI lost Local SQLite boundary");
    assert(activated.entitlementPaidAuthority === "masterv-gateway", "Paid-operation authority regressed");
    const activatedCredits = numericCredits(activated.credits, "Activated BASIC credits");

    const secureAfterActivation = await invokeJson(first, "desktop_device_secure_store_status");
    assert(secureAfterActivation?.record_present === true, "Activation did not persist the DPAPI Device Credential");
    assert(secureAfterActivation?.backend === "windows-dpapi", "Activation did not use Windows DPAPI");
    assert(secureAfterActivation?.product_key_stored === false, "Product Key persistence boundary regressed");
    assert(secureAfterActivation?.session_credential_stored === false, "Session Credential persistence boundary regressed");

    await first.close();
    first = null;

    second = await attachMasterV(APP_BINARY, EVIDENCE_DIR, "masterv-lic1-sandbox-resume", {
      dataDir: webviewDataDir,
      appDataDir: localDataDir,
      reuseDataDir: true,
      driverVerbose: false,
      recordDriverLog: false
    });
    const resumed = await waitState(second, (value) =>
      value.auth === "DEVICE RESUMED" &&
      value.api === "CONNECTED" &&
      value.entitlementHidden === false &&
      value.entitlementStatus === "ENTITLED" &&
      value.plan === "BASIC" &&
      value.license === "ACTIVE" &&
      value.deviceLimit === "1" &&
      value.productKeyValue === "",
      "Sandbox DPAPI device-session resume",
      90_000
    );
    const resumedCredits = numericCredits(resumed.credits, "Resumed BASIC credits");
    assert(resumedCredits === activatedCredits, `Restart resume unexpectedly changed usage balance: ${activatedCredits} → ${resumedCredits}`);

    let finalCredits = resumedCredits;
    let postGuidanceRestartCredits = resumedCredits;
    let chargedUnits = 0;
    if (guidanceChargeAllowed) {
      assert(resumedCredits === 29, `Guidance safety requires authoritative pre-charge BASIC credits=29, got ${resumedCredits}`);
      const receipt = await invokeGuidance(second, fixtureAnalysis, fixtureProductTruth);
      assert(receipt?.charged_units === 1, `Sandbox Guidance expected 1 charged unit, got ${receipt?.charged_units}`);
      const afterCharge = await waitState(second, (value) => Number(value.credits) === resumedCredits - 1, "Sandbox post-Guidance entitlement readback", 90_000);
      finalCredits = numericCredits(afterCharge.credits, "Post-Guidance BASIC credits");
      chargedUnits = 1;
      assert(finalCredits === 28, `Guidance authoritative readback expected BASIC credits=28, got ${finalCredits}`);

      await second.close();
      second = null;

      third = await attachMasterV(APP_BINARY, EVIDENCE_DIR, "masterv-lic1-sandbox-post-guidance-resume", {
        dataDir: webviewDataDir,
        appDataDir: localDataDir,
        reuseDataDir: true,
        driverVerbose: false,
        recordDriverLog: false
      });
      const postGuidanceResumed = await waitState(third, (value) =>
        value.auth === "DEVICE RESUMED" &&
        value.api === "CONNECTED" &&
        value.entitlementHidden === false &&
        value.entitlementStatus === "ENTITLED" &&
        value.plan === "BASIC" &&
        value.license === "ACTIVE" &&
        value.deviceLimit === "1" &&
        value.productKeyValue === "",
        "Sandbox post-Guidance DPAPI device-session resume",
        90_000
      );
      postGuidanceRestartCredits = numericCredits(postGuidanceResumed.credits, "Post-Guidance restart BASIC credits");
      assert(postGuidanceRestartCredits === finalCredits, `Post-Guidance restart must not charge again: ${finalCredits} → ${postGuidanceRestartCredits}`);

      await third.close();
      third = null;
    } else {
      await second.close();
      second = null;
    }

    const evidence = Object.freeze({
      status: "MASTERV_DESKTOP_LIC_1_SANDBOX_E2E_PASS",
      source_sha: sourceSha,
      gateway_class: "deno-sandbox",
      gateway_host: new URL(gatewayUrl).hostname,
      gateway_contract_version: health.contract_version,
      gateway_stateless: health.architecture.stateless === true,
      gateway_db_less: health.architecture.db_less === true,
      local_sqlite_pre_activation_access: true,
      desktop_app_data_isolated: true,
      desktop_gateway_build_binding: true,
      runtime_gateway_env_injected: false,
      product_key_activation_verified: true,
      product_key_persisted: false,
      device_credential_backend: "windows-dpapi",
      device_credential_persisted: true,
      session_credential_persisted: false,
      restart_device_resume_verified: true,
      post_guidance_restart_verified: guidanceChargeAllowed,
      entitlement_projection_authority: "gateway-polar-readback",
      desktop_entitlement_authority: "projection-only",
      plan: resumed.plan,
      license_status: resumed.license,
      subscription_projection: resumed.subscription,
      device_limit: Number(resumed.deviceLimit),
      credits_after_activation: activatedCredits,
      credits_after_restart: resumedCredits,
      guidance_charge_authorized: guidanceChargeAllowed,
      guidance_charged_units: chargedUnits,
      credits_before_guidance: guidanceChargeAllowed ? resumedCredits : null,
      credits_after_guidance: finalCredits,
      credits_after_guidance_restart: guidanceChargeAllowed ? postGuidanceRestartCredits : null,
      server_activation_cleanup_performed: false,
      local_activation_state_preserved: true,
      production_polar_mutation: false,
      production_signing_mutation: false,
      release_publication: false,
      raw_credentials_in_evidence: false
    });
    fs.writeFileSync(path.join(EVIDENCE_DIR, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    assertSecretAbsent(EVIDENCE_DIR, productKey);
    console.log(JSON.stringify(evidence));
  } catch (error) {
    throw redactedError(error, productKey);
  } finally {
    if (first) await first.close().catch(() => undefined);
    if (second) await second.close().catch(() => undefined);
    if (third) await third.close().catch(() => undefined);
    delete process.env.MASTERV_SANDBOX_PRODUCT_KEY;
    delete process.env.MASTERV_GATEWAY_BASE_URL;
    if (localDataDir) {
      const deviceIdentityPath = path.join(localDataDir, "device-identity.dpapi");
      const preserveActivationState = fs.existsSync(deviceIdentityPath);
      if (preserveActivationState) {
        console.error(`MASTERV_DESKTOP_LIC_1_SANDBOX_E2E_LOCAL_STATE_PRESERVED=${localDataDir}`);
      } else {
        fs.rmSync(localDataDir, { recursive: true, force: true });
      }
    }
    assertSecretAbsent(EVIDENCE_DIR, productKey);
  }
}

await main();
