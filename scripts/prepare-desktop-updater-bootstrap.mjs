import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "desktop");
const outputDir = path.join(root, "desktop-dist");
const indexPath = path.join(outputDir, "index.html");
const configPath = path.join(outputDir, "config.js");

for (const filename of ["session-bridge.js", "updater.js"]) {
  await fs.copyFile(path.join(sourceDir, filename), path.join(outputDir, filename));
}

let html = await fs.readFile(indexPath, "utf8");
const appScript = '<script src="./app.js"></script>';
if (!html.includes(appScript)) throw new Error("desktop index is missing app.js script anchor");
html = html.replace(
  appScript,
  '<script src="./session-bridge.js"></script>\n    <script src="./app.js"></script>\n    <script src="./updater.js"></script>'
);
await fs.writeFile(indexPath, html, "utf8");

await fs.appendFile(
  configPath,
  'window.MASTERV_DESKTOP_CONFIG.updater_ui = true;\nwindow.MASTERV_DESKTOP_CONFIG.update_channel = "private-test";\n',
  "utf8"
);

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_UPDATER_BOOTSTRAP_PREPARE_PASS",
  updater_ui: true,
  update_channel: "private-test",
  token_persistence: false
}));
