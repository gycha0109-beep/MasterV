import fs from "node:fs";
import path from "node:path";

const appBinaryPath = path.resolve(process.cwd(), "src-tauri", "target", "release", "masterv-desktop.exe");

if (!fs.existsSync(appBinaryPath)) {
  throw new Error(`MasterV Windows binary not found: ${appBinaryPath}`);
}

export const config = {
  runner: "local",
  specs: [path.resolve(process.cwd(), "desktop-e2e", "specs", "runtime.spec.mjs")],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: appBinaryPath
      }
    }
  ],
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "external",
        autoDownloadEdgeDriver: true
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
