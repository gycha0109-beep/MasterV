import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const REFERENCE_LIBRARY_LIST_PROJECTION = [
  "source_id",
  "canonical_url",
  "label",
  "analysis_provenance",
  "revision",
  "first_saved_at",
  "updated_at"
];

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
      message: document.querySelector('#message')?.textContent?.trim() || '',
      libraryStatus: document.querySelector('#library-status')?.textContent?.trim() || '',
      libraryWorkspace: document.querySelector('#library-workspace')?.textContent?.trim() || '',
      libraryCount: document.querySelector('#library-count')?.textContent?.trim() || '',
      libraryHidden: Boolean(document.querySelector('#reference-library-panel')?.hidden),
      projection: document.querySelector('#reference-library-panel')?.dataset?.projection || '',
      sourceIds: Array.from(document.querySelectorAll('[data-source-id]')).map((node) => node.dataset.sourceId || '')
    };`);
    if (predicate(last)) return last;
    await delay(500);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

function restHeaders(publishableKey, accessToken, extra = {}) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    ...extra
  };
}

async function parseHttpError(response) {
  try {
    const body = await response.json();
    return body.message || body.details || body.error_description || body.error || `${response.status}`;
  } catch {
    return `${response.status} ${response.statusText}`.trim();
  }
}

async function directLogin(projectUrl, publishableKey, email, password) {
  const response = await fetch(`${projectUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(`Direct Supabase login failed: ${await parseHttpError(response)}`);
  const body = await response.json();
  assert(body.access_token && body.user?.id, "Direct Supabase login response is incomplete");
  return body;
}

async function bootstrapWorkspace(projectUrl, publishableKey, directSession) {
  const workspaceId = `user:${directSession.user.id}`;
  const params = new URLSearchParams({ on_conflict: "workspace_id,user_id" });
  const response = await fetch(`${projectUrl}/rest/v1/masterv_workspace_members?${params.toString()}`, {
    method: "POST",
    headers: restHeaders(publishableKey, directSession.access_token, {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal"
    }),
    body: JSON.stringify({ workspace_id: workspaceId, user_id: directSession.user.id, role: "owner" })
  });
  if (!response.ok) throw new Error(`Direct workspace bootstrap failed: ${await parseHttpError(response)}`);
  return workspaceId;
}

