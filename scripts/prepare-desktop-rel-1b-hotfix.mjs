import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "desktop-dist");
const indexPath = path.join(outputDir, "index.html");
const configPath = path.join(outputDir, "config.js");
const hotfixVersion = "0.1.4";
const previousVersion = "0.1.3";
const releaseTrackField = "release_track";

let html = await fs.readFile(indexPath, "utf8");
const versionMatches = html.match(/0\.1\.3/g) || [];
if (versionMatches.length < 3) {
  throw new Error(`MV-REL-1B expected at least three ${previousVersion} desktop UI version markers, found ${versionMatches.length}`);
}
html = html.replaceAll(previousVersion, hotfixVersion);
await fs.writeFile(indexPath, html, "utf8");

let config = await fs.readFile(configPath, "utf8");
const releaseTrackMarker = `\"${releaseTrackField}\":\"${previousVersion}\"`;
if (!config.includes(releaseTrackMarker)) {
  throw new Error(`MV-REL-1B desktop config is missing ${releaseTrackField} ${previousVersion}`);
}
config = config.replace(releaseTrackMarker, `\"${releaseTrackField}\":\"${hotfixVersion}\"`);
await fs.writeFile(configPath, config, "utf8");

console.log(JSON.stringify({
  status: "MASTERV_REL_1B_DESKTOP_HOTFIX_PREPARE_PASS",
  previous_version: previousVersion,
  hotfix_version: hotfixVersion,
  updater_bootstrap_fix: true,
  release_track_rewritten: true
}));
