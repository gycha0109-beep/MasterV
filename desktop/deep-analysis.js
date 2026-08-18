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
    capDeep.textContent = value === true ? "READY" : value === false ? "PENDING" : "â€”";
    panel.hidden = !session;
    setStatus(session ? (capabilityReady ? "READY" : "NOT CONFIGURED") : "SIGNED OUT", session && capabilityReady ? "ok" : session ? "error" : "");
    updateControl();
  }

  function setProductionCapability(value) {
    productionCapabilityReady = value === true;
    capProductTruth.textContent = value === true ? "READY" : value === false ? "PENDING" : "â€”";
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
        notice.textContent = "ìƒí’ˆ ì •ë³´ê°€ ë³€ê²½ë˜ì—ˆìŠµë‹ˆë‹¤. ê¸°ì¡´ í”„ë¡¬í”„íŠ¸ëŠ” ì‚¬ìš©í•  ìˆ˜ ì—†ìŠµë‹ˆë‹¤. ì œìž‘ì•ˆì„ ë‹¤ì‹œ ìƒì„±í•´ì£¼ì„¸ìš”.";
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
    productionModel.textContent = "â€”";
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
    model.textContent = "â€”";
    source.textContent = "â€”";
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
    summary.textContent = "ê°œë°œìž ì§„ë‹¨ / ì‹¤í—˜ ê¸°ëŠ¥";
    const note = document.createElement("p");
    note.className = "muted small";
    note.style.margin = "12px 0 18px";
    note.textContent = "ì„œë²„ ê²½ê³„, Surface Migration, ì•„ì§ ì°¨ëŠ”ë œ Background BatchëŠ” ì¼ë°˜ ì œìž‘ í•˜ë¦„ ì•´ë¹„ê³ ìž í”„ë¦„í”Œí”Œì´ì™€ ë¶„ë¦¬í•´ë‘ˆë‹ˆë‹¤.";
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
    data.textContent = value ?? "â€”";
    item.append(term, data);
    container.append(item);
  }

  function seconds(value) {
    return typeof value === "number" && Number.isFinite(value) ? `${value}s` : "â€”";
  }

  function percent(value) {
    return typeof value === "number" && Number.isFinite(value) ? `${value}%` : "â€”";
  }

  function render(result) {
    const analysis = result.analysis || {};
    const metrics = result.derived_metrics || {};
    content.replaceChildren();
    model.textContent = result.model || "â€”";
    source.textContent = result.source?.source_id || "â€”";
    panel.dataset.geminiRequests = String(result.diagnostics?.gemini_requests ?? 0);
    const heading = document.createElement("div");
    heading.className = "detail-heading-block";
    const title = document.createElement("h3");
    title.textContent = analysis.structure_label || "Deep Analysis";
    const summary = document.createElement("p");
    summary.className = "detail-summary";
    summary.textContent = analysis.summary || "ìš”ì•½ ì •ë³´ê°€ ì—†ìŠµë‹ˆë‹¤.";
    heading.append(title, summary);
    const facts = document.createElement("div");
    facts.className = "detail-facts";
    fact(facts, "Duration", seconds(analysis.duration_seconds));
    fact(facts, "Hook", analysis.hook?.type || "â€”");
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

  function promptPreview(prompt) {
    const singleLine = String(prompt || "").replace(/\s+/g, " ").trim();
    return singleLine.length > 360 ? `${singleLine.slice(0, 360)}â€¦" : singleLine;
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
    title.textContent = "ë‚´ ìƒí’ˆìš© ì œìž‘ê°ƒ²vÓ®Npˆì(€€€½¹ÍÐÍÕµµ…Éä€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰Àˆ¤ì(€€€ÍÕµµ…Éä¹±…ÍÍ9…µ”€ô€‰‘•Ñ…¥°µÍÕµµ…Éäˆì(€€€ÍÕµµ…Éä¹Ñ•áÑ½¹Ñ•¹Ð€ôÕ¥‘”¹‘¥É•Ñ¥½¹}ÍÕµµ…Éäñð€‹²‚s²zG¶V¤ƒ²vÓ¶Z—²vƒ²vÆ‡F’²ž®ž$ƒ¶Vc²ž ƒ®ªã²ZÓ²*×®.#®.¸ˆì(€€€¡•…‘¥¹œ¹…ÁÁ•¹¡Ñ¥Ñ±”°ÍÕµµ…Éä¤ì(€€€½¹ÍÐ™…ÑÌ€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰‘¥Øˆ¤ì(€€€™…ÑÌ¹±…ÍÍ9…µ”€ô€‰‘•Ñ…¥°µ™…ÑÌˆì(€€€™…Ð¡™…ÑÌ°€‰AÉ½‘ÕÐQÉÕÑ ˆ°É•ÍÕ±Ð¹ÁÉ½‘ÕÑ}ÑÉÕÑ¡}…ÕÑ¡½É¥Ñäñð€‹ŠPˆ¤ì(€€€™…Ð¡™…ÑÌ°€‰I•™•É•¹”…¹…±åÍ¥Ìˆ°É•ÍÕ±Ð¹É•™•É•¹•}…¹…±åÍ¥Í}…ÕÑ¡½É¥Ñäñð€‹ŠPˆ¤ì(€€€™…Ð¡™…ÑÌ°€‰5•ÑÉ¥Ìˆ°É•ÍÕ±Ð¹µ•ÑÉ¥Í}…ÕÑ¡½É¥Ñäñð€‹ŠPˆ¤ì(€€€™…Ð¡™…ÑÌ°€‰%¹Ñ•ÉÁÉ•Ñ…Ñ¥½¸ˆ°Õ¥‘”¹¥¹Ñ•ÉÁÉ•Ñ…Ñ¥½¹}É•…‘ä€ü€‰Idˆ€èÕ¥‘”¹¥¹Ñ•ÉÁÉ•Ñ…Ñ¥½¹}É•ÅÕ¥É•€ü€‰IEU%Iˆ€è€‰9=PIEU%Iˆ¤ì(€€€™…Ð¡™…ÑÌ°€‰A•ÉÍ¥ÍÑ•¹”ˆ°É•ÍÕ±Ð¹Á•ÉÍ¥ÍÑ•¹•}…ÕÑ¡½É¥Ñäñð€‹ŠPˆ¤ì(€€€™…Ð¡™…ÑÌ°€‰•µ¥¹¤É•ÅÕ•ÍÑÌˆ°MÑÉ¥¹œ¡É•ÍÕ±Ð¹‘¥…¹½ÍÑ¥Ìü¹•µ¥¹¥}É•ÅÕ•ÍÑÌ€üü€À¤¤ì(€€€ÁÉ½‘ÕÑ¥½¹½¹Ñ•¹Ð¹…ÁÁ•¹¡¡•…‘¥¹œ°™…ÑÌ¤ì(€€€½¹ÍÐÍÑ•ÁÍQ¥Ñ±”€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰ Ìˆ¤ì(€€€ÍÑ•ÁÍQ¥Ñ±”¹Ñ•áÑ½¹Ñ•¹Ð€ô€‹²ÚS²Êpƒ²‚s²zDƒ¶vC®š²jÀˆì(€€€½¹ÍÐÍÑ•ÁÌ€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰‘¥Øˆ¤ì(€€€ÍÑ•ÁÌ¹±…ÍÍ9…µ”€ô€‰½µÁ…É”µÉ¥ˆì(€€€™½È€¡½¹ÍÐÍÑ•À½˜Õ¥‘”¹ÁÉ½‘ÕÑ¥½¹}ÍÑ•ÁÌñðmt¤ì(€€€€€½¹ÍÐ…É€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰…ÉÑ¥±”ˆ¤ì(€€€€€…É¹±…ÍÍ9…µ”€ô€‰½µÁ…É”µ…Éˆì(€€€€€½¹ÍÐ¹…µ”€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰ Ìˆ¤ì(€€€€€¹…µ”¹Ñ•áÑ½¹Ñ•¹Ð€ôÍÑ•À¹Ñ¥Ñ±”ñð€‹²‚s²zDƒ®.£ªÎˆì(€€€€€½¹ÍÐ‘•Ñ…¥°€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰Àˆ¤ì(€€€€€‘•Ñ…¥°¹±…ÍÍ9…µ”€ô€‰½µÁ…É”µÍÕµµ…Éäˆì(€€€€€‘•Ñ…¥°¹Ñ•áÑ½¹Ñ•¹Ð€ôÍÑ•À¹‘•Ñ…¥°ñð€ˆˆì(€€€€€…É¹…ÁÁ•¹¡¹…µ”°‘•Ñ…¥°¤ì(€€€€€ÍÑ•ÁÌ¹…ÁÁ•¹¡…É¤ì(€€€ô(€€€ÁÉ½‘ÕÑ¥½¹½¹Ñ•¹Ð¹…ÁÁ•¹¡ÍÑ•ÁÍQ¥Ñ±”°ÍÑ•ÁÌ¤ì(€€€½¹ÍÐ…ÍÍ•ÑÉ¥€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰‘¥Øˆ¤ì(€€€…ÍÍ•ÑÉ¥¹±…ÍÍ9…µ”€ô€‰½µÁ…É”µÉ¥ˆì(€€€™½È€¡½¹ÍÐÉ½ÕÀ½˜Õ¥‘”¹…ÍÍ•Ñ}É½ÕÁÌñðmt¤ì(€€€€€É•¹‘•É1¥ÍÑ…É¡…ÍÍ•ÑÉ¥°€‘íÉ½ÕÀ¹¥½¸ñð€ˆ‰ô€‘íÉ½ÕÀ¹Ñ¥Ñ±”ñð€‹²’®æ²7²z°Š&¤¹ÑÉ¥´ ¤°ÉÉ…ä¹¥ÍÉÉ…ä¡É½ÕÀ¹¥Ñ•µÌ¤€üÉ½ÕÀ¹¥Ñ•µÌ€èmt¤ì(€€€ô(€€€¥˜€¡…ÍÍ•ÑÉ¥¹¡¥±‘±•µ•¹Ñ½Õ¹Ð€ø€À¤ì(€€€€€½¹ÍÐ…ÍÍ•ÑQ¥Ñ±”€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰ Ìˆ¤ì(€€€€€…ÍÍ•ÑQ¥Ñ±”¹Ñ•áÑ½¹Ñ•¹Ð€ô€‹²’®æ¶V„ƒ²7²z°ˆì(€€€€€ÁÉ½‘ÕÑ¥½¹½¹Ñ•¹Ð¹…ÁÁ•¹¡…ÍÍ•ÑQ¥Ñ±”°…ÍÍ•ÑÉ¥¤ì(€€€ô(€€€¥˜€¡ÉÉ…ä¹¥ÍÉÉ…ä¡Õ¥‘”¹É¥Ñ¥…±}Ý…É¹¥¹Ì¤€˜˜Õ¥‘”¹É¥Ñ¥…±}Ý…É¹¥¹Ì¹±•¹Ñ €ø€À¤ì(€€€€€½¹ÍÐÝ…É¹¥¹É¥€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰‘¥Øˆ¤ì(€€€€€Ý…É¹¥¹É¥¹±…ÍÍ9…µ”€ô€‰½µÁ…É”µÉ¥ˆì(€€€€€É•¹‘•É1¥ÍÑ…É¡Ý…É¹¥¹É¥°€‹²‚s²zG¶V`ƒ²‚ƒ¶fW²vàˆ°Õ¥‘”¹É¥Ñ¥…±}Ý…É¹¥¹Ì¤ì(€€€€€ÁÉ½‘ÕÑ¥½¹½¹Ñ•¹Ð¹…ÁÁ•¹¡Ý…É¹¥¹É¥¤ì(€€€ô(€€€½¹ÍÐ•á±Õ‘•‘½Õ¹Ð€ôÉÉ…ä¹¥ÍÉÉ…ä¡Õ¥‘”¹•á±Õ‘•‘}É•™•É•¹•}µ•¡…¹¥ÍµÌ¤€üÕ¥‘”¹•á±Õ‘•‘}É•™•É•¹•}µ•¡…¹¥ÍµÌ¹±•¹Ñ €è€Àì(€€€¥˜€¡•á±Õ‘•‘½Õ¹Ð€ø€À¤ì(€€€€€½¹ÍÐÍ…™•9½Ñ¥”€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰Àˆ¤ì(€€€€€Í…™•9½Ñ¥”¹±…ÍÍ9…µ”€ô€‰±¥‰É…ÉäµÍÑ…Ñ”ˆì(€€€€€Í…™•9½Ñ¥”¹Ñ•áÑ½¹Ñ•¹Ð€ôƒ²ÂãªÎ€ƒ®¦S²î“®.#²š`€‘í•á±Õ‘•‘½Õ¹Ñ÷ªÂs®*ƒ®
`ƒ²¶J ƒ²‚W®ÎÓ²f ƒ²^ÃªÊÃ²vÐƒ®Ú#¶fW².“¶VcªÆÃ®
c®
`ƒ²‚²j§¶V€ƒ²"`ƒ².s²‚¶VÐƒ²"`ƒ²^²ZÓ²*×®.#®.¸ƒ²‚s²zDƒ²V#²vƒ®.“².pƒ²
³²j§¶V€ƒ²Vó²‚s¶V#²*×®.#®.¹€ìì(€€€€€ÁÉ½‘ÕÑ¥½¹½¹Ñ•¹Ð¹…ÁÁ•¹¡Í…™•9½Ñ¥”¤ì(€€€ô(€€€½¹ÍÐÁÉ½µÁÑMÕÉ™…”€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰Í•Ñ¥½¸ˆ¤ì(€€€ÁÉ½µÁÑMÕÉ™…”¹‘…Ñ…Í•Ð¹ÁÉ½‘ÕÑ¥½¹AÉ½µÁÑMÕÉ™…”€ô€‰É•…‘äˆì(€€€ÁÉ½µÁÑMÕÉ™…”¹ÍÑå±”¹µ…É¥¹Q½À€ô€ˆÈÁÁàˆì(€€€½¹ÍÐÁÉ½µÁÑQ¥Ñ±”€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰ Ìˆ¤ì(€€€ÁÉ½µÁÑQ¥Ñ±”¹Ñ•áÑ½¹Ñ•¹Ð€ô€‰'¶Vs¶0ƒ®žgªâÀˆì(€€€½¹ÍÐÁÉ½µÁÑáÁ±…¹…Ñ¥½¸€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰Àˆ¤ì(€€€ÁÉ½µÁÑáÁ±…¹…Ñ¥½¸¹±…ÍÍ9…µ”€ô€‰µÕÑ•Íµ…±°ˆì(€€€ÁÉ½µÁÑáÁ±…¹…Ñ¥½¸¹Ñ•áÑ½¹Ñ•¹Ð€ô€‹²vÐƒ¶R®†³¶R¶*ã¶*Pƒ²Âã²F£²b²²v`ƒ²‚s²zGªÂ«ZÎÊÂÈIÎ»N«¸ºNÈ¹Â«8NÈ+ÙYÂ»˜NÈIÞÉxŽÉØBÊxÙÂÂÈ*ÎÉªžÉé«Éè^º
^ÙYÂ&öGV7BG'WFŽÉ˜«;ÎÉêR»
žÊx«yÎË™žÉØBÊÙZžÙZž¸¸Ž¸ºBâËŽ«:ÉˆÈ8ÉÙ‚È8Ù(‚Ê;ÎÉê^ÉÛN¸)‚ÈªNØéžÉØB¸+BÈ8Ù(‚È*ÎÈºNºÂ»;^È*ÎÙYŽÊxÉX®È«^¸¸Ž¸ºBâ#°¢6öç7B&ö×Dw&–BÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢&ö×Dw&–Bæ6Æ74æÖRÒ&6ö×&RÖw&–B#°¢6öç7BÆ&VÇ2Ò²67&—C¢.¸È»;‚ºxÎ¹:N«‹"Â6†ö÷F–æs¢.ËJÎÉˆ«8NÙ¨Ò"Â76WG3¢.ÈhÎÉêÂºªžºÒ"ÂVF—F–æs¢.ØëŽÊyÊxÈ¹Â"Ó°¢f÷"†6öç7B¶¶–æBÂÆ&VÅÒöbö&¦V7BæVçG&–W2†Æ&VÇ2’’°¢6öç7B&ö×BÒwV–FRç&ö×G3òå¶¶–æEÓ°¢–b‚&ö×B’6öçF–çVS°¢6öç7B6&BÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&'F–6ÆR"“°¢6&Bæ6Æ74æÖRÒ&6ö×&RÖ6&B#°¢6öç7BæÖRÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&ƒ2"“°¢æÖRçFW‡D6öçFVçBÒÆ&VÃ°¢6öç7B&Wf–WtÆ&VÂÒFö7VÖVçBæ7&VFTVÆVÖVçB‚'7â"“°¢&Wf–WtÆ&VÂæ6Æ74æÖRÒ&W–V'&÷r#°¢&Wf–WtÆ&VÂçFW‡D6öçFVçBÒ.ÙHNºÎÙHNØ«‚ºûŽºjÎ»;N«‹#°¢6öç7B&Wf–WrÒFö7VÖVçBæ7&VFTVÆVÖVçB‚'"“°¢&Wf–Wræ6Æ74æÖRÒ&×WFVB6ÖÆÂ#°¢&Wf–Wrç7G–ÆRæÖ–ä†V–v‡BÒ#S‡‚#°¢&Wf–WrçFW‡D6öçFVçBÒ&ö×E&Wf–Wr‡&ö×B“°¢6öç7B'WGFöâÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&'WGFöâ"“°¢'WGFöâçG—RÒ&'WGFöâ#°¢'WGFöâæ6Æ74æÖRÒ'6V6öæF'’6ö×7B#°¢'WGFöâæFF6WBç&öGV7F–öå&ö×D¶–æBÒ¶–æC°¢'WGFöâçFW‡D6öçFVçBÒ.ÙHNºÎÙHNØ«‚»;^È*Â#°¢'WGFöâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â7–æ2‚’Óâ°¢v—Bæf–vF÷"æ6Æ—&ö&Bçw&—FUFW‡B‡&ö×B“°¢'WGFöâçFW‡D6öçFVçBÒ.»;^È*Î¹
‚#°¢v–æF÷rç6WEF–ÖV÷WB‚‚’Óâ²'WGFöâçFW‡D6öçFVçBÒ.ÙHNºÎÙHNØ«‚»;^È*Â#²ÒÂ#“°¢Ò“°¢6&BæVæB†æÖRÂ&Wf–WtÆ&VÂÂ&Wf–WrÂ'WGFöâ“°¢&ö×Dw&–BæVæB†6&B“°¢Ð¢&ö×E7W&f6RæVæB‡&ö×EF—FÆRÂ&ö×DW‡ÆæF–öâÂ&ö×Dw&–B“°¢6öç7B&u&ö×BÒG—VöbwV–FRç&u÷&ö×BÓÓÒ'7G&–ær"bbwV–FRç&u÷&ö×BçG&–Ò‚’òwV–FRç&u÷&ö×B¢ö&¦V7BçfÇVW2†wV–FRç&ö×G2ÇÂ·Ò’æf–ÇFW"‚‡fÇVR’ÓâG—VöbfÇVRÓÓÒ'7G&–ær"’æ¦ö–â‚%ÆåÆâÒÒÕÆåÆâ"“°¢–b‡&u&ö×B’°¢6öç7B&tFWF–Ç2ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&FWF–Ç2"“°¢&tFWF–Ç2ç7G–ÆRæÖ&v–åF÷Ò#g‚#°¢6öç7B&u7VÖÖ'’ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚'7VÖÖ'’"“°¢&u7VÖÖ'’ç7G–ÆRæ7W'6÷"Ò'ö–çFW"#°¢&u7VÖÖ'’ç7G–ÆRæföçEvV–v‡BÒ#ƒ#°¢&u7VÖÖ'’çFW‡D6öçFVçBÒ.ÊNË+BÊ	ÎÉéÙHNºÎÙHNØ«‚»;N«‹#°¢6öç7BFööÆ&"ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢FööÆ&"ç7G–ÆRæF—7Æ’Ò&fÆW‚#°¢FööÆ&"ç7G–ÆRæ§W7F–g”6öçFVçBÒ&fÆW‚ÖVæB#°¢FööÆ&"ç7G–ÆRæÖ&v–âÒ#'‚#°¢6öç7B6÷”ÆÂÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&'WGFöâ"“°¢6÷”ÆÂçG—RÒ&'WGFöâ#°¢6÷”ÆÂæ6Æ74æÖRÒ'6V6öæF'’6ö×7B#°¢6÷”ÆÂæFF6WBç&öGV7F–öå&ö×DÆÂÒ'G'VR#°¢6÷”ÆÂç6WDGG&–'WFR‚&FF×&öGV7F–öâ×&ö×BÖÆÂ"Â'G'VR"“°¢6÷”ÆÂçFW‡D6öçFVçBÒ.ÊNË+B»;^È*Â#°¢6÷”ÆÂæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â7–æ2‚’Óâ°¢v—Bæf–vF÷"æ6Æ—&ö&Bçw&—FUFW‡B‡&u&ö×B“°¢6÷”ÆÂçFW‡D6öçFVçBÒ.»;^È*Î¹
‚#°¢v–æF÷rç6WEF–ÖV÷WB‚‚’Óâ²6÷”ÆÂçFW‡D6öçFVçBÒ.ÊNË+B»;^È*Â#²ÒÂ#“°¢Ò“°¢6öç7B&t&öG’ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚'&R"“°¢&t&öG’ç7G–ÆRçv†—FU76RÒ'&R×w&#°¢&t&öG’ç7G–ÆRæ÷fW&fÆ÷uw&Ò&ç—v†W&R#°¢&t&öG’ç7G–ÆRæÖ„†V–v‡BÒ#C#‚#°¢&t&öG’ç7G–ÆRæ÷fW&fÆ÷rÒ&WFò#°¢&t&öG’ç7G–ÆRçFF–ærÒ#G‚#°¢&t&öG’ç7G–ÆRæ&÷&FW"Ò#‚6öÆ–B3#“3SF"#°¢&t&öG’ç7G–ÆRæ&÷&FW%&F—W2Ò#'‚#°¢&t&öG’ç7G–ÆRæ&6¶w&÷VæBÒ"3C3##°¢&t&öG’ç7G–ÆRæ6öÆ÷"Ò"6CvFVV"#°¢&t&öG’çFW‡D6öçFVçBÒ&u&ö×C°¢FööÆ&"æVæB†6÷”ÆÂ“°¢&tFWF–Ç2æVæB‡&u7VÖÖ'’ÂFööÆ&"Â&t&öG’“°¢&ö×E7W&f6RæVæB‡&tFWF–Ç2“°¢Ð¢&öGV7F–öä6öçFVçBæVæB‡&ö×E7W&f6R“°¢6ö×–ÆVE&öGV7EG'WF…6æ6†÷BÒ&öGV7EG'WF…6æ6†÷B‚“°¢&öGV7F–öåæVÂæFF6WBæwV–Fæ6U7FÆRÒ&fÇ6R#°¢&öGV7F–öå&VG•7FGW2ÒW†6ÇVFVD6÷VçBâò%$TE’t•D‚t$ä”äu2"¢%$TE’#°¢6WE&öGV7F–öå7FGW2‡&öGV7F–öå&VG•7FGW2Â&ö²"“°¢Ð ¢7–æ2gVæ7F–öâæÇ—¦R‡W&Â’°¢&WGW&âv—B&6¶VæBç&VÖ÷FT÷W&F–öç2ææÇ—¦U–÷UGV&R‡6W76–öâÂW&Â“°¢Ð ¢7–æ2gVæ7F–öâ6ö×–ÆU&öGV7F–öâ‡&öGV7EG'WF‚’°¢6öç7B&WVW7BÒ²÷W&F–öã¢'&öGV7F–öåöwV–Fæ6R"ÂæÇ—6—3¢ÆFW7DæÇ—6—2Â&öGV7E÷G'WFƒ¢&öGV7EG'WF‚Ó°¢&WGW&âv—B&6¶VæBç&VÖ÷FT÷W&F–öç2ævVæW&FU&öGV7F–öäwV–Fæ6R‡6W76–öâÂ&WVW7BææÇ—6—2Â&WVW7Bç&öGV7E÷G'WF‚“°¢Ð ¢&6¶VæBç6W76–öâç7V'67&–&R‚†æW‡E6W76–öâ’Óâ°¢–b‚æW‡E6W76–öâ’°¢6ÆV%7FFR‚“°¢&WGW&ã°¢Ð¢6W76–öâÒæW‡E6W76–öã°¢æVÂæ†–FFVâÒfÇ6S°¢6WE7FGW2‚$4„T4²$UT•$TB"“°¢6öç7B66†VBÒ&6¶VæBç&VÖ÷FT÷W&F–öç2æ7W'&VçD6&–Æ—F–W2‚“°¢–b†66†VB’Ç”6&–Æ—G”&öG’†66†VB“°¢VÇ6R°¢6WD6&–Æ—G’†çVÆÂ“°¢6WE&öGV7F–öä6&–Æ—G’†çVÆÂ“°¢Ð¢Ò“° ¢&6¶VæBç&VÖ÷FT÷W&F–öç2ç7V'67&–&T6&–Æ—F–W2‚†&öG’’Óâ°¢–b‚6W76–öâÇÂ&öG’’&WGW&ã°¢–b‚Ç”6&–Æ—G”&öG’†&öG’’’°¢6WD6&–Æ—G’†fÇ6R“°¢6WE&öGV7F–öä6&–Æ—G’†fÇ6R“°¢Ð¢Ò“° ¢f÷&ÒæFDWfVçDÆ—7FVæW"‚'7V&Ö—B"Â7–æ2†WfVçB’Óâ°¢WfVçBç&WfVçDFVfVÇB‚“°¢–b‚6W76–öâÇÂ6&–Æ—G•&VG’’&WGW&ã°¢6öç7BW&ÂÒW&Ä–çWBçfÇVRçG&–Ò‚“°¢–b‚W&Â’&WGW&ã°¢7V&Ö—BæF—6&ÆVBÒG'VS°¢6ÆV%&W7VÇB‚“°¢6WE7FGW2‚$äÅ•¤”är"“°¢G'’°¢6öç7B&W7VÇBÒv—BæÇ—¦R‡W&Â“°¢&VæFW"‡&W7VÇB“°¢æVÂç67&öÆÄ–çFõf–Wr‡²&Æö6³¢'7F'B"Ò“°¢Ò6F6‚†W'&÷"’°¢6WE7FGW2‚$U%$õ""Â&W'&÷""“°¢6öç7BW'&÷%FW‡BÒFö7VÖVçBæ7&VFTVÆVÖVçB‚'"“°¢W'&÷%FW‡Bæ6Æ74æÖRÒ&Æ–'&'’×7FFRW'&÷"×FW‡B#°¢W'&÷%FW‡BçFW‡D6öçFVçBÒW'&÷"–ç7Fæ6VöbW'&÷"òW'&÷"æÖW76vR¢7G&–ær†W'&÷"“°¢6öçFVçBç&WÆ6T6†–ÆG&Vâ†W'&÷%FW‡B“°¢Òf–æÆÇ’°¢WFFT6öçG&öÂ‚“°¢Ð¢Ò“° ¢&öGV7F–öäf÷&ÒæFDWfVçDÆ—7FVæW"‚'7V&Ö—B"Â7–æ2†WfVçB’Óâ°¢WfVçBç&WfVçDFVfVÇB‚“°¢–b‚6W76–öâÇÂ&öGV7F–öä6&–Æ—G•&VG’ÇÂÆFW7DæÇ—6—2ÇÂ†5&öGV7EG'WF„–çWB‚’’&WGW&ã°¢&öGV7F–öå7V&Ö—BæF—6&ÆVBÒG'VS°¢6ÆV%&öGV7F–öä÷WGWB‚“°¢6WE&öGV7F–öå7FGW2‚$4ôÕ”Ä”är"“°¢G'’°¢6öç7B&W7VÇBÒv—B6ö×–ÆU&öGV7F–öâ‡&öGV7EG'WF…–ÆöB‚’“°¢&VæFW%&öGV7F–öäwV–Fæ6R‡&W7VÇB“°¢&öGV7F–öåæVÂç67&öÆÄ–çFõf–Wr‡²&Æö6³¢'7F'B"Ò“°¢Ò6F6‚†W'&÷"’°¢6WE&öGV7F–öå7FGW2‚$U%$õ""Â&W'&÷""“°¢6öç7BW'&÷%FW‡BÒFö7VÖVçBæ7&VFTVÆVÖVçB‚'"“°¢W'&÷%FW‡Bæ6Æ74æÖRÒ&Æ–'&'’×7FFRW'&÷"×FW‡B#°¢W'&÷%FW‡BçFW‡D6öçFVçBÒW'&÷"–ç7Fæ6VöbW'&÷"òW'&÷"æÖW76vR¢7G&–ær†W'&÷"“°¢&öGV7F–öä6öçFVçBç&WÆ6T6†–ÆG&Vâ†W'&÷%FW‡B“°¢Òf–æÆÇ’°¢WFFU&öGV7F–öä6öçG&öÂ‚“°¢Ð¢Ò“° ¢W&Ä–çWBæFDWfVçDÆ—7FVæW"‚&–çWB"Â‚’Óâ°¢6ÆV%&öGV7F–öå7FFR‡²6ÆV$–çWG3¢G'VRÂ†–FS¢G'VRÒ“°¢WFFT6öçG&öÂ‚“°¢Ò“°¢f÷"†6öç7B–çWBöb·&öGV7DæÖRÂ&öGV7EF&vWBÂ&öGV7E&–6RÂ&öGV7Df7G5Ò’°¢–çWBæFDWfVçDÆ—7FVæW"‚&–çWB"Â‚’Óâ°¢7–æ4wV–Fæ6U7FÆU7FFR‚“°¢WFFU&öGV7F–öä6öçG&öÂ‚“°¢Ò“°¢Ð¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â†WfVçB’Óâ°¢6öç7BF&vWBÒWfVçBçF&vWB–ç7Fæ6VöbVÆVÖVçBòWfVçBçF&vWBæ6Æ÷6W7B‚%¶FFÖF—66÷fW'’×6÷W&6RÖ–EÒ"’¢çVÆÃ°¢–b‚‡F&vWB–ç7Fæ6Vöb…DÔÄVÆVÖVçB’’&WGW&ã°¢6öç7BF—66÷fW&VEW&ÂÒF&vWBçVW'•6VÆV7F÷"‚"æF—66÷fW'’×W&Â"“òçFW‡D6öçFVçCòçG&–Ò‚’ÇÂ"#°¢–b‚F—66÷fW&VEW&Â’&WGW&ã°¢W&Ä–çWBçfÇVRÒF—66÷fW&VEW&Ã°¢6ÆV%&öGV7F–öå7FFR‡²6ÆV$–çWG3¢G'VRÂ†–FS¢G'VRÒ“°¢WFFT6öçG&öÂ‚“°¢Ò“° ¢Æöv÷WBæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â6ÆV%7FFR“°¢÷&væ—¦TFWfVÆ÷W$F–væ÷7F–72‚“°¢Ð ¢–b‡v–æF÷räÔ5DU%eô$4´TäB’–æ—F–Æ—¦R‡v–æF÷räÔ5DU%eô$4´TäB“°¢VÇ6Rv–æF÷ræFDWfVçDÆ—7FVæW"‚&Ö7FW'c¦&6¶VæB×&VG’"Â‚’Óâ–æ—F–Æ—¦R‡v–æF÷räÔ5DU%eô$4´TäB’Â²öæ6S¢G'VRÒ“°§Ò’‚“°