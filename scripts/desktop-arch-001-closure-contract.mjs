import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");
const json = (relative) => JSON.parse(read(relative));
const exists = (relative) => fs.existsSync(path.join(root, relative));
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

function runNode(relative) {
  const result = spawnSync(process.execPath, [relative], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${relative} failed:\n${result.stderr || result.stdout || result.error}`);
}

function runTsx(relative) {
  assert(exists(path.relative(root, tsxCli)), `tsx CLI is missing: ${tsxCli}`);
  const result = spawnSync(process.execPath, [tsxCli, relative], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${relative} failed:\n${result.stderr || result.stdout || result.error}`);
}

function walkText(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  const output = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...walkText(child));
    else if (/\.(?:js|mjs|ts|tsx|rs|json|toml)$/i.test(entry.name)) output.push([child, read(child)]);
  }
  return output;
}

const closureDocPath = "docs/architecture/MV-ARCH-001-CLOSURE.md";
assert(exists(closureDocPath), "MV-ARCH-001 closure document is missing");

// Reuse the already-governed implementation and release-plane contracts.
// These are deterministic source/contracts only; no production credential or mutation is exercised.
runTsx("scripts/gateway-polar-authority-contract.ts");
runTsx("scripts/gateway-stateless-contract.ts");
runNode("scripts/desktop-local-persistence-contract.mjs");
runNode("scripts/desktop-independent-updater-contract.mjs");
runNode("scripts/desktop-supabase-clean-cut-contract.mjs");
runNode("scripts/desktop-post-exit-1-contract.mjs");
runNode("scripts/desktop-rel-1-contract.mjs");
runNode("scripts/desktop-rel-1b-contract.mjs");
runNode("scripts/desktop-rel-1c-contract.mjs");

const closure = read(closureDocPath);
const ci = read(".github/workflows/ci.yml");
const hotfixRelease = json("src-tauri/tauri.windows-updater-hotfix-release.conf.json");
const hotfixRc = json("src-tauri/tauri.windows-updater-hotfix-rc.conf.json");
const nativeUpdater = read("src-tauri/src/updater.rs");
const rel1cWorkflow = read(".github/workflows/desktop-rel-1c-published-updater-verification.yml");

const architecture = {
  MASTERV_ARCHITECTURE: "LOCAL_FIRST_PRODUCT_KEY_DESKTOP",
  MASTERV_CENTRAL_DB: "NONE",
  MASTERV_AUTH_MODEL: "LICENSE_ACTIVATION",
  MASTERV_PAYMENT_PROVIDER: "POLAR",
  MASTERV_USER_DATA_AUTHORITY: "LOCAL_SQLITE",
  MASTERV_GATEWAY: "STATELESS",
  MASTERV_UPDATE_CHANNEL: "INDEPENDENT_TAURI_SIGNED",
  SUPABASE_RUNTIME_DEPENDENCY: "ZERO",
  MV_ARCH_001: "CLOSED"
};

for (const [key, value] of Object.entries(architecture)) {
  assert(closure.includes(`${key} = ${value}`), `MV-ARCH-001 frozen architecture marker missing: ${key} = ${value}`);
}

const invariants = Array.from({ length: 12 }, (_, index) => `INV-${index + 1}`);
for (const invariant of invariants) {
  assert(closure.includes(`| ${invariant} `), `MV-ARCH-001 invariant closure missing: ${invariant}`);
}

const completionCriteria = [
  "Product-key activation works",
  "Subscription entitlement works",
  "Device activation works",
  "Usage enforcement works",
  "Reference Library is SQLite-backed",
  "Analysis results persist locally",
  "Production Guidance persists locally",
  "Gateway is stateless",
  "Gateway has no MasterV-owned central DB",
  "Gemini secret exists only server-side",
  "YouTube secret exists only server-side",
  "Updater works without Supabase",
  "Update access is independent of subscription",
  "Supabase runtime network requests = 0",
  "Supabase runtime secrets = 0",
  "Supabase DB dependency = 0",
  "Supabase Storage dependency = 0",
  "User can export/import local data",
  "DB migration backup exists"
];
for (const criterion of completionCriteria) {
  assert(closure.includes(`| ${criterion} | PASS |`), `MV-ARCH-001 completion criterion is not frozen PASS: ${criterion}`);
}

for (const marker of [
  "schema_version             PASS",
  "transactional migrations  PASS",
  "pre-migration backup       PASS",
  "manual export/import       PASS",
  "automatic backup           PASS",
  "corruption/integrity guard PASS"
]) {
  assert(closure.includes(marker), `MV-ARCH-001 reliability closure marker missing: ${marker}`);
}