function fixtureRecord(workspaceId, nativeId, label) {
  return {
    workspace_id: workspaceId,
    source_platform: "youtube",
    source_id: `yt:${nativeId}`,
    native_id: nativeId,
    canonical_url: `https://www.youtube.com/watch?v=${nativeId}`,
    label,
    analysis: {
      summary: `${label} synthetic persistence smoke`,
      structure_label: "hook → demo → CTA",
      duration_seconds: 12,
      hook: { type: "visual", text: "", visual: "synthetic", duration_seconds: 2 },
      product_presentation: {
        first_seen_seconds: 1,
        demonstration_present: true,
        before_after_present: false,
        comparison_present: false,
        result_visual_present: false,
        face_present: false,
        hand_present: true
      },
      persuasion: { problem: "", solution: "", benefit: "", proof: "", social_proof: "", offer: "", cta: "", emotional_trigger: "" },
      presentation: { format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" },
      transcript: { full: "", segments: [] },
      scenes: [],
      observation_segments: [],
      tags: ["synthetic-smoke"],
      confidence_notes: ["Synthetic desktop runtime fixture; no provider request was executed."]
    },
    analysis_cache_key: `desktop-runtime:${nativeId}`,
    analysis_provenance: "replay",
    schema_version: "reference-library-v1"
  };
}

async function deleteFixture(projectUrl, publishableKey, directSession, workspaceId, sourceId) {
  const params = new URLSearchParams();
  params.set("workspace_id", `eq.${workspaceId}`);
  params.set("source_id", `eq.${sourceId}`);
  const response = await fetch(`${projectUrl}/rest/v1/reference_library_entries?${params.toString()}`, {
    method: "DELETE",
    headers: restHeaders(publishableKey, directSession.access_token, { Prefer: "return=minimal" })
  });
  if (!response.ok) throw new Error(`Fixture cleanup failed: ${await parseHttpError(response)}`);
}

async function readFixture(projectUrl, publishableKey, directSession, workspaceId, sourceId) {
  const params = new URLSearchParams();
  params.set("select", "source_id,label,revision");
  params.set("workspace_id", `eq.${workspaceId}`);
  params.set("source_id", `eq.${sourceId}`);
  const response = await fetch(`${projectUrl}/rest/v1/reference_library_entries?${params.toString()}`, {
    method: "GET",
    headers: restHeaders(publishableKey, directSession.access_token, { Accept: "application/json" })
  });
  if (!response.ok) throw new Error(`Fixture read failed: ${await parseHttpError(response)}`);
  const body = await response.json();
  assert(Array.isArray(body), "Fixture read response must be an array");
  return body;
}

async function insertFixture(projectUrl, publishableKey, directSession, record) {
  const params = new URLSearchParams({ on_conflict: "workspace_id,source_id" });
  const response = await fetch(`${projectUrl}/rest/v1/reference_library_entries?${params.toString()}`, {
    method: "POST",
    headers: restHeaders(publishableKey, directSession.access_token, {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    }),
    body: JSON.stringify(record)
  });
  if (!response.ok) throw new Error(`Fixture insert failed: ${await parseHttpError(response)}`);
  const body = await response.json();
  assert(Array.isArray(body) && body[0]?.source_id === record.source_id, "Fixture insert response mismatch");
}

async function verifyCrossWorkspaceWriteDenied(projectUrl, publishableKey, directSession, record) {
  const foreignRecord = { ...record, workspace_id: "user:00000000-0000-0000-0000-000000000000" };
  const response = await fetch(`${projectUrl}/rest/v1/reference_library_entries`, {
    method: "POST",
    headers: restHeaders(publishableKey, directSession.access_token, {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    }),
    body: JSON.stringify(foreignRecord)
  });
  return !response.ok;
}

async function main() {
  if (process.platform !== "win32") throw new Error("Windows native runtime smoke must run on Windows");

  const appBinaryPath = path.resolve("src-tauri", "target", "release", "masterv-desktop.exe");
  assert(fs.existsSync(appBinaryPath), `MasterV Windows binary not found: ${appBinaryPath}`);

  const email = required("SUPABASE_TEST_EMAIL");
  const password = required("SUPABASE_TEST_PASSWORD");
  const projectUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
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
  const uniqueSuffix = `${process.env.GITHUB_RUN_ID || Date.now()}${process.env.GITHUB_RUN_ATTEMPT || "1"}${process.pid}`.replace(/[^A-Za-z0-9_-]/g, "");
  const nativeId = `MV3D${uniqueSuffix}`;
  const sourceId = `yt:${nativeId}`;
  const fixtureLabel = `Desktop runtime fixture ${uniqueSuffix}`;

  const appLog = fs.openSync(path.join(evidenceDir, "masterv-process.log"), "w");
  const driverLog = fs.openSync(path.join(evidenceDir, "msedgedriver.log"), "w");
  let appProcess;
  let driverProcess;
  let sessionId = null;
  let directSession = null;
  let workspaceId = null;
  let cleanupVerified = false;
  let failure = null;
  let cleanupFailure = null;
  let evidence = null;

  try {
    directSession = await directLogin(projectUrl, publishableKey, email, password);
    workspaceId = await bootstrapWorkspace(projectUrl, publishableKey, directSession);
    const record = fixtureRecord(workspaceId, nativeId, fixtureLabel);
    await deleteFixture(projectUrl, publishableKey, directSession, workspaceId, sourceId);
    const crossWorkspaceWriteDenied = await verifyCrossWorkspaceWriteDenied(projectUrl, publishableKey, directSession, record);
    assert(crossWorkspaceWriteDenied, "RLS must deny the desktop test user from writing a foreign workspace");
    await insertFixture(projectUrl, publishableKey, directSession, record);
    const seeded = await readFixture(projectUrl, publishableKey, directSession, workspaceId, sourceId);
    assert(seeded.length === 1 && seeded[0].label === fixtureLabel, "Unique runtime fixture was not persisted");

    appProcess = spawn(appBinaryPath, [], {
      cwd: path.dirname(appBinaryPath),
      env: {
        ...process.env,
        MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT: String(debugPort),
        MASTERV_DESKTOP_TEST_WEBVIEW_DATA_DIR: webviewUserDataFolder
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

    const driverSession = await webdriverRequest(driverPort, "POST", "/session", {
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
    sessionId = driverSession.value?.sessionId || driverSession.sessionId;
    assert(sessionId, `WebDriver session id missing: ${JSON.stringify(driverSession)}`);

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
      (state) => state.auth === "AUTHENTICATED" && state.api === "CONNECTED" && state.libraryStatus === "READY" && state.sourceIds.includes(sourceId),
      45_000,
      "MasterV authenticated Reference Library state"
    );

    assert(connected.surface === "desktop", `unexpected surface: ${connected.surface}`);
    assert(connected.boundary === "READY", `boundary probe was not READY: ${JSON.stringify(connected)}`);
    assert(connected.analyze === "PENDING", `analyze capability must remain PENDING: ${connected.analyze}`);
    assert(["PENDING", "READY"].includes(connected.youtube), `YouTube discovery capability must be PENDING or READY: ${connected.youtube}`);
    assert(connected.productTruth === "PENDING", `Product Truth capability must remain PENDING: ${connected.productTruth}`);
    assert(connected.libraryWorkspace === workspaceId, `desktop workspace mismatch: ${connected.libraryWorkspace}`);
    assert(connected.projection === REFERENCE_LIBRARY_LIST_PROJECTION.join(","), `desktop metadata projection mismatch: ${connected.projection}`);
    assert(!connected.projection.split(",").includes("analysis"), "desktop list projection must not select analysis payload");

    await execute(driverPort, sessionId, `
      const email = document.querySelector('#email');
      const password = document.querySelector('#password');
      if (email) email.value = '';
      if (password) password.value = '';
      document.querySelector('#reference-library-panel')?.scrollIntoView({ block: 'start' });
      return true;
    `);
    await delay(300);

    const screenshot = await webdriverRequest(driverPort, "GET", `/session/${sessionId}/screenshot`);
    assert(typeof screenshot.value === "string" && screenshot.value.length > 100, "WebDriver screenshot payload missing");
    fs.writeFileSync(path.join(evidenceDir, "reference-library-visible.png"), Buffer.from(screenshot.value, "base64"));

    const clickedDelete = await execute(driverPort, sessionId, `
      const sourceId = arguments[0];
      const button = Array.from(document.querySelectorAll('[data-delete-source-id]'))
        .find((node) => node.dataset.deleteSourceId === sourceId);
      if (!button) return false;
      button.click();
      return true;
    `, [sourceId]);
    assert(clickedDelete === true, "Desktop fixture delete button was not found");

    const afterDelete = await waitUi(
      driverPort,
      sessionId,
      (state) => state.libraryStatus === "READY" && !state.sourceIds.includes(sourceId),
      20_000,
      "Desktop Reference Library delete convergence"
    );
    assert(!afterDelete.sourceIds.includes(sourceId), "Fixture remained visible after UI delete");

    const persistedAfterDelete = await readFixture(projectUrl, publishableKey, directSession, workspaceId, sourceId);
    assert(persistedAfterDelete.length === 0, "Fixture still exists in Supabase after desktop UI delete");

    await deleteFixture(projectUrl, publishableKey, directSession, workspaceId, sourceId);
    const remainingAfterCleanup = await readFixture(projectUrl, publishableKey, directSession, workspaceId, sourceId);
    assert(remainingAfterCleanup.length === 0, "Fixture cleanup verification failed");
    cleanupVerified = true;

    await execute(driverPort, sessionId, "document.querySelector('#logout-button')?.click(); return true;");
    const signedOut = await waitUi(
      driverPort,
      sessionId,
      (state) => state.auth === "SIGNED OUT" && state.libraryHidden === true && state.sourceIds.length === 0,
      10_000,
      "desktop logout"
    );
    assert(signedOut.auth === "SIGNED OUT", "desktop logout did not clear in-memory session");
    assert(signedOut.libraryHidden === true, "desktop logout did not hide Reference Library surface");

    evidence = {
      status: "MASTERV_WINDOWS_REFERENCE_LIBRARY_RUNTIME_PASS",
      webview2_runtime_version: webViewVersion,
      cdp_browser: cdpVersion.Browser || null,
      attach_mode: true,
      surface: connected.surface,
      auth_status: connected.auth,
      hosted_api_status: connected.api,
      boundary_probe: connected.boundary === "READY",
      workspace_bootstrap: connected.libraryWorkspace === workspaceId,
      reference_library_list: "PASS",
      reference_library_projection: REFERENCE_LIBRARY_LIST_PROJECTION,
      analysis_payload_selected: false,
      fixture_visible: connected.sourceIds.includes(sourceId),
      reference_delete_ui: !afterDelete.sourceIds.includes(sourceId) ? "PASS" : "FAIL",
      reference_delete_db: persistedAfterDelete.length === 0 ? "PASS" : "FAIL",
      cross_workspace_write_denied: crossWorkspaceWriteDenied,
      cleanup: cleanupVerified ? "PASS" : "FAIL",
      logout: signedOut.auth === "SIGNED OUT" ? "PASS" : "FAIL",
      analyze_migrated: false,
      youtube_discovery_migrated: false,
      product_truth_migrated: false,
      local_next_api_required: false,
      provider_credentials_in_desktop_job: false,
      gemini_requests: 0,
      youtube_requests: 0,
      screenshot: "reference-library-visible.png"
    };
  } catch (error) {
    failure = error;
  } finally {
    if (directSession && workspaceId && !cleanupVerified) {
      try {
        await deleteFixture(projectUrl, publishableKey, directSession, workspaceId, sourceId);
        const remaining = await readFixture(projectUrl, publishableKey, directSession, workspaceId, sourceId);
        assert(remaining.length === 0, "fallback fixture cleanup verification failed");
        cleanupVerified = true;
      } catch (error) {
        cleanupFailure = error;
      }
    }
    if (sessionId) {
      await webdriverRequest(driverPort, "DELETE", `/session/${sessionId}`).catch(() => undefined);
    }
    if (driverProcess && driverProcess.exitCode === null) driverProcess.kill();
    if (appProcess && appProcess.exitCode === null) appProcess.kill();
    fs.closeSync(appLog);
    fs.closeSync(driverLog);
  }

  if (cleanupFailure) {
    const cleanupMessage = cleanupFailure instanceof Error ? cleanupFailure.message : String(cleanupFailure);
    const primaryMessage = failure instanceof Error ? failure.message : failure ? String(failure) : "runtime verification failed";
    throw new Error(`${primaryMessage}; cleanup also failed: ${cleanupMessage}`);
  }
  if (failure) throw failure;
  assert(cleanupVerified, "Runtime fixture cleanup was not verified");
  assert(evidence, "Runtime evidence was not produced");

  fs.writeFileSync(path.join(evidenceDir, "runtime-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
