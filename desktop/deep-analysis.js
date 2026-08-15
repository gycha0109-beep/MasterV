(() => {
  const config = window.MASTERV_DESKTOP_CONFIG || {};
  const originalFetch = window.fetch.bind(window);
  const boundaryPath = "/functions/v1/masterv-api-boundary";
  const capDeep = document.getElementById("cap-deep-analysis");
  const capProductTruth = document.getElementById("cap-product-truth");
  const panel = document.getElementById("deep-analysis-panel");
  const form = document.getElementById("deep-analysis-form");
  const urlInput = document.getElementById("deep-analysis-url");
  const submit = document.getElementById("deep-analysis-submit");
  const status = document.getElementById("deep-analysis-status");
  const model = document.getElementById("deep-analysis-model");
  const source = document.getElementById("deep-analysis-source");
  const content = document.getElementById("deep-analysis-content");
  const productionPanel = document.getElementById("production-guidance-panel");
  const productionForm = document.getElementById("product-truth-form");
  const productName = document.getElementById("product-truth-name");
  const productTarget = document.getElementById("product-truth-target");
  const productPrice = document.getElementById("product-truth-price");
  const productFacts = document.getElementById("product-truth-facts");
  const productionSubmit = document.getElementById("production-guidance-submit");
  const productionStatus = document.getElementById("production-guidance-status");
  const productionModel = document.getElementById("production-guidance-model");
  const productionContent = document.getElementById("production-guidance-content");
  const logout = document.getElementById("logout-button");

  if (!capDeep || !capProductTruth || !panel || !form || !urlInput || !submit || !status || !model || !source || !content || !productionPanel || !productionForm || !productName || !productTarget || !productPrice || !productFacts || !productionSubmit || !productionStatus || !productionModel || !productionContent || !logout) return;

  let accessToken = "";
  let capabilityReady = false;
  let productionCapabilityReady = false;
  let capabilityProbeInFlight = false;
  let latestAnalysis = null;

  panel.dataset.providerAuthority = "hosted-secret";
  panel.dataset.providerCredentialsInClient = "false";
  panel.dataset.computeAuthority = "hosted-deep-analysis";
  panel.dataset.analysisTier = "deep";
  panel.dataset.persistenceAuthority = "none";
  panel.dataset.geminiRequests = "0";

  productionPanel.dataset.providerAuthority = "hosted-secret";
  productionPanel.dataset.providerCredentialsInClient = "false";
  productionPanel.dataset.computeAuthority = "hosted-production-guidance";
  productionPanel.dataset.productTruthAuthority = "user-input-raw";
  productionPanel.dataset.referenceAnalysisAuthority = "validated-hosted-result-transit";
  productionPanel.dataset.metricsAuthority = "server-derived";
  productionPanel.dataset.persistenceAuthority = "none";
  productionPanel.dataset.backgroundBatchMigrated = "false";
  productionPanel.dataset.geminiRequests = "0";
  productionPanel.dataset.persistenceWrites = "0";
  productionPanel.dataset.backgroundBatchRequests = "0";

  function setStatus(text, tone = "") {
    status.textContent = text;
    status.classList.toggle("ok", tone === "ok");
    status.classList.toggle("error", tone === "error");
  }

  function setProductionStatus(text, tone = "") {
    productionStatus.textContent = text;
    productionStatus.classList.toggle("ok", tone === "ok");
    productionStatus.classList.toggle("error", tone === "error");
  }

  function setCapability(value) {
    capabilityReady = value === true;
    capDeep.textContent = value === true ? "READY" : value === false ? "PENDING" : "—";
    panel.hidden = !accessToken;
    setStatus(accessToken ? (capabilityReady ? "READY" : "NOT CONFIGURED") : "SIGNED OUT", accessToken && capabilityReady ? "ok" : accessToken ? "error" : "");
    updateControl();
  }

  function setProductionCapability(value) {
    productionCapabilityReady = value === true;
    capProductTruth.textContent = value === true ? "READY" : value === false ? "PENDING" : "—";
    if (!accessToken || !latestAnalysis) productionPanel.hidden = true;
    setProductionStatus(accessToken ? (productionCapabilityReady ? (latestAnalysis ? "READY" : "WAITING FOR ANALYSIS") : "NOT CONFIGURED") : "SIGNED OUT", accessToken && productionCapabilityReady && latestAnalysis ? "ok" : accessToken && !productionCapabilityReady ? "error" : "");
    updateProductionControl();
  }

  function hasProductTruthInput() {
    return Boolean(productName.value || productTarget.value || productPrice.value || productFacts.value);
  }

  function updateControl() {
    submit.disabled = !accessToken || !capabilityReady || !urlInput.value.trim();
  }

  function updateProductionControl() {
    productionSubmit.disabled = !accessToken || !productionCapabilityReady || !latestAnalysis || !hasProductTruthInput();
  }

  function clearProductionOutput() {
    productionContent.replaceChildren();
    productionModel.textContent = "—";
    productionPanel.dataset.geminiRequests = "0";
    productionPanel.dataset.persistenceWrites = "0";
    productionPanel.dataset.backgroundBatchRequests = "0";
  }

  function clearProductionState({ clearInputs = true, hide = true } = {}) {
    latestAnalysis = null;
    clearProductionOutput();
    if (clearInputs) {
      productName.value = "";
      productTarget.value = "";
      productPrice.value = "";
      productFacts.value = "";
    }
    if (hide) productionPanel.hidden = true;
    setProductionStatus(accessToken ? (productionCapabilityReady ? "WAITING FOR ANALYSIS" : "NOT CONFIGURED") : "SIGNED OUT", accessToken && !productionCapabilityReady ? "error" : "");
    updateProductionControl();
  }

  function clearResult() {
    content.replaceChildren();
    model.textContent = "—";
    source.textContent = "—";
    panel.dataset.geminiRequests = "0";
    clearProductionState({ clearInputs: true, hide: true });
  }

  function clearState() {
    accessToken = "";
    capabilityReady = false;
    productionCapabilityReady = false;
    urlInput.value = "";
    clearResult();
    panel.hidden = true;
    productionPanel.hidden = true;
    setCapability(null);
    setProductionCapability(null);
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
      const productionRouteReady = body.capabilities?.product_truth_route === true && body.capabilities?.production_guidance_route === true;
      setProductionCapability(productionRouteReady && body.capabilities.product_truth === true && body.capabilities.production_guidance === true);
    } catch {
      setCapability(false);
      setProductionCapability(false);
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
    latestAnalysis = analysis;
    productionPanel.hidden = false;
    clearProductionOutput();
    setProductionStatus(productionCapabilityReady ? "READY" : "NOT CONFIGURED", productionCapabilityReady ? "ok" : "error");
    updateProductionControl();
    setStatus("READY", "ok");
  }

  function productTruthPayload() {
    return {
      product_name: productName.value,
      verified_facts: productFacts.value,
      target_customer: productTarget.value,
      price_offer: productPrice.value
    };
  }

  function renderListCard(container, titleText, items) {
    const card = document.createElement("article");
    card.className = "compare-card";
    const title = document.createElement("h3");
    title.textContent = titleText;
    const list = document.createElement("ul");
    list.className = "muted small";
    for (const text of items) {
      const item = document.createElement("li");
      item.textContent = text;
      list.append(item);
    }
    card.append(title, list);
    container.append(card);
  }

  function renderProductionGuidance(result) {
    const guide = result.guide || {};
    clearProductionOutput();
    productionModel.textContent = result.model || "NO GEMINI";
    productionPanel.dataset.geminiRequests = String(result.diagnostics?.gemini_requests ?? 0);
    productionPanel.dataset.persistenceWrites = String(result.diagnostics?.persistence_writes ?? 0);
    productionPanel.dataset.backgroundBatchRequests = String(result.diagnostics?.background_batch_requests ?? 0);

    const heading = document.createElement("div");
    heading.className = "detail-heading-block";
    const title = document.createElement("h3");
    title.textContent = "내 상품용 제작 가이드";
    const summary = document.createElement("p");
    summary.className = "detail-summary";
    summary.textContent = guide.direction_summary || "제작 방향을 생성하지 못했습니다.";
    heading.append(title, summary);

    const facts = document.createElement("div");
    facts.className = "detail-facts";
    fact(facts, "Product Truth", result.product_truth_authority || "—");
    fact(facts, "Reference analysis", result.reference_analysis_authority || "—");
    fact(facts, "Metrics", result.metrics_authority || "—");
    fact(facts, "Interpretation", guide.interpretation_ready ? "READY" : guide.interpretation_required ? "REQUIRED" : "NOT REQUIRED");
    fact(facts, "Persistence", result.persistence_authority || "—");
    fact(facts, "Gemini requests", String(result.diagnostics?.gemini_requests ?? 0));
    productionContent.append(heading, facts);

    const stepsTitle = document.createElement("h3");
    stepsTitle.textContent = "추천 제작 흐름";
    const steps = document.createElement("div");
    steps.className = "compare-grid";
    for (const step of guide.production_steps || []) {
      const card = document.createElement("article");
      card.className = "compare-card";
      const name = document.createElement("h3");
      name.textContent = step.title || "제작 단계";
      const detail = document.createElement("p");
      detail.className = "compare-summary";
      detail.textContent = step.detail || "";
      card.append(name, detail);
      steps.append(card);
    }
    productionContent.append(stepsTitle, steps);

    const assetGrid = document.createElement("div");
    assetGrid.className = "compare-grid";
    for (const group of guide.asset_groups || []) {
      renderListCard(assetGrid, `${group.icon || ""} ${group.title || "준비 소재"}`.trim(), Array.isArray(group.items) ? group.items : []);
    }
    if (assetGrid.childElementCount > 0) {
      const assetTitle = document.createElement("h3");
      assetTitle.textContent = "준비할 소재";
      productionContent.append(assetTitle, assetGrid);
    }

    if (Array.isArray(guide.critical_warnings) && guide.critical_warnings.length > 0) {
      const warningGrid = document.createElement("div");
      warningGrid.className = "compare-grid";
      renderListCard(warningGrid, "제작 전 확인", guide.critical_warnings);
      productionContent.append(warningGrid);
    }

    const promptTitle = document.createElement("h3");
    promptTitle.textContent = "AI 작업 프롬프트";
    const promptGrid = document.createElement("div");
    promptGrid.className = "compare-grid";
    const labels = { script: "대본 만들기", shooting: "촬영 계획", assets: "소재 목록", editing: "편집 지시" };
    for (const [kind, label] of Object.entries(labels)) {
      const prompt = guide.prompts?.[kind];
      if (!prompt) continue;
      const card = document.createElement("article");
      card.className = "compare-card";
      const name = document.createElement("h3");
      name.textContent = label;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary compact";
      button.dataset.productionPromptKind = kind;
      button.textContent = "프롬프트 복사";
      button.addEventListener("click", async () => {
        await navigator.clipboard.writeText(prompt);
        button.textContent = "복사됨";
        window.setTimeout(() => { button.textContent = "프롬프트 복사"; }, 1200);
      });
      card.append(name, button);
      promptGrid.append(card);
    }
    productionContent.append(promptTitle, promptGrid);
    setProductionStatus("READY", "ok");
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

  async function compileProduction(productTruth) {
    const request = { operation: "production_guidance", analysis: latestAnalysis, product_truth: productTruth };
    const response = await originalFetch(`${config.api_base_url}/masterv-api-boundary`, {
      method: "POST",
      headers: {
        apikey: config.supabase_publishable_key,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(`Hosted Production Guidance ${await parseError(response)}`);
    const body = await response.json();
    if (body.contract_version !== config.api_contract_version || body.operation !== "production_guidance") {
      throw new Error("Hosted Production Guidance response contract mismatch");
    }
    if (body.provider_authority !== "hosted-secret" || body.compute_authority !== "hosted-production-guidance" || body.product_truth_authority !== "user-input-raw" || body.reference_analysis_authority !== "validated-hosted-result-transit" || body.metrics_authority !== "server-derived" || body.persistence_authority !== "none") {
      throw new Error("Hosted Production Guidance authority mismatch");
    }
    if (!body.guide || body.diagnostics?.persistence_writes !== 0 || body.diagnostics?.background_batch_requests !== 0) {
      throw new Error("Hosted Production Guidance response is incomplete");
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

  productionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!accessToken || !productionCapabilityReady || !latestAnalysis || !hasProductTruthInput()) return;
    productionSubmit.disabled = true;
    clearProductionOutput();
    setProductionStatus("COMPILING");
    try {
      const result = await compileProduction(productTruthPayload());
      renderProductionGuidance(result);
      productionPanel.scrollIntoView({ block: "start" });
    } catch (error) {
      setProductionStatus("ERROR", "error");
      const errorText = document.createElement("p");
      errorText.className = "library-state error-text";
      errorText.textContent = error instanceof Error ? error.message : String(error);
      productionContent.replaceChildren(errorText);
    } finally {
      updateProductionControl();
    }
  });

  urlInput.addEventListener("input", () => {
    clearProductionState({ clearInputs: true, hide: true });
    updateControl();
  });
  for (const input of [productName, productTarget, productPrice, productFacts]) input.addEventListener("input", updateProductionControl);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-discovery-source-id]") : null;
    if (!(target instanceof HTMLElement)) return;
    const discoveredUrl = target.querySelector(".discovery-url")?.textContent?.trim() || "";
    if (!discoveredUrl) return;
    urlInput.value = discoveredUrl;
    clearProductionState({ clearInputs: true, hide: true });
    updateControl();
  });

  logout.addEventListener("click", clearState);
  clearState();
})();
