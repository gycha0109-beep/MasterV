import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
await fs.copyFile(
  path.join(root, "desktop", "deep-analysis.js"),
  path.join(root, "desktop-dist", "deep-analysis.js")
);
console.log(JSON.stringify({ status: "MASTERV_DESKTOP_DEEP_ANALYSIS_ASSET_COPY_PASS" }));
