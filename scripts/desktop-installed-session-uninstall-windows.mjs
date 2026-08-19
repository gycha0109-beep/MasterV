import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assert,
  attachMasterV,
  delay,
  execute,
  required,
  shellLines
} from "./windows-webview2-attach.mjs";

function powershell(command) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function countMatching(command) {
  const output = powershell(`$items = @(${command}); Write-Output $items.Count`);
  const value = Number(output.split(/\r?\n/).filter(Boolean).at(-1) || "0");
  assert(Number.isInteger(value) && value >= 0, `Invalid PowerShell count: ${output}`);
  return value;
}

async function state(native) {
  return await execute(native.driverPort, native.sessionId, `return {
    surface: window.MASTERV_DESKTOP_CONFIG?.surface || '',
    migrationStage: window.MASTERV_DESKTOP_CONFIG?.migration_stage || '',
    tauriGlobal: Boolean(window.__TAURI__?.core?.invoke),
    auth: document.querySelector('#auth-status')?.textContent?.trim() || '',
    api: document.querySelector('#api-status')?.textContent?.trim() || '',
    workspace: document.querySelector('#library-workspace')?.textContent?.trim() || '',
    libraryStatus: document.querySelector('#library-status')?.textContent?.trim() || '',
    sourceIds: Array.from(document.querySelectorAll('[data-source-id]')).map(node => node.dataset.sourceId || ''),
    activationForm: Boolean(document.querySelector('#activation-form')),
    loginForm: Boolean(document.querySelector('#login-form')),
    localKeys: Object.keys(localStorage),
    sessionKeys: Object.keys(sessionStorage),
    resources: performance.getEntriesByType('resource').map(entry => entry.name),
    smokeInvoke: document.documentElement.dataset.smokeInvoke || ''
  };`);
}

