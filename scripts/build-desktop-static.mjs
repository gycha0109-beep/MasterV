import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { readLegacyDesktopRuntimeConfig, renderLegacyDesktopRuntimeConfig } from "./desktop-legacy-config-bridge.mjs";

const root = process.cwd();
const sourceDir = path.join(root, "desktop");
const outputDir = path.join(root, "desktop-dist");
const tauriIconPath = path.join(root, "src-tauri", "icons", "icon.png");
const tauriWindowsIconPath = path.join(root, "src-tauri", "icons", "icon.ico");
const compilerEntry = path.join(root, "scripts", "desktop-reference-compiler-entry.ts");
const compilerOutput = path.join(outputDir, "reference-compiler.js");

const TAURI_ICON_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADmklEQVR4nO2dvW0cMRQGnwxXoEgVSLFLUuQCFLgGByrAkUpyrGrkwCasOyyPf49ckt9MZkPGGvvNze4tDqe7+4fHDwNZvpz9H4BzQQBxEEAcBBAHAcRBAHEQQJyvow/4+vY++pDL8fL8NOxYd70fBDF4Oz2F6CYAw/vTQwR3ARi+P54iuAqQM/6P79+8DrctP3/9Tv6MlwQuAqSGZ/R6UjK0itAswK3xGd6PWyK0SNAkQGx8hu9HTIRaCaofBDH+OcTOb+3Nd1UBjg7G8OM5qkFpCVweBTP+OXic92IBeJ8/N6X7FAlA+ufj6PyXSNB0CWD8OWjZIVsA0r8WuXtVF4BX/1zU7pElAK/+NcnZraoAvPrnpGYXPhImDgKIkxTg+jpC/ufmep/UfQAFEAcBxEEAcRBAHAQQZ3kBcj5BC3GWF8DsrwSIUMcWAgSQoJytBDCjBqVsJ0AACfLYVgAzapDD1gIEkCCOhABm1CCGjAABJLhETgAzavAZSQECSCAugBk1kBcgoCoBAnxCsQYIcICSBAgQQaUGCJBgdxEQIJNdJUCAAnasAQJUsJMECFDJLjVAgEZWlwABHFi5BgjgyIoSIIAzq9UAATqxigQI0JEVaoAAA5hZAgQYxKw1QIDBzCYBApzATDUY/osjYa4v2qIAg5lpfDMKMIzZhg9QgAHMOr4ZBejKzMMHKEAnVhjfjAK4s8rwAQrgyGrjm1EAF1YcPkABGll5fDMKUM3qwwcoQAW7jG9GAYrYafgABchkx/HNKECSXYcPIECE3YcPcAk4QGV8MwpwgdLwAQrwD8XxzSiA7PAB6QKoj28mWgCG/49cARj/EpkCMPwxEgVg/DhbF4Dh02xbAMbPY7sCMHwZWxWA8cvZogAMX8/yBWD8NpYXANpAAHEQQBwEEAcBxEkK8PL8dPHnWb7cCI653ud6v2sogDgIIE6VAFwG5qRmlywBUtcRmJOc3aovAVRgLmr3yBaACqxF7l5NN4FUYA5adigS4MgqJDiXo/NfUuviAnApmJvSfVyeA1CBc/A473f3D48fNf/w9e398O/5gEZ/YsPX1Lm6ALGDUYO+eI5v1lCAQKwEZtTAk1svrJb7smYBzG5LYIYILaSK2npT7iJAICWCGTLkkHMZ9Xo35iqAWZ4E0IbnW3F3AQKI4E+PZzDdBAggQjs9H751F+AahEgz8mnrcAFgLvhImDgIIA4CiIMA4iCAOAggzh9L6DC+7Kr6vwAAAABJRU5ErkJggg==";

function singlePngIco(png, width, height) {
  if (width < 1 || width > 256 || height < 1 || height > 256) throw new Error("ICO dimensions must be between 1 and 256");
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width === 256 ? 0 : width, 0); entry.writeUInt8(height === 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2); entry.writeUInt8(0, 3); entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

function buildReferenceCompiler() {
  const executable = process.platform === "win32"
    ? path.join(root, "node_modules", ".bin", "esbuild.cmd")
    : path.join(root, "node_modules", ".bin", "esbuild");
  const result = spawnSync(executable, [
    compilerEntry,
    "--bundle",
    "--platform=browser",
    "--format=iife",
    "--target=es2022",
    `--outfile=${compilerOutput}`,
    `--alias:@=${root}`
  ], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`desktop Reference Compare bundle failed: ${result.stderr || result.stdout}`);
}

const legacyRuntime = readLegacyDesktopRuntimeConfig(process.env);

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(path.dirname(tauriIconPath), { recursive: true });
const tauriPng = Buffer.from(TAURI_ICON_PNG_BASE64, "base64");
await fs.writeFile(tauriIconPath, tauriPng);
await fs.writeFile(tauriWindowsIconPath, singlePngIco(tauriPng, 128, 128));
for (const filename of ["index.html", "styles.css", "app.js", "production-guidance-renderer.js"]) await fs.copyFile(path.join(sourceDir, filename), path.join(outputDir, filename));
await fs.cp(path.join(sourceDir, "backend"), path.join(outputDir, "backend"), { recursive: true });
await fs.writeFile(
  path.join(outputDir, "backend", "legacy", "runtime-config.js"),
  renderLegacyDesktopRuntimeConfig(legacyRuntime.adapterConfig),
  "utf8"
);
buildReferenceCompiler();

const runtimeIndexPath = path.join(outputDir, "index.html");
let runtimeIndex = await fs.readFile(runtimeIndexPath, "utf8");
const deepScript = '    <script src="./deep-analysis.js"></script>';
const rendererScript = '    <script src="./production-guidance-renderer.js"></script>';
if (!runtimeIndex.includes(deepScript)) throw new Error("desktop index is missing the deep-analysis.js script anchor");
runtimeIndex = runtimeIndex.replace(deepScript, `${rendererScript}\n${deepScript}`);
const appScript = '    <script src="./app.js"></script>';
const providerScripts = [
  '    <script src="./backend/provider-boundary.js"></script>',
  '    <script src="./backend/legacy/runtime-config.js"></script>',
  '    <script src="./backend/legacy/supabase-session-provider.js"></script>',
  '    <script src="./backend/legacy/supabase-work-data-provider.js"></script>',
  '    <script src="./backend/legacy/hosted-api-client.js"></script>',
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
  runtime_contract_version: "mv-desktop-runtime-v1",
  backend_provider_contract_version: "mv-backend-provider-v1",
  migration_stage: "MV-SUPABASE-EXIT-2C"
};
await fs.writeFile(path.join(outputDir, "config.js"), `window.MASTERV_DESKTOP_CONFIG = ${JSON.stringify(publicConfig)};\n`, "utf8");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_STATIC_BUILD_PASS",
  output: "desktop-dist",
  configured: legacyRuntime.configured,
  surface: publicConfig.surface,
  migration_stage: publicConfig.migration_stage,
  runtime_contract_version: publicConfig.runtime_contract_version,
  backend_provider_contract_version: publicConfig.backend_provider_contract_version,
  backend_provider_assets: true,
  gateway_primary_assets: true,
  local_sqlite_primary_assets: true,
  local_reference_compiler_bundle: true,
  legacy_runtime_config_isolated: true,
  legacy_runtime_scope: "existing-data-migration-only",
  desktop_config_vendor_neutral: true,
  backend_consumer: "app",
  production_guidance_renderer: true,
  tauri_icon_generated: true,
  tauri_windows_icon_generated: true
}));
