import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

function required(name) {
  const value = process.env[name]?.trim() || "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate TCP port"));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function detectWebView2Version() {
  const registryPaths = [
    "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  ];

  for (const registryPath of registryPaths) {
    const result = spawnSync("reg.exe", ["query", registryPath, "/v", "pv"], { encoding: "utf8" });
    const match = `${result.stdout || ""}\n${result.stderr || ""}`.match(/pv\s+REG_SZ\s+([\d.]+)/i);
    if (match) return match[1];
  }
  throw new Error("WebView2 runtime version could not be detected from the Windows registry");
}

function ensureEdgeDriver(version, workDir) {
  const driverDir = path.join(workDir, "msedgedriver", version);
  const driverPath = path.join(driverDir, "msedgedriver.exe");
  if (fs.existsSync(driverPath)) return driverPath;

  fs.mkdirSync(driverDir, { recursive: true });
  const escapedDir = driverDir.replace(/'/g, "''");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12",
    `$version = '${version}'`,
    `$dir = '${escapedDir}'`,
    "$zip = Join-Path $dir 'edgedriver.zip'",
    "$url = \"https://msedgedriver.microsoft.com/$version/edgedriver_win64.zip\"",
    "Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 60",
    "Expand-Archive -Path $zip -DestinationPath $dir -Force",
    "Remove-Item $zip -Force",
    "if (-not (Test-Path (Join-Path $dir 'msedgedriver.exe'))) { throw 'msedgedriver.exe missing after extraction' }"
  ].join("; ");

  const download = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    timeout: 90_000
  });
  if (download.status !== 0 || !fs.existsSync(driverPath)) {
    throw new Error(`EdgeDriver download failed: ${download.stderr || download.stdout}`);
  }
  return driverPath;
}

async function waitHttp(url, label, timeoutMs, processToWatch) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (processToWatch && processToWatch.exitCode !== null) {
      throw new Error(`${label} process exited early with code ${processToWatch.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(400);
  }
  throw new Error(`${label} was not ready within ${timeoutMs}ms: ${lastError}`);
}

async function webdriverRequest(driverPort, method, requestPath, body) {
  const response = await fetch(`http://127.0.0.1:${driverPort}${requestPath}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = { value: null };
  }
  if (!response.ok || payload?.value?.error) {
    const detail = payload?.value?.message || payload?.value?.error || `${response.status} ${response.statusText}`;
    throw new Error(`WebDriver ${method} ${requestPath} failed: ${detail}`);
  }
  return payload;
}

async function execute(driverPort, sessionId, script, args = []) {
  const payload = await webdriverRequest(driverPort, "POST", `/session/${sessionId}/execute/sync`, { script, args });
  return payload.value;
}

