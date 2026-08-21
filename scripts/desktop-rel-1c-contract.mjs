import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(path.resolve(file), "utf8").replace(/\r\n?/g, "\n");
}

const verifier = read("scripts/desktop-rel-1c-published-updater-windows.mjs");
const workflow = read(".github/workflows/desktop-rel-1c-published-updater-verification.yml");
const ci = read(".github/workflows/ci.yml");

for (const marker of [
  'attachMasterV',
  'waitForBaselineReady',
  'https://tauri.localhost/',
  'document.readyState',
  "window.__TAURI__.core.invoke('desktop_update_check')",
  "window.__TAURI__.core.invoke('desktop_update_install')",
  'MASTERV_REL_1C_PUBLISHED_UPDATER_SIGNATURE_ACCEPTANCE_PASS',
  'tauri_signature_verified_by_successful_install: true',
  'release_mutation: false'
]) {
  assert(verifier.includes(marker), `MV-REL-1C verifier contract marker missing: ${marker}`);
}

assert(!verifier.includes('pages.find((entry) => entry?.webSocketDebuggerUrl)'), "MV-REL-1C must not attach to the first arbitrary CDP target");
assert(!verifier.includes('Published 0.1.3 hero contract changed unexpectedly'), "MV-REL-1C must not retain the immediate baseline DOM assertion that caused the REL-1B race");

for (const marker of [
  'name: MV REL-1C Published Updater Verification',
  'workflow_dispatch:',
  'contents: read',
  'windows-2025',
  'node scripts/desktop-rel-1c-contract.mjs',
  'node scripts/desktop-rel-1c-published-updater-windows.mjs',
  'masterv-0.1.4-rel-1c-published-updater-verification'
]) {
  assert(workflow.includes(marker), `MV-REL-1C workflow contract marker missing: ${marker}`);
}
assert(!workflow.includes('pull_request:'), "MV-REL-1C verification-only workflow must not become a third automatic PR workflow");

for (const forbidden of [
  'TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.',
  'TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.',
  'gh release create',
  'gh release upload',
  'gh release edit',
  'contents: write'
]) {
  assert(!workflow.includes(forbidden), `MV-REL-1C verification-only workflow must not contain mutation/signing authority: ${forbidden}`);
}

for (const marker of [
  'Verify REL-1C verification-only harness contract',
  'node scripts/desktop-rel-1c-contract.mjs',
  'Verify real published 0.1.3 to signed 0.1.4 updater acceptance',
  'node scripts/desktop-rel-1c-published-updater-windows.mjs'
]) {
  assert(ci.includes(marker), `MV-REL-1C existing CI integration marker missing: ${marker}`);
}

console.log(JSON.stringify({
  status: "MASTERV_REL_1C_VERIFICATION_HARNESS_CONTRACT_PASS",
  published_versions: ["0.1.3", "0.1.4"],
  app_target_wait_required: true,
  dom_ready_wait_required: true,
  automatic_pr_workflow_added: false,
  existing_ci_integration_required: true,
  production_signing_allowed: false,
  release_publication_allowed: false,
  release_mutation_allowed: false
}));
