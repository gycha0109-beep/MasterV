import fs from "node:fs";
import path from "node:path";
import { assert, attachMasterV, delay, execute } from "./windows-webview2-attach.mjs";

if (process.platform !== "win32") throw new Error("MV-REL-1B updater bootstrap hotfix smoke must run on Windows");

const root = process.cwd();
const hotfixVersion = "0.1.4";
const binary = path.resolve("src-tauri", "target", "release", "masterv-desktop.exe");
const evidenceDir = path.resolve("artifacts", "desktop-rel-1b-hotfix");
fs.mkdirSync(evidenceDir, { recursive: true });
assert(fs.existsSync(binary), `MV-REL-1B hotfix binary missing: ${binary}`);

let runtime;
try {
  runtime = await attachMasterV(binary, evidenceDir, "masterv-rel-1b-hotfix");
  const deadline = Date.now() + 30_000;
  let state = null;
  while (Date.now() < deadline) {
    state = await execute(runtime.driverPort, runtime.sessionId, `return {
      href: location.href,
      heroTag: document.querySelector('.hero')?.tagName || '',
      releaseTrack: window.MASTERV_DESKTOP_CONFIG?.release_track || '',
      updaterEnabled: window.MASTERV_UPDATER_CONFIG?.enabled === true,
      updaterPanel: Boolean(document.querySelector('#desktop-updater-panel')),
      updaterStatus: document.querySelector('#desktop-updater-status')?.textContent?.trim() || '',
      updaterNotes: document.querySelector('#desktop-updater-notes')?.textContent?.trim() || '',
      checkButton: Boolean(document.querySelector('#desktop-updater-check')),
      installButton: Boolean(document.querySelector('#desktop-updater-install'))
    };`);
    if (state?.updaterPanel && state?.updaterStatus) break;
    await delay(250);
  }

  assert(state?.href?.startsWith("https://tauri.localhost/"), `unexpected desktop URL: ${state?.href}`);
  assert(state?.heroTag === "HEADER", `MV-REL-1B expected header.hero, got ${state?.heroTag || "missing"}`);
  assert(state?.releaseTrack === hotfixVersion, `MV-REL-1B release track mismatch: ${state?.releaseTrack}`);
  assert(state?.updaterEnabled === true, "MV-REL-1B updater config is not enabled");
  assert(state?.updaterPanel === true, "MV-REL-1B updater panel was not created");
  assert(Boolean(state?.updaterStatus), "MV-REL-1B updater status element is empty or missing");
  assert(state?.checkButton === true, "MV-REL-1B updater check button is missing");
  assert(state?.installButton === true, "MV-REL-1B updater install button is missing");

  const evidence = {
    status: "MASTERV_REL_1B_UPDATER_BOOTSTRAP_HOTFIX_RC_PASS",
    version: hotfixVersion,
    hero_selector_contract: "header.hero",
    updater_panel_created: true,
    updater_status_observable: true,
    updater_status: state.updaterStatus,
    updater_notes: state.updaterNotes,
    production_signature_exercised: false,
    publication: false
  };
  fs.writeFileSync(path.join(evidenceDir, "hotfix-rc-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  if (runtime) await runtime.close().catch(() => undefined);
}
