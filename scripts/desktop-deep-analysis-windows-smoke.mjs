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

async function probe(apiBase, key, auth) {
  const response = await fetch(`${apiBase}/masterv-api-boundary`, {
    headers: headers(key, auth.access_token, { Accept: "application/json" })
  });
  if (!response.ok) throw new Error(`Hosted capability probe failed: ${await errorText(response)}`);
  return await response.json();
}

async function state(driverPort, sessionId) {
  return await execute(driverPort, sessionId, `return {
    surface: document.querySelector('#surface-badge')?.textContent?.trim() || '',
    auth: document.querySelector('#auth-status')?.textContent?.trim() || '',
    api: document.querySelector('#api-status')?.textContent?.trim() || '',
    deepCapability: document.querySelector('#cap-deep-analysis')?.textContent?.trim() || '',
    deepHidden: Boolean(document.querySelector('#deep-analysis-panel')?.hidden),
    deepStatus: document.querySelector('#deep-analysis-status')?.textContent?.trim() || '',
    deepModel: document.querySelector('#deep-analysis-model')?.textContent?.trim() || '',
    deepSource: document.querySelector('#deep-analysis-source')?.textContent?.trim() || '',
    providerAuthority: document.querySelector('#deep-analysis-panel')?.dataset?.providerAuthority || '',
    providerCredentialsInClient: document.querySelector('#deep-analysis-panel')?.dataset?.providerCredentialsInClient || '',
    computeAuthority: document.querySelector('#deep-analysis-panel')?.dataset?.computeAuthority || '',
    analysisTier: document.querySelector('#deep-analysis-panel')?.dataset?.analysisTier || '',
    persistenceAuthority: document.querySelector('#deep-analysis-panel')?.dataset?.persistenceAuthority || '',
    geminiRequests: document.querySelector('#deep-analysis-panel')?.dataset?.geminiRequests || '',
    submitDisabled: Boolean(document.querySelector('#deep-analysis-submit')?.disabled),
    resultText: document.querySelector('#deep-analysis-content')?.textContent?.trim() || '',
    functionResources: performance.getEntriesByType('resource').filter(e => e.name.includes('/functions/v1/masterv-api-boundary')).length,
    geminiClientResources: performance.getEntriesByType('resource').filter(e => /generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com/i.test(e.name)).length,
    localAnalyzeResources: performance.getEntriesByType('resource').filter(e => e.name.includes('/api/analyze')).length,
    youtubeClientResources: performance.getEntriesByType('resource').filter(e => e.name.includes('googleapis.com/youtube')).length,
    libraryHidden: Boolean(document.querySelector('#reference-library-panel')?.hidden)
  };`);
}

