import fs from "node:fs";
import path from "node:path";
import { assert, attachMasterV, delay, execute } from "./windows-webview2-attach.mjs";

if (process.platform !== "win32") throw new Error("Windows clean-cut runtime smoke must run on Windows");
const binary = path.resolve(process.env.MASTERV_DESKTOP_APP_BINARY || path.join("src-tauri", "target", "release", "masterv-desktop.exe"));
assert(fs.existsSync(binary), `MasterV binary missing: ${binary}`);

const evidenceDir = path.resolve(process.env.MASTERV_WINDOWS_EVIDENCE_DIR || path.join("artifacts", "desktop-windows-clean-cut"));
fs.mkdirSync(evidenceDir, { recursive: true });
const suffix = `${process.env.GITHUB_RUN_ID || Date.now()}${process.pid}`.replace(/[^A-Za-z0-9_-]/g, "");
const sourceId = `yt:MV3${suffix}`;
const dataDir = path.join(evidenceDir, `webview-${suffix}`);

async function state(native) {
  return await execute(native.driverPort, native.sessionId, `return {
    surface: window.MASTERV_DESKTOP_CONFIG?.surface || '',
    stage: window.MASTERV_DESKTOP_CONFIG?.architecture_stage || '',
    releaseTrack: window.MASTERV_DESKTOP_CONFIG?.release_track || '',
    tauriGlobal: Boolean(window.__TAURI__?.core?.invoke),
    auth: document.querySelector('#auth-status')?.textContent?.trim() || '',
    api: document.querySelector('#api-status')?.textContent?.trim() || '',
    workspace: document.querySelector('#library-workspace')?.textContent?.trim() || '',
    libraryStatus: document.querySelector('#library-status')?.textContent?.trim() || '',
    activationForm: Boolean(document.querySelector('#activation-form')),
    legacyMigrationForm: Boolean(document.querySelector('#legacy-migration-form')),
    loginForm: Boolean(document.querySelector('#login-form')),
    sourceIds: Array.from(document.querySelectorAll('[data-source-id]')).map(node => node.dataset.sourceId || ''),
    localKeys: Object.keys(localStorage),
    sessionKeys: Object.keys(sessionStorage),
    resources: performance.getEntriesByType('resource').map(entry => entry.name),
    invokeState: document.documentElement.dataset.cleanCutInvoke || ''
  };`);
}

async function waitState(native, predicate, label, timeout = 45_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await state(native);
    if (predicate(last)) return last;
    await delay(350);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function invoke(native, command, args) {
  await execute(native.driverPort, native.sessionId, `
    document.documentElement.dataset.cleanCutInvoke = 'pending';
    window.__TAURI__.core.invoke(arguments[0], arguments[1] || {})
      .then(() => { document.documentElement.dataset.cleanCutInvoke = 'ok'; })
      .catch((error) => { document.documentElement.dataset.cleanCutInvoke = 'error:' + String(error); });
    return true;
  `, [command, args]);
  const snapshot = await waitState(native, (value) => value.invokeState === "ok" || value.invokeState.startsWith("error:"), `invoke ${command}`);
  assert(snapshot.invokeState === "ok", `${command} failed: ${snapshot.invokeState}`);
}

const record = {
  source_platform: "youtube",
  source_id: sourceId,
  native_id: sourceId.slice(3),
  canonical_url: `https://www.youtube.com/watch?v=${sourceId.slice(3)}`,
  label: `EXIT-3 local fixture ${suffix}`,
  analysis: { summary: "EXIT-3 local-only fixture", structure_label: "hook → demo → CTA", duration_seconds: 12, hook: { type: "visual", text: "", visual: "synthetic", duration_seconds: 2 }, product_presentation: { first_seen_seconds: 1, demonstration_present: true, before_after_present: false, comparison_present: false, result_visual_present: false, face_present: false, hand_present: true }, persuasion: { problem: "", solution: "", benefit: "", proof: "", social_proof: "", offer: "", cta: "링크 확인", emotional_trigger: "" }, presentation: { format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" }, transcript: { full: "", segments: [] }, scenes: [], observation_segments: [], tags: ["exit-3-clean-cut"], confidence_notes: ["Synthetic local-only fixture"] },
  analysis_cache_key: `exit3:${sourceId}`,
  analysis_provenance: "replay",
  schema_version: "reference-library-v1",
  first_saved_at: null,
  updated_at: null
};

let first;
let second;
try {
  first = await attachMasterV(binary, evidenceDir, "masterv-exit3-first", { dataDir, reuseDataDir: false });
  const fresh = await waitState(first, (value) => value.auth === "LOCAL ONLY" && value.api === "LOCAL ONLY" && value.libraryStatus === "READY / LOCAL" && value.workspace === "local:masterv", "fresh clean-cut local state");
  assert(fresh.surface === "desktop", `unexpected surface ${fresh.surface}`);
  assert(fresh.stage === "MV-EXIT-3-CLEAN-CUT", `unexpected architecture stage ${fresh.stage}`);
  assert(fresh.releaseTrack === "0.1.3", `unexpected release track ${fresh.releaseTrack}`);
  assert(fresh.tauriGlobal && fresh.activationForm, "native bridge/Product Key activation missing");
  assert(!fresh.legacyMigrationForm && !fresh.loginForm, "legacy auth/migration surface remains");
  assert(fresh.localKeys.length === 0 && fresh.sessionKeys.length === 0, "browser credential persistence detected");
  const externalRuntimeRequests = fresh.resources.filter((url) => /^https?:\/\//i.test(url) && !/^https:\/\/tauri\.localhost/i.test(url));
  assert(externalRuntimeRequests.length === 0, `fresh local runtime emitted external requests: ${externalRuntimeRequests.join(", ")}`);

  await invoke(first, "desktop_local_reference_upsert", { input: record });
  await execute(first.driverPort, first.sessionId, `document.querySelector('#library-refresh')?.click();return true;`);
  await waitState(first, (value) => value.sourceIds.includes(sourceId), "local SQLite write visibility");
  await first.close(); first = null;

  second = await attachMasterV(binary, evidenceDir, "masterv-exit3-restart", { dataDir, reuseDataDir: true });
  const restarted = await waitState(second, (value) => value.libraryStatus === "READY / LOCAL" && value.sourceIds.includes(sourceId), "local SQLite restart persistence");
  assert(restarted.localKeys.length === 0 && restarted.sessionKeys.length === 0, "restart introduced browser credential persistence");
  await invoke(second, "desktop_local_reference_delete", { sourceId });
  await execute(second.driverPort, second.sessionId, `document.querySelector('#library-refresh')?.click();return true;`);
  await waitState(second, (value) => !value.sourceIds.includes(sourceId), "local SQLite cleanup");

  const evidence = {
    status: "MASTERV_WINDOWS_EXIT_3_CLEAN_CUT_PASS",
    architecture_stage: fresh.stage,
    release_track: fresh.releaseTrack,
    local_sqlite_crud: "PASS",
    local_sqlite_process_restart_persistence: "PASS",
    visible_auth: "product-key+device-resume",
    legacy_auth_surface: false,
    legacy_migration_surface: false,
    browser_persistent_auth_storage: false,
    fresh_external_runtime_requests: 0
  };
  fs.writeFileSync(path.join(evidenceDir, "runtime-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  if (first) await first.close();
  if (second) await second.close();
}
