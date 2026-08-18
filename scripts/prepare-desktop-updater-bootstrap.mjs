import fs from "node:fs/promises";
import path from "node:path";
import { readLegacyDesktopRuntimeConfig } from "./desktop-legacy-config-bridge.mjs";

const root = process.cwd();
const sourceDir = path.join(root, "desktop");
const outputDir = path.join(root, "desktop-dist");
const indexPath = path.join(outputDir, "index.html");
const configPath = path.join(outputDir, "config.js");
const legacyRuntime = readLegacyDesktopRuntimeConfig(process.env);

if (!legacyRuntime.configured || !legacyRuntime.nativeInterop.clientKey) {
  throw new Error("updater bootstrap requires a configured legacy runtime client key");
}

await fs.copyFile(path.join(sourceDir, "updater.js"), path.join(outputDir, "updater.js"));

let html = await fs.readFile(indexPath, "utf8");
const appScript = '<script src="./app.js"></script>';
if (!html.includes(appScript)) throw new Error("desktop index is missing app.js script anchor");
html = html.replace(
  appScript,
  '<script src="./app.js"></script>\n    <script src="./updater.js"></script>'
);
await fs.writeFile(indexPath, html, "utf8");

const updaterBootstrapConfig = {
  enabled: true,
  channel: "private-test",
  client_key: legacyRuntime.nativeInterop.clientKey
};
await fs.appendFile(
  configPath,
  `window.MASTERV_UPDATER_BOOTSTRAP_CONFIG = Object.freeze(${JSON.stringify(updaterBootstrapConfig)});\n`,
  "utf8"
);

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_UPDATER_BOOTSTRAP_PREPARE_PASS",
  updater_ui: true,
  update_channel: updaterBootstrapConfig.channel,
  session_authority: "backend-provider",
  config_authority: "updater-bootstrap",
  token_persistence: false
}));
