(() => {
  "use strict";

  function initialize(backend) {
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

  if (!backend || !capDeep || !capProductTruth || !panel || !form || !urlInput || !submit || !status || !model || !source || !content || !productionPanel || !productionForm || !productName || !productTarget || !productPrice || !productFacts || !productionSubmit || !productionStatus || !productionModel || !productionContent || !logout) return;

  let session = null;
  let capabilityReady = false;
  let productionCapabilityReady = false;
  let latestAnalysis = null;
  let compiledProductTruthSnapshot = "";
  let productionReadyStatus = "READY";

  panel.dataset.providerAuthority = "hosted-secret";
  panel.dataset.providerCredentialsInClient = "false";
  panel.dataset.computeAuthority = "hosted-deep-analysis";
  panel.dataset.analysisTier = "deep";
  panel.dataset.persistenceAuthority = "none";
  panel.dataset.transportAuthority = "backend-provider";
  panel.dataset.geminiRequests = "0";

  productionPanel.dataset.providerAuthority = "hosted-secret";
  productionPanel.dataset.providerCredentialsInClient = "false";
  productionPanel.dataset.computeAuthority = "hosted-production-guidance";
  productionPanel.dataset.productTruthAuthority = "user-input-raw";
  productionPanel.dataset.referenceAnalysisAuthority = "validated-hosted-result-transit";
  productionPanel.dataset.metricsAuthority = "server-derived";
  productionPanel.dataset.persistenceAuthority = "none";
  productionPanel.dataset.backgroundBatchMigrated = "false";
  productionPanel.dataset.transportAuthority = "backend-provider";
  productionPanel.dataset.geminiRequests = "0";
  productionPanel.dataset.persistenceWrites = "0";
  productionPanel.dataset.backgroundBatchRequests = "0";
  productionPanel.dataset.guidanceStale = "false";
  productionPanel.dataset.promptPreviewLabel = "프롬프트 미리보기";

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
    panel.hidden = !session;
    setStatus(session ? (capabilityReady ? "READY" : "NOT CONFIGURED") : "SIGNED OUT", session && capabilityReady ? "ok" : session ? "error" : "");
    updateControl();
  }

  function setProductionCapability(value) {
    productionCapabilityReady = value === true;
    capProductTruth.textContent = value === true ? "READY" : value === false ? "PENDING" : "—";
    if (!session || !latestAnalysis) productionPanel.hidden = true;
    setProductionStatus(session ? (productionCapabilityReady ? (latestAnalysis ? "READY" : "WAITING FOR ANALYSIS") : "NOT CONFIGURED") : "SIGNED OUT", session && productionCapabilityReady && latestAnalysis ? "ok" : session && !productionCapabilityReady ? "error" : "");
    updateProductionControl();
  }

  function applyCapabilityBody(body) {
    const capabilities = body?.capabilities;
    if (capabilities?.deep_analysis_route !== true) return false;
    setCapability(capabilities.deep_analysis === true);
    const productionRouteReady = capabilities.product_truth_route === true && capabilities.production_guidance_route === true;
    setProductionCapability(productionRouteReady && capabilities.product_truth === true && capabilities.production_guidance === true);
    return true;
  }

  function hasProductTruthInput() {
    return Boolean(productName.value || productTarget.value || productPrice.value || productFacts.value);
  }

  function updateControl() {
    submit.disabled = !session || !capabilityReady || !urlInput.value.trim();
  }

  function updateProductionControl() {
    productionSubmit.disabled = !session || !productionCapabilityReady || !latestAnalysis || !hasProductTruthInput();
  }

  function productTruthPayload() {
    return {
      product_name: productName.value,
      verified_facts: productFacts.value,
      target_customer: productTarget.value,
      price_offer: productPrice.value
    };
  }

  function productTruthSnapshot() {
    return JSON.stringify(productTruthPayload());
  }

  function setPromptActionsDisabled(disabled) {
    for (const button of productionContent.querySelectorAll("[data-production-prompt-kind], [data-production-prompt-all]")) {
      if (button instanceof HTMLButtonElement) button.disabled = disabled;
    }
  }

  function syncGuidanceStaleState() {
    if (!compiledProductTruthSnapshot) return;
    const stale = productTruthSnapshot() !== compiledProductTruthSnapshot;
    productionPanel.dataset.guidanceStale = stale ? "true" : "false";
    const promptSurface = productionContent.querySelector("[data-production-prompt-surface]");
    if (promptSurface instanceof HTMLElement) promptSurface.hidden = stale;
    setPromptActionsDisabled(stale);
    let notice = productionContent.querySelector("#production-guidance-stale-notice");
    if (stale) {
      if (!notice) {
        notice = document.createElement("p");
        notice.id = "production-guidance-stale-notice";
        notice.className = "library-state error-text";
        notice.textContent = "상품 정보가 변경되었습니다. 기존 프롬프트는 사용할 수 없습니다. 제작안을 다시 생성해주세요.";
        productionContent.prepend(notice);
      }
      setProductionStatus("STALE", "error");
      return;
    }
    notice?.remove();
    setProductionStatus(productionReadyStatus, "ok");
  }

  function clearProductionOutput() {
    productionContent.replaceChildren();
    productionModel.textContent = "—";
    productionPanel.dataset.geminiRequests = "0";
    productionPanel.dataset.persistenceWrites = "0";
    productionPanel.dataset.backgroundBatchRequests = "0";
    productionPanel.dataset.guidanceStale = "false";
    compiledProductTruthSnapshot = "";
    productionReadyStatus = "READY";
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
    setProductionStatus(session ? (productionCapabilityReady ? "WAITING FOR ANALYSIS" : "NOT CONFIGURED") : "SIGNED OUT", session && !productionCapabilityReady ? "error" : "");
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
    session = null;
    capabilityReady = false;
    productionCapabilityReady = false;
    urlInput.value = "";
    clearResult();
    panel.hidden = true;
    productionPanel.hidden = true;
    setCapability(null);
    setProductionCapability(null);
  }

  function organizeDeveloperDiagnostics() {
    if (document.getElementById("developer-diagnostics")) return;
    const capabilityCard = capDeep.closest("article.card");
    const backgroundBatch = document.getElementById("background-batch-panel");
    const roadmap = document.querySelector(".roadmap");
    if (!(capabilityCard instanceof HTMLElement) || !(backgroundBatch instanceof HTMLElement) || !(roadmap instanceof HTMLElement) || !roadmap.parentElement) return;
    const grid = capabilityCard.parentElement;
    if (grid?.classList.contains("grid")) grid.style.gridTemplateColumns = "1fr";
    const diagnostics = document.createElement("details");
    diagnostics.id = "developer-diagnostics";
    diagnostics.className = "card";
    diagnostics.dataset.productSurface = "developer-diagnostics";
    diagnostics.style.marginBottom = "20px";
    const summary = document.createElement("summary");
    summary.style.cursor = "pointer";
    summary.style.fontWeight = "800";
    summary.style.color = "#dfe7f7";
    summary.textContent = "개발자 진단 / 실험 기능";
    const note = document.createElement("p");
    note.className = "muted small";
    note.style.margin = "12px 0 18px";
    note.textContent = "서버 경계, Surface Migration, 아직 차단된 Background Batch는 일반 제작 흐름과 분리해 둡니다.";
    const body = document.createElement("div");
    body.style.display = "grid";
    body.style.gap = "16px";
    roadmap.parentElement.insertBefore(diagnostics, roadmap);
    diagnostics.append(summary, note, body);
    body.append(capabilityCard, backgroundBatch, roadmap);
  }

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

  const productionRenderer = window.MASTERV_PRODUCTION_GUIDANCE_RENDERER?.create({
    productionContent,
    productionModel,
    productionPanel,
    clearProductionOutput,
    fact,
    productTruthSnapshot,
    setProductionStatus,
    onCompiled(snapshot, readyStatus) {
      compiledProductTruthSnapshot = snapshot;
      productionReadyStatus = readyStatus;
    }
  });
  if (!productionRenderer) throw new Error("MasterV Production Guidance renderer was not initialized before Deep Analysis");

  function renderProductionGuidance(result) {
    productionRenderer.render(result);
  }

  async function analyze(url) {
    return await backend.remoteOperations.analyzeYouTube(session, url);
  }

  async function compileProduction(productTruth) {
    const request = { operation: "production_guidance", analysis: latestAnalysis, product_truth: productTruth };
    return await backend.remoteOperations.generateProductionGuidance(session, request.analysis, request.product_truth);
  }

  backend.session.subscribe((nextSession) => {
    if (!nextSession) {
      clearState();
      return;
    }
    session = nextSession;
    panel.hidden = false;
    setStatus("CHECK REQUIRED");
    const cached = backend.remoteOperations.currentCapabilities();
    if (cached) applyCapabilityBody(cached);
    else {
      setCapability(null);
      setProductionCapability(null);
    }
  });

  backend.remoteOperations.subscribeCapabilities((body) => {
    if (!session || !body) return;
    if (!applyCapabilityBody(body)) {
      setCapability(false);
      setProductionCapability(false);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session || !capabilityReady) return;
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
    if (!session || !productionCapabilityReady || !latestAnalysis || !hasProductTruthInput()) return;
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
  for (const input of [productName, productTarget, productPrice, productFacts]) {
    input.addEventListener("input", () => {
      syncGuidanceStaleState();
      updateProductionControl();
    });
  }
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
  organizeDeveloperDiagnostics();
  }

  if (window.MASTERV_BACKEND) initialize(window.MASTERV_BACKEND);
  else window.addEventListener("masterv:backend-ready", () => initialize(window.MASTERV_BACKEND), { once: true });
})();