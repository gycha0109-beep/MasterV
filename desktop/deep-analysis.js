(() => {
  const config = window.MASTERV_DESKTOP_CONFIG || {};
  const originalFetch = window.fetch.bind(window);
  const boundaryPath = "/functions/v1/masterv-api-boundary";
  const capDeep = document.getElementById("cap-deep-analysis");
  const panel = document.getElementById("deep-analysis-panel");
  const form = document.getElementById("deep-analysis-form");
  const urlInput = document.getElementById("deep-analysis-url");
  const submit = document.getElementById("deep-analysis-submit");
  const status = document.getElementById("deep-analysis-status");
  const model = document.getElementById("deep-analysis-model");
  const source = document.getElementById("deep-analysis-source");
  const content = document.getElementById("deep-analysis-content");
  const logout = document.getElementById("logout-button");

  if (!capDeep || !panel || !form || !urlInput || !submit || !status || !model || !source || !content || !logout) return;

  let accessToken = "";
  let capabilityReady = false;
  let capabilityProbeInFlight = false;

  panel.dataset.providerAuthority = "hosted-secret";
  panel.dataset.providerCredentialsInClient = "false";
  panel.dataset.computeAuthority = "hosted-deep-analysis";
  panel.dataset.analysisTier = "deep";
  panel.dataset.persistenceAuthority = "none";
  panel.dataset.geminiRequests = "0";

  function setStatus(text, tone = "") {
    status.textContent = text;
    status.classList.toggle("ok", tone === "ok");
    status.classList.toggle("error", tone === "error");
  }

  function setCapability(value) {
    capabilityReady = value === true;
    capDeep.textContent = value === true ? "READY" : value === false ? "PENDING" : "—";
    panel.hidden = !accessToken;
    setStatus(accessToken ? (capabilityReady ? "READY" : "NOT CONFIGURED") : "SIGNED OUT", accessToken && capabilityReady ? "ok" : accessToken ? "error" : "");
    updateControl();
  }

  function updateControl() {
    submit.disabled = !accessToken || !capabilityReady || !urlInput.value.trim();
  }

  function clearResult() {
    content.replaceChildren();
    model.textContent = "—";
    source.textContent = "—";
    panel.dataset.geminiRequests = "0";
  }

  function clearState() {
    accessToken = "";
    capabilityReady = false;
    urlInput.value = "";
    clearResult();
    panel.hidden = true;
    setCapability(null);
  }

  function authorizationFrom(input, init) {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const authorization = headers.get("Authorization") || headers.get("authorization") || "";
    return authorization.replace(/^Bearer\s+/i, "").trim();
  }

  function requestUrl(input) {
    return typeof input === "string" ? input : input instanceof URL ? input.toString() : input instanceof Request ? input.url : "";
  }

  async function refreshCapability() {
    if (!accessToken || capabilityProbeInFlight || !config.api_base_url || !config.supabase_publishable_key) return;
    capabilityProbeInFlight = true;
    try {
      const response = await originalFetch(`${config.api_base_url}/masterv-api-boundary`, {
        method: "GET",
        headers: {
          apikey: config.supabase_publishable_key,
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      });
      if (!response.ok) throw new Error(`Hosted Deep Analysis capability probe failed (${response.status})`);
      const body = await response.json();
      if (body.contract_version !== config.api_contract_version || body.capabilities?.deep_analysis_route !== true) {
        throw new Error("Hosted Deep Analysis capability contract mismatch");
      }
      setCapability(body.capabilities.deep_analysis === true);
    } catch {
      setCapability(false);
    } finally {
      capabilityProbeInFlight = false;
    }
  }

  window.fetch = async function masterVDesktopFetch(input, init) {
    const url = requestUrl(input);
    if (url.includes(boundaryPath) || url.endsWith("/masterv-api-boundary")) {
      const token = authorizationFrom(input, init);
      if (token && token !== accessToken) {
        accessToken = token;
        panel.hidden = false;
        queueMicrotask(() => refreshCapability());
      }
    }
    return originalFetch(input, init);
  };

  function fact(container, label, value) {
    const item = document.createElement("div");
    const term = document.createElement("span");
    term.textContent = label;
    const data = document.createElement("strong");
    data.textContent = value ?? "—";
    item.append(term, data);
    container.append(item);
  }

  function seconds(value) {
    return typeof value === "number" && Number.isFinite(value) ? `${value}s` : "—";
  }

  function percent(value) {
    return typeof value === "number" && Number.isFinite(value) ? `${value}%` : "—";
  }

  function render(result) {
    const analysis = result.analysis || {};
    const metrics = result.derived_metrics || {};
    content.replaceChildren();
    model.textContent = result.model || "—";
    source.textContent = result.source?.source_id || "—";
    panel.dataset.geminiRequests = String(result.diagnostics?.gemini_requests ?? 0);

    const heading = document.createElement("div");
    heading.className = "detail-heading-block";
    const title = document.createElement("h3");
    title.textContent = analysis.structure_label || "Deep Analysis";
    const summary = document.createElement("p");
    summary.className = "detail-summary";
    summary.textContent = analysis.summary || "요약 정보가 없습니다.";
    heading.append(title, summary);

    const facts = document.createElement("div");
    facts.className = "detail-facts";
    fact(facts, "Duration", seconds(analysis.duration_seconds));
    fact(facts, "Hook", analysis.hook?.type || "—");
    fact(facts, "Product first", seconds(metrics.product?.first_seen_seconds));
    fact(facts, "Product visible", percent(metrics.product?.visible_percent));
    fact(facts, "Demonstration", percent(metrics.demonstration?.combined_percent));
    fact(facts, "CTA first", seconds(metrics.cta?.first_seen_seconds));
    fact(facts, "Observation segments", String(Array.isArray(analysis.observation_segments) ? analysis.observation_segments.length : 0));
    fact(facts, "Analyzed coverage", percent(metrics.analyzed_coverage_percent));
    content.append(heading, facts);
    setStatus("READY", "ok");
  }

  async function parseError(response) {
    try {
      const body = await response.json();
      return body.error || body.message || body.code || `${response.status}`;
    } catch {
      return `${response.status} ${response.statusText}`.trim();
    }
  }

  async function analyze(url) {
    const response = await originalFetch(`${config.api_base_url}/masterv-api-boundary`, {
      method: "POST",
      headers: {
        apikey: config.supabase_publishable_key,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ operation: "youtube_deep_analysis", url })
    });
    if (!response.ok) throw new Error(`Hosted Deep Analysis ${await parseError(response)}`);
    const body = await response.json();
    if (body.contract_version !== config.api_contract_version || body.operation !== "youtube_deep_analysis" || body.provider !== "gemini") {
      throw new Error("Hosted Deep Analysis response contract mismatch");
    }
    if (body.provider_authority !== "hosted-secret" || body.compute_authority !== "hosted-deep-analysis" || body.analysis_tier !== "deep" || body.persistence_authority !== "none") {
      throw new Error("Hosted Deep Analysis authority mismatch");
    }
    if (!body.analysis || !body.derived_metrics || body.diagnostics?.gemini_requests !== 1 || body.diagnostics?.persistence_writes !== 0) {
      throw new Error("Hosted Deep Analysis response is incomplete");
    }
    return body;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!accessToken || !capabilityReady) return;
    const url = urlInput.value.trim();
    if (!url) return;
    submit.disabled = true;
    clearResult();
    setStatus("ANALYZING");
    try {
      const result = await analyze(url);
      render(result);
      panel.scrollIntoView({ block: "start" });
    } catch (error) {
      setStatus("ERROR", "error");
      const errorText = document.createElement("p");
      errorText.className = "library-state error-text";
      errorText.textContent = error instanceof Error ? error.message : String(error);
      content.replaceChildren(errorText);
    } finally {
      updateControl();
    }
  });

  urlInput.addEventListener("input", updateControl);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-discovery-source-id]") : null;
    if (!(target instanceof HTMLElement)) return;
    const discoveredUrl = target.querySelector(".discovery-url")?.textContent?.trim() || "";
    if (!discoveredUrl) return;
    urlInput.value = discoveredUrl;
    updateControl();
  });

  logout.addEventListener("click", clearState);
  clearState();
})();
