import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.SEARCH_UX_BROWSER_BASE_URL?.trim() || "http://127.0.0.1:3000";
const QUERY = process.env.SEARCH_UX_BROWSER_QUERY?.trim() || "sunscreen review shorts";
const DEBUG_PORT = Number(process.env.SEARCH_UX_BROWSER_DEBUG_PORT || 9222);
const ARTIFACT_DIR = path.resolve("artifacts/search-ux-browser");
const PROFILE_DIR = path.resolve(`/tmp/masterv-search-ux-${process.pid}`);

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
      const listeners = this.handlers.get(message.method) ?? [];
      for (const listener of listeners) listener(message.params ?? {});
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

async function waitForExpression(cdp, expression, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function captureScreenshot(cdp, filename, captureBeyondViewport = true) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport,
    fromSurface: true
  });
  await writeFile(path.join(ARTIFACT_DIR, filename), Buffer.from(result.data, "base64"));
}

async function main() {
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
  const network = {
    discovery_requests: 0,
    discovery_status: null,
    analyze_requests: 0
  };
  let artifact = null;

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
      if (url.includes("/api/discover/youtube")) network.discovery_requests += 1;
      if (url.includes("/api/analyze")) network.analyze_requests += 1;
    });
    cdp.on("Network.responseReceived", ({ response }) => {
      if ((response?.url || "").includes("/api/discover/youtube")) network.discovery_status = response.status;
    });

    await cdp.send("Page.navigate", { url: BASE_URL });
    await waitForExpression(cdp, "document.readyState === 'complete'", "initial page load");
    await waitForExpression(cdp, "Boolean(document.querySelector('input[aria-label=\"YouTube 검색어\"]'))", "discovery search input");

    const initial = await evaluate(cdp, `(() => ({
      direct_input_present: Boolean(document.querySelector('input[aria-label="YouTube URL"]')),
      direct_input_value: document.querySelector('input[aria-label="YouTube URL"]')?.value ?? null,
      search_results_present: Boolean(document.querySelector('#search-results'))
    }))()`);
    assert(initial.direct_input_present, "Direct URL analyzer input is missing before search");
    assert(initial.direct_input_value === "", "Direct URL analyzer should be empty before candidate selection");
    assert(!initial.search_results_present, "Search results should not render before submitting a query");

    const queryLiteral = JSON.stringify(QUERY);
    await evaluate(cdp, `(() => {
      const input = document.querySelector('input[aria-label="YouTube 검색어"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${queryLiteral});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value;
    })()`);
    await waitForExpression(cdp, "!document.querySelector('#discovery-search form button')?.disabled", "enabled search button");
    await evaluate(cdp, "document.querySelector('#discovery-search form button').click(); true");

    await waitForExpression(cdp, "document.querySelectorAll('#search-results article').length > 0", "rendered discovery cards", 30_000);
    await sleep(500);

    const desktop = await evaluate(cdp, `(() => {
      const section = document.querySelector('#search-results');
      const text = section?.innerText ?? '';
      const cards = Array.from(section?.querySelectorAll('article') ?? []);
      const actionButtons = cards.flatMap((card) => Array.from(card.querySelectorAll('button')));
      const images = cards.flatMap((card) => Array.from(card.querySelectorAll('img')));
      return {
        card_count: cards.length,
        has_plan_limited_badge: text.includes('자동 빠른 분석 제한'),
        limited_card_count: cards.filter((card) => card.innerText.includes('분석 제한됨')).length,
        precise_action_count: actionButtons.filter((button) => button.textContent?.includes('정밀 분석')).length,
        thumbnail_count: images.length,
        has_metadata_copy: text.includes('메타데이터만 사용 가능'),
        direct_input_value: document.querySelector('input[aria-label="YouTube URL"]')?.value ?? null,
        result_heading: section?.querySelector('h3')?.textContent ?? null
      };
    })()`);

    assert(network.discovery_requests === 1, `Expected exactly one browser discovery request, got ${network.discovery_requests}`);
    assert(network.discovery_status === 200, `Expected discovery HTTP 200, got ${network.discovery_status}`);
    assert(network.analyze_requests === 0, `Search triggered ${network.analyze_requests} unexpected /api/analyze request(s)`);
    assert(desktop.card_count > 0, "No discovery cards rendered");
    assert(desktop.has_plan_limited_badge, "Blocked coarse runtime badge is missing");
    assert(desktop.limited_card_count > 0, "Pending candidates are not labeled 분석 제한됨");
    assert(desktop.precise_action_count === desktop.card_count, "Every candidate should expose an explicit Deep action");
    assert(desktop.has_metadata_copy, "Metadata-only copy is missing while coarse runtime is blocked");
    assert(desktop.direct_input_value === "", "Search should not populate the direct URL analyzer before candidate selection");

    await captureScreenshot(cdp, "desktop-search-results.png", true);

    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844
    });
    await sleep(300);
    await evaluate(cdp, "document.getElementById('search-results')?.scrollIntoView({ block: 'start' }); true");
    await sleep(200);

    const mobile = await evaluate(cdp, `(() => {
      const card = document.querySelector('#search-results article');
      const rect = card?.getBoundingClientRect();
      return {
        viewport_width: window.innerWidth,
        document_width: document.documentElement.scrollWidth,
        no_horizontal_overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        first_card_width: rect?.width ?? null,
        first_card_fits_viewport: rect ? rect.width <= window.innerWidth + 1 : false
      };
    })()`);
    assert(mobile.no_horizontal_overflow, `Mobile page overflows horizontally: ${mobile.document_width}px > ${mobile.viewport_width}px`);
    assert(mobile.first_card_fits_viewport, "First result card does not fit the mobile viewport");
    assert(network.analyze_requests === 0, "Responsive check unexpectedly triggered Deep analysis");

    await captureScreenshot(cdp, "mobile-search-results.png", false);

    artifact = {
      version: "search-ux-browser-smoke-v1",
      generated_at: new Date().toISOString(),
      status: "PASS",
      base_url: BASE_URL,
      query: QUERY,
      chrome_path: chromePath,
      network,
      desktop,
      mobile,
      gemini_api_key_present: Boolean(process.env.GEMINI_API_KEY?.trim()),
      automatic_deep_analysis_observed: network.analyze_requests > 0,
      screenshots: ["desktop-search-results.png", "mobile-search-results.png"]
    };
    assert(!artifact.gemini_api_key_present, "Browser smoke must run without GEMINI_API_KEY");
    await writeFile(path.join(ARTIFACT_DIR, "search-ux-browser-smoke.json"), `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(JSON.stringify({
      status: "SEARCH_UX_BROWSER_SMOKE_PASS",
      candidates: desktop.card_count,
      discovery_requests: network.discovery_requests,
      analyze_requests: network.analyze_requests,
      mobile_no_horizontal_overflow: mobile.no_horizontal_overflow
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let body_text = null;
    try {
      if (cdp) body_text = await evaluate(cdp, "document.body?.innerText?.slice(0, 8000) ?? null");
    } catch {}
    artifact = {
      version: "search-ux-browser-smoke-v1",
      generated_at: new Date().toISOString(),
      status: "FAIL",
      base_url: BASE_URL,
      query: QUERY,
      chrome_path: chromePath,
      network,
      error: message,
      body_text
    };
    await writeFile(path.join(ARTIFACT_DIR, "search-ux-browser-smoke.json"), `${JSON.stringify(artifact, null, 2)}\n`);
    console.error(JSON.stringify({ status: "SEARCH_UX_BROWSER_SMOKE_FAIL", error: message, network }));
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
