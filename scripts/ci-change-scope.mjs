import assert from "node:assert/strict";
import fs from "node:fs";

function isServerOnlyPath(path) {
  return path === "deno.json"
    || path.startsWith("gateway/")
    || path.startsWith("docs/")
    || path.startsWith("scripts/gateway-");
}

export function classifyChangedFiles(paths) {
  const normalized = paths.map((value) => value.trim()).filter(Boolean);
  if (normalized.length === 0) {
    return Object.freeze({ server_only: false, desktop_heavy_required: true, paths: [] });
  }
  const serverOnly = normalized.every(isServerOnlyPath);
  return Object.freeze({
    server_only: serverOnly,
    desktop_heavy_required: !serverOnly,
    paths: normalized
  });
}

function selfTest() {
  assert.equal(classifyChangedFiles(["gateway/core.ts"]).desktop_heavy_required, false);
  assert.equal(classifyChangedFiles(["deno.json", "scripts/gateway-root-surface-contract.ts"]).desktop_heavy_required, false);
  assert.equal(classifyChangedFiles(["docs/architecture/example.md"]).desktop_heavy_required, false);
  assert.equal(classifyChangedFiles(["gateway/core.ts", "src-tauri/src/lib.rs"]).desktop_heavy_required, true);
  assert.equal(classifyChangedFiles([".github/workflows/ci.yml"]).desktop_heavy_required, true);
  assert.equal(classifyChangedFiles(["package.json"]).desktop_heavy_required, true);
  assert.equal(classifyChangedFiles([]).desktop_heavy_required, true);
}

if (process.argv.includes("--self-test")) {
  selfTest();
  console.log(JSON.stringify({ status: "MASTERV_CI_CHANGE_SCOPE_SELF_TEST_PASS" }));
  process.exit(0);
}

const result = classifyChangedFiles(process.argv.slice(2));
const output = process.env.GITHUB_OUTPUT;
if (!output) throw new Error("GITHUB_OUTPUT is required when classifying CI change scope");
fs.appendFileSync(output, `server_only=${result.server_only}\n`);
fs.appendFileSync(output, `desktop_heavy_required=${result.desktop_heavy_required}\n`);
console.log(JSON.stringify({
  status: "MASTERV_CI_CHANGE_SCOPE_CLASSIFIED",
  server_only: result.server_only,
  desktop_heavy_required: result.desktop_heavy_required,
  changed_files: result.paths
}));
