(() => {
  "use strict";

  const backend = window.MASTERV_BACKEND;
  if (!backend) throw new Error("MasterV backend provider was not initialized before app.js");

  const $ = (id) => document.getElementById(id);
  const authStatus = $("auth-status");
  const apiStatus = $("api-status");
  const activationForm = $("activation-form");
  const productKeyInput = $("product-key");
  const activateButton = $("activate-button");
  const resumeButton = $("resume-button");
  const logoutButton = $("logout-button");
  const message = $("message");
  const capBoundary = $("cap-boundary");
  const capReferenceCompiler = $("cap-reference-compiler");
  const capAnalyze = $("cap-analyze");
  const capYoutube = $("cap-youtube");
  const discoveryPanel = $("discovery-panel");
  const discoveryForm = $("discovery-form");
  const discoveryQuery = $("discovery-query");
  const discoveryRegion = $("discovery-region");
  const discoveryLanguage = $("discovery-language");
  const discoveryDuration = $("discovery-duration");
  const discoverySearch = $("discovery-search");
  const discoveryStatus = $("discovery-status");
  const discoveryCount = $("discovery-count");
  const discoveryProvider = $("discovery-provider");
  const discoveryResults = $("discovery-results");
  const libraryPanel = $("reference-library-panel");
  const libraryStatus = $("library-status");
  const libraryWorkspace = $("library-workspace");
  const libraryCount = $("library-count");
  const librarySelectedCount = $("library-selected-count");
  const libraryList = $("reference-library-list");
  const libraryRefresh = $("library-refresh");
  const libraryCompare = $("library-compare");
  const detailPanel = $("reference-detail-panel");
  const detailStatus = $("reference-detail-status");
  const detailContent = $("reference-detail-content");
  const detailClose = $("reference-detail-close");
  const comparePanel = $("reference-compare-panel");
  const compareStatus = $("reference-compare-status");
  const compareCount = $("reference-compare-count");
  const compareContent = $("reference-compare-content");
  const compareClear = $("reference-compare-clear");

  const required = [authStatus, apiStatus, activationForm, productKeyInput, activateButton, resumeButton, logoutButton, message, capBoundary, capReferenceCompiler, capAnalyze, capYoutube, discoveryPanel, discoveryForm, discoveryQuery, discoveryRegion, discoveryLanguage, discoveryDuration, discoverySearch, discoveryStatus, discoveryCount, discoveryProvider, discoveryResults, libraryPanel, libraryStatus, libraryWorkspace, libraryCount, librarySelectedCount, libraryList, libraryRefresh, libraryCompare, detailPanel, detailStatus, detailContent, detailClose, comparePanel, compareStatus, compareCount, compareContent, compareClear];
  if (required.some((value) => !value)) throw new Error("MasterV EXIT-3 visible surface is missing required DOM elements");

  let session = null;
  let workspaceId = null;
  let youtubeDiscoveryReady = false;
  const selectedSourceIds = new Set();

  document.documentElement.dataset.backendProviderContract = backend.contract_version;
  document.documentElement.dataset.backendConsumer = "app";
  document.documentElement.dataset.architectureStage = "MV-EXIT-3-CLEAN-CUT";
  document.documentElement.dataset.localDataRequiresSubscription = "false";
  document.documentElement.dataset.runtimeVendorDependencyZero = "true";
  libraryPanel.dataset.workDataAuthority = "local-sqlite";
  comparePanel.dataset.compiler = "local-canonical";
  comparePanel.dataset.workDataAuthority = "local-sqlite";
  discoveryPanel.dataset.providerAuthority = "masterv-gateway";
  discoveryPanel.dataset.providerCredentialsInClient = "false";

  function publishSessionState(authenticated) {
    window.dispatchEvent(new CustomEvent("masterv:session-state-changed", { detail: { authenticated: Boolean(authenticated), provider: session?.provider || null } }));
  }
  function setMessage(text, success = false) {
    message.textContent = text || "";
    message.classList.toggle("success", success);
  }
  function setCapability(target, value) {
    target.textContent = value === true ? "READY" : value === false ? "BLOCKED" : "—";
    target.classList.toggle("ok", value === true);
    target.classList.toggle("error", value === false);
  }
  function setTone(target, text, tone = "") {
    target.textContent = text;
    target.classList.toggle("ok", tone === "ok");
    target.classList.toggle("error", tone === "error");
  }
  function updateDiscoveryControl() {
    discoverySearch.disabled = !session || !youtubeDiscoveryReady || !discoveryQuery.value.trim();
  }
  function updateCompareControls() {
    librarySelectedCount.textContent = String(selectedSourceIds.size);
    libraryCompare.disabled = !workspaceId || selectedSourceIds.size < 2;
  }
  function resetRemoteCapabilities() {
    for (const target of [capBoundary, capAnalyze, capYoutube]) setCapability(target, null);
    setCapability(capReferenceCompiler, Boolean(window.MASTERV_LOCAL_REFERENCE_COMPILER && workspaceId));
    youtubeDiscoveryReady = false;
    apiStatus.textContent = session ? "NOT CHECKED" : "LOCAL ONLY";
    apiStatus.classList.remove("ok", "error");
    discoveryPanel.hidden = true;
    discoveryResults.replaceChildren();
    discoveryCount.textContent = "0";
    setTone(discoveryStatus, "LOCAL ONLY");
    updateDiscoveryControl();
  }

  function formatUpdatedAt(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value || "—" : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }
  function appendFact(container, label, value) {
    const item = document.createElement("div");
    const term = document.createElement("span");
    const data = document.createElement("strong");
    term.textContent = label;
    data.textContent = value ?? "—";
    item.append(term, data);
    container.append(item);
  }

  function renderReferenceLibrary(records) {
    libraryPanel.hidden = false;
    libraryList.replaceChildren();
    libraryCount.textContent = String(records.length);
    setTone(libraryStatus, "READY / LOCAL", "ok");
    const available = new Set(records.map((record) => record.source_id));
    for (const sourceId of [...selectedSourceIds]) if (!available.has(sourceId)) selectedSourceIds.delete(sourceId);
    updateCompareControls();
    if (!records.length) {
      const empty = document.createElement("p");
      empty.className = "library-state";
      empty.textContent = "Local SQLite에 저장된 레퍼런스가 없습니다.";
      libraryList.append(empty);
      return;
    }
    for (const record of records) {
      const item = document.createElement("article");
      item.className = "library-item";
      item.dataset.sourceId = record.source_id;
      const selector = document.createElement("label");
      selector.className = "compare-selector";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedSourceIds.has(record.source_id);
      checkbox.dataset.compareSourceId = record.source_id;
      const selectorText = document.createElement("span");
      selectorText.textContent = "비교";
      selector.append(checkbox, selectorText);
      const content = document.createElement("div");
      content.className = "library-item-main";
      const title = document.createElement("strong");
      title.className = "library-label";
      title.textContent = record.label || record.source_id;
      const url = document.createElement("div");
      url.className = "library-url";
      url.textContent = record.canonical_url;
      const meta = document.createElement("div");
      meta.className = "library-meta";
      for (const text of [`rev ${record.revision ?? "—"}`, `updated ${formatUpdatedAt(record.updated_at)}`]) {
        const span = document.createElement("span"); span.textContent = text; meta.append(span);
      }
      content.append(title, url, meta);
      const actions = document.createElement("div");
      actions.className = "library-item-actions";
      const detail = document.createElement("button");
      detail.type = "button"; detail.className = "ghost"; detail.dataset.detailSourceId = record.source_id; detail.textContent = "상세";
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "danger ghost"; remove.dataset.deleteSourceId = record.source_id; remove.textContent = "삭제";
      actions.append(detail, remove);
      item.append(selector, content, actions);
      libraryList.append(item);
    }
  }

  async function loadReferenceLibrary() {
    if (!workspaceId) throw new Error("Local Reference Library workspace is not ready");
    libraryPanel.hidden = false;
    setTone(libraryStatus, "LOADING");
    const records = await backend.workData.listReferenceLibrary(null, workspaceId);
    renderReferenceLibrary(records);
    return records;
  }

  async function initializeLocalWorkspace() {
    libraryPanel.hidden = false;
    setTone(libraryStatus, "LOCAL STARTUP");
    workspaceId = await backend.workData.bootstrapPersonalWorkspace(null);
    libraryWorkspace.textContent = workspaceId;
    setCapability(capReferenceCompiler, Boolean(window.MASTERV_LOCAL_REFERENCE_COMPILER));
    await loadReferenceLibrary();
  }

  async function loadReferenceDetail(sourceId) {
    if (!workspaceId) return;
    detailPanel.hidden = false;
    detailContent.replaceChildren();
    setTone(detailStatus, "LOADING");
    const record = await backend.workData.fetchReferenceDetail(null, workspaceId, sourceId);
    const heading = document.createElement("div"); heading.className = "detail-heading-block";
    const title = document.createElement("h3"); title.textContent = record.label || record.source_id;
    const summary = document.createElement("p"); summary.className = "detail-summary"; summary.textContent = record.analysis?.summary || "요약 정보가 없습니다.";
    heading.append(title, summary);
    const facts = document.createElement("div"); facts.className = "detail-facts";
    appendFact(facts, "Structure", record.analysis?.structure_label || "—");
    appendFact(facts, "Source", record.source_id);
    appendFact(facts, "Revision", String(record.revision ?? "—"));
    detailContent.append(heading, facts);
    setTone(detailStatus, "READY / LOCAL", "ok");
  }

  async function loadReferenceComparison() {
    const sourceIds = [...selectedSourceIds];
    if (sourceIds.length < 2) throw new Error("비교하려면 레퍼런스를 2개 이상 선택해야 합니다.");
    comparePanel.hidden = false;
    compareContent.replaceChildren();
    compareCount.textContent = String(sourceIds.length);
    setTone(compareStatus, "COMPILING LOCAL");
    const result = await backend.remoteOperations.compileReferenceWorkflow(null, sourceIds);
    const summary = document.createElement("p");
    summary.className = "detail-summary";
    summary.textContent = `Local canonical compiler가 ${sourceIds.length}개 레퍼런스를 비교했습니다.`;
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(result.comparison || result, null, 2);
    compareContent.append(summary, pre);
    setTone(compareStatus, "READY / LOCAL", "ok");
  }

  function renderDiscoveryCandidates(result) {
    discoveryResults.replaceChildren();
    const candidates = Array.isArray(result.candidates) ? result.candidates : [];
    discoveryCount.textContent = String(candidates.length);
    discoveryProvider.textContent = "MASTERV GATEWAY";
    for (const [index, candidate] of candidates.entries()) {
      const card = document.createElement("article"); card.className = "discovery-card"; card.dataset.discoverySourceId = candidate.source_id;
      const rank = document.createElement("span"); rank.className = "discovery-rank"; rank.textContent = `candidate #${index + 1}`;
      const title = document.createElement("h3"); title.textContent = candidate.title || candidate.source_id;
      const url = document.createElement("p"); url.className = "discovery-url"; url.textContent = candidate.canonical_url;
      card.append(rank, title, url); discoveryResults.append(card);
    }
    setTone(discoveryStatus, "READY", "ok");
  }

  async function establishGatewaySession(credentials, { silent = false } = {}) {
    const nextSession = await backend.session.openSession(credentials);
    session = nextSession;
    authStatus.textContent = credentials.kind === "resume" ? "DEVICE RESUMED" : "ACTIVATED";
    authStatus.classList.add("ok");
    logoutButton.hidden = false;
    resumeButton.disabled = true;
    publishSessionState(true);
    try {
      const capabilities = await backend.remoteOperations.probeCapabilities(session);
      apiStatus.textContent = "CONNECTED"; apiStatus.classList.add("ok");
      setCapability(capBoundary, capabilities.capabilities?.boundary_probe === true);
      setCapability(capReferenceCompiler, capabilities.capabilities?.reference_compiler === true);
      setCapability(capAnalyze, capabilities.capabilities?.analyze === true);
      setCapability(capYoutube, capabilities.capabilities?.youtube_discovery === true);
      youtubeDiscoveryReady = capabilities.capabilities?.youtube_discovery === true;
      discoveryPanel.hidden = false;
      setTone(discoveryStatus, youtubeDiscoveryReady ? "READY" : "NOT ENTITLED", youtubeDiscoveryReady ? "ok" : "error");
      updateDiscoveryControl();
      if (!silent) setMessage("MasterV Gateway에 연결되었습니다. Local SQLite가 계속 user work-data authority입니다.", true);
      return nextSession;
    } catch (error) {
      await backend.session.closeSession(nextSession).catch(() => undefined);
      session = null;
      publishSessionState(false);
      throw error;
    }
  }

  async function logout() {
    const activeSession = session;
    session = null;
    authStatus.textContent = "LOCAL ONLY"; authStatus.classList.remove("ok");
    logoutButton.hidden = true; resumeButton.disabled = false;
    resetRemoteCapabilities(); publishSessionState(false);
    if (activeSession) await backend.session.closeSession(activeSession);
    setMessage("Gateway 세션만 제거했습니다. Local SQLite 데이터는 계속 사용할 수 있습니다.", true);
  }

  activationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const productKey = productKeyInput.value.trim();
    if (!productKey) return;
    activateButton.disabled = true; authStatus.textContent = "ACTIVATING"; setMessage("");
    try { await establishGatewaySession({ kind: "product_key", product_key: productKey, device_label: "MasterV Desktop" }); }
    catch (error) { authStatus.textContent = "LOCAL ONLY"; apiStatus.textContent = "FAILED"; apiStatus.classList.add("error"); setMessage(error instanceof Error ? error.message : String(error)); }
    finally { productKeyInput.value = ""; activateButton.disabled = false; }
  });
  resumeButton.addEventListener("click", async () => {
    resumeButton.disabled = true; setMessage("");
    try { await establishGatewaySession({ kind: "resume" }); }
    catch (error) { authStatus.textContent = "LOCAL ONLY"; setMessage(error instanceof Error ? error.message : String(error)); resumeButton.disabled = false; }
  });
  logoutButton.addEventListener("click", () => { void logout(); });
  discoveryQuery.addEventListener("input", updateDiscoveryControl);
  discoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session || !youtubeDiscoveryReady) return;
    discoverySearch.disabled = true; setTone(discoveryStatus, "SEARCHING");
    try {
      const options = { max_results: 50, shortlist_limit: 12, min_duration_seconds: 1, max_duration_seconds: Number(discoveryDuration.value || 180), max_per_creator: 2 };
      if (discoveryRegion.value) options.region_code = discoveryRegion.value;
      if (discoveryLanguage.value) options.relevance_language = discoveryLanguage.value;
      renderDiscoveryCandidates(await backend.remoteOperations.discoverYouTube(session, discoveryQuery.value.trim(), options));
    } catch (error) { setTone(discoveryStatus, "ERROR", "error"); setMessage(error instanceof Error ? error.message : String(error)); }
    finally { updateDiscoveryControl(); }
  });
  libraryRefresh.addEventListener("click", () => { void loadReferenceLibrary().catch((error) => setMessage(String(error))); });
  libraryCompare.addEventListener("click", () => { void loadReferenceComparison().catch((error) => setMessage(String(error))); });
  compareClear.addEventListener("click", () => {
    selectedSourceIds.clear(); comparePanel.hidden = true; compareContent.replaceChildren(); updateCompareControls();
    for (const checkbox of libraryList.querySelectorAll("[data-compare-source-id]")) if (checkbox instanceof HTMLInputElement) checkbox.checked = false;
  });
  detailClose.addEventListener("click", () => { detailPanel.hidden = true; detailContent.replaceChildren(); setTone(detailStatus, "IDLE"); });
  libraryList.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.compareSourceId) return;
    if (target.checked) selectedSourceIds.add(target.dataset.compareSourceId); else selectedSourceIds.delete(target.dataset.compareSourceId);
    updateCompareControls();
  });
  libraryList.addEventListener("click", async (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const detailTarget = element?.closest("[data-detail-source-id]");
    if (detailTarget instanceof HTMLButtonElement && detailTarget.dataset.detailSourceId) return void loadReferenceDetail(detailTarget.dataset.detailSourceId).catch((error) => setMessage(String(error)));
    const deleteTarget = element?.closest("[data-delete-source-id]");
    if (deleteTarget instanceof HTMLButtonElement && deleteTarget.dataset.deleteSourceId) {
      try { await backend.workData.deleteReferenceLibraryEntry(null, workspaceId, deleteTarget.dataset.deleteSourceId); await loadReferenceLibrary(); }
      catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    }
  });

  resetRemoteCapabilities();
  authStatus.textContent = "LOCAL STARTUP";
  apiStatus.textContent = "LOCAL ONLY";
  void (async () => {
    try {
      await initializeLocalWorkspace();
      authStatus.textContent = "LOCAL ONLY";
      setMessage("Local SQLite 작업 데이터를 사용할 수 있습니다. 유료 AI 기능은 Product Key activation 또는 device resume 후 연결됩니다.", true);
    } catch (error) {
      authStatus.textContent = "LOCAL ERROR";
      setTone(libraryStatus, "ERROR", "error");
      setMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    try { await establishGatewaySession({ kind: "resume" }, { silent: true }); }
    catch { session = null; authStatus.textContent = "LOCAL ONLY"; logoutButton.hidden = true; resumeButton.disabled = false; resetRemoteCapabilities(); publishSessionState(false); }
  })();
})();