assert.equal(hotfixRc.version, "0.1.4", "MV-ARCH-001 production hotfix RC baseline must remain 0.1.4");
assert.equal(hotfixRelease.version, "0.1.4", "MV-ARCH-001 production hotfix release baseline must remain 0.1.4");
assert.equal(hotfixRc.bundle?.createUpdaterArtifacts, false, "MV-ARCH-001 closure must preserve unsigned PR hotfix RC");
assert.equal(hotfixRelease.bundle?.createUpdaterArtifacts, true, "MV-ARCH-001 closure must preserve signed production hotfix release plane");

const keyMatch = nativeUpdater.match(/UPDATE_PUBLIC_KEY:\s*&str\s*=\s*"([^"]+)"/);
const updaterPublicKey = keyMatch?.[1] || "";
assert(updaterPublicKey, "MV-ARCH-001 native updater public key authority is missing");
assert.equal(hotfixRelease.plugins?.updater?.pubkey, updaterPublicKey, "v0.1.4 production updater public key must remain aligned with native authority");

for (const marker of [
  "run_id\n= 32463797796",
  "head_sha\n= 3e500ef13a268793a17dbb121ed5cd3ae4b77eed",
  "artifact_id\n= 9439943054",
  "artifact_name\n= masterv-0.1.4-rel-1c-published-updater-verification",
  "artifact_digest\n= sha256:7f5c709c6509e460739146536017563bfe7524db86265200b51df7be44409446",
  "tauri_signature_verified_by_successful_install = true",
  "application_credentials_used = false",
  "signing_credentials_used = false",
  "supabase_required = false",
  "release_mutation = false"
]) {
  assert(closure.includes(marker), `MV-ARCH-001 frozen REL-1C evidence marker missing: ${marker}`);
}

assert(rel1cWorkflow.includes("contents: read"), "REL-1C verification-only workflow must retain read-only repository authority");
for (const forbidden of [
  "TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.",
  "contents: write",
  "gh release create",
  "gh release upload",
  "gh release edit"
]) {
  assert(!rel1cWorkflow.includes(forbidden), `REL-1C verification-only workflow regained mutation/signing authority: ${forbidden}`);
}

assert(ci.includes("node scripts/desktop-arch-001-closure-contract.mjs"), "existing CI must execute the MV-ARCH-001 closure contract");
assert(!ci.includes("TAURI_SIGNING_PRIVATE_KEY: ${{ secrets."), "MV-ARCH-001 PR CI must not consume the production Tauri signing key");
assert(!ci.includes("TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets."), "MV-ARCH-001 PR CI must not consume the production Tauri signing password");

const workflowDir = path.join(root, ".github", "workflows");
const automaticPrWorkflows = fs.readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .filter((name) => {
    const text = read(path.join(".github/workflows", name));
    return /^\s*pull_request\s*:/m.test(text) || /^\s*pull_request\s*$/m.test(text);
  })
  .sort();
assert.deepEqual(automaticPrWorkflows, ["ci.yml", "mv-exit-3-clean-cut.yml"], "automatic PR governance must remain exactly CI + EXIT-3");

const vendorHostPatterns = [
  [".", "supabase", ".co"].join(""),
  ".workers.dev",
  ".r2.dev"
];
const desktopRuntime = [...walkText("desktop"), ...walkText("src-tauri")];
const vendorViolations = [];
for (const [relative, text] of desktopRuntime) {
  for (const token of vendorHostPatterns) {
    if (text.toLowerCase().includes(token)) vendorViolations.push(`${relative}: ${token}`);
  }
}
assert.equal(vendorViolations.length, 0, `Desktop runtime regained vendor-specific backend hostname coupling:\n${vendorViolations.join("\n")}`);

for (const forbiddenCredential of [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "POLAR_ACCESS_TOKEN",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY"
]) {
  assert.equal(process.env[forbiddenCredential], undefined, `MV-ARCH-001 closure validation must not receive credential: ${forbiddenCredential}`);
}

console.log(JSON.stringify({
  status: "MASTERV_ARCH_001_CLOSURE_CONTRACT_PASS",
  frozen_pre_closure_main_sha: "3e500ef13a268793a17dbb121ed5cd3ae4b77eed",
  frozen_pre_closure_tree: "c3754d5d3ba5e0c5b9cea802d60509a50cecd649",
  production_baseline: "v0.1.4",
  architecture,
  invariant_count: invariants.length,
  completion_criteria_count: completionCriteria.length,
  rel_1c_attestation: {
    run_id: 32463797796,
    artifact_id: 9439943054,
    artifact_digest: "sha256:7f5c709c6509e460739146536017563bfe7524db86265200b51df7be44409446",
    exact_main: true,
    tauri_signature_verified_by_successful_install: true
  },
  automatic_pr_workflows: automaticPrWorkflows,
  application_credentials_used: false,
  signing_credentials_used: false,
  release_mutation: false,
  supabase_runtime_dependency: "ZERO",
  mv_pilot_1_started: false,
  merge_required_for_repository_closure_authority: true
}));
