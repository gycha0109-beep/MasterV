import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "desktop");
const outputDir = path.join(root, "desktop-dist");
const indexPath = path.join(outputDir, "index.html");
const configPath = path.join(outputDir, "config.js");

await fs.copyFile(path.join(sourceDir, "updater.js"), path.join(outputDir, "updater.js"));

let html = await fs.readFile(indexPath, "utf8");
const appScript = '<script src="./app.js"></script>';
if (!html.includes(appScript)) throw new Error("desktop index is missing app.js script anchor");
html = html.replace(
  appScript,
  '<script src="./app.js"></script>\n    <script src="./updater.js"></script>'
);
await fs.writeFile(indexPath, html, "utf8");

const updaterConfig = {
  enabled: true,
  channel: "stable",
  transport: "tauri-static-signed",
  subscription_independent: true
};
await fs.appendFile(
  configPath,
  `window.MASTERV_UPDATER_CONFIG = Object.freeze(${JSON.stringify(updaterConfig)});\n`,
  "utf8"
);

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_INDEPENDENT_UPDATER_PREPARE_PASS",
  updater_ui: true,
  update_channel: updaterConfig.channel,
  transport: updaterConfig.transport,
  subscription_independent: true,
  session_authority: "none",
  config_authority: "independent-updater"
}));
