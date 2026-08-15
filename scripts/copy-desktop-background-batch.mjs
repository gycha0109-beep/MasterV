import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
await fs.copyFile(
  path.join(root, "desktop", "background-batch.js"),
  path.join(root, "desktop-dist", "background-batch.js")
);
console.log(JSON.stringify({ status: "MASTERV_DESKTOP_BACKGROUND_BATCH_ASSET_COPY_PASS" }));
