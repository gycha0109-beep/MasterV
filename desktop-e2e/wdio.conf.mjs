import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const appBinaryPath = path.resolve(process.cwd(), "src-tauri", "target", "release", "masterv-desktop.exe");

if (!fs.existsSync(appBinaryPath)) {
  throw new Error(`MasterV Windows binary not found: ${appBinaryPath}`);
}

const runtimeTempRoot = process.env.RUNNER_TEMP?.trim() || os.tmpdir();
const webviewUserDataFolder = path.resolve(runtimeTempRoot, `masterv-webview2-${process.pid}`);
fs.rmSync(webviewUserDataFolder, { recursive: true, force: true });
fs.mkdirSync(webviewUserDataFolder, { recursive: true });

export const config = {
  runner: "local",
  specs: [path.resolve(process.cwd(), "desktop-e2e", "specs", "runtime.spec.mjs")],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: appBinaryPath,
        webviewOptions: {
          userDataFolder: webviewUserDataFolder
        }
      }
    }
  ],
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "external",
        autoDownloadEdgeDriver: true,
        startTimeout: 60_000
      }
    ]
  ],
  logLevel: "info",
  bail: 1,
  waitforTimeout: 20_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 2,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 90_000
  }
};
