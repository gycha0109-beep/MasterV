import fs from "node:fs";
import path from "node:path";
import { assert, attachMasterV, delay, execute, required, webdriverRequest } from "./windows-webview2-attach.mjs";

const LIST_PROJECTION = ["source_id", "canonical_url", "label", "analysis_provenance", "revision", "first_saved_at", "updated_at"];
const DETAIL_PROJECTION = [...LIST_PROJECTION, "analysis"];

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
function fixture(workspaceId, nativeId, label, variant) {
  const a = variant === "A";
  return {
    workspace_id: workspaceId, source_platform: "youtube", source_id: `yt:${nativeId}`, native_id: nativeId,
    canonical_url: `https://www.youtube.com/watch?v=${nativeId}`, label,
    analysis: {
      summary: `${label} persisted detail fixture`, structure_label: a ? "hook → demo → CTA" : "problem → proof → CTA", duration_seconds: a ? 12 : 18,
      hook: { type: a ? "visual" : "problem", text: "", visual: "synthetic", duration_seconds: 2 },
      product_presentation: { first_seen_seconds: a ? 1 : 4, demonstration_present: true, before_after_present: false, comparison_present: !a, result_visual_present: false, face_present: false, hand_present: true },
      persuasion: { problem: a ? "" : "synthetic problem", solution: "", benefit: "", proof: "", social_proof: "", offer: "", cta: a ? "링크 확인" : "상세 보기", emotional_trigger: "" },
      presentation: { format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" }, transcript: { full: "", segments: [] }, scenes: [], observation_segments: [], tags: ["synthetic-smoke", variant], confidence_notes: ["Synthetic 3E runtime fixture; no provider request executed."]
    },
    analysis_cache_key: `desktop-runtime-3e:${nativeId}`, analysis_provenance: "replay", schema_version: "reference-library-v1"
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
async function state(driverPort, sessionId) {
  return await execute(driverPort, sessionId, `return {
    surface: document.querySelector('#surface-badge')?.textContent?.trim() || '', auth: document.querySelector('#auth-status')?.textContent?.trim() || '', api: document.querySelector('#api-status')?.textContent?.trim() || '', boundary: document.querySelector('#cap-boundary')?.textContent?.trim() || '',
    libraryStatus: document.querySelector('#library-status')?.textContent?.trim() || '', libraryWorkspace: document.querySelector('#library-workspace')?.textContent?.trim() || '', libraryHidden: Boolean(document.querySelector('#reference-library-panel')?.hidden), listProjection: document.querySelector('#reference-library-panel')?.dataset?.projection || '', sourceIds: Array.from(document.querySelectorAll('[data-source-id]')).map(n => n.dataset.sourceId || ''),
    detailHidden: Boolean(document.querySelector('#reference-detail-panel')?.hidden), detailStatus: document.querySelector('#reference-detail-status')?.textContent?.trim() || '', detailProjection: document.querySelector('#reference-detail-panel')?.dataset?.projection || '', detailText: document.querySelector('#reference-detail-content')?.textContent?.trim() || '',
    compareHidden: Boolean(document.querySelector('#reference-compare-panel')?.hidden), compareStatus: document.querySelector('#reference-compare-status')?.textContent?.trim() || '', compareCount: document.querySelector('#reference-compare-count')?.textContent?.trim() || '', compareIds: Array.from(document.querySelectorAll('[data-compare-result-source-id]')).map(n => n.dataset.compareResultSourceId || ''), compareText: document.querySelector('#reference-compare-content')?.textContent?.trim() || ''
  };`);
}
async function waitState(driverPort, sessionId, predicate, label, timeout = 30_000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { last = await state(driverPort, sessionId); if (predicate(last)) return last; await delay(400); }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function main() {
  if (process.platform !== "win32") throw new Error("3E runtime smoke must run on Windows");
  const binary = path.resolve("src-tauri", "target", "release", "masterv-desktop.exe"); assert(fs.existsSync(binary), `MasterV binary missing: ${binary}`);
  const email = required("SUPABASE_TEST_EMAIL"), password = required("SUPABASE_TEST_PASSWORD"), url = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, ""), key = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  assert(!process.env.GEMINI_API_KEY && !process.env.YOUTUBE_DATA_API_KEY, "Provider credentials must not be present");
  const evidenceDir = path.resolve("artifacts", "desktop-reference-detail-compare"); fs.mkdirSync(evidenceDir, { recursive: true });
  const suffix = `${process.env.GITHUB_RUN_ID || Date.now()}${process.env.GITHUB_RUN_ATTEMPT || "1"}${process.pid}`.replace(/[^A-Za-z0-9_-]/g, "");
  const ids = [`yt:MV3E${suffix}A`, `yt:MV3E${suffix}B`], labels = [`Desktop 3E fixture A ${suffix}`, `Desktop 3E fixture B ${suffix}`];
  let auth, workspaceId, native, cleanup = false, failure, cleanupFailure, evidence;
  try {
    auth = await login(url, key, email, password); workspaceId = await bootstrap(url, key, auth);
    for (const id of ids) await remove(url, key, auth, workspaceId, id);
    await insert(url, key, auth, fixture(workspaceId, ids[0].slice(3), labels[0], "A")); await insert(url, key, auth, fixture(workspaceId, ids[1].slice(3), labels[1], "B"));
    assert((await read(url, key, auth, workspaceId, ids)).length === 2, "3E fixtures were not persisted");
    native = await attachMasterV(binary, evidenceDir, "masterv-desktop-3e");
    await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password'),b=document.querySelector('#login-button'); if(!e||!p||!b)return false;e.value=arguments[0];p.value=arguments[1];b.click();return true;`, [email, password]);
    const connected = await waitState(native.driverPort, native.sessionId, s => s.auth === "AUTHENTICATED" && s.api === "CONNECTED" && s.libraryStatus === "READY" && ids.every(id => s.sourceIds.includes(id)), "3E connected state", 45_000);
    assert(connected.surface === "desktop" && connected.boundary === "READY" && connected.libraryWorkspace === workspaceId, "3E desktop authority mismatch");
    assert(connected.listProjection === LIST_PROJECTION.join(",") && !connected.listProjection.split(",").includes("analysis"), "3E list projection must remain metadata-only");

    const detailClicked = await execute(native.driverPort, native.sessionId, `const id=arguments[0];const b=Array.from(document.querySelectorAll('[data-detail-source-id]')).find(n=>n.dataset.detailSourceId===id);if(!b)return false;b.click();return true;`, [ids[0]]); assert(detailClicked, "3E detail button missing");
    const detail = await waitState(native.driverPort, native.sessionId, s => !s.detailHidden && s.detailStatus === "READY" && s.detailText.includes(labels[0]) && s.detailText.includes("persisted detail fixture"), "3E detail lazy-load");
    assert(detail.detailProjection === DETAIL_PROJECTION.join(",") && detail.detailProjection.split(",").includes("analysis"), "3E detail projection mismatch");

    const compareClicked = await execute(native.driverPort, native.sessionId, `const ids=arguments[0];for(const id of ids){const c=Array.from(document.querySelectorAll('[data-compare-source-id]')).find(n=>n.dataset.compareSourceId===id);if(!c)return false;c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));}const b=document.querySelector('#library-compare');if(!b||b.disabled)return false;b.click();return true;`, [ids]); assert(compareClicked, "3E compare control could not activate");
    const compared = await waitState(native.driverPort, native.sessionId, s => !s.compareHidden && s.compareStatus === "READY" && s.compareCount === "2" && ids.every(id => s.compareIds.includes(id)) && labels.every(label => s.compareText.includes(label)), "3E compare surface");

    await execute(native.driverPort, native.sessionId, `const e=document.querySelector('#email'),p=document.querySelector('#password');if(e)e.value='';if(p)p.value='';document.querySelector('#reference-compare-panel')?.scrollIntoView({block:'start'});return true;`); await delay(250);
    const shot = await webdriverRequest(native.driverPort, "GET", `/session/${native.sessionId}/screenshot`); assert(typeof shot.value === "string" && shot.value.length > 100, "3E screenshot missing"); fs.writeFileSync(path.join(evidenceDir, "reference-detail-compare.png"), Buffer.from(shot.value, "base64"));

    const deleteClicked = await execute(native.driverPort, native.sessionId, `const id=arguments[0];const b=Array.from(document.querySelectorAll('[data-delete-source-id]')).find(n=>n.dataset.deleteSourceId===id);if(!b)return false;b.click();return true;`, [ids[0]]); assert(deleteClicked, "3E fixture delete button missing");
    const afterDelete = await waitState(native.driverPort, native.sessionId, s => s.libraryStatus === "READY" && !s.sourceIds.includes(ids[0]), "3E UI delete convergence");
    const dbAfterDelete = await read(url, key, auth, workspaceId, [ids[0]]); assert(dbAfterDelete.length === 0, "3E fixture still exists after UI delete");
    await remove(url, key, auth, workspaceId, ids[1]); assert((await read(url, key, auth, workspaceId, ids)).length === 0, "3E cleanup failed"); cleanup = true;

    await execute(native.driverPort, native.sessionId, "document.querySelector('#logout-button')?.click();return true;");
    const signedOut = await waitState(native.driverPort, native.sessionId, s => s.auth === "SIGNED OUT" && s.libraryHidden && s.detailHidden && s.compareHidden && s.sourceIds.length === 0, "3E logout");
    evidence = {
      status: "MASTERV_WINDOWS_REFERENCE_DETAIL_COMPARE_RUNTIME_PASS", webview2_runtime_version: native.webviewVersion, cdp_browser: native.cdpBrowser, attach_mode: true,
      surface: connected.surface, auth_status: connected.auth, hosted_api_status: connected.api, boundary_probe: true, workspace_bootstrap: true,
      reference_library_list: "PASS", list_projection_metadata_only: true, reference_detail_lazy_load: detail.detailStatus === "READY", detail_projection_includes_analysis: true,
      reference_compare_surface: compared.compareStatus === "READY" ? "PASS" : "FAIL", compare_selection_count: Number(compared.compareCount), aggregate_compare_compiler_migrated: false,
      reference_delete_ui: !afterDelete.sourceIds.includes(ids[0]) ? "PASS" : "FAIL", reference_delete_db: dbAfterDelete.length === 0 ? "PASS" : "FAIL", cleanup: cleanup ? "PASS" : "FAIL",
      logout_clear: signedOut.auth === "SIGNED OUT" ? "PASS" : "FAIL", local_next_api_required: false, provider_credentials_in_desktop_job: false, gemini_requests: 0, youtube_requests: 0, screenshot: "reference-detail-compare.png"
    };
  } catch (error) { failure = error; }
  finally {
    if (auth && workspaceId && !cleanup) try { for (const id of ids) await remove(url, key, auth, workspaceId, id); assert((await read(url, key, auth, workspaceId, ids)).length === 0, "fallback cleanup failed"); cleanup = true; } catch (error) { cleanupFailure = error; }
    if (native) await native.close();
  }
  if (cleanupFailure) throw new Error(`${failure instanceof Error ? failure.message : failure || "runtime failed"}; cleanup also failed: ${cleanupFailure instanceof Error ? cleanupFailure.message : cleanupFailure}`);
  if (failure) throw failure; assert(cleanup && evidence, "3E runtime did not produce verified evidence");
  fs.writeFileSync(path.join(evidenceDir, "runtime-evidence.json"), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
}
main().catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exitCode = 1; });