async function waitUi(driverPort, sessionId, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await execute(driverPort, sessionId, `return {
      surface: document.querySelector('#surface-badge')?.textContent?.trim() || '',
      auth: document.querySelector('#auth-status')?.textContent?.trim() || '',
      api: document.querySelector('#api-status')?.textContent?.trim() || '',
      boundary: document.querySelector('#cap-boundary')?.textContent?.trim() || '',
      analyze: document.querySelector('#cap-analyze')?.textContent?.trim() || '',
      youtube: document.querySelector('#cap-youtube')?.textContent?.trim() || '',
      productTruth: document.querySelector('#cap-product-truth')?.textContent?.trim() || '',
      message: document.querySelector('#message')?.textContent?.trim() || ''
    };`);
    if (predicate(last)) return last;
    await delay(500);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function main() {
  if (process.platform !== "win32") throw new Error("Windows native runtime smoke must run on Windows");

  const appBinaryPath = path.resolve("src-tauri", "target", "release", "masterv-desktop.exe");
  assert(fs.existsSync(appBinaryPath), `MasterV Windows binary not found: ${appBinaryPath}`);

  const email = required("SUPABASE_TEST_EMAIL");
  const password = required("SUPABASE_TEST_PASSWORD");
  assert(!process.env.GEMINI_API_KEY, "Gemini credential must not be present in desktop runtime smoke");
  assert(!process.env.YOUTUBE_DATA_API_KEY, "YouTube credential must not be present in desktop runtime smoke");

  const evidenceDir = path.resolve("artifacts", "desktop-windows-runtime");
  const runtimeRoot = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `masterv-desktop-runtime-${process.pid}`);
  const webviewUserDataFolder = path.join(runtimeRoot, "webview2");
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(webviewUserDataFolder, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });

  const webViewVersion = detectWebView2Version();
  const edgeDriverPath = ensureEdgeDriver(webViewVersion, runtimeRoot);
  const debugPort = await freePort();
  const driverPort = await freePort();

  const appLog = fs.openSync(path.join(evidenceDir, "masterv-process.log"), "w");
  const driverLog = fs.openSync(path.join(evidenceDir, "msedgedriver.log"), "w");
  let appProcess;
  let driverProcess;
  let sessionId = null;

  try {
    appProcess = spawn(appBinaryPath, [], {
      cwd: path.dirname(appBinaryPath),
      env: {
        ...process.env,
        WEBVIEW2_USER_DATA_FOLDER: webviewUserDataFolder,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`
      },
      stdio: ["ignore", appLog, appLog],
      windowsHide: false
    });

    const cdpResponse = await waitHttp(`http://127.0.0.1:${debugPort}/json/version`, "WebView2 CDP", 60_000, appProcess);
    const cdpVersion = await cdpResponse.json();

    driverProcess = spawn(edgeDriverPath, [`--port=${driverPort}`, "--verbose"], {
      cwd: path.dirname(edgeDriverPath),
      stdio: ["ignore", driverLog, driverLog],
      windowsHide: true
    });
    await waitHttp(`http://127.0.0.1:${driverPort}/status`, "msedgedriver", 30_000, driverProcess);

    const session = await webdriverRequest(driverPort, "POST", "/session", {
      capabilities: {
        alwaysMatch: {
          browserName: "webview2",
          "ms:edgeChromium": true,
          "ms:edgeOptions": {
            debuggerAddress: `127.0.0.1:${debugPort}`
          }
        }
      }
    });
    sessionId = session.value?.sessionId || session.sessionId;
    assert(sessionId, `WebDriver session id missing: ${JSON.stringify(session)}`);

    await execute(driverPort, sessionId, `
      const email = document.querySelector('#email');
      const password = document.querySelector('#password');
      const button = document.querySelector('#login-button');
      if (!email || !password || !button) return false;
      email.value = arguments[0];
      password.value = arguments[1];
      button.click();
      return true;
    `, [email, password]);

    const connected = await waitUi(
      driverPort,
      sessionId,
      (state) => state.auth === "AUTHENTICATED" && state.api === "CONNECTED",
      45_000,
      "MasterV authenticated hosted API state"
    );

    assert(connected.surface === "desktop", `unexpected surface: ${connected.surface}`);
    assert(connected.boundary === "READY", `boundary probe was not READY: ${JSON.stringify(connected)}`);
    assert(connected.analyze === "PENDING", `analyze capability must remain PENDING: ${connected.analyze}`);
    assert(connected.youtube === "PENDING", `YouTube discovery capability must remain PENDING: ${connected.youtube}`);
    assert(connected.productTruth === "PENDING", `Product Truth capability must remain PENDING: ${connected.productTruth}`);

    await execute(driverPort, sessionId, `
      const email = document.querySelector('#email');
      const password = document.querySelector('#password');
      if (email) email.value = '';
      if (password) password.value = '';
      return true;
    `);

    const screenshot = await webdriverRequest(driverPort, "GET", `/session/${sessionId}/screenshot`);
    assert(typeof screenshot.value === "string" && screenshot.value.length > 100, "WebDriver screenshot payload missing");
    fs.writeFileSync(path.join(evidenceDir, "native-connected.png"), Buffer.from(screenshot.value, "base64"));

    const evidence = {
      status: "MASTERV_WINDOWS_NATIVE_RUNTIME_PASS",
      webview2_runtime_version: webViewVersion,
      cdp_browser: cdpVersion.Browser || null,
      attach_mode: true,
      surface: connected.surface,
      auth_status: connected.auth,
      hosted_api_status: connected.api,
      boundary_probe: connected.boundary === "READY",
      analyze_migrated: false,
      youtube_discovery_migrated: false,
      product_truth_migrated: false,
      local_next_api_required: false,
      provider_credentials_in_desktop_job: false,
      screenshot: "native-connected.png"
    };
    fs.writeFileSync(path.join(evidenceDir, "runtime-evidence.json"), JSON.stringify(evidence, null, 2));

    await execute(driverPort, sessionId, "document.querySelector('#logout-button')?.click(); return true;");
    const signedOut = await waitUi(driverPort, sessionId, (state) => state.auth === "SIGNED OUT", 10_000, "desktop logout");
    assert(signedOut.auth === "SIGNED OUT", "desktop logout did not clear in-memory session");

    console.log(JSON.stringify(evidence));
  } finally {
    if (sessionId) {
      await webdriverRequest(driverPort, "DELETE", `/session/${sessionId}`).catch(() => undefined);
    }
    if (driverProcess && driverProcess.exitCode === null) driverProcess.kill();
    if (appProcess && appProcess.exitCode === null) appProcess.kill();
    fs.closeSync(appLog);
    fs.closeSync(driverLog);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
