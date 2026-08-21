import fs from "node:fs";
import path from "node:path";
import {
  assert,
  attachMasterV,
  delay,
  execute,
  webdriverRequest
} from "./windows-webview2-attach.mjs";

const LIST_PROJECTION = [
  "source_id",
  "canonical_url",
  "label",
  "analysis_provenance",
  "revision",
  "first_saved_at",
  "updated_at"
];
const DETAIL_PROJECTION = [...LIST_PROJECTION, "analysis"];

function fixture(nativeId, label, variant) {
  const primary = variant === "A";
  return {
    source_platform: "youtube",
    source_id: `yt:${nativeId}`,
    native_id: nativeId,
    canonical_url: `https://www.youtube.com/watch?v=${nativeId}`,
    label,
    analysis: {
      summary: `${label} local-first runtime fixture`,
      structure_label: primary ? "hook → demo → CTA" : "problem → proof → CTA",
      duration_seconds: primary ? 12 : 18,
      hook: { type: primary ? "visual" : "problem", text: "", visual: "synthetic", duration_seconds: 2 },
      product_presentation: {
        first_seen_seconds: primary ? 1 : 4,
        demonstration_present: true,
        before_after_present: false,
        comparison_present: !primary,
        result_visual_present: false,
        face_present: false,
        hand_present: true
      },
      persuasion: {
        problem: primary ? "" : "synthetic problem",
        solution: "",
        benefit: "",
        proof: "",
        social_proof: "",
        offer: "",
        cta: primary ? "링크 확인" : "상세 보기",
        emotional_trigger: ""
      },
      presentation: { format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" },
      transcript: { full: "", segments: [] },
      scenes: [],
      observation_segments: [],
      tags: ["synthetic-smoke", variant],
      confidence_notes: ["Synthetic local-first Windows runtime fixture; no remote provider request executed."]
    },
    analysis_cache_key: `desktop-runtime-exit2c:${nativeId}`,
    analysis_provenance: "replay",
    schema_version: "reference-library-v1",
    first_saved_at: null,
    updated_at: null
  };
}

async function state(driverPort, sessionId) {
  return await execute(driverPort, sessionId, `return {
    surface: window.MASTERV_DESKTOP_CONFIG?.surface || '',
    migrationStage: window.MASTERV_DESKTOP_CONFIG?.migration_stage || '',
    tauriGlobal: Boolean(window.__TAURI__?.core?.invoke),
    auth: document.querySelector('#auth-status')?.textContent?.trim() || '',
    api: document.querySelector('#api-status')?.textContent?.trim() || '',
    activationForm: Boolean(document.querySelector('#activation-form')),
    productKeyInput: Boolean(document.querySelector('#product-key')),
    loginForm: Boolean(document.querySelector('#login-form')),
    legacyMigrationForm: Boolean(document.querySelector('#legacy-migration-form')),
    libraryStatus: document.querySelector('#library-status')?.textContent?.trim() || '',
    libraryWorkspace: document.querySelector('#library-workspace')?.textContent?.trim() || '',
    libraryHidden: Boolean(document.querySelector('#reference-library-panel')?.hidden),
    listProjection: document.querySelector('#reference-library-panel')?.dataset?.projection || '',
    sourceIds: Array.from(document.querySelectorAll('[data-source-id]')).map(n => n.dataset.sourceId || ''),
    detailHidden: Boolean(document.querySelector('#reference-detail-panel')?.hidden),
    detailStatus: document.querySelector('#reference-detail-status')?.textContent?.trim() || '',
    detailProjection: document.querySelector('#reference-detail-panel')?.dataset?.projection || '',
    detailText: document.querySelector('#reference-detail-content')?.textContent?.trim() || '',
    compareHidden: Boolean(document.querySelector('#reference-compare-panel')?.hidden),
    compareStatus: document.querySelector('#reference-compare-status')?.textContent?.trim() || '',
    compareCount: document.querySelector('#reference-compare-count')?.textContent?.trim() || '',
    compareIds: Array.from(document.querySelectorAll('[data-compare-result-source-id]')).map(n => n.dataset.compareResultSourceId || ''),
    compareText: document.querySelector('#reference-compare-content')?.textContent?.trim() || '',
    localKeys: Object.keys(localStorage),
    sessionKeys: Object.keys(sessionStorage),
    resources: performance.getEntriesByType('resource').map(entry => entry.name),
    smokeInvoke: document.documentElement.dataset.smokeInvoke || ''
  };`);
}

async function waitState(driverPort, sessionId, predicate, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await state(driverPort, sessionId);
    if (predicate(last)) return last;
    await delay(350);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function invokeNative(driverPort, sessionId, command, args) {
  await execute(driverPort, sessionId, `
    document.documentElement.dataset.smokeInvoke = 'pending';
    window.__TAURI__.core.invoke(arguments[0], arguments[1] || {})
      .then(() => { document.documentElement.dataset.smokeInvoke = 'ok'; })
      .catch((error) => { document.documentElement.dataset.smokeInvoke = 'error:' + String(error); });
    return true;
  `, [command, args]);
  const result = await waitState(
    driverPort,
    sessionId,
    (snapshot) => snapshot.smokeInvoke === "ok" || snapshot.smokeInvoke.startsWith("error:"),
    `native invoke ${command}`
  );
  assert(result.smokeInvoke === "ok", `native invoke ${command} failed: ${result.smokeInvoke}`);
}

async function click(driverPort, sessionId, selector, label) {
  const clicked = await execute(driverPort, sessionId, `const node=document.querySelector(arguments[0]);if(!node)return false;node.click();return true;`, [selector]);
  assert(clicked === true, `${label} control missing: ${selector}`);
}

async function seedFixtures(native, records) {
  for (const record of records) {
    await invokeNative(native.driverPort, native.sessionId, "desktop_local_reference_upsert", { input: record });
  }
  await click(native.driverPort, native.sessionId, "#library-refresh", "Reference Library refresh");
}

async function deleteFixture(native, sourceId) {
  const clicked = await execute(native.driverPort, native.sessionId, `
    const id=arguments[0];
    const button=Array.from(document.querySelectorAll('[data-delete-source-id]')).find(node => node.dataset.deleteSourceId === id);
    if(!button)return false;
    button.click();
    return true;
  `, [sourceId]);
  assert(clicked === true, `delete control missing for ${sourceId}`);
  await waitState(native.driverPort, native.sessionId, (snapshot) => snapshot.libraryStatus === "READY / LOCAL" && !snapshot.sourceIds.includes(sourceId), `delete ${sourceId}`);
}

async function main() {
  if (process.platform !== "win32") throw new Error("Desktop Windows runtime smoke must run on Windows");
  const binary = path.resolve(process.env.MASTERV_DESKTOP_APP_BINARY || path.join("src-tauri", "target", "release", "masterv-desktop.exe"));
  assert(fs.existsSync(binary), `MasterV binary missing: ${binary}`);
  assert(!process.env.GEMINI_API_KEY, "Gemini credential must not be present in Desktop runtime smoke");
  assert(!process.env.YOUTUBE_DATA_API_KEY, "YouTube credential must not be present in Desktop runtime smoke");
  assert(!process.env.POLAR_ACCESS_TOKEN, "Polar server credential must not be present in Desktop runtime smoke");

  const evidenceDir = path.resolve("artifacts", "desktop-windows-runtime");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const suffix = `${process.env.GITHUB_RUN_ID || Date.now()}${process.env.GITHUB_RUN_ATTEMPT || "1"}${process.pid}`.replace(/[^A-Za-z0-9_-]/g, "");
  const ids = [`yt:MV2C${suffix}A`, `yt:MV2C${suffix}B`];
  const labels = [`Desktop EXIT-2C fixture A ${suffix}`, `Desktop EXIT-2C fixture B ${suffix}`];
  const records = [fixture(ids[0].slice(3), labels[0], "A"), fixture(ids[1].slice(3), labels[1], "B")];
  const dataDir = path.join(evidenceDir, `webview-${suffix}`);

  let first;
  let second;
  let failure;
  let cleanupFailure;
  let evidence;
  try {
    first = await attachMasterV(binary, evidenceDir, "masterv-desktop-exit2c-first", { dataDir, reuseDataDir: false });
    const local = await waitState(
      first.driverPort,
      first.sessionId,
      (snapshot) => snapshot.auth === "LOCAL ONLY" && snapshot.api === "LOCAL ONLY" && snapshot.libraryStatus === "READY / LOCAL" && snapshot.libraryWorkspace === "local:masterv",
      "fresh local-first state",
      45_000
    );
    assert(local.surface === "desktop", `unexpected Desktop surface: ${local.surface}`);
    assert(local.migrationStage === "MV-SUPABASE-EXIT-2C", `unexpected migration stage: ${local.migrationStage}`);
    assert(local.tauriGlobal === true, "window.__TAURI__.core.invoke is unavailable in the packaged runtime");
    assert(local.activationForm && local.productKeyInput, "Product-Key activation controls are missing");
    assert(!local.loginForm, "legacy email/password login must not be the visible primary entry");
    assert(local.legacyMigrationForm, "0.1.2 existing-data migration surface is missing");
    assert(!local.libraryHidden, "Local Reference Library must be accessible without a Gateway session");
    assert(local.listProjection === LIST_PROJECTION.join(","), `unexpected local list projection: ${local.listProjection}`);
    assert(local.localKeys.length === 0 && local.sessionKeys.length === 0, "fresh local-only runtime must not persist auth credentials in Web storage");

    await seedFixtures(first, records);
    const seeded = await waitState(first.driverPort, first.sessionId, (snapshot) => snapshot.libraryStatus === "READY / LOCAL" && ids.every((id) => snapshot.sourceIds.includes(id)), "local SQLite fixture visibility");

    const detailClicked = await execute(first.driverPort, first.sessionId, `
      const id=arguments[0];
      const button=Array.from(document.querySelectorAll('[data-detail-source-id]')).find(node => node.dataset.detailSourceId===id);
      if(!button)return false;
      button.click();
      return true;
    `, [ids[0]]);
    assert(detailClicked === true, "local detail button missing");
    const detail = await waitState(first.driverPort, first.sessionId, (snapshot) => !snapshot.detailHidden && snapshot.detailStatus === "READY / LOCAL" && snapshot.detailText.includes(labels[0]), "local detail read");
    assert(detail.detailProjection === DETAIL_PROJECTION.join(","), `unexpected detail projection: ${detail.detailProjection}`);

    const compareClicked = await execute(first.driverPort, first.sessionId, `
      const ids=arguments[0];
      for(const id of ids){
        const checkbox=Array.from(document.querySelectorAll('[data-compare-source-id]')).find(node => node.dataset.compareSourceId===id);
        if(!checkbox)return false;
        checkbox.checked=true;
        checkbox.dispatchEvent(new Event('change',{bubbles:true}));
      }
      const button=document.querySelector('#library-compare');
      if(!button||button.disabled)return false;
      button.click();
      return true;
    `, [ids]);
    assert(compareClicked === true, "local canonical compare could not be activated");
    const compared = await waitState(first.driverPort, first.sessionId, (snapshot) => !snapshot.compareHidden && snapshot.compareStatus === "READY / LOCAL" && snapshot.compareCount === "2" && ids.every((id) => snapshot.compareIds.includes(id)), "local canonical compare", 45_000);
    assert(labels.every((label) => compared.compareText.includes(label)), "local compare output does not contain both fixture labels");

    const screenshot = await webdriverRequest(first.driverPort, "GET", `/session/${first.sessionId}/screenshot`);
    assert(typeof screenshot.value === "string" && screenshot.value.length > 100, "runtime screenshot missing");
    fs.writeFileSync(path.join(evidenceDir, "local-first-runtime.png"), Buffer.from(screenshot.value, "base64"));

    await first.close();
    first = null;
    second = await attachMasterV(binary, evidenceDir, "masterv-desktop-exit2c-restart", { dataDir, reuseDataDir: true });
    const restarted = await waitState(
      second.driverPort,
      second.sessionId,
      (snapshot) => snapshot.auth === "LOCAL ONLY" && snapshot.libraryStatus === "READY / LOCAL" && ids.every((id) => snapshot.sourceIds.includes(id)),
      "local data after process restart",
      45_000
    );
    assert(restarted.tauriGlobal === true, "Tauri invoke bridge disappeared after restart");
    assert(restarted.localKeys.length === 0 && restarted.sessionKeys.length === 0, "restart introduced persistent browser auth storage");

    for (const id of ids) await deleteFixture(second, id);
    const cleaned = await waitState(second.driverPort, second.sessionId, (snapshot) => ids.every((id) => !snapshot.sourceIds.includes(id)), "local fixture cleanup");

    const resourceUrls = [...new Set([...local.resources, ...seeded.resources, ...restarted.resources, ...cleaned.resources])];
    const forbiddenRuntimeRequests = resourceUrls.filter((url) => /\/api\/|generativelanguage\.googleapis\.com|youtube\.googleapis\.com/i.test(url));
    assert(forbiddenRuntimeRequests.length === 0, `local-only runtime emitted forbidden direct provider/local API requests: ${forbiddenRuntimeRequests.join(", ")}`);

    evidence = {
      status: "MASTERV_WINDOWS_DESKTOP_RUNTIME_PASS",
      migration_stage: "MV-SUPABASE-EXIT-2C",
      webview2_runtime_version: second.webviewVersion,
      cdp_browser: second.cdpBrowser,
      attach_mode: true,
      visible_auth: "product-key+device-resume",
      fresh_runtime_auth_state: local.auth,
      gateway_required_for_local_data: false,
      local_workspace: restarted.libraryWorkspace,
      local_sqlite_crud: "PASS",
      local_sqlite_process_restart_persistence: "PASS",
      reference_detail_local_read: detail.detailStatus === "READY / LOCAL" ? "PASS" : "FAIL",
      reference_compare_local_canonical: compared.compareStatus === "READY / LOCAL" ? "PASS" : "FAIL",
      product_key_ui_present: local.productKeyInput,
      legacy_login_ui_present: local.loginForm,
      legacy_migration_ui_present: local.legacyMigrationForm,
      tauri_global_invoke_bridge: local.tauriGlobal,
      persistent_auth_storage: false,
      direct_provider_requests: 0,
      local_next_api_requests: 0,
      fixture_cleanup: "PASS",
      screenshot: "local-first-runtime.png"
    };
  } catch (error) {
    failure = error;
  } finally {
    if (first) await first.close();
    if (second) {
      if (!evidence) {
        try {
          for (const id of ids) {
            await invokeNative(second.driverPort, second.sessionId, "desktop_local_reference_delete", { sourceId: id });
          }
        } catch (error) {
          cleanupFailure = error;
        }
      }
      await second.close();
    }
  }

  if (cleanupFailure) throw new Error(`${failure instanceof Error ? failure.message : failure || "runtime failed"}; cleanup also failed: ${cleanupFailure instanceof Error ? cleanupFailure.message : cleanupFailure}`);
  if (failure) throw failure;
  assert(evidence, "local-first Windows runtime did not produce evidence");
  fs.writeFileSync(path.join(evidenceDir, "runtime-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
