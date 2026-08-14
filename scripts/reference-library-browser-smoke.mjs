import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.REFERENCE_LIBRARY_BROWSER_BASE_URL?.trim() || "http://127.0.0.1:3000";
const EMAIL = process.env.SUPABASE_TEST_EMAIL?.trim() || "";
const PASSWORD = process.env.SUPABASE_TEST_PASSWORD || "";
const DEBUG_PORT = Number(process.env.REFERENCE_LIBRARY_BROWSER_DEBUG_PORT || 9223);
const ARTIFACT_DIR = path.resolve("artifacts/reference-library-browser");
const PROFILE_DIR = path.resolve(`/tmp/masterv-reference-library-${process.pid}`);
const EXPECTED_SOURCE_ID = "yt:MVpersist01";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN?.trim(),
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser"
  ].filter(Boolean);
  for (const candidate of candidates) {
    const found = spawnSync("which", [candidate], { encoding: "utf8" });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  throw new Error("No Chrome/Chromium executable found on runner");
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError ? String(lastError) : "no response"}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.socket = null;
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP websocket connect timeout")), 10_000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP websocket connection failed"));
      }, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${JSON.stringify(message.error)}`));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.handlers.get(message.method) ?? []) listener(message.params ?? {});
    });
  }

  on(method, handler) {
    const listeners = this.handlers.get(method) ?? [];
    listeners.push(handler);
    this.handlers.set(method, listeners);
  }

  send(method, params = {}) {
    assert(this.socket?.readyState === WebSocket.OPEN, "CDP socket is not open");
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value;
}

async function waitForExpression(cdp, expression, label, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function captureScreenshot(cdp, filename) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    fromSurface: true
  });
  await writeFile(path.join(ARTIFACT_DIR, filename), Buffer.from(result.data, "base64"));
}

async function main() {
  assert(EMAIL, "SUPABASE_TEST_EMAIL is required");
  assert(PASSWORD.length >= 6, "SUPABASE_TEST_PASSWORD must be at least 6 characters");
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await rm(PROFILE_DIR, { recursive: true, force: true });
  await mkdir(PROFILE_DIR, { recursive: true });

  const chromePath = findChrome();
  const chromeLog = [];
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--window-size=1440,1200",
    "about:blank"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  chrome.stdout.on("data", (chunk) => chromeLog.push(String(chunk)));
  chrome.stderr.on("data", (chunk) => chromeLog.push(String(chunk)));

  let cdp = null;
  const network = { auth_requests: 0, reference_rest_requests: 0, analyze_requests: 0 };
  try {
    await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    assert(target, "Chrome exposed no debuggable page target");

    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    cdp.on("Network.requestWillBeSent", ({ request }) => {
      const url = request?.url || "";
      if (url.includes(".supabase.co/auth/v1/")) network.auth_requests += 1;
      if (url.includes(".supabase.co/rest/v1/")) network.reference_rest_requests += 1;
      if (url.includes("/api/analyze")) network.analyze_requests += 1;
    });

    await cdp.send("Page.navigate", { url: BASE_URL });
    await waitForExpression(cdp, "document.readyState === 'complete'", "initial page load");
    await waitForExpression(cdp, "Boolean(document.querySelector('input[aria-label=\"보관함 이메일\"]'))", "reference login form");

    const emailLiteral = JSON.stringify(EMAIL);
    const passwordLiteral = JSON.stringify(PASSWORD);
    await evaluate(cdp, `(() => {
      const email = document.querySelector('input[aria-label="보관함 이메일"]');
      const password = document.querySelector('input[aria-label="보관함 비밀번호"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(email, ${emailLiteral});
      email.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(password, ${passwordLiteral});
      password.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await evaluate(cdp, `(() => {
      const account = document.querySelector('[aria-label="Reference Library account"]');
      const button = Array.from(account?.querySelectorAll('button') ?? []).find((item) => item.textContent?.trim() === '로그인');
      button?.click();
      return Boolean(button);
    })()`);

    await waitForExpression(cdp, `document.body.innerText.includes('Supabase 보관함 연결됨')`, "authenticated reference library", 30_000);
    await waitForExpression(cdp, `document.body.innerText.includes(${JSON.stringify(EXPECTED_SOURCE_ID)})`, "seeded persisted reference", 30_000);

    const beforeReload = await evaluate(cdp, `(() => ({
      connected: document.body.innerText.includes('Supabase 보관함 연결됨'),
      reference_present: document.body.innerText.includes(${JSON.stringify(EXPECTED_SOURCE_ID)}),
      tray_copy_present: document.body.innerText.includes('Supabase 보관함 · 새로고침 후에도 유지'),
      stored_session_present: Boolean(localStorage.getItem('masterv.supabase.session.v1'))
    }))()`);
    assert(beforeReload.connected, "Reference Library did not enter connected state");
    assert(beforeReload.reference_present, "Seeded DB reference is missing before reload");
    assert(beforeReload.tray_copy_present, "Persistent tray copy is missing before reload");
    assert(beforeReload.stored_session_present, "Auth session was not persisted in browser storage");
    assert(network.analyze_requests === 0, "Persistence smoke must not invoke Deep analysis");
    await captureScreenshot(cdp, "before-reload.png");

    await cdp.send("Page.reload", { ignoreCache: true });
    await waitForExpression(cdp, "document.readyState === 'complete'", "page reload");
    await waitForExpression(cdp, `document.body.innerText.includes('Supabase 보관함 연결됨')`, "restored authenticated state", 30_000);
    await waitForExpression(cdp, `document.body.innerText.includes(${JSON.stringify(EXPECTED_SOURCE_ID)})`, "reference restored after reload", 30_000);

    const afterReload = await evaluate(cdp, `(() => ({
      connected: document.body.innerText.includes('Supabase 보관함 연결됨'),
      reference_present: document.body.innerText.includes(${JSON.stringify(EXPECTED_SOURCE_ID)}),
      stored_session_present: Boolean(localStorage.getItem('masterv.supabase.session.v1')),
      persistent_count_copy: Array.from(document.querySelectorAll('.reference-tray strong')).map((node) => node.textContent).find((text) => text?.includes('개 저장')) ?? null
    }))()`);
    assert(afterReload.connected, "Authenticated state did not restore after page reload");
    assert(afterReload.reference_present, "Persisted reference did not restore after page reload");
    assert(afterReload.stored_session_present, "Stored auth session disappeared after reload");
    assert(network.analyze_requests === 0, "Reload persistence smoke unexpectedly invoked Deep analysis");
    await captureScreenshot(cdp, "after-reload.png");

    const artifact = {
      version: "reference-library-browser-smoke-v1",
      generated_at: new Date().toISOString(),
      status: "PASS",
      expected_source_id: EXPECTED_SOURCE_ID,
      before_reload: beforeReload,
      after_reload: afterReload,
      network,
      gemini_api_key_present: Boolean(process.env.GEMINI_API_KEY?.trim()),
      screenshots: ["before-reload.png", "after-reload.png"]
    };
    assert(!artifact.gemini_api_key_present, "Persistence browser smoke must run without GEMINI_API_KEY");
    await writeFile(path.join(ARTIFACT_DIR, "reference-library-browser-smoke.json"), `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(JSON.stringify({
      status: "REFERENCE_LIBRARY_BROWSER_SMOKE_PASS",
      reference_rest_requests: network.reference_rest_requests,
      analyze_requests: network.analyze_requests,
      restored_after_reload: afterReload.reference_present
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let bodyText = null;
    try {
      if (cdp) bodyText = await evaluate(cdp, "document.body?.innerText?.slice(0, 8000) ?? null");
    } catch {}
    await writeFile(path.join(ARTIFACT_DIR, "reference-library-browser-smoke.json"), `${JSON.stringify({
      version: "reference-library-browser-smoke-v1",
      generated_at: new Date().toISOString(),
      status: "FAIL",
      error: message,
      network,
      body_text: bodyText
    }, null, 2)}\n`);
    console.error(JSON.stringify({ status: "REFERENCE_LIBRARY_BROWSER_SMOKE_FAIL", error: message, network }));
    process.exitCode = 1;
  } finally {
    try { cdp?.close(); } catch {}
    chrome.kill("SIGTERM");
    await sleep(200);
    if (!chrome.killed) chrome.kill("SIGKILL");
    await writeFile(path.join(ARTIFACT_DIR, "chrome.log"), chromeLog.join(""));
    await rm(PROFILE_DIR, { recursive: true, force: true });
  }
}

await main();
