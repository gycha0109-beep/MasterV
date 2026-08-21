import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) { if (!condition) throw new Error(message); }
const root = process.cwd();
const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], { cwd: root, env: { ...process.env }, encoding: "utf8" });
assert(build.status === 0, `desktop static builder failed: ${build.stderr || build.stdout}`);
const outputDir = path.join(root, "desktop-dist");
const indexText = fs.readFileSync(path.join(outputDir, "index.html"), "utf8");
const appText = fs.readFileSync(path.join(outputDir, "app.js"), "utf8");
const localWorkText = fs.readFileSync(path.join(outputDir, "backend", "local", "local-work-data-provider.js"), "utf8");
const transitionText = fs.readFileSync(path.join(outputDir, "backend", "bridge", "transition-provider.js"), "utf8");

for (const id of ["reference-library-panel", "library-status", "library-workspace", "library-count", "reference-library-list", "library-refresh"]) {
  assert(indexText.includes(`id="${id}"`), `desktop Reference Library UI element missing: ${id}`);
}
assert(indexText.includes("Local SQLite Reference Library"), "Local SQLite Reference Library authority heading missing");
assert(appText.includes("backend.workData.bootstrapPersonalWorkspace(null)"), "local workspace bootstrap must remain session-independent");
assert(appText.includes("backend.workData.listReferenceLibrary(null, workspaceId)"), "Reference Library list must remain local");
assert(appText.includes("backend.workData.deleteReferenceLibraryEntry(null, workspaceId"), "Reference Library delete must remain local");
assert(!appText.includes('kind: "email_password"') && !appText.includes("legacy-migration-form"), "legacy auth/migration consumer remains");
assert(!appText.includes("localStorage") && !appText.includes("sessionStorage"), "Desktop auth must not use browser persistent storage");
assert(localWorkText.includes("desktop_local_reference_library_list"), "native local list command missing");
assert(localWorkText.includes("desktop_local_reference_detail"), "native local detail command missing");
assert(localWorkText.includes("desktop_local_reference_delete"), "native local delete command missing");
assert(localWorkText.includes('persistence: "local-sqlite"'), "local SQLite persistence authority missing");
assert(transitionText.includes('primary: "local-sqlite"'), "work-data primary must be Local SQLite");
assert(transitionText.includes('fallback: "none"'), "work-data must not have remote fallback");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_REFERENCE_LIBRARY_CLEAN_CUT_PASS",
  workspace_scope: "local:masterv",
  authority: "local-sqlite",
  local_access_subscription_gated: false,
  legacy_auth: false,
  legacy_migration: false,
  browser_persistent_auth_storage: false
}));
