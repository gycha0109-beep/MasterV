import { build as buildWithEsbuild } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "desktop");
const outputDir = path.join(root, "desktop-dist");
const tauriIconPath = path.join(root, "src-tauri", "icons", "icon.png");
const tauriWindowsIconPath = path.join(root, "src-tauri", "icons", "icon.ico");
const compilerEntry = path.join(root, "scripts", "desktop-reference-compiler-entry.ts");
const compilerOutput = path.join(outputDir, "reference-compiler.js");
const TAURI_ICON_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAA8ElEQVR42u3SAQ0AMAgEsTEl798k2CChlXC5StKPs74EBsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AAA0hgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA7DDAAdzAl+MEM0VAAAAAElFTkSuQmCC";

function singlePngIco(png, width, height) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width === 256 ? 0 : width, 0); entry.writeUInt8(height === 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2); entry.writeUInt8(0, 3); entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

async function buildReferenceCompiler() {
  await buildWithEsbuild({ absWorkingDir: root, entryPoints: [compilerEntry], bundle: true, platform: "browser", format: "iife", target: "es2022", outfile: compilerOutput, alias: { "@": root }, logLevel: "silent" });
}

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(path.dirname(tauriIconPath), { recursive: true });
const tauriPng = Buffer.from(TAURI_ICON_PNG_BASE64, "base64");
await fs.writeFile(tauriIconPath, tauriPng);
await fs.writeFile(tauriWindowsIconPath, singlePngIco(tauriPng, 128, 128));
for (const filename of ["index.html", "styles.css", "app.js", "production-guidance-renderer.js"]) await fs.copyFile(path.join(sourceDir, filename), path.join(outputDir, filename));
await fs.cp(path.join(sourceDir, "backend"), path.join(outputDir, "backend"), { recursive: true, filter: (source) => !source.includes(`${path.sep}legacy${path.sep}`) && !source.endsWith(`${path.sep}legacy`) });
await buildReferenceCompiler();

const runtimeIndexPath = path.join(outputDir, "index.html");
let runtimeIndex = await fs.readFile(runtimeIndexPath, "utf8");
const deepScript = '    <script src="./deep-analysis.js"></script>';
const rendererScript = '    <script src="./production-guidance-renderer.js"></script>';
if (!runtimeIndex.includes(deepScript)) throw new Error("desktop index is missing the deep-analysis.js script anchor");
runtimeIndex = runtimeIndex.replace(deepScript, `${rendererScript}\n${deepScript}`);
const appScript = '    <script src="./app.js"></script>';
const providerScripts = [
  '    <script src="./backend/provider-boundary.js"></script>',
  '    <script src="./backend/gateway/gateway-session-provider.js"></script>',
  '    <script src="./backend/gateway/gateway-remote-provider.js"></script>',
  '    <script src="./backend/local/local-work-data-provider.js"></script>',
  '    <script src="./reference-compiler.js"></script>',
  '    <script src="./backend/bridge/transition-provider.js"></script>',
  '    <script src="./backend/backend.js"></script>',
  appScript
].join("\n");
if (!runtimeIndex.includes(appScript)) throw new Error("desktop index is missing the app.js script anchor");
await fs.writeFile(runtimeIndexPath, runtimeIndex.replace(appScript, providerScripts), "utf8");

const publicConfig = {
  surface: "desktop",
  runtime_contract_version: "mv-desktop-runtime-v2",
  backend_provider_contract_version: "mv-backend-provider-v1",
  architecture_stage: "MV-EXIT-3-CLEAN-CUT",
  release_track: "0.1.3"
};
await fs.writeFile(path.join(outputDir, "config.js"), `window.MASTERV_DESKTOP_CONFIG = ${JSON.stringify(publicConfig)};\n`, "utf8");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_CLEAN_CUT_STATIC_BUILD_PASS",
  output: "desktop-dist",
  surface: publicConfig.surface,
  architecture_stage: publicConfig.architecture_stage,
  release_track: publicConfig.release_track,
  gateway_primary_assets: true,
  local_sqlite_primary_assets: true,
  local_reference_compiler_bundle: true,
  vendor_runtime_config: false,
  legacy_runtime_assets: false,
  backend_consumer: "app",
  tauri_icon_generated: true,
  tauri_windows_icon_generated: true
}));
