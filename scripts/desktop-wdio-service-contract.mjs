import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function packageVersion(packagePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "node_modules", ...packagePath.split("/"), "package.json"), "utf8")).version;
}

const nativeUtils = await import("@wdio/native-utils");
assert.equal(typeof nativeUtils.installMockSyncOverride, "function", "@wdio/native-utils must export installMockSyncOverride for tauri-service 1.2.0");
assert.equal(packageVersion("@wdio/native-utils"), "2.4.0", "native-utils version must match tauri-service 1.2.0 workspace release");
assert.equal(packageVersion("@wdio/tauri-service"), "1.2.0", "tauri-service version drifted");
assert.equal(packageVersion("webdriverio"), "9.27.1", "webdriverio version must match tauri-service 1.2.0 release catalog");

await import("@wdio/tauri-service");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_WDIO_SERVICE_CONTRACT_PASS",
  tauri_service: "1.2.0",
  native_utils: "2.4.0",
  webdriverio: "9.27.1",
  install_mock_sync_override: true
}));
