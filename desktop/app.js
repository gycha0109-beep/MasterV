(() => {
  "use strict";

  const backend = window.MASTERV_BACKEND;
  if (!backend) throw new Error("MasterV backend provider was not initialized before app.js");

  const REFERENCE_LIBRARY_LIST_PROJECTION = [
    "source_id",
    "canonical_url",
    "label",
    "analysis_provenance",
    "revision",
    "first_saved_at",
    "updated_at"
  ];
  const REFERENCE_LIBRARY_DETAIL_PROJECTION = [
    "source_id",
    "canonical_url",
    "label",
    "analysis_provenance",
    "revision",
    "first_saved_at",
    "updated_at",
    "analysis"
  ];

  const authStatus = document.getElementById("auth-status");
  const apiStatus = document.getElementById("api-status");
  const activationForm = document.getElementById("activation-form");
  const productKeyInput = document.getElementById("product-key");
  const activateButton = document.getElementById("activate-button");
  const resumeButton = document.getElementById("resume-button");
  const logoutButton = document.getElementById("logout-button");
  const message = document.getElementById("message");
  const migrationForm = document.getElementById("legacy-migration-form");
  const migrationEmail = document.getElementById("migration-email");
  const migrationPassword = document.getElementById("migration-password");
  const migrationButton = document.getElementById("migration-button");
  const migrationStatus = document.getElementById("migration-status");
  const capBoundary = document.getElementById("cap-boundary");
  const capReferenceCompiler = document.getElementById("cap-reference-compiler");
  const capAnalyze = document.getElementById("cap-analyze");
  const capYoutube = document.getElementById("cap-youtube");
  const discoveryPanel = document.getElementById("discovery-panel");
  const discoveryForm = document.getElementById("discovery-form");
  const discoveryQuery = document.getElementById("discovery-query");
  const discoveryRegion = document.getElementById("discovery-region");
  const discoveryLanguage = document.getElementById("discovery-language");
  const discoveryDuration = document.getElementById("discovery-duration");
  const discoverySearch = document.getElementById("discovery-search");
  const discoveryStatus = document.getElementById("discovery-status");
  const discoveryCount = document.getElementById("discovery-count");
  const discoveryProvider = document.getElementById("discovery-provider");
  const discoveryResults = document.getElementById("discovery-results");
  const libraryPanel = document.getElementById("reference-library-panel");
  const libraryStatus = document.getElementById("library-status");
  const libraryWorkspace = document.getElementById("library-workspace");
  const libraryCount = document.getElementById("library-count");
  const librarySelectedCount = document.getElementById("library-selected-count");
  const libraryList = document.getElementById("reference-library-list");
  const libraryRefresh = document.getElementById("library-refresh");
  const libraryCompare = document.getElementById("library-compare");
  const detailPanel = document.getElementById("reference-detail-panel");
  const detailStatus = document.getElementById("reference-detail-status");
  const detailContent = document.getElementById("reference-detail-content");
  const detailClose = document.getElementById("reference-detail-close");
  const comparePanel = document.getElementById("reference-compare-panel");
  const compareStatus = document.getElementById("reference-compare-status");
  const compareCount = document.getElementById("reference-compare-count");
  const compareContent = document.getElementById("reference-compare-content");
  const compareClear = document.getElementById("reference-compare-clear");

  const required = [
    authStatus, apiStatus, activationForm, productKeyInput, activateButton, resumeButton,
    logoutButton, message, migrationForm, migrationEmail, migrationPassword, migrationButton,
    migrationStatus, capBoundary, capReferenceCompiler, capAnalyze, capYoutube, discoveryPanel,
    discoveryForm, discoveryQuery, discoveryRegion, discoveryLanguage, discoveryDuration,
    discoverySearch, discoveryStatus, discoveryCount, discoveryProvider, discoveryResults,
    libraryPanel, libraryStatus, libraryWorkspace, libraryCount, librarySelectedCount,
    libraryList, libraryRefresh, libraryCompare, detailPanel, detailStatus, detailContent,
    detailClose, comparePanel, compareStatus, compareCount, compareContent, compareClear
  ];
  if (required.some((value) => !value)) throw new Error("MasterV EXIT-2C visible surface is missing required DOM elements");

  let session = null;
  let workspaceId = null;
  let detailSourceId = null;
  let youtubeDiscoveryReady = false;
  const selectedSourceIds = new Set();

  libraryPanel.dataset.projection = REFERENCE_LIBRARY_LIST_PROJECTION.join(",");
  detailPanel.dataset.projection = REFERENCE_LIBRARY_DETAIL_PROJECTION.join(",");
  comparePanel.dataset.compiler = "local-canonical";
  comparePanel.dataset.workDataAuthority = "local-sqlite";
  discoveryPanel.dataset.providerAuthority = "masterv-gateway";
  discoveryPanel.dataset.providerCredentialsInClient = "false";
  discoveryPanel.dataset.analysisAuthority = "metadata-only";
  discoveryPanel.dataset.youtubeApiRequests = "0";
  document.documentElement.dataset.backendProviderContract = backend.contract_version;
  document.documentElement.dataset.backendConsumer = "app";
  document.documentElement.dataset.migrationStage = "MV-SUPABASE-EXIT-2C";
  document.documentElement.dataset.localDataRequiresSubscription = "false";

  function publishSessionState(authenticated) {
    window.dispatchEvent(new CustomEvent("masterv:session-state-changed", {
      detail: { authenticated: Boolean(authenticated), provider: session?.provider || null }
    }));
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

  function resetRemoteCapabilities() {
    setCapability(capBoundary, null);
    setCapability(capAnalyze, null);
    setCapability(capYoutube, null);
    setCapability(capReferenceCompiler, Boolean(window.MASTERV_LOCAL_REFERENCE_COMPILER && workspaceId));
    youtubeDiscoveryReady = false;
    apiStatus.textContent = session ? "NOT CHECKED" : "LOCAL ONLY";
    apiStatus.classList.remove("ok", "error");
    updateDiscoveryControl();
  }

  function setDiscoveryStatus(text, tone = "") {
    discoveryStatus.textContent = text;
    discoveryStatus.classList.toggle("ok", tone === "ok");
    discoveryStatus.classList.toggle("error", tone === "error");
  }

  function setLibraryStatus(text, tone = "") {
    libraryStatus.textContent = text;
    libraryStatus.classList.toggle("ok", tone === "ok");
    libraryStatus.classList.toggle("error", tone === "error");
  }

  function setDetailStatus(text, tone = "") {
    detailStatus.textContent = text;
    detailStatus.classList.toggle("ok", tone === "ok");
    detailStatus.classList.toggle("error", tone === "error");
  }

  function setCompareStatus(text, tone = "") {
    compareStatus.textContent = text;
    compareStatus.classList.toggle("ok", tone === "ok");
    compareStatus.classList.toggle("error", tone === "error");
  }

  function updateDiscoveryControl() {
    discoverySearch.disabled = !session || !youtubeDiscoveryReady || !discoveryQuery.value.trim();
  }

  function clearDiscoveryState({ hide = true, clearQuery = false } = {}) {
    if (hide) discoveryPanel.hidden = true;
    discoveryResults.replaceChildren();
    discoveryCount.textContent = "0";
    discoveryProvider.textContent = "GATEWAY";
    discoveryPanel.dataset.youtubeApiRequests = "0";
    if (clearQuery) discoveryQuery.value = "";
    setDiscoveryStatus(session ? (youtubeDiscoveryReady ? "READY" : "NOT ENTITLED") : "LOCAL ONLY", session && youtubeDiscoveryReady ? "ok" : "");
    updateDiscoveryControl();
  }

  function clearReferenceDetailState() {
    detailSourceId = null;
    detailPanel.hidden = true;
    detailContent.replaceChildren();
    setDetailStatus("IDLE");
  }

  function clearReferenceCompareState({ clearSelection = true } = {}) {
    comparePanel.hidden = true;
    compareContent.replaceChildren();
    compareCount.textContent = "0";
    setCompareStatus("IDLE");
    if (clearSelection) selectedSourceIds.clear();
    updateCompareControls();
  }

  function setLibraryLoading(label = "LOADING") {
    libraryPanel.hidden = false;
    setLibraryStatus(label);
    libraryList.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "library-state";
    loading.textContent = "로컬 보관함을 불러오는 중입니다.";
    libraryList.append(loading);
  }

  function renderLibraryError(text) {
    libraryPanel.hidden = false;
    setLibraryStatus("ERROR", "error");
    libraryCount.textContent = "—";
    libraryList.replaceChildren();
    const error = document.createElement("p");
    error.className = "library-state error-text";
    error.textContent = text;
    libraryList.append(error);
  }

  function formatUpdatedAt(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "—";
    return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function formatSeconds(value) {
    return typeof value === "number" && Number.isFinite(value) ? `${value}s` : "—";
  }

  function formatPercent(value) {
    return typeof value === "number" && Number.isFinite(value) ? `${value}%` : "—";
  }

  function formatViews(value) {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat("ko-KR").format(number) : "미확인";
  }

  function updateCompareControls() {
    librarySelectedCount.textContent = String(selectedSourceIds.size);
    libraryCompare.disabled = !workspaceId || selectedSourceIds.size < 2;
  }

  function pruneSelection(records) {
    const available = new Set(records.map((record) => record.source_id));
    for (const sourceId of selectedSourceIds) if (!available.has(sourceId)) selectedSourceIds.delete(sourceId);
    if (detailSourceId && !available.has(detailSourceId)) clearReferenceDetailState();
    updateCompareControls();
  }

  function renderReferenceLibrary(records) {
    libraryList.replaceChildren();
    libraryCount.textContent = String(records.length);
    setLibraryStatus("READY / LOCAL", "ok");
    pruneSelection(records);
    if (records.length === 0) {
      const empty = document.createElement("p");
      empty.className = "library-state";
      empty.textContent = "로컬 SQLite에 저장된 레퍼런스가 없습니다.";
      libraryList.append(empty);
      return;
    }
    for (const record of records) {
      const item = document.createElement("article");
      item.className = "library-item";
      item.dataset.sourceId = record.source_id;
      const selector = document.createElement("label");
      selector.className = "compare-selector";
      selector.title = "비교 대상으로 선택";
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
      title.textContent = record.label;
      const url = document.createElement("div");
      url.className = "library-url";
      url.textContent = record.canonical_url;
      const meta = document.createElement("div");
      meta.className = "library-meta";
      for (const text of [`provenance ${record.analysis_provenance}`, `rev ${record.revision}`, `updated ${formatUpdatedAt(record.updated_at)}`]) {
        const span = document.createElement("span");
        span.textContent = text;
        meta.append(span);
      }
      content.append(title, url, meta);
      const actions = document.createElement("div");
      actions.className = "library-item-actions";
      const detail = document.createElement("button");
      detail.type = "button";
      detail.className = "ghost";
      detail.dataset.detailSourceId = record.source_id;
      detail.textContent = "상세";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger ghost";
      remove.dataset.deleteSourceId = record.source_id;
      remove.textContent = "삭제";
      actions.append(detail, remove);
      item.append(selector, content, actions);
      libraryList.append(item);
    }
  }

  async function loadReferenceLibrary() {
    if (!workspaceId) throw new Error("Local Reference Library workspace is not ready");
    setLibraryLoading();
    try {
      const records = await backend.workData.listReferenceLibrary(null, workspaceId, REFERENCE_LIBRARY_LIST_PROJECTION);
      renderReferenceLibrary(records);
      return records;
    } catch (error) {
      renderLibraryError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async function initializeLocalWorkspace() {
    setLibraryLoading("LOCAL STARTUP");
    workspaceId = await backend.workData.bootstrapPersonalWorkspace(null);
    libraryWorkspace.textContent = workspaceId;
    setCapability(capReferenceCompiler, Boolean(window.MASTERV_LOCAL_REFERENCE_COMPILER));
    await loadReferenceLibrary();
  }

  function appendFact(container, label, value) {
    const item = document.createElement("div");
    const term = document.createElement("span");
    term.textContent = label;
    const data = document.createElement("strong");
    data.textContent = value ?? "—";
    item.append(term, data);
    container.append(item);
  }

  function renderReferenceDetail(record) {
    const analysis = record.analysis || {};
    detailSourceId = record.source_id;
    detailPanel.hidden = false;
    detailContent.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "detail-heading-block";
    const title = document.createElement("h3");
    title.textContent = record.label;
    const url = document.createElement("p");
    url.className = "library-url";
    url.textContent = record.canonical_url;
    const summary = document.createElement("p");
    summary.className = "detail-summary";
    summary.textContent = analysis.summary || "요약 정보가 없습니다.";
    heading.append(title, url, summary);
    const facts = document.createElement("div");
    facts.className = "detail-facts";
    appendFact(facts, "Structure", analysis.structure_label || "—");
    appendFact(facts, "Duration", formatSeconds(analysis.duration_seconds));
    appendFact(facts, "Hook", analysis.hook?.type || "—");
    appendFact(facts, "Observation segments", String(Array.isArray(analysis.observation_segments) ? analysis.observation_segments.length : 0));
    appendFact(facts, "Provenance", record.analysis_provenance || "—");
    appendFact(facts, "Revision", String(record.revision ?? "—"));
    detailContent.append(heading, facts);
    setDetailStatus("READY / LOCAL", "ok");
  }

  async function loadReferenceDetail(sourceId) {
    if (!workspaceId) throw new Error("Local Reference Library workspace is not ready");
    detailPanel.hidden = false;
    detailContent.replaceChildren();
    setDetailStatus("LOADING");
    try {
      const record = await backend.workData.fetchReferenceDetail(null, workspaceId, sourceId, REFERENCE_LIBRARY_DETAIL_PROJECTION);
      renderReferenceDetail(record);
      return record;
    } catch (error) {
      setDetailStatus("ERROR", "error");
      const errorText = document.createElement("p");
      errorText.className = "library-state error-text";
      errorText.textContent = error instanceof Error ? error.message : String(error);
      detailContent.replaceChildren(errorText);
      throw error;
    }
  }

  async function deleteReferenceLibraryEntry(sourceId) {
    if (!workspaceId) throw new Error("Local Reference Library workspace is not ready");
    await backend.workData.deleteReferenceLibraryEntry(null, workspaceId, sourceId);
    selectedSourceIds.delete(sourceId);
    if (detailSourceId === sourceId) clearReferenceDetailState();
    const records = await loadReferenceLibrary();
    if (records.some((record) => record.source_id === sourceId)) throw new Error("Reference Library delete did not converge with local persisted state");
    if (selectedSourceIds.size < 2) clearReferenceCompareState({ clearSelection: false });
  }

  function renderReferenceComparison(result) {
    const comparison = result.comparison;
    const ruleSet = result.evidence_rules;
    comparePanel.hidden = false;
    compareContent.replaceChildren();
    compareCount.textContent = String(comparison.sample_size ?? 0);
    const authority = document.createElement("p");
    authority.className = "muted small";
    authority.dataset.compilerAuthority = "local-canonical";
    authority.textContent = "Local SQLite 분석을 Desktop의 canonical Compare/Evidence compiler로 처리했습니다. Gateway 전송은 없습니다.";
    compareContent.append(authority);
    const aggregateTitle = document.createElement("h3");
    aggregateTitle.textContent = "Aggregate comparison";
    const aggregateFacts = document.createElement("div");
    aggregateFacts.className = "detail-facts";
    appendFact(aggregateFacts, "Sample", String(comparison.sample_size ?? 0));
    appendFact(aggregateFacts, "Product first median", formatSeconds(comparison.product?.median_first_seen_seconds));
    appendFact(aggregateFacts, "Product visible avg", formatPercent(comparison.product?.avg_visible_percent));
    appendFact(aggregateFacts, "Demo avg", formatPercent(comparison.demonstration?.avg_combined_percent));
    appendFact(aggregateFacts, "CTA present", formatPercent(comparison.cta?.present_percent));
    appendFact(aggregateFacts, "Common patterns", String(Array.isArray(comparison.common_patterns) ? comparison.common_patterns.length : 0));
    compareContent.append(aggregateTitle, aggregateFacts);
    const videoTitle = document.createElement("h3");
    videoTitle.textContent = "Selected references";
    const grid = document.createElement("div");
    grid.className = "compare-grid";
    for (const video of comparison.videos || []) {
      const card = document.createElement("article");
      card.className = "compare-card";
      card.dataset.compareResultSourceId = video.id;
      const title = document.createElement("h3");
      title.textContent = video.label;
      const facts = document.createElement("div");
      facts.className = "compare-facts";
      appendFact(facts, "Structure", video.structure_label || "—");
      appendFact(facts, "Duration", formatSeconds(video.duration_seconds));
      appendFact(facts, "Product first", formatSeconds(video.product_first_seen_seconds));
      appendFact(facts, "Product visible", formatPercent(video.product_visible_percent));
      appendFact(facts, "Demonstration", formatPercent(video.demonstration_percent));
      appendFact(facts, "CTA first", formatSeconds(video.cta_first_seen_seconds));
      card.append(title, facts);
      grid.append(card);
    }
    compareContent.append(videoTitle, grid);
    const evidenceTitle = document.createElement("h3");
    evidenceTitle.textContent = "Deterministic evidence rules";
    evidenceTitle.dataset.evidenceRules = "canonical";
    const evidenceGrid = document.createElement("div");
    evidenceGrid.className = "compare-grid";
    for (const rule of ruleSet.rules || []) {
      const card = document.createElement("article");
      card.className = "compare-card evidence-rule-card";
      card.dataset.evidenceRuleId = rule.id;
      const title = document.createElement("h3");
      title.textContent = rule.title;
      const instruction = document.createElement("p");
      instruction.className = "compare-summary";
      instruction.textContent = rule.instruction;
      const facts = document.createElement("div");
      facts.className = "compare-facts";
      appendFact(facts, "Support", `${rule.support_count}/${rule.sample_size} (${rule.support_percent}%)`);
      appendFact(facts, "Confidence", rule.confidence);
      appendFact(facts, "Status", rule.status);
      appendFact(facts, "Default", rule.default_selected ? "selected" : "optional");
      card.append(title, instruction, facts);
      evidenceGrid.append(card);
    }
    compareContent.append(evidenceTitle, evidenceGrid);
    setCompareStatus("READY / LOCAL", "ok");
  }

  async function loadReferenceComparison() {
    if (!workspaceId) throw new Error("Local Reference Library workspace is not ready");
    const sourceIds = [...selectedSourceIds];
    if (sourceIds.length < 2) throw new Error("비교하려면 레퍼런스를 2개 이상 선택해야 합니다.");
    comparePanel.hidden = false;
    compareContent.replaceChildren();
    compareCount.textContent = String(sourceIds.length);
    setCompareStatus("COMPILING LOCAL");
    try {
      const result = await backend.remoteOperations.compileReferenceWorkflow(null, sourceIds);
      renderReferenceComparison(result);
      return result;
    } catch (error) {
      setCompareStatus("ERROR", "error");
      const errorText = document.createElement("p");
      errorText.className = "library-state error-text";
      errorText.textContent = error instanceof Error ? error.message : String(error);
      compareContent.replaceChildren(errorText);
      throw error;
    }
  }

  function renderDiscoveryCandidates(result) {
    discoveryResults.replaceChildren();
    const candidates = Array.isArray(result.candidates) ? result.candidates : [];
    discoveryCount.textContent = String(candidates.length);
    discoveryProvider.textContent = "MASTERV GATEWAY";
    discoveryPanel.dataset.youtubeApiRequests = String(result.diagnostics?.youtube_api_requests ?? 0);
    if (candidates.length === 0) {
      const empty = document.createElement("p");
      empty.className = "library-state discovery-empty";
      empty.textContent = "조건에 맞는 YouTube 후보가 없습니다. 검색어 또는 필터를 조정해 주세요.";
      discoveryResults.append(empty);
      setDiscoveryStatus("READY", "ok");
      return;
    }
    candidates.forEach((candidate, index) => {
      const card = document.createElement("article");
      card.className = "discovery-card";
      card.dataset.discoverySourceId = candidate.source_id;
      const rank = document.createElement("span");
      rank.className = "discovery-rank";
      rank.textContent = `candidate #${index + 1}`;
      const title = document.createElement("h3");
      title.textContent = candidate.title || candidate.source_id;
      const meta = document.createElement("div");
      meta.className = "discovery-meta";
      for (const text of [candidate.creator || "채널 미확인", typeof candidate.duration_seconds === "number" ? `${candidate.duration_seconds}초` : "길이 미확인", `조회 ${formatViews(candidate.native_metrics?.view_count)}`, candidate.published_at ? formatUpdatedAt(candidate.published_at) : "게시일 미확인"]) {
        const span = document.createElement("span");
        span.textContent = text;
        meta.append(span);
      }
      const url = document.createElement("p");
      url.className = "discovery-url";
      url.textContent = candidate.canonical_url;
      card.append(rank, title, meta, url);
      discoveryResults.append(card);
    });
    setDiscoveryStatus("READY", "ok");
  }

  async function loadYouTubeDiscovery() {
    if (!session || !youtubeDiscoveryReady) throw new Error("MasterV Gateway YouTube discovery is not ready");
    const query = discoveryQuery.value.trim();
    if (!query) throw new Error("검색어를 입력해 주세요.");
    const options = { max_results: 50, shortlist_limit: 12, min_duration_seconds: 1, max_duration_seconds: Number(discoveryDuration.value || 180), max_per_creator: 2 };
    if (discoveryRegion.value) options.region_code = discoveryRegion.value;
    if (discoveryLanguage.value) options.relevance_language = discoveryLanguage.value;
    discoveryResults.replaceChildren();
    discoveryCount.textContent = "0";
    setDiscoveryStatus("SEARCHING");
    const result = await backend.remoteOperations.discoverYouTube(session, query, options);
    renderDiscoveryCandidates(result);
    return result;
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
      apiStatus.textContent = "CONNECTED";
      apiStatus.classList.add("ok");
      setCapability(capBoundary, capabilities.capabilities?.boundary_probe === true);
      setCapability(capReferenceCompiler, capabilities.capabilities?.reference_compiler === true);
      setCapability(capAnalyze, capabilities.capabilities?.analyze === true);
      setCapability(capYoutube, capabilities.capabilities?.youtube_discovery === true);
      youtubeDiscoveryReady = capabilities.capabilities?.youtube_discovery === true;
      discoveryPanel.hidden = false;
      setDiscoveryStatus(youtubeDiscoveryReady ? "READY" : "NOT ENTITLED", youtubeDiscoveryReady ? "ok" : "error");
      updateDiscoveryControl();
      if (!silent) setMessage("Product-Key/Device session이 MasterV Gateway에 연결되었습니다. 로컬 데이터 authority는 SQLite로 유지됩니다.", true);
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
    authStatus.textContent = "LOCAL ONLY";
    authStatus.classList.remove("ok");
    apiStatus.textContent = "LOCAL ONLY";
    apiStatus.classList.remove("ok", "error");
    logoutButton.hidden = true;
    resumeButton.disabled = false;
    resetRemoteCapabilities();
    clearDiscoveryState({ hide: true, clearQuery: true });
    publishSessionState(false);
    if (activeSession) await backend.session.closeSession(activeSession);
    setMessage("Gateway 세션만 메모리에서 제거했습니다. Local SQLite 데이터는 계속 사용할 수 있습니다.", true);
  }

  async function tryDeviceResume() {
    try {
      await establishGatewaySession({ kind: "resume" }, { silent: true });
      setMessage("저장된 Windows device credential로 Gateway session을 재개했습니다.", true);
    } catch {
      session = null;
      authStatus.textContent = "LOCAL ONLY";
      logoutButton.hidden = true;
      resumeButton.disabled = false;
      resetRemoteCapabilities();
      publishSessionState(false);
    }
  }

  activationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const productKey = productKeyInput.value.trim();
    if (!productKey) return;
    activateButton.disabled = true;
    authStatus.textContent = "ACTIVATING";
    setMessage("");
    try {
      await establishGatewaySession({ kind: "product_key", product_key: productKey, device_label: "MasterV Desktop" });
    } catch (error) {
      authStatus.textContent = "LOCAL ONLY";
      authStatus.classList.remove("ok");
      apiStatus.textContent = "FAILED";
      apiStatus.classList.add("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      productKeyInput.value = "";
      activateButton.disabled = false;
    }
  });

  resumeButton.addEventListener("click", async () => {
    resumeButton.disabled = true;
    setMessage("");
    try {
      await establishGatewaySession({ kind: "resume" });
    } catch (error) {
      authStatus.textContent = "LOCAL ONLY";
      setMessage(error instanceof Error ? error.message : String(error));
      resumeButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", () => { void logout(); });

  migrationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = migrationEmail.value.trim();
    const password = migrationPassword.value;
    migrationButton.disabled = true;
    migrationStatus.textContent = "EXPORTING / IMPORTING";
    migrationStatus.classList.remove("ok", "error");
    try {
      const result = await backend.workData.migrateLegacyReferenceLibrary({ email, password });
      migrationStatus.textContent = result.already_completed ? "ALREADY MIGRATED" : "MIGRATED / VERIFIED";
      migrationStatus.classList.add("ok");
      await loadReferenceLibrary();
      setMessage(`기존 Reference Library ${result.exported_count}개를 확인했습니다. 신규 import ${result.imported_count}개, post-import integrity 검증 완료.`, true);
    } catch (error) {
      migrationStatus.textContent = "FAILED";
      migrationStatus.classList.add("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      migrationPassword.value = "";
      migrationButton.disabled = false;
    }
  });

  discoveryQuery.addEventListener("input", updateDiscoveryControl);
  discoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session || !youtubeDiscoveryReady) return;
    discoverySearch.disabled = true;
    try {
      const result = await loadYouTubeDiscovery();
      setMessage(`Gateway YouTube metadata discovery로 ${result.candidates.length}개 후보를 불러왔습니다.`, true);
      discoveryPanel.scrollIntoView({ block: "start" });
    } catch (error) {
      setDiscoveryStatus("ERROR", "error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      updateDiscoveryControl();
    }
  });

  libraryRefresh.addEventListener("click", async () => {
    libraryRefresh.disabled = true;
    try {
      await loadReferenceLibrary();
      setMessage("Local SQLite Reference Library를 새로고침했습니다.", true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      libraryRefresh.disabled = false;
    }
  });

  libraryCompare.addEventListener("click", async () => {
    libraryCompare.disabled = true;
    try {
      await loadReferenceComparison();
      comparePanel.scrollIntoView({ block: "start" });
      setMessage("선택한 레퍼런스를 local canonical Compare/Evidence compiler로 처리하고 SQLite에 저장했습니다.", true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      updateCompareControls();
    }
  });

  compareClear.addEventListener("click", () => {
    clearReferenceCompareState();
    for (const checkbox of libraryList.querySelectorAll("[data-compare-source-id]")) {
      if (checkbox instanceof HTMLInputElement) checkbox.checked = false;
    }
    setMessage("비교 선택을 초기화했습니다.", true);
  });

  detailClose.addEventListener("click", clearReferenceDetailState);
  libraryList.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.compareSourceId) return;
    const sourceId = target.dataset.compareSourceId;
    if (target.checked) selectedSourceIds.add(sourceId); else selectedSourceIds.delete(sourceId);
    if (selectedSourceIds.size < 2) clearReferenceCompareState({ clearSelection: false });
    updateCompareControls();
  });

  libraryList.addEventListener("click", async (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const detailTarget = element?.closest("[data-detail-source-id]");
    if (detailTarget instanceof HTMLButtonElement) {
      const sourceId = detailTarget.dataset.detailSourceId;
      if (!sourceId) return;
      detailTarget.disabled = true;
      try {
        await loadReferenceDetail(sourceId);
        detailPanel.scrollIntoView({ block: "start" });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        detailTarget.disabled = false;
      }
      return;
    }
    const deleteTarget = element?.closest("[data-delete-source-id]");
    if (!(deleteTarget instanceof HTMLButtonElement)) return;
    const sourceId = deleteTarget.dataset.deleteSourceId;
    if (!sourceId) return;
    deleteTarget.disabled = true;
    setLibraryStatus("DELETING");
    try {
      await deleteReferenceLibraryEntry(sourceId);
      setMessage("Local SQLite Reference Library 항목을 삭제했습니다.", true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      try { await loadReferenceLibrary(); } catch {}
    }
  });

  clearDiscoveryState({ hide: true });
  clearReferenceDetailState();
  clearReferenceCompareState();
  authStatus.textContent = "LOCAL STARTUP";
  apiStatus.textContent = "LOCAL ONLY";

  void (async () => {
    try {
      await initializeLocalWorkspace();
      authStatus.textContent = "LOCAL ONLY";
      setMessage("Local SQLite 작업 데이터를 사용할 수 있습니다. 유료 AI 기능은 Product Key activation 또는 device resume 후 연결됩니다.", true);
    } catch (error) {
      authStatus.textContent = "LOCAL ERROR";
      renderLibraryError(error instanceof Error ? error.message : String(error));
      setMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    await tryDeviceResume();
  })();
})();
