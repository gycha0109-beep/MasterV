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
    youtubeCapability: document.querySelector('#cap-youtube')?.textContent?.trim() || '',
    discoveryHidden: Boolean(document.querySelector('#discovery-panel')?.hidden),
    discoveryStatus: document.querySelector('#discovery-status')?.textContent?.trim() || '',
    discoveryCount: document.querySelector('#discovery-count')?.textContent?.trim() || '',
    providerAuthority: document.querySelector('#discovery-panel')?.dataset?.providerAuthority || '',
    providerCredentialsInClient: document.querySelector('#discovery-panel')?.dataset?.providerCredentialsInClient || '',
    analysisAuthority: document.querySelector('#discovery-panel')?.dataset?.analysisAuthority || '',
    youtubeApiRequests: document.querySelector('#discovery-panel')?.dataset?.youtubeApiRequests || '',
    searchDisabled: Boolean(document.querySelector('#discovery-search')?.disabled),
    discoveryIds: Array.from(document.querySelectorAll('[data-discovery-source-id]')).map(n => n.dataset.discoverySourceId || ''),
    discoveryText: document.querySelector('#discovery-results')?.textContent?.trim() || '',
    functionResources: performance.getEntriesByType('resource').filter(e => e.name.includes('/functions/v1/masterv-api-boundary')).length,
    youtubeClientResources: performance.getEntriesByType('resource').filter(e => e.name.includes('googleapis.com/youtube')).length,
    localDiscoveryResources: performance.getEntriesByType('resource').filter(e => e.name.includes('/api/discover/youtube')).length,
    libraryHidden: Boolean(document.querySelector('#reference-library-panel')?.hidden)
  };`);
}

async function waitState(driverPort, sessionId, predicate, label, timeout = 45_000) {
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
  assert(typeof shot.value === "string" && shot.value.length > 100, "3G screenshot missing");
  fs.writeFileSync(path.join(evidenceDir, filename), Buffer.from(shot.value, "base64"));
}

async function main() {
  if (process.platform !== "win32") throw new Error("3G runtime smoke must run on Windows");
  const binary = path.resolve("src-tauri", "target", "release", "masterv-desktop.exe");
  assert(fs.existsSync(binary), `MasterV binary missing: ${binary}`);

  const email = required("SUPABASE_TEST_EMAIL");
  const password = required("SUPABASE_TEST_PASSWORD");
  const url = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const apiBase = required("NEXT_PUBLIC_MASTERV_API_BASE_URL").replace(/\/+$/, "");
  assert(!process.env.GEMINI_API_KEY && !process.env.YOUTUBE_DATA_API_KEY, "Provider credentials must not be present in desktop runtime smoke");

  const evidenceDir = path.resolve("artifacts", "desktop-youtube-discovery");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const auth = await login(url, key, email, password);
  const hosted = await probe(apiBase, key, auth);
  assert(hosted.contract_version === "mv-hosted-api-v1" && hosted.capabilities?.youtube_discovery_route === true, "3G hosted discovery route capability missing");
  const configured = hosted.capabilities?.youtube_discovery === true;

  let native;
  let evidence;
  try {
    native = await attachMasterV(binary, evidenceDir, "masterv-desktop-3g");
    await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password'),b=document.querySelector('#login-button');if(!e||!p||!b)return false;e.value=arguments[0];p.value=arguments[1];b.click();return true;`, [email, password]);
    const connected = await waitState(native.driverPort, native.sessionId, s => s.auth === "AUTHENTICATED" && s.api === "CONNECTED" && !s.discoveryHidden, "3G connected state");
    assert(connected.surface === "desktop", `unexpected surface: ${connected.surface}`);
    assert(connected.providerAuthority === "hosted-secret" && connected.providerCredentialsInClient === "false" && connected.analysisAuthority === "metadata-only", "3G Desktop authority markers mismatch");
    assert(connected.youtubeClientResources === 0 && connected.localDiscoveryResources === 0, "3G Desktop must not contact provider/local Next discovery route during connect");

    if (!configured) {
      assert(connected.youtubeCapability === "PENDING" && connected.discoveryStatus === "NOT CONFIGURED" && connected.searchDisabled, "3G missing-secret state is not truthful");
      await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password');if(e)e.value='';if(p)p.value='';document.querySelector('#discovery-panel')?.scrollIntoView({block:'start'});return true;`);
      await delay(250);
      await screenshot(native, evidenceDir, "youtube-discovery-config-blocked.png");
      await execute(native.driverPort, native.sessionId, "document.querySelector('#logout-button')?.click();return true;");
      const signedOut = await waitState(native.driverPort, native.sessionId, s => s.auth === "SIGNED OUT" && s.discoveryHidden && s.libraryHidden, "3G blocked logout");
      evidence = {
        status: "MASTERV_WINDOWS_YOUTUBE_DISCOVERY_CONFIG_BLOCKED",
        webview2_runtime_version: native.webviewVersion,
        cdp_browser: native.cdpBrowser,
        attach_mode: true,
        surface: connected.surface,
        auth_status: connected.auth,
        hosted_api_status: connected.api,
        hosted_route: true,
        hosted_provider_configured: false,
        provider_authority: connected.providerAuthority,
        desktop_provider_credentials: false,
        analysis_authority: connected.analysisAuthority,
        client_youtube_api_delta: 0,
        local_next_discovery_requests: 0,
        gemini_requests: 0,
        lifecycle_blocker: "YOUTUBE_DATA_API_KEY missing from Supabase Edge Function environment",
        logout_clear: signedOut.auth === "SIGNED OUT",
        screenshot: "youtube-discovery-config-blocked.png"
      };
    } else {
      assert(connected.youtubeCapability === "READY" && connected.discoveryStatus === "READY", "3G hosted discovery capability must be READY when provider secret exists");
      const beforeFunctions = connected.functionResources;
      const beforeYoutube = connected.youtubeClientResources;
      const beforeLocal = connected.localDiscoveryResources;
      const query = process.env.MASTERV_DESKTOP_DISCOVERY_QUERY?.trim() || "sunscreen review shorts";
      const submitted = await execute(native.driverPort, native.sessionId, `const q=document.querySelector('#discovery-query'),b=document.querySelector('#discovery-search');if(!q||!b)return false;q.value=arguments[0];q.dispatchEvent(new Event('input',{bubbles:true}));if(b.disabled)return false;b.click();return true;`, [query]);
      assert(submitted, "3G Desktop discovery form could not submit");
      const searched = await waitState(native.driverPort, native.sessionId, s => s.discoveryStatus === "READY" || s.discoveryStatus === "ERROR", "3G hosted search result", 60_000);
      if (searched.discoveryStatus === "ERROR") throw new Error(`3G hosted provider search failed in Desktop: ${searched.discoveryText}`);
      assert(Number(searched.youtubeApiRequests) >= 1, "3G hosted provider request diagnostics missing");
      assert(searched.functionResources === beforeFunctions + 1, `3G search must issue exactly one hosted function request: ${beforeFunctions} -> ${searched.functionResources}`);
      assert(searched.youtubeClientResources === beforeYoutube, "3G Desktop issued direct YouTube Data API request");
      assert(searched.localDiscoveryResources === beforeLocal, "3G Desktop issued local Next discovery request");

      await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password');if(e)e.value='';if(p)p.value='';document.querySelector('#discovery-panel')?.scrollIntoView({block:'start'});return true;`);
      await delay(250);
      await screenshot(native, evidenceDir, "youtube-discovery.png");
      await execute(native.driverPort, native.sessionId, "document.querySelector('#logout-button')?.click();return true;");
      const signedOut = await waitState(native.driverPort, native.sessionId, s => s.auth === "SIGNED OUT" && s.discoveryHidden && s.discoveryCount === "0" && s.discoveryIds.length === 0 && s.libraryHidden, "3G logout");
      evidence = {
        status: "MASTERV_WINDOWS_YOUTUBE_DISCOVERY_RUNTIME_PASS",
        webview2_runtime_version: native.webviewVersion,
        cdp_browser: native.cdpBrowser,
        attach_mode: true,
        surface: connected.surface,
        auth_status: connected.auth,
        hosted_api_status: connected.api,
        youtube_discovery_capability: "READY",
        hosted_provider_configured: true,
        provider_authority: searched.providerAuthority,
        analysis_authority: searched.analysisAuthority,
        candidate_count: Number(searched.discoveryCount),
        youtube_api_requests: Number(searched.youtubeApiRequests),
        client_youtube_api_delta: searched.youtubeClientResources - beforeYoutube,
        client_hosted_function_delta: searched.functionResources - beforeFunctions,
        local_next_discovery_requests: searched.localDiscoveryResources - beforeLocal,
        desktop_provider_credentials: false,
        gemini_requests: 0,
        deep_analysis_migrated: false,
        persistence_write: false,
        logout_clear: signedOut.auth === "SIGNED OUT",
        screenshot: "youtube-discovery.png"
      };
    }
  } finally {
    if (native) await native.close();
  }

  assert(evidence, "3G runtime evidence missing");
  fs.writeFileSync(path.join(evidenceDir, "runtime-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
