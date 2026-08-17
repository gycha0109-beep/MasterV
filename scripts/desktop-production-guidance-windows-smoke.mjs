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
    productCapability: document.querySelector('#cap-product-truth')?.textContent?.trim() || '',
    deepHidden: Boolean(document.querySelector('#deep-analysis-panel')?.hidden),
    deepStatus: document.querySelector('#deep-analysis-status')?.textContent?.trim() || '',
    deepSource: document.querySelector('#deep-analysis-source')?.textContent?.trim() || '',
    deepText: document.querySelector('#deep-analysis-content')?.textContent?.trim() || '',
    productionHidden: Boolean(document.querySelector('#production-guidance-panel')?.hidden),
    productionStatus: document.querySelector('#production-guidance-status')?.textContent?.trim() || '',
    productionModel: document.querySelector('#production-guidance-model')?.textContent?.trim() || '',
    productionText: document.querySelector('#production-guidance-content')?.textContent?.trim() || '',
    productName: document.querySelector('#product-truth-name')?.value || '',
    productTarget: document.querySelector('#product-truth-target')?.value || '',
    productPrice: document.querySelector('#product-truth-price')?.value || '',
    productFacts: document.querySelector('#product-truth-facts')?.value || '',
    providerAuthority: document.querySelector('#production-guidance-panel')?.dataset?.providerAuthority || '',
    providerCredentialsInClient: document.querySelector('#production-guidance-panel')?.dataset?.providerCredentialsInClient || '',
    computeAuthority: document.querySelector('#production-guidance-panel')?.dataset?.computeAuthority || '',
    productTruthAuthority: document.querySelector('#production-guidance-panel')?.dataset?.productTruthAuthority || '',
    referenceAnalysisAuthority: document.querySelector('#production-guidance-panel')?.dataset?.referenceAnalysisAuthority || '',
    metricsAuthority: document.querySelector('#production-guidance-panel')?.dataset?.metricsAuthority || '',
    persistenceAuthority: document.querySelector('#production-guidance-panel')?.dataset?.persistenceAuthority || '',
    backgroundBatchMigrated: document.querySelector('#production-guidance-panel')?.dataset?.backgroundBatchMigrated || '',
    guidanceStale: document.querySelector('#production-guidance-panel')?.dataset?.guidanceStale || '',
    geminiRequests: document.querySelector('#production-guidance-panel')?.dataset?.geminiRequests || '',
    persistenceWrites: document.querySelector('#production-guidance-panel')?.dataset?.persistenceWrites || '',
    backgroundBatchRequests: document.querySelector('#production-guidance-panel')?.dataset?.backgroundBatchRequests || '',
    productionSubmitDisabled: Boolean(document.querySelector('#production-guidance-submit')?.disabled),
    promptButtons: document.querySelectorAll('[data-production-prompt-kind]').length,
    promptButtonsDisabled: [...document.querySelectorAll('[data-production-prompt-kind]')].filter(e => e.disabled).length,
    wholePromptButtons: document.querySelectorAll('[data-production-prompt-all]').length,
    wholePromptDisabled: Boolean(document.querySelector('[data-production-prompt-all]')?.disabled),
    promptSurfaceHidden: Boolean(document.querySelector('[data-production-prompt-surface]')?.hidden),
    promptPreviewPresent: (document.querySelector('#production-guidance-content')?.textContent || '').includes('프롬프트 미리보기'),
    developerDiagnosticsPresent: Boolean(document.querySelector('#developer-diagnostics')),
    developerDiagnosticsOpen: Boolean(document.querySelector('#developer-diagnostics')?.open),
    backgroundBatchInDiagnostics: Boolean(document.querySelector('#developer-diagnostics')?.contains(document.querySelector('#background-batch-panel'))),
    functionResources: performance.getEntriesByType('resource').filter(e => e.name.includes('/functions/v1/masterv-api-boundary')).length,
    geminiClientResources: performance.getEntriesByType('resource').filter(e => /generativelanguage\\.googleapis\\.com|aiplatform\\.googleapis\\.com/i.test(e.name)).length,
    localProductTruthResources: performance.getEntriesByType('resource').filter(e => e.name.includes('/api/interpret-product-truth')).length,
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
  assert(typeof shot.value === "string" && shot.value.length > 100, "Product workflow screenshot missing");
  fs.writeFileSync(path.join(evidenceDir, filename), Buffer.from(shot.value, "base64"));
}