async function waitState(native, predicate, label, timeout = 35_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await state(native);
    if (predicate(last)) return last;
    await delay(400);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function invokeNative(native, command, args) {
  await execute(native.driverPort, native.sessionId, `
    document.documentElement.dataset.smokeInvoke = 'pending';
    window.__TAURI__.core.invoke(arguments[0], arguments[1] || {})
      .then(() => { document.documentElement.dataset.smokeInvoke = 'ok'; })
      .catch((error) => { document.documentElement.dataset.smokeInvoke = 'error:' + String(error); });
    return true;
  `, [command, args]);
  const result = await waitState(native, (snapshot) => snapshot.smokeInvoke === "ok" || snapshot.smokeInvoke.startsWith("error:"), `native invoke ${command}`);
  assert(result.smokeInvoke === "ok", `native invoke ${command} failed: ${result.smokeInvoke}`);
}

function fixture(nativeId, label) {
  return {
    source_platform: "youtube",
    source_id: `yt:${nativeId}`,
    native_id: nativeId,
    canonical_url: `https://www.youtube.com/watch?v=${nativeId}`,
    label,
    analysis: {
      summary: `${label} installed lifecycle fixture`,
      structure_label: "hook → demo → CTA",
      duration_seconds: 12,
      hook: { type: "visual", text: "", visual: "synthetic", duration_seconds: 2 },
      product_presentation: { first_seen_seconds: 1, demonstration_present: true, before_after_present: false, comparison_present: false, result_visual_present: false, face_present: false, hand_present: true },
      persuasion: { problem: "", solution: "", benefit: "", proof: "", social_proof: "", offer: "", cta: "링크 확인", emotional_trigger: "" },
      presentation: { format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" },
      transcript: { full: "", segments: [] },
      scenes: [], observation_segments: [], tags: ["installed-exit2c-smoke"], confidence_notes: ["Synthetic local-only installed runtime fixture."]
    },
    analysis_cache_key: `installed-exit2c:${nativeId}`,
    analysis_provenance: "replay",
    schema_version: "reference-library-v1",
    first_saved_at: null,
    updated_at: null
  };
}

async function waitForUninstallCleanup(installedBinary, uninstallKeyName, timeout = 60_000) {
  const end = Date.now() + timeout;
  let lastRegistryCount = -1;
  while (Date.now() < end) {
    const registryCount = countMatching(`Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -eq '${uninstallKeyName.replace(/'/g, "''")}' }`);
    lastRegistryCount = registryCount;
    if (!fs.existsSync(installedBinary) && registryCount === 0) return { registryCount, waitedMs: timeout - Math.max(0, end - Date.now()) };
    await delay(500);
  }
  assert(!fs.existsSync(installedBinary), `Installed executable still exists after bounded uninstall cleanup: ${installedBinary}`);
  assert(lastRegistryCount === 0, `MasterV uninstall registry entry still exists after bounded cleanup: ${lastRegistryCount}`);
  return { registryCount: lastRegistryCount, waitedMs: timeout };
}

async function main() {
  if (process.platform !== "win32") throw new Error("Installed lifecycle smoke must run on Windows");
  const binary = path.resolve(required("MASTERV_DESKTOP_APP_BINARY"));
  const uninstaller = path.resolve(required("MASTERV_DESKTOP_UNINSTALLER"));
  const uninstallKeyName = required("MASTERV_DESKTOP_UNINSTALL_KEY");
  assert(fs.existsSync(binary), `Installed MasterV binary missing: ${binary}`);
  assert(fs.existsSync(uninstaller), `MasterV uninstaller missing: ${uninstaller}`);
  assert(!process.env.GEMINI_API_KEY && !process.env.YOUTUBE_DATA_API_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY, "Provider/admin credentials must not be present in installed Desktop runtime");
  assert(!process.env.TAURI_SIGNING_PRIVATE_KEY, "Signing private key must not be present in installed quality runtime");

  const evidenceDir = path.resolve("artifacts", "desktop-installed-quality");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const suffix = `${process.env.GITHUB_RUN_ID || Date.now()}${process.env.GITHUB_RUN_ATTEMPT || "1"}${process.pid}`.replace(/[^A-Za-z0-9_-]/g, "");
  const dataDir = path.join(evidenceDir, `restart-profile-${suffix}`);
  const nativeId = `MVIL${suffix}`;
  const sourceId = `yt:${nativeId}`;
  const label = `Installed EXIT-2C fixture ${suffix}`;
  let first;
  let second;
  let failure;
  let cleanupFailure;
  let evidence;

  try {
    first = await attachMasterV(binary, evidenceDir, "masterv-installed-exit2c-first", { dataDir, reuseDataDir: false });
    const initial = await waitState(first, (snapshot) => snapshot.auth === "LOCAL ONLY" && snapshot.api === "LOCAL ONLY" && snapshot.libraryStatus === "READY / LOCAL" && snapshot.workspace === "local:masterv", "installed local-first startup", 45_000);
    assert(initial.surface === "desktop" && initial.migrationStage === "MV-SUPABASE-EXIT-2C", "installed runtime surface/stage mismatch");
    assert(initial.tauriGlobal, "installed runtime is missing the Tauri global invoke bridge");
    assert(initial.activationForm && !initial.loginForm, "installed runtime did not cut over visible authentication to Product Key");
    assert(initial.localKeys.length === 0 && initial.sessionKeys.length === 0, "fresh installed runtime has persistent browser auth storage");

    await invokeNative(first, "desktop_local_reference_upsert", { input: fixture(nativeId, label) });
    await execute(first.driverPort, first.sessionId, "document.querySelector('#library-refresh')?.click(); return true;");
    await waitState(first, (snapshot) => snapshot.sourceIds.includes(sourceId), "installed local fixture visibility");

    await first.close();
    first = null;
    second = await attachMasterV(binary, evidenceDir, "masterv-installed-exit2c-restart", { dataDir, reuseDataDir: true });
    const restarted = await waitState(second, (snapshot) => snapshot.auth === "LOCAL ONLY" && snapshot.libraryStatus === "READY / LOCAL" && snapshot.sourceIds.includes(sourceId), "installed local data after process restart", 45_000);
    assert(restarted.localKeys.length === 0 && restarted.sessionKeys.length === 0, "process_restart_without_logout introduced persistent browser auth storage");
    const persistent_auth_storage = false;
    const resourceUrls = [...new Set(restarted.resources)];
    const direct_gemini_requests = resourceUrls.filter((url) => url.includes("generativelanguage.googleapis.com"));
    const direct_youtube_data_api_requests = resourceUrls.filter((url) => url.includes("youtube.googleapis.com"));
    const local_next_api_requests = resourceUrls.filter((url) => /\/api\//.test(url));
    assert(direct_gemini_requests.length === 0 && direct_youtube_data_api_requests.length === 0 && local_next_api_requests.length === 0, "installed local-only restart emitted forbidden direct provider/local API traffic");

    await invokeNative(second, "desktop_local_reference_delete", { sourceId });
    await execute(second.driverPort, second.sessionId, "document.querySelector('#library-refresh')?.click(); return true;");
    await waitState(second, (snapshot) => !snapshot.sourceIds.includes(sourceId), "installed fixture cleanup");
    await second.close();
    second = null;

    const uninstall = spawnSync(uninstaller, ["/S"], { encoding: "utf8", windowsHide: true });
    assert(uninstall.status === 0, `Uninstaller failed: ${uninstall.stderr || uninstall.stdout}`);
    const cleanup = await waitForUninstallCleanup(binary, uninstallKeyName, 60_000);
    const uninstall_registry_removed = cleanup.registryCount === 0;
    const autorun_residue = shellLines(`Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | Where-Object { ($_.Name -match 'MasterV') -or ($_.Command -like '*masterv-desktop.exe*') } | ForEach-Object { $_.Name }`);
    const service_residue = shellLines(`Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object { ($_.Name -match 'MasterV') -or ($_.DisplayName -match 'MasterV') -or ($_.PathName -like '*masterv-desktop.exe*') } | ForEach-Object { $_.Name }`);
    const scheduled_task_residue = shellLines(`Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { ($_.TaskName -match 'MasterV') -or (($_.Actions | ForEach-Object Execute) -like '*masterv-desktop.exe*') } | ForEach-Object { $_.TaskName }`);
    assert(autorun_residue.length === 0, `Unexpected autorun residue: ${autorun_residue.join(", ")}`);
    assert(service_residue.length === 0, `Unexpected service residue: ${service_residue.join(", ")}`);
    assert(scheduled_task_residue.length === 0, `Unexpected scheduled-task residue: ${scheduled_task_residue.join(", ")}`);

    evidence = {
      status: "MASTERV_DESKTOP_INSTALLED_SESSION_UNINSTALL_PASS",
      migration_stage: "MV-SUPABASE-EXIT-2C",
      process_restart_without_logout: true,
      local_data_survived_process_restart: true,
      local_data_access_without_gateway_session: true,
      persistent_auth_storage,
      localStorage: restarted.localKeys,
      sessionStorage: restarted.sessionKeys,
      direct_gemini_requests: direct_gemini_requests.length,
      direct_youtube_data_api_requests: direct_youtube_data_api_requests.length,
      local_next_api_requests: local_next_api_requests.length,
      fixture_cleanup: true,
      uninstall_registry_removed,
      autorun_residue,
      service_residue,
      scheduled_task_residue,
      uninstall_cleanup_wait_ms: cleanup.waitedMs
    };
  } catch (error) {
    failure = error;
  } finally {
    if (first) await first.close();
    if (second) {
      try { await invokeNative(second, "desktop_local_reference_delete", { sourceId }); }
      catch (error) { cleanupFailure = error; }
      await second.close();
    }
  }

  if (cleanupFailure) throw new Error(`${failure instanceof Error ? failure.message : failure || "installed lifecycle failed"}; cleanup also failed: ${cleanupFailure instanceof Error ? cleanupFailure.message : cleanupFailure}`);
  if (failure) throw failure;
  assert(evidence, "installed lifecycle did not produce evidence");
  fs.writeFileSync(path.join(evidenceDir, "session-uninstall-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
