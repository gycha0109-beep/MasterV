import fs from "node:fs";
import path from "node:path";
import { assert, attachMasterV, delay, execute, required, webdriverRequest } from "./windows-webview2-attach.mjs";

function headers(key, token, extra = {}) { return { apikey: key, Authorization: `Bearer ${token}`, ...extra }; }
async function errorText(response) {
  try { const body = await response.json(); return body.message || body.details || body.error_description || body.error || `${response.status}`; }
  catch { return `${response.status} ${response.statusText}`.trim(); }
}
async function login(url, key, email, password) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!response.ok) throw new Error(`Direct Supabase login failed: ${await errorText(response)}`);
  const body = await response.json(); assert(body.access_token && body.user?.id, "Direct login response incomplete"); return body;
}
async function bootstrap(url, key, auth) {
  const workspaceId = `user:${auth.user.id}`;
  const params = new URLSearchParams({ on_conflict: "workspace_id,user_id" });
  const response = await fetch(`${url}/rest/v1/masterv_workspace_members?${params}`, { method: "POST", headers: headers(key, auth.access_token, { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" }), body: JSON.stringify({ workspace_id: workspaceId, user_id: auth.user.id, role: "owner" }) });
  if (!response.ok) throw new Error(`Workspace bootstrap failed: ${await errorText(response)}`); return workspaceId;
}
function segment(start, end, role, evidenceType, actionType) {
  const substantive = evidenceType !== "근거없음";
  return {
    start_seconds: start, end_seconds: end,
    visual: { description: `synthetic ${role}`, subjects: ["synthetic product"], material_types: ["상품실물"], presenter_presence: ["손"], subject_role: "판매제품", contains_product: true },
    action: { type: actionType, description: `synthetic ${actionType}` }, scene_purpose: role, message_roles: [role], spoken_text: "", on_screen_text: "", claims: [],
    evidence: { types: [evidenceType], scope: substantive ? "판매제품직접" : "해당없음", supports_selling_product_claim: substantive, observable_result: "", result_visually_observable: false }, confidence: "high"
  };
}
function fixture(workspaceId, nativeId, label, duration) {
  const demoEnd = duration === 12 ? 8 : 12;
  return {
    workspace_id: workspaceId, source_platform: "youtube", source_id: `yt:${nativeId}`, native_id: nativeId,
    canonical_url: `https://www.youtube.com/watch?v=${nativeId}`, label,
    analysis: {
      summary: `${label} canonical compiler fixture`, structure_label: "훅 → 사용시연 → CTA", duration_seconds: duration,
      hook: { type: "visual", text: "", visual: "synthetic", duration_seconds: 3 },
      product_presentation: { first_seen_seconds: 0, demonstration_present: true, before_after_present: false, comparison_present: false, result_visual_present: false, face_present: false, hand_present: true },
      persuasion: { problem: "", solution: "", benefit: "", proof: "", social_proof: "", offer: "", cta: "상세 보기", emotional_trigger: "" },
      presentation: { format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" }, transcript: { full: "", segments: [] }, scenes: [],
      observation_segments: [segment(0, 3, "훅", "근거없음", "훅"), segment(3, demoEnd, "사용시연", "직접시연", "시연"), segment(demoEnd, duration, "CTA", "근거없음", "CTA")],
      tags: ["synthetic-smoke", "3F"], confidence_notes: ["Synthetic 3F runtime fixture; no provider request executed."]
    },
    analysis_cache_key: `desktop-runtime-3f:${nativeId}`, analysis_provenance: "replay", schema_version: "reference-library-v1"
  };
}
async function remove(url, key, auth, workspaceId, sourceId) {
  const p = new URLSearchParams(); p.set("workspace_id", `eq.${workspaceId}`); p.set("source_id", `eq.${sourceId}`);
  const r = await fetch(`${url}/rest/v1/reference_library_entries?${p}`, { method: "DELETE", headers: headers(key, auth.access_token, { Prefer: "return=minimal" }) });
  if (!r.ok) throw new Error(`Fixture delete failed: ${await errorText(r)}`);
}
async function insert(url, key, auth, record) {
  const p = new URLSearchParams({ on_conflict: "workspace_id,source_id" });
  const r = await fetch(`${url}/rest/v1/reference_library_entries?${p}`, { method: "POST", headers: headers(key, auth.access_token, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(record) });
  if (!r.ok) throw new Error(`Fixture insert failed: ${await errorText(r)}`);
}
async function read(url, key, auth, workspaceId, sourceIds) {
  const p = new URLSearchParams(); p.set("select", "source_id,label,revision"); p.set("workspace_id", `eq.${workspaceId}`); p.set("source_id", `in.(${sourceIds.join(",")})`);
  const r = await fetch(`${url}/rest/v1/reference_library_entries?${p}`, { headers: headers(key, auth.access_token, { Accept: "application/json" }) });
  if (!r.ok) throw new Error(`Fixture read failed: ${await errorText(r)}`); const body = await r.json(); assert(Array.isArray(body), "Fixture read must be array"); return body;
}
async function compile(apiBase, key, auth, ids, extra = {}) {
  const r = await fetch(`${apiBase}/masterv-api-boundary`, { method: "POST", headers: headers(key, auth.access_token, { "Content-Type": "application/json", Accept: "application/json" }), body: JSON.stringify({ operation: "reference_workflow", source_ids: ids, ...extra }) });
  if (!r.ok) throw new Error(`Hosted compiler failed: ${await errorText(r)}`); return await r.json();
}
async function state(driverPort, sessionId) {
  return await execute(driverPort, sessionId, `return {
    surface: document.querySelector('#surface-badge')?.textContent?.trim() || '', auth: document.querySelector('#auth-status')?.textContent?.trim() || '', api: document.querySelector('#api-status')?.textContent?.trim() || '', boundary: document.querySelector('#cap-boundary')?.textContent?.trim() || '', compilerCapability: document.querySelector('#cap-reference-compiler')?.textContent?.trim() || '',
    libraryStatus: document.querySelector('#library-status')?.textContent?.trim() || '', sourceIds: Array.from(document.querySelectorAll('[data-source-id]')).map(n => n.dataset.sourceId || ''), detailHidden: Boolean(document.querySelector('#reference-detail-panel')?.hidden),
    compareHidden: Boolean(document.querySelector('#reference-compare-panel')?.hidden), compareStatus: document.querySelector('#reference-compare-status')?.textContent?.trim() || '', compareCount: document.querySelector('#reference-compare-count')?.textContent?.trim() || '', compiler: document.querySelector('#reference-compare-panel')?.dataset?.compiler || '', authority: document.querySelector('[data-compiler-authority]')?.dataset?.compilerAuthority || '',
    compareIds: Array.from(document.querySelectorAll('[data-compare-result-source-id]')).map(n => n.dataset.compareResultSourceId || ''), evidenceRuleIds: Array.from(document.querySelectorAll('[data-evidence-rule-id]')).map(n => n.dataset.evidenceRuleId || ''), compareText: document.querySelector('#reference-compare-content')?.textContent?.trim() || '',
    restResources: performance.getEntriesByType('resource').filter(e => e.name.includes('/rest/v1/reference_library_entries')).length,
    functionResources: performance.getEntriesByType('resource').filter(e => e.name.includes('/functions/v1/masterv-api-boundary')).length,
    libraryHidden: Boolean(document.querySelector('#reference-library-panel')?.hidden)
  };`);
}
async function waitState(driverPort, sessionId, predicate, label, timeout = 30_000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { last = await state(driverPort, sessionId); if (predicate(last)) return last; await delay(400); }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function main() {
  if (process.platform !== "win32") throw new Error("3F runtime smoke must run on Windows");
  const binary = path.resolve("src-tauri", "target", "release", "masterv-desktop.exe"); assert(fs.existsSync(binary), `MasterV binary missing: ${binary}`);
  const email = required("SUPABASE_TEST_EMAIL"), password = required("SUPABASE_TEST_PASSWORD"), url = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, ""), key = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), apiBase = required("NEXT_PUBLIC_MASTERV_API_BASE_URL").replace(/\/+$/, "");
  assert(!process.env.GEMINI_API_KEY && !process.env.YOUTUBE_DATA_API_KEY, "Provider credentials must not be present");
  const evidenceDir = path.resolve("artifacts", "desktop-reference-compiler"); fs.mkdirSync(evidenceDir, { recursive: true });
  const suffix = `${process.env.GITHUB_RUN_ID || Date.now()}${process.env.GITHUB_RUN_ATTEMPT || "1"}${process.pid}`.replace(/[^A-Za-z0-9_-]/g, "");
  const ids = [`yt:MV3F${suffix}A`, `yt:MV3F${suffix}B`], labels = [`Desktop 3F fixture A ${suffix}`, `Desktop 3F fixture B ${suffix}`];
  let auth, workspaceId, native, cleanup = false, failure, cleanupFailure, evidence;
  try {
    auth = await login(url, key, email, password); workspaceId = await bootstrap(url, key, auth);
    for (const id of ids) await remove(url, key, auth, workspaceId, id);
    await insert(url, key, auth, fixture(workspaceId, ids[0].slice(3), labels[0], 12)); await insert(url, key, auth, fixture(workspaceId, ids[1].slice(3), labels[1], 18));
    assert((await read(url, key, auth, workspaceId, ids)).length === 2, "3F fixtures were not persisted");

    const hosted = await compile(apiBase, key, auth, ids, { workspace_id: "user:00000000-0000-0000-0000-000000000000" });
    assert(hosted.contract_version === "mv-hosted-api-v1" && hosted.operation === "reference_workflow", "3F hosted compiler contract mismatch");
    assert(hosted.compiler?.comparison === "canonical" && hosted.compiler?.evidence === "canonical", "3F canonical compiler marker missing");
    assert(hosted.authority?.workspace === "jwt-derived" && hosted.authority?.persistence === "user-jwt-rls", "3F hosted authority marker mismatch");
    assert(hosted.comparison?.sample_size === 2 && Array.isArray(hosted.comparison?.videos) && hosted.comparison.videos.length === 2, "3F hosted comparison result invalid");
    assert(Array.isArray(hosted.evidence_rules?.rules) && hosted.evidence_rules.rules.length > 0, "3F hosted evidence rules missing");
    assert(hosted.evidence_rules.rules.some((rule) => rule.id === "demonstration-include-use-or-demo"), "3F expected deterministic demonstration rule missing");

    native = await attachMasterV(binary, evidenceDir, "masterv-desktop-3f");
    await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password'),b=document.querySelector('#login-button');if(!e||!p||!b)return false;e.value=arguments[0];p.value=arguments[1];b.click();return true;`, [email, password]);
    const connected = await waitState(native.driverPort, native.sessionId, s => s.auth === "AUTHENTICATED" && s.api === "CONNECTED" && s.libraryStatus === "READY" && ids.every(id => s.sourceIds.includes(id)), "3F connected state", 45_000);
    assert(connected.surface === "desktop" && connected.boundary === "READY" && connected.compilerCapability === "READY", "3F desktop hosted capability mismatch");
    assert(connected.detailHidden, "3F compare proof must begin without opening raw detail surface");
    const beforeRest = connected.restResources, beforeFunction = connected.functionResources;

    const compareClicked = await execute(native.driverPort, native.sessionId, `const ids=arguments[0];for(const id of ids){const c=Array.from(document.querySelectorAll('[data-compare-source-id]')).find(n=>n.dataset.compareSourceId===id);if(!c)return false;c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));}const b=document.querySelector('#library-compare');if(!b||b.disabled)return false;b.click();return true;`, [ids]); assert(compareClicked, "3F compare control could not activate");
    const compared = await waitState(native.driverPort, native.sessionId, s => !s.compareHidden && s.compareStatus === "READY" && s.compareCount === "2" && ids.every(id => s.compareIds.includes(id)) && s.evidenceRuleIds.length > 0 && s.compareText.includes("Deterministic evidence rules"), "3F hosted compare surface", 45_000);
    assert(compared.compiler === "hosted-canonical" && compared.authority === "canonical", "3F desktop canonical authority marker mismatch");
    assert(compared.restResources === beforeRest, `3F compare issued direct client Reference Library fetches: ${beforeRest} -> ${compared.restResources}`);
    assert(compared.functionResources === beforeFunction + 1, `3F compare must issue exactly one hosted compiler request: ${beforeFunction} -> ${compared.functionResources}`);
    assert(compared.detailHidden, "3F compare must not open or reuse raw detail surface");

    await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password');if(e)e.value='';if(p)p.value='';document.querySelector('#reference-compare-panel')?.scrollIntoView({block:'start'});return true;`); await delay(250);
    const shot = await webdriverRequest(native.driverPort, "GET", `/session/${native.sessionId}/screenshot`); assert(typeof shot.value === "string" && shot.value.length > 100, "3F screenshot missing"); fs.writeFileSync(path.join(evidenceDir, "reference-compiler.png"), Buffer.from(shot.value, "base64"));

    for (const id of ids) await remove(url, key, auth, workspaceId, id);
    assert((await read(url, key, auth, workspaceId, ids)).length === 0, "3F cleanup failed"); cleanup = true;
    await execute(native.driverPort, native.sessionId, "document.querySelector('#logout-button')?.click();return true;");
    const signedOut = await waitState(native.driverPort, native.sessionId, s => s.auth === "SIGNED OUT" && s.libraryHidden && s.compareHidden && s.sourceIds.length === 0, "3F logout");

    evidence = {
      status: "MASTERV_WINDOWS_REFERENCE_COMPILER_RUNTIME_PASS", webview2_runtime_version: native.webviewVersion, cdp_browser: native.cdpBrowser, attach_mode: true, surface: connected.surface,
      auth_status: connected.auth, hosted_api_status: connected.api, boundary_probe: true, reference_compiler_capability: "READY", hosted_reference_compiler: "PASS", hosted_compiler_authority: "canonical",
      workspace_authority: hosted.authority.workspace, persistence_authority: hosted.authority.persistence, arbitrary_workspace_body_ignored: true, comparison_sample_size: hosted.comparison.sample_size, evidence_rule_count: hosted.evidence_rules.rules.length,
      desktop_compare_surface: compared.compareStatus === "READY" ? "PASS" : "FAIL", desktop_compare_raw_analysis_fetch: false, client_reference_fetch_delta: compared.restResources - beforeRest, client_hosted_function_delta: compared.functionResources - beforeFunction,
      cleanup: cleanup ? "PASS" : "FAIL", logout_clear: signedOut.auth === "SIGNED OUT" ? "PASS" : "FAIL", local_next_api_required: false, provider_credentials_in_desktop_job: false, gemini_requests: 0, youtube_requests: 0, screenshot: "reference-compiler.png"
    };
  } catch (error) { failure = error; }
  finally {
    if (auth && workspaceId && !cleanup) try { for (const id of ids) await remove(url, key, auth, workspaceId, id); assert((await read(url, key, auth, workspaceId, ids)).length === 0, "fallback cleanup failed"); cleanup = true; } catch (error) { cleanupFailure = error; }
    if (native) await native.close();
  }
  if (cleanupFailure) throw new Error(`${failure instanceof Error ? failure.message : failure || "runtime failed"}; cleanup also failed: ${cleanupFailure instanceof Error ? cleanupFailure.message : cleanupFailure}`);
  if (failure) throw failure; assert(cleanup && evidence, "3F runtime did not produce verified evidence");
  fs.writeFileSync(path.join(evidenceDir, "runtime-evidence.json"), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
}
main().catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exitCode = 1; });