async function main() {
  if (process.platform !== "win32") throw new Error("Production Guidance runtime smoke must run on Windows");
  const binary = path.resolve("src-tauri", "target", "release", "masterv-desktop.exe");
  assert(fs.existsSync(binary), `MasterV binary missing: ${binary}`);

  const email = required("SUPABASE_TEST_EMAIL");
  const password = required("SUPABASE_TEST_PASSWORD");
  const url = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const apiBase = required("NEXT_PUBLIC_MASTERV_API_BASE_URL").replace(/\/+$/, "");
  assert(!process.env.GEMINI_API_KEY && !process.env.YOUTUBE_DATA_API_KEY, "Provider credentials must not be present in Desktop runtime smoke");

  const evidenceDir = path.resolve("artifacts", "desktop-production-guidance");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const auth = await login(url, key, email, password);
  const hosted = await probe(apiBase, key, auth);
  assert(hosted.contract_version === "mv-hosted-api-v1", "hosted contract version mismatch");
  assert(hosted.capabilities?.deep_analysis === true, "Production Guidance requires hosted Deep Analysis readiness");
  assert(hosted.capabilities?.product_truth_route === true && hosted.capabilities?.production_guidance_route === true, "hosted Product Truth/Production Guidance routes missing");
  assert(hosted.capabilities?.product_truth === true && hosted.capabilities?.production_guidance === true, "hosted Product Truth/Production Guidance readiness missing");

  let native;
  let evidence;
  try {
    native = await attachMasterV(binary, evidenceDir, "masterv-desktop-product-workflow");
    await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password'),b=document.querySelector('#login-button');if(!e||!p||!b)return false;e.value=arguments[0];p.value=arguments[1];b.click();return true;`, [email, password]);
    const connected = await waitState(native.driverPort, native.sessionId, s => s.auth === "AUTHENTICATED" && s.api === "CONNECTED" && s.deepCapability === "READY" && s.productCapability === "READY", "Product workflow connected state");
    assert(connected.surface === "desktop", `unexpected surface: ${connected.surface}`);
    assert(connected.providerAuthority === "hosted-secret" && connected.providerCredentialsInClient === "false", "provider boundary markers mismatch");
    assert(connected.computeAuthority === "hosted-production-guidance", "compute authority marker mismatch");
    assert(connected.productTruthAuthority === "user-input-raw", "Product Truth authority marker mismatch");
    assert(connected.referenceAnalysisAuthority === "validated-hosted-result-transit", "reference analysis authority marker mismatch");
    assert(connected.metricsAuthority === "server-derived", "metrics authority marker mismatch");
    assert(connected.persistenceAuthority === "none" && connected.backgroundBatchMigrated === "false", "persistence/batch boundary marker mismatch");
    assert(connected.productionHidden, "Production Guidance must wait for a current Deep Analysis result");
    assert(connected.developerDiagnosticsPresent && !connected.developerDiagnosticsOpen && connected.backgroundBatchInDiagnostics, "developer diagnostics must be collapsed and contain Background Batch");
    assert(connected.geminiClientResources === 0 && connected.localProductTruthResources === 0 && connected.localAnalyzeResources === 0 && connected.youtubeClientResources === 0, "Desktop contacted provider/local Next route during connect");

    const deepUrl = process.env.MASTERV_DESKTOP_DEEP_ANALYSIS_URL?.trim() || "https://www.youtube.com/watch?v=9hE5-98ZeCg";
    const deepSubmitted = await execute(native.driverPort, native.sessionId, `const q=document.querySelector('#deep-analysis-url'),b=document.querySelector('#deep-analysis-submit');if(!q||!b)return false;q.value=arguments[0];q.dispatchEvent(new Event('input',{bubbles:true}));if(b.disabled)return false;b.click();return true;`, [deepUrl]);
    assert(deepSubmitted, "prerequisite Deep Analysis form could not submit");
    const analyzed = await waitState(native.driverPort, native.sessionId, s => s.deepStatus === "READY" || s.deepStatus === "ERROR", "prerequisite Deep Analysis", 240_000);
    if (analyzed.deepStatus === "ERROR") throw new Error(`prerequisite Deep Analysis failed: ${analyzed.deepText || "unknown Deep Analysis error"}`);
    assert(!analyzed.productionHidden && analyzed.productionStatus === "READY", "Production Guidance panel did not unlock after Deep Analysis");
    assert(analyzed.deepSource.startsWith("yt:"), "canonical source identity missing");

    const beforeFunctions = analyzed.functionResources;
    const beforeGemini = analyzed.geminiClientResources;
    const beforeLocalTruth = analyzed.localProductTruthResources;
    const beforeLocalAnalyze = analyzed.localAnalyzeResources;
    const beforeYoutube = analyzed.youtubeClientResources;
    const payload = {
      product_name: "자동 단우산",
      target_customer: "출퇴근 때 작은 우산이 필요한 사람",
      price_offer: "8,900원 / 무료배송",
      verified_facts: "200그람\n버튼으로 자동 개폐\n가방에 걍 쏙"
    };
    const productSubmitted = await execute(native.driverPort, native.sessionId, `const n=document.querySelector('#product-truth-name'),t=document.querySelector('#product-truth-target'),p=document.querySelector('#product-truth-price'),f=document.querySelector('#product-truth-facts'),b=document.querySelector('#production-guidance-submit');if(!n||!t||!p||!f||!b)return false;n.value=arguments[0].product_name;t.value=arguments[0].target_customer;p.value=arguments[0].price_offer;f.value=arguments[0].verified_facts;for(const e of [n,t,p,f])e.dispatchEvent(new Event('input',{bubbles:true}));if(b.disabled)return false;b.click();return true;`, [payload]);
    assert(productSubmitted, "Product Truth form could not submit");
    const guided = await waitState(native.driverPort, native.sessionId, s => s.productionStatus.startsWith("READY") || s.productionStatus === "ERROR", "Production Guidance result", 180_000);
    if (guided.productionStatus === "ERROR") throw new Error(`hosted Production Guidance failed: ${guided.productionText}`);

    assert(Number(guided.geminiRequests) === 1, "semantic matcher must issue exactly one hosted Gemini request for verified facts");
    assert(Number(guided.persistenceWrites) === 0, "must not persist Production Guidance automatically");
    assert(Number(guided.backgroundBatchRequests) === 0, "must not invoke Background Batch");
    assert(guided.functionResources === beforeFunctions + 1, `Production Guidance must issue exactly one hosted function request: ${beforeFunctions} -> ${guided.functionResources}`);
    assert(guided.geminiClientResources === beforeGemini, "Desktop issued direct Gemini provider request");
    assert(guided.localProductTruthResources === beforeLocalTruth, "Desktop issued local Next Product Truth request");
    assert(guided.localAnalyzeResources === beforeLocalAnalyze, "Production Guidance issued local Next analyze request");
    assert(guided.youtubeClientResources === beforeYoutube, "Production Guidance issued direct YouTube Data API request");
    assert(guided.productionModel && guided.productionModel !== "—" && guided.productionModel !== "NO GEMINI", "hosted semantic matcher model authority missing");
    assert(guided.productionText.includes("내 상품용 제작 가이드") && guided.productionText.includes("추천 제작 흐름"), "production guide output missing");
    assert(guided.productionText.includes("user-input-raw") && guided.productionText.includes("validated-hosted-result-transit") && guided.productionText.includes("server-derived"), "runtime authority output missing");
    assert(guided.productionText.includes("InterpretationREADY") || guided.productionText.includes("Interpretation READY"), "semantic interpretation did not become ready");
    assert(guided.promptButtons === 4, `expected four production prompt actions, got ${guided.promptButtons}`);
    assert(guided.promptButtonsDisabled === 0, "fresh production prompt actions must be enabled");
    assert(guided.wholePromptButtons === 1 && !guided.wholePromptDisabled, "whole production prompt copy must be available");
    assert(guided.promptPreviewPresent && !guided.promptSurfaceHidden, "prompt preview surface must be visible after generation");
    assert(guided.guidanceStale === "false", "fresh guidance must not be stale");

    const postGuidanceFunctions = guided.functionResources;
    const staleChanged = await execute(native.driverPort, native.sessionId, `const t=document.querySelector('#product-truth-target');if(!t)return false;t.value=arguments[0];t.dispatchEvent(new Event('input',{bubbles:true}));return true;`, [`${payload.target_customer} 변경`]);
    assert(staleChanged, "Product Truth mutation for stale test failed");
    const stale = await waitState(native.driverPort, native.sessionId, s => s.productionStatus === "STALE" && s.guidanceStale === "true", "stale prompt state");
    assert(stale.promptButtonsDisabled === 4, "stale prompt action buttons must be disabled");
    assert(stale.wholePromptDisabled, "stale whole-prompt copy must be disabled");
    assert(stale.promptSurfaceHidden, "stale prompt surface must be hidden");
    assert(stale.productionText.includes("상품 정보가 변경되었습니다. 기존 프롬프트는 사용할 수 없습니다."), "stale warning missing");
    assert(stale.functionResources === postGuidanceFunctions, "stale invalidation must not issue a hosted request");

    const restoredInput = await execute(native.driverPort, native.sessionId, `const t=document.querySelector('#product-truth-target');if(!t)return false;t.value=arguments[0];t.dispatchEvent(new Event('input',{bubbles:true}));return true;`, [payload.target_customer]);
    assert(restoredInput, "Product Truth restore for stale test failed");
    const restored = await waitState(native.driverPort, native.sessionId, s => s.productionStatus.startsWith("READY") && s.guidanceStale === "false", "restored prompt state");
    assert(restored.promptButtonsDisabled === 0, "restored prompt actions must be enabled");
    assert(!restored.wholePromptDisabled && !restored.promptSurfaceHidden, "restored whole-prompt surface must be usable");
    assert(restored.functionResources === postGuidanceFunctions, "exact Product Truth restore must not issue a hosted request");

    await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password');if(e)e.value='';if(p)p.value='';document.querySelector('#production-guidance-panel')?.scrollIntoView({block:'start'});return true;`);
    await delay(250);
    await screenshot(native, evidenceDir, "production-guidance.png");

    await execute(native.driverPort, native.sessionId, `document.querySelector('#logout-button')?.click();return true;`);
    const signedOut = await waitState(native.driverPort, native.sessionId, s => s.auth === "SIGNED OUT" && s.deepHidden && s.productionHidden && s.productName === "" && s.productTarget === "" && s.productPrice === "" && s.productFacts === "" && s.libraryHidden, "Production Guidance logout");

    evidence = {
      status: "MASTERV_WINDOWS_PRODUCTION_GUIDANCE_RUNTIME_PASS",
      webview2_runtime_version: native.webviewVersion,
      cdp_browser: native.cdpBrowser,
      attach_mode: true,
      surface: connected.surface,
      auth_status: connected.auth,
      hosted_api_status: connected.api,
      product_truth_capability: connected.productCapability,
      production_guidance_capability: connected.productCapability,
      provider_authority: connected.providerAuthority,
      compute_authority: connected.computeAuthority,
      product_truth_authority: connected.productTruthAuthority,
      reference_analysis_authority: connected.referenceAnalysisAuthority,
      metrics_authority: connected.metricsAuthority,
      persistence_authority: connected.persistenceAuthority,
      model: guided.productionModel,
      guidance_status: guided.productionStatus,
      gemini_requests: Number(guided.geminiRequests),
      client_gemini_api_delta: guided.geminiClientResources - beforeGemini,
      client_hosted_function_delta: guided.functionResources - beforeFunctions,
      local_next_product_truth_requests: guided.localProductTruthResources - beforeLocalTruth,
      local_next_analyze_requests: guided.localAnalyzeResources - beforeLocalAnalyze,
      client_youtube_api_delta: guided.youtubeClientResources - beforeYoutube,
      desktop_provider_credentials: false,
      persistence_writes: Number(guided.persistenceWrites),
      background_batch_requests: Number(guided.backgroundBatchRequests),
      background_batch_migrated: connected.backgroundBatchMigrated === "true",
      prompt_actions: guided.promptButtons,
      whole_prompt_copy: guided.wholePromptButtons === 1,
      prompt_preview: guided.promptPreviewPresent,
      stale_prompt_blocked: stale.productionStatus === "STALE" && stale.promptSurfaceHidden && stale.promptButtonsDisabled === 4 && stale.wholePromptDisabled,
      stale_prompt_restored_without_network: restored.functionResources === postGuidanceFunctions && restored.guidanceStale === "false",
      developer_diagnostics_collapsed: connected.developerDiagnosticsPresent && !connected.developerDiagnosticsOpen && connected.backgroundBatchInDiagnostics,
      logout_clear: signedOut.auth === "SIGNED OUT",
      screenshot: "production-guidance.png"
    };
  } finally {
    if (native) await native.close();
  }

  assert(evidence, "Production Guidance runtime evidence missing");
  fs.writeFileSync(path.join(evidenceDir, "runtime-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
