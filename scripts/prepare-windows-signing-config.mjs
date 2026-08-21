import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const templatePath = path.join(root, "src-tauri/tauri.windows-signing-readiness.template.json");
const outputPath = path.join(root, "src-tauri/tauri.windows-signing-readiness.runtime.json");
const bridgePath = path.resolve(root, "scripts/windows-signing-bridge.mjs");
const nodeExecutable = path.resolve(process.execPath);

assert(fs.existsSync(templatePath), "3N signing-readiness template config is missing");
assert(fs.existsSync(bridgePath), "3N signing bridge is missing");
assert(path.isAbsolute(nodeExecutable), "Node executable must resolve to an absolute path");
assert(path.isAbsolute(bridgePath), "Signing bridge must resolve to an absolute path");

const config = JSON.parse(fs.readFileSync(templatePath, "utf8"));
assert(config.bundle?.active === true, "3N signing-readiness template must enable bundling");
assert(config.bundle?.windows?.signCommand, "3N signing-readiness template must define signCommand");
config.bundle.windows.signCommand = {
  cmd: nodeExecutable,
  args: [bridgePath, "%1"]
};

fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(JSON.stringify({
  status: "MASTERV_WINDOWS_SIGNING_CONFIG_PREPARED",
  runtime_config: path.relative(root, outputPath).replaceAll("\\", "/"),
  node_executable_absolute: true,
  bridge_absolute: true,
  provider_selected: false,
  live_signing_enabled: false
}));
