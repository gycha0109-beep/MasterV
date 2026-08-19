import { build as buildWithEsbuild } from "esbuild";
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

const TAURI_ICON_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACz0lEQVR42u3dO27bQBRA0ZjQGlykU+FdpfLCXGUfrrOGFF5KUiUwAiGipJn3GZ5bGZAgjvnuvA9J2U/Pz19/fcFh2ZwCAoAAIAAIAAKAACAACAACgAAgAAgAAoAAIAAIAAKAACAACAACgAAgAAgAAoAAIAAIAAKAACAAynOa+eEfHz///nw+v5T75auvL4KnWX8h5PPJ/UyVE31pfUeUYIsM/rXXsgJ/y9re3r6Hrnf28U6RJ7hi6r/02r+ZIDro/5Pg9fVb7RKwV4CMdLt3be/vP66+Z3Qg7t39j65jq7gLcZAxMFKCW44VsbtHMGKdrgMUJarvSBcgIgvMOEZ2Y7iMAPqBvPRfqgTMkuDez83sAyKzix6gYRkYKWcpAUZngY6lJVqqchmgUtC6jIOtBNhzBXCEBKs2lqOlTMkAK911G5myM3qKsk3gIzvYWNlAgKhSsFIfMGMtqRlghgQZ0oxI3VkjZXoJOOqjWIcvATN29Z733SNchTIwaw0lBOjSD3SYJNpmgEclmLX7OwRxmRKgH4gvQe1uBl3a6RG7f1YQsjNHOQE69wMzgjm7AS2ZAW6RILv2d+8bypaAikFb8e5g6wdCOu/+KsKVFqBj8Pam9SpjY/kM8IgExspFSkClQEb1AVHHWfah0ExprqX3SlcNNwFVApbb1bNlmZ2eI8fNdiWgeyaodtNouR6giiBd7g5uglyL6KuN2yo7/Xx+CRXjnkBVzAqtS8CfoK9ysyfjXoMvhx68JyBAo3pNADIN5+TUH3sclAEODgEKpO7MXoIAMgAIgLQUnj1KEkAGAAHQdoIggGASgDAEAAHsagIQhQAgAAhQN71X6xOGPxDS4ZFtXzOTAVKyQMUpgQBBElQdEaf993AoASAACAACgAAgAAoAAIAAIAAKAACAACAACgAAgAAoAAIAAIAAKAACAACAACgAAgAAiAYfwGJ1nsuR6EN/UAAAAASUVORK5CYII=";

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

async function buildReferenceCompiler() {
  await buildWithEsbuild({
    absWorkingDir: root,
    entryPoints: [compilerEntry],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    outfile: compilerOutput,
    alias: { "@": root },
    logLevel: "silent"
  });
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
  local_reference_compiler_builder: "esbuild-js-api",
  legacy_runtime_config_isolated: true,
  legacy_runtime_scope: "existing-data-migration-only",
  desktop_config_vendor_neutral: true,
  backend_consumer: "app",
  production_guidance_renderer: true,
  tauri_icon_generated: true,
  tauri_windows_icon_generated: true
}));
