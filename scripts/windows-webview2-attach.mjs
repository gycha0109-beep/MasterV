import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function assert(condition, message) { if (!condition) throw new Error(message); }
export function required(name) {
  const value = process.env[name]?.trim() || "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function resolveMasterVBinary(fallbackPath) {
  const installed = process.env.MASTERV_DESKTOP_APP_BINARY?.trim() || "";
  if (installed && fs.existsSync(installed)) return path.resolve(installed);
  return path.resolve(fallbackPath);
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("failed to allocate TCP port"));
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function detectWebView2Version() {
  const paths = [
    "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  ];
  for (const registryPath of paths) {
    const result = spawnSync("reg.exe", ["query", registryPath, "/v", "pv"], { encoding: "utf8" });
    const match = `${result.stdout || ""}\n${result.stderr || ""}`.match(/pv\s+REG_SZ\s+([\d.]+)/i);
    if (match) return match[1];
  }
  throw new Error("WebView2 runtime version could not be detected");
}

function ensureEdgeDriver(version, root) {
  const dir = path.join(root, "msedgedriver", version);
  const driver = path.join(dir, "msedgedriver.exe");
  if (fs.existsSync(driver)) return driver;
  fs.mkdirSync(dir, { recursive: true });
  const escaped = dir.replace(/'/g, "''");
  const ps = [
    "$ErrorActionPreference='Stop'", "$ProgressPreference='SilentlyContinue'",
    `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12`,
    `$d='${escaped}'`, `$z=Join-Path $d 'driver.zip'`,
    `$u='https://msedgedriver.microsoft.com/${version}/edgedriver_win64.zip'`,
    "Invoke-WebRequest -Uri $u -OutFile $z -UseBasicParsing -TimeoutSec 60",
    "Expand-Archive -Path $z -DestinationPath $d -Force", "Remove-Item $z -Force"
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], { encoding: "utf8", timeout: 90_000 });
  if (result.status !== 0 || !fs.existsSync(driver)) throw new Error(`EdgeDriver download failed: ${result.stderr || result.stdout}`);
  return driver;
}

async function waitHttp(url, label, timeoutMs, processToWatch) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    if (processToWatch?.exitCode !== null && processToWatch?.exitCode !== undefined) throw new Error(`${label} exited early: ${processToWatch.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      last = `${response.status} ${response.statusText}`;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await delay(400);
  }
  throw new Error(`${label} was not ready: ${last}`);
}

export async function webdriverRequest(driverPort, method, requestPath, body) {
  const response = await fetch(`http://127.0.0.1:${driverPort}${requestPath}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = { value: null };
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload?.value?.error) throw new Error(payload?.value?.message || payload?.value?.error || `WebDriver ${response.status}`);
  return payload;
}

export async function execute(driverPort, sessionId, script, args = []) {
  return (await webdriverRequest(driverPort, "POST", `/session/${sessionId}/execute/sync`, { script, args })).value;
}

export async function attachMasterV(appBinaryPath, evidenceDir, runtimeLabel, options = {}) {
  const resolvedBinary = resolveMasterVBinary(appBinaryPath);
  assert(fs.existsSync(resolvedBinary), `MasterV binary missing: ${resolvedBinary}`);
  const runtimeRoot = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `${runtimeLabel}-${process.pid}`);
  const dataDir = options.dataDir ? path.resolve(options.dataDir) : path.join(runtimeRoot, "webview2");
  if (!options.reuseDataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  const webviewVersion = detectWebView2Version();
  const driverPath = ensureEdgeDriver(webviewVersion, runtimeRoot);
  const debugPort = await freePort();
  const driverPort = await freePort();
  const appLog = fs.openSync(path.join(evidenceDir, `${runtimeLabel}-masterv-process.log`), "w");
  const driverLog = fs.openSync(path.join(evidenceDir, `${runtimeLabel}-msedgedriver.log`), "w");
  const appProcess = spawn(resolvedBinary, [], {
    cwd: path.dirname(resolvedBinary),
    env: { ...process.env, MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT: String(debugPort), MASTERV_DESKTOP_TEST_WEBVIEW_DATA_DIR: dataDir },
    stdio: ["ignore", appLog, appLog], windowsHide: false
  });
  const cdp = await (await waitHttp(`http://127.0.0.1:${debugPort}/json/version`, "WebView2 CDP", 60_000, appProcess)).json();
  const driverProcess = spawn(driverPath, [`--port=${driverPort}`, "--verbose"], { cwd: path.dirname(driverPath), stdio: ["ignore", driverLog, driverLog], windowsHide: true });
  await waitHttp(`http://127.0.0.1:${driverPort}/status`, "msedgedriver", 30_000, driverProcess);
  const created = await webdriverRequest(driverPort, "POST", "/session", { capabilities: { alwaysMatch: { browserName: "webview2", "ms:edgeChromium": true, "ms:edgeOptions": { debuggerAddress: `127.0.0.1:${debugPort}` } } } });
  const sessionId = created.value?.sessionId || created.sessionId;
  assert(sessionId, "WebDriver session id missing");
  return {
    appBinaryPath: resolvedBinary,
    dataDir,
    driverPort, sessionId, webviewVersion, cdpBrowser: cdp.Browser || null,
    async close() {
      await webdriverRequest(driverPort, "DELETE", `/session/${sessionId}`).catch(() => undefined);
      if (driverProcess.exitCode === null) driverProcess.kill();
      if (appProcess.exitCode === null) appProcess.kill();
      fs.closeSync(appLog); fs.closeSync(driverLog);
    }
  };
}