async function waitState(driverPort, sessionId, predicate, label, timeout = 60_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await state(driverPort, sessionId);
    if (predicate(last)) return last;
    await delay(500);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function screenshot(native, evidenceDir, filename) {
  const shot = await webdriverRequest(native.driverPort, "GET", `/session/${native.sessionId}/screenshot`);
  assert(typeof shot.value === "string" && shot.value.length > 100, "3H screenshot missing");
  fs.writeFileSync(path.join(evidenceDir, filename), Buffer.from(shot.value, "base64"));
}

async function main() {
  if (process.platform !== "win32") throw new Error("3H runtime smoke must run on Windows");
  const binary = path.resolve("src-tauri", "target", "release", "masterv-desktop.exe");
  assert(fs.existsSync(binary), `MasterV binary missing: ${binary}`);

  const email = required("SUPABASE_TEST_EMAIL");
  const password = required("SUPABASE_TEST_PASSWORD");
  const url = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const apiBase = required("NEXT_PUBLIC_MASTERV_API_BASE_URL").replace(/\/+$/, "");
  assert(!process.env.GEMINI_API_KEY && !process.env.YOUTUBE_DATA_API_KEY, "Provider credentials must not be present in Desktop runtime smoke");

  const evidenceDir = path.resolve("artifacts", "desktop-deep-analysis");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const auth = await login(url, key, email, password);
  const hosted = await probe(apiBase, key, auth);
  assert(hosted.contract_version === "mv-hosted-api-v1" && hosted.capabilities?.deep_analysis_route === true, "3H hosted Deep Analysis route capability missing");
  const configured = hosted.capabilities?.deep_analysis === true;

  let native;
  let evidence;
  try {
    native = await attachMasterV(binary, evidenceDir, "masterv-desktop-3h");
    await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password'),b=document.querySelector('#login-button');if(!e||!p||!b)return false;e.value=arguments[0];p.value=arguments[1];b.click();return true;`, [email, password]);
    const connected = await waitState(native.driverPort, native.sessionId, s => s.auth === "AUTHENTICATED" && s.api === "CONNECTED" && !s.deepHidden && ["READY", "PENDING"].includes(s.deepCapability), "3H connected state");
    assert(connected.surface === "desktop", `unexpected surface: ${connected.surface}`);
    assert(connected.providerAuthority === "hosted-secret" && connected.providerCredentialsInClient === "false", "3H provider authority markers mismatch");
    assert(connected.computeAuthority === "hosted-deep-analysis" && connected.analysisTier === "deep" && connected.persistenceAuthority === "none", "3H compute/persistence authority markers mismatch");
    assert(connected.geminiClientResources === 0 && connected.localAnalyzeResources === 0 && connected.youtubeClientResources === 0, "3H Desktop must not contact provider/local Next route during connect");

    if (!configured) {
      assert(connected.deepCapability === "PENDING" && connected.deepStatus === "NOT CONFIGURED" && connected.submitDisabled, "3H missing-secret state is not truthful");
      await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password');if(e)e.value='';if(p)p.value='';document.querySelector('#deep-analysis-panel')?.scrollIntoView({block:'start'});return true;`);
      await delay(250);
      await screenshot(native, evidenceDir, "deep-analysis-config-blocked.png");
      await execute(native.driverPort, native.sessionId, "document.querySelector('#logout-button')?.click();return true;");
      const signedOut = await waitState(native.driverPort, native.sessionId, s => s.auth === "SIGNED OUT" && s.deepHidden && s.libraryHidden, "3H blocked logout");
      evidence = {
        status: "MASTERV_WINDOWS_DEEP_ANALYSIS_CONFIG_BLOCKED",
        webview2_runtime_version: native.webviewVersion,
        cdp_browser: native.cdpBrowser,
        attach_mode: true,
        surface: connected.surface,
        auth_status: connected.auth,
        hosted_api_status: connected.api,
        hosted_route: true,
        hosted_provider_configured: false,
        provider_authority: connected.providerAuthority,
        compute_authority: connected.computeAuthority,
        analysis_tier: connected.analysisTier,
        persistence_authority: connected.persistenceAuthority,
        desktop_provider_credentials: false,
        client_gemini_api_delta: 0,
        local_next_analyze_requests: 0,
        persistence_writes: 0,
        lifecycle_blocker: "GEMINI_API_KEY missing from Supabase Edge Function environment",
        logout_clear: signedOut.auth === "SIGNED OUT",
        screenshot: "deep-analysis-config-blocked.png"
      };
    } else {
      assert(connected.deepCapability === "READY" && connected.deepStatus === "READY", "3H Deep Analysis capability must be READY when hosted Gemini secret exists");
      const beforeFunctions = connected.functionResources;
      const beforeGemini = connected.geminiClientResources;
      const beforeLocal = connected.localAnalyzeResources;
      const beforeYoutube = connected.youtubeClientResources;
      const deepUrl = process.env.MASTERV_DESKTOP_DEEP_ANALYSIS_URL?.trim() || "https://www.youtube.com/watch?v=9hE5-98ZeCg";
      const submitted = await execute(native.driverPort, native.sessionId, `const q=document.querySelector('#deep-analysis-url'),b=document.querySelector('#deep-analysis-submit');if(!q||!b)return false;q.value=arguments[0];q.dispatchEvent(new Event('input',{bubbles:true}));if(b.disabled)return false;b.click();return true;`, [deepUrl]);
      assert(submitted, "3H Desktop Deep Analysis form could not submit");
      const analyzed = await waitState(native.driverPort, native.sessionId, s => s.deepStatus === "READY" || s.deepStatus === "ERROR", "3H hosted Deep Analysis result", 240_000);
      if (analyzed.deepStatus === "ERROR") throw new Error(`3H hosted Deep Analysis failed in Desktop: ${analyzed.resultText}`);
      assert(Number(analyzed.geminiRequests) === 1, "3H hosted Gemini request diagnostics mismatch");
      assert(analyzed.functionResources === beforeFunctions + 1, `3H analysis must issue exactly one hosted function request: ${beforeFunctions} -> ${analyzed.functionResources}`);
      assert(analyzed.geminiClientResources === beforeGemini, "3H Desktop issued direct Gemini provider request");
      assert(analyzed.localAnalyzeResources === beforeLocal, "3H Desktop issued local Next analyze request");
      assert(analyzed.youtubeClientResources === beforeYoutube, "3H Desktop issued direct YouTube Data API request");
      assert(analyzed.deepSource.startsWith("yt:"), "3H canonical source identity missing");
      assert(analyzed.deepModel && analyzed.deepModel !== "—", "3H hosted model authority missing");

      await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password');if(e)e.value='';if(p)p.value='';document.querySelector('#deep-analysis-panel')?.scrollIntoView({block:'start'});return true;`);
      await delay(250);
      await screenshot(native, evidenceDir, "deep-analysis.png");
      await execute(native.driverPort, native.sessionId, "document.querySelector('#logout-button')?.click();return true;");
      const signedOut = await waitState(native.driverPort, native.sessionId, s => s.auth === "SIGNED OUT" && s.deepHidden && s.deepSource === "—" && s.resultText === "" && s.libraryHidden, "3H logout");
      evidence = {
        status: "MASTERV_WINDOWS_DEEP_ANALYSIS_RUNTIME_PASS",
        webview2_runtime_version: native.webviewVersion,
        cdp_browser: native.cdpBrowser,
        attach_mode: true,
        surface: connected.surface,
        auth_status: connected.auth,
        hosted_api_status: connected.api,
        deep_analysis_capability: "READY",
        hosted_provider_configured: true,
        provider_authority: analyzed.providerAuthority,
        compute_authority: analyzed.computeAuthority,
        analysis_tier: analyzed.analysisTier,
        persistence_authority: analyzed.persistenceAuthority,
        source_id: analyzed.deepSource,
        model: analyzed.deepModel,
        gemini_requests: Number(analyzed.geminiRequests),
        client_gemini_api_delta: analyzed.geminiClientResources - beforeGemini,
        client_hosted_function_delta: analyzed.functionResources - beforeFunctions,
        local_next_analyze_requests: analyzed.localAnalyzeResources - beforeLocal,
        client_youtube_api_delta: analyzed.youtubeClientResources - beforeYoutube,
        desktop_provider_credentials: false,
        persistence_writes: 0,
        product_truth_migrated: false,
        background_batch_migrated: false,
        logout_clear: signedOut.auth === "SIGNED OUT",
        screenshot: "deep-analysis.png"
      };
    }
  } finally {
    if (native) await native.close();
  }

  assert(evidence, "3H runtime evidence missing");
  fs.writeFileSync(path.join(evidenceDir, "runtime-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
