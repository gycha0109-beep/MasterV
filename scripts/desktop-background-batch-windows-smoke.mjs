import fs from "node:fs";
import path from "node:path";
import { assert, attachMasterV, delay, execute, required, webdriverRequest } from "./windows-webview2-attach.mjs";

function headers(key, token, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${token}`, ...extra };
}

async function errorText(response) {
  try {
    const body = await response.json();
    return body.message || body.details || body.error_description || body.error || `${response.status}`;
  } catch {
    return `${response.status} ${response.statusText}`.trim();
  }
}

async function login(url, key, email, password) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(`Direct Supabase login failed: ${await errorText(response)}`);
  const body = await response.json();
  assert(body.access_token && body.user?.id, "Direct login response incomplete");
  return body;
}

async function probeBatch(apiBase, key, auth) {
  const response = await fetch(`${apiBase}/masterv-background-batch-boundary`, {
    headers: headers(key, auth.access_token, { Accept: "application/json" })
  });
  if (!response.ok) throw new Error(`Hosted Background Batch capability probe failed: ${await errorText(response)}`);
  return await response.json();
}

async function state(driverPort, sessionId) {
  return await execute(driverPort, sessionId, `return {
    surface: document.querySelector('#surface-badge')?.textContent?.trim() || '',
    auth: document.querySelector('#auth-status')?.textContent?.trim() || '',
    api: document.querySelector('#api-status')?.textContent?.trim() || '',
    capability: document.querySelector('#cap-background-batch')?.textContent?.trim() || '',
    panelHidden: Boolean(document.querySelector('#background-batch-panel')?.hidden),
    batchStatus: document.querySelector('#background-batch-status')?.textContent?.trim() || '',
    providerPrecondition: document.querySelector('#background-batch-provider-precondition')?.textContent?.trim() || '',
    liveVerified: document.querySelector('#background-batch-live-verified')?.textContent?.trim() || '',
    activation: document.querySelector('#background-batch-activation')?.textContent?.trim() || '',
    count: document.querySelector('#background-batch-count')?.textContent?.trim() || '',
    submitDisabled: Boolean(document.querySelector('#background-batch-submit')?.disabled),
    refreshDisabled: Boolean(document.querySelector('#background-batch-refresh')?.disabled),
    providerAuthority: document.querySelector('#background-batch-panel')?.dataset?.providerAuthority || '',
    modelAuthority: document.querySelector('#background-batch-panel')?.dataset?.modelAuthority || '',
    persistenceAuthority: document.querySelector('#background-batch-panel')?.dataset?.persistenceAuthority || '',
    ledgerWriteAuthority: document.querySelector('#background-batch-panel')?.dataset?.ledgerWriteAuthority || '',
    workspaceAuthority: document.querySelector('#background-batch-panel')?.dataset?.workspaceAuthority || '',
    createIdempotency: document.querySelector('#background-batch-panel')?.dataset?.createIdempotency || '',
    autoRetry: document.querySelector('#background-batch-panel')?.dataset?.autoRetry || '',
    referenceLibraryWrites: document.querySelector('#background-batch-panel')?.dataset?.referenceLibraryWrites || '',
    directGeminiRequests: document.querySelector('#background-batch-panel')?.dataset?.directGeminiRequests || '',
    batchBoundaryResources: performance.getEntriesByType('resource').filter(e => e.name.includes('/functions/v1/masterv-background-batch-boundary')).length,
    geminiClientResources: performance.getEntriesByType('resource').filter(e => /generativelanguage\\.googleapis\\.com|aiplatform\\.googleapis\\.com/i.test(e.name)).length,
    localApiResources: performance.getEntriesByType('resource').filter(e => /\/api\//.test(e.name)).length,
    batchItems: document.querySelectorAll('[data-batch-request-id]').length,
    urlValue: document.querySelector('#background-batch-url')?.value || '',
    libraryHidden: Boolean(document.querySelector('#reference-library-panel')?.hidden)
  };`);
}

async function waitState(driverPort, sessionId, predicate, label, timeout = 60_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await state(driverPort, sessionId);
    if (predicate(last)) return last;
    await delay(400);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function screenshot(native, evidenceDir, filename) {
  const shot = await webdriverRequest(native.driverPort, "GET", `/session/${native.sessionId}/screenshot`);
  assert(typeof shot.value === "string" && shot.value.length > 100, "3J screenshot missing");
  fs.writeFileSync(path.join(evidenceDir, filename), Buffer.from(shot.value, "base64"));
}

async function main() {
  if (process.platform !== "win32") throw new Error("3J runtime smoke must run on Windows");
  const binary = path.resolve("src-tauri", "target", "release", "masterv-desktop.exe");
  assert(fs.existsSync(binary), `MasterV binary missing: ${binary}`);

  const email = required("SUPABASE_TEST_EMAIL");
  const password = required("SUPABASE_TEST_PASSWORD");
  const url = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const apiBase = required("NEXT_PUBLIC_MASTERV_API_BASE_URL").replace(/\/+$/, "");
  assert(!process.env.GEMINI_API_KEY && !process.env.YOUTUBE_DATA_API_KEY, "Provider credentials must not be present in Desktop runtime smoke");

  const evidenceDir = path.resolve("artifacts", "desktop-background-batch");
  fs.mkdirSync(evidenceDir, { recursive: true });

  const auth = await login(url, key, email, password);
  const hosted = await probeBatch(apiBase, key, auth);
  assert(hosted.contract_version === "background-batch-hosted-v1", "3J hosted contract version mismatch");
  assert(hosted.capabilities?.boundary_probe === true, "3J hosted boundary probe missing");
  assert(hosted.capabilities?.durable_ledger === true, "3J durable ledger capability missing");
  assert(hosted.capabilities?.list_route === true && hosted.capabilities?.check_route === true && hosted.capabilities?.submit_route === true, "3J hosted routes missing");
  assert(hosted.capabilities?.provider_secret_configured === true, "3J hosted Gemini secret is not configured");
  assert(hosted.capabilities?.provider_precondition_confirmed === false, "3J provider precondition must remain unconfirmed until paid/live verification changes");
  assert(hosted.capabilities?.live_batch_verified === false, "3J live Batch must remain unverified before provider success");
  assert(hosted.capabilities?.desktop_submit_enabled === false, "3J Desktop submit activation must remain off");
  assert(hosted.capabilities?.submit === false, "3J submit capability must remain blocked");
  assert(hosted.authority?.workspace === "jwt-derived-personal", "3J workspace authority mismatch");
  assert(hosted.authority?.provider === "hosted-secret", "3J provider authority mismatch");
  assert(hosted.authority?.ledger_write === "hosted-admin-only", "3J ledger write authority mismatch");
  assert(hosted.authority?.auto_retry === false && hosted.authority?.reference_library_write === false, "3J hosted guardrail mismatch");

  let native;
  let evidence;
  try {
    native = await attachMasterV(binary, evidenceDir, "masterv-desktop-3j");
    await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password'),b=document.querySelector('#login-button');if(!e||!p||!b)return false;e.value=arguments[0];p.value=arguments[1];b.click();return true;`, [email, password]);
    const connected = await waitState(native.driverPort, native.sessionId, s => s.auth === "AUTHENTICATED" && s.api === "CONNECTED" && !s.panelHidden && s.batchStatus === "CHECK REQUIRED", "3J connected state");
    assert(connected.surface === "desktop", `unexpected surface: ${connected.surface}`);
    assert(connected.capability === "—", `3J capability must not auto-probe after login, got ${connected.capability}`);
    assert(connected.batchBoundaryResources === 0, `3J must not auto-call dedicated boundary after login, got ${connected.batchBoundaryResources}`);
    assert(connected.submitDisabled, "3J submit must remain disabled before explicit capability refresh");
    assert(!connected.refreshDisabled, "3J explicit refresh must be available after login");
    assert(connected.providerAuthority === "hosted-secret", "3J Desktop provider authority mismatch");
    assert(connected.modelAuthority === "hosted-config", "3J Desktop model authority mismatch");
    assert(connected.persistenceAuthority === "durable-ledger", "3J Desktop persistence authority mismatch");
    assert(connected.ledgerWriteAuthority === "hosted-admin-only", "3J Desktop ledger write authority mismatch");
    assert(connected.workspaceAuthority === "jwt-derived-personal", "3J Desktop workspace authority mismatch");
    assert(connected.createIdempotency === "request-id-reservation", "3J request reservation marker mismatch");
    assert(connected.autoRetry === "false", "3J Desktop auto retry must be false");
    assert(connected.referenceLibraryWrites === "0" && connected.directGeminiRequests === "0", "3J Desktop side-effect markers mismatch");
    assert(connected.geminiClientResources === 0 && connected.localApiResources === 0, "3J Desktop contacted provider/local API during login");

    const beforeBatchResources = connected.batchBoundaryResources;
    const beforeGemini = connected.geminiClientResources;
    const beforeLocalApi = connected.localApiResources;
    const refreshed = await execute(native.driverPort, native.sessionId, `const b=document.querySelector('#background-batch-refresh');if(!b||b.disabled)return false;b.click();return true;`);
    assert(refreshed, "3J explicit Background Batch refresh could not start");
    const guarded = await waitState(native.driverPort, native.sessionId, s => s.capability === "BLOCKED" && s.batchStatus === "PROVIDER PRECONDITION BLOCKED" && s.providerPrecondition === "BLOCKED" && s.liveVerified === "NOT VERIFIED" && s.activation === "OFF" && s.batchBoundaryResources >= beforeBatchResources + 2, "3J guarded boundary refresh");
    assert(guarded.batchBoundaryResources === beforeBatchResources + 2, `3J refresh must issue exactly one capability GET and one ledger list POST: ${beforeBatchResources} -> ${guarded.batchBoundaryResources}`);
    assert(guarded.submitDisabled, "3J submit must remain disabled under blocked provider precondition");
    assert(guarded.geminiClientResources === beforeGemini, "3J Desktop issued direct Gemini provider request during refresh");
    assert(guarded.localApiResources === beforeLocalApi, "3J Desktop issued local Next API request during refresh");

    const testUrl = "https://www.youtube.com/watch?v=9hE5-98ZeCg";
    await execute(native.driverPort, native.sessionId, `const q=document.querySelector('#background-batch-url');if(!q)return false;q.value=arguments[0];q.dispatchEvent(new Event('input',{bubbles:true}));return true;`, [testUrl]);
    const filled = await state(native.driverPort, native.sessionId);
    assert(filled.urlValue === testUrl, "3J URL input did not retain test value");
    assert(filled.submitDisabled, "3J submit became enabled despite blocked provider/live/activation gate");
    assert(filled.batchBoundaryResources === guarded.batchBoundaryResources, "3J input mutation must not trigger hosted Batch traffic");

    await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password');if(e)e.value='';if(p)p.value='';document.querySelector('#background-batch-panel')?.scrollIntoView({block:'start'});return true;`);
    await delay(250);
    await screenshot(native, evidenceDir, "background-batch-guard-blocked.png");

    await execute(native.driverPort, native.sessionId, "document.querySelector('#logout-button')?.click();return true;");
    const signedOut = await waitState(native.driverPort, native.sessionId, s => s.auth === "SIGNED OUT" && s.panelHidden && !s.urlValue && s.libraryHidden, "3J logout");

    evidence = {
      status: "MASTERV_WINDOWS_BACKGROUND_BATCH_GUARD_RUNTIME_PASS",
      webview2_runtime_version: native.webviewVersion,
      cdp_browser: native.cdpBrowser,
      attach_mode: true,
      surface: connected.surface,
      auth_status: connected.auth,
      hosted_api_status: connected.api,
      guarded_boundary: "PASS",
      durable_ledger: true,
      provider_secret_configured: true,
      provider_precondition_confirmed: false,
      live_batch_verified: false,
      desktop_submit_enabled: false,
      submit_capability: false,
      provider_authority: guarded.providerAuthority,
      model_authority: guarded.modelAuthority,
      persistence_authority: guarded.persistenceAuthority,
      ledger_write_authority: guarded.ledgerWriteAuthority,
      workspace_authority: guarded.workspaceAuthority,
      create_idempotency: guarded.createIdempotency,
      auto_retry: false,
      desktop_provider_credentials: false,
      batch_boundary_request_delta: guarded.batchBoundaryResources - beforeBatchResources,
      batch_submit_requests: 0,
      batch_create_attempts: 0,
      client_gemini_api_delta: guarded.geminiClientResources - beforeGemini,
      local_next_api_delta: guarded.localApiResources - beforeLocalApi,
      reference_library_writes: 0,
      lifecycle_blocker: "provider paid-tier/live Batch precondition not verified",
      logout_clear: signedOut.auth === "SIGNED OUT",
      screenshot: "background-batch-guard-blocked.png"
    };
  } finally {
    if (native) await native.close();
  }

  assert(evidence, "3J runtime evidence missing");
  fs.writeFileSync(path.join(evidenceDir, "runtime-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
