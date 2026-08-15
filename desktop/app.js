(() => {
  const config = window.MASTERV_DESKTOP_CONFIG || {};
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
  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");
  const message = document.getElementById("message");
  const capBoundary = document.getElementById("cap-boundary");
  const capReferenceCompiler = document.getElementById("cap-reference-compiler");
  const capAnalyze = document.getElementById("cap-analyze");
  const capYoutube = document.getElementById("cap-youtube");
  const capProductTruth = document.getElementById("cap-product-truth");
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

  let session = null;
  let workspaceId = null;
  let detailSourceId = null;
  let youtubeDiscoveryReady = false;
  const selectedSourceIds = new Set();

  libraryPanel.dataset.projection = REFERENCE_LIBRARY_LIST_PROJECTION.join(",");
  detailPanel.dataset.projection = REFERENCE_LIBRARY_DETAIL_PROJECTION.join(",");
  comparePanel.dataset.compiler = "hosted-canonical";
  discoveryPanel.dataset.providerAuthority = "hosted-secret";
  discoveryPanel.dataset.providerCredentialsInClient = "false";
  discoveryPanel.dataset.analysisAuthority = "metadata-only";
  discoveryPanel.dataset.youtubeApiRequests = "0";

  function configured() {
    return Boolean(config.supabase_url && config.supabase_publishable_key && config.api_base_url);
  }

  function setMessage(text, success = false) {
    message.textContent = text || "";
    message.classList.toggle("success", success);
  }

  function setCapability(target, value) {
    if (!target) return;
    target.textContent = value === true ? "READY" : value === false ? "PENDING" : "—";
  }

  function resetCapabilities() {
    [capBoundary, capReferenceCompiler, capAnalyze, capYoutube, capProductTruth].forEach((target) => setCapability(target, null));
    youtubeDiscoveryReady = false;
    updateDiscoveryControl();
    apiStatus.textContent = "NOT CHECKED";
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
    if (!discoverySearch || !discoveryQuery) return;
    discoverySearch.disabled = !session || !youtubeDiscoveryReady || !discoveryQuery.value.trim();
  }

  function clearDiscoveryState({ hide = true, clearQuery = false } = {}) {
    if (hide) discoveryPanel.hidden = true;
    discoveryResults.replaceChildren();
    discoveryCount.textContent = "0";
    discoveryProvider.textContent = "HOSTED";
    discoveryPanel.dataset.youtubeApiRequests = "0";
    if (clearQuery) discoveryQuery.value = "";
    setDiscoveryStatus(session ? (youtubeDiscoveryReady ? "READY" : "NOT CONFIGURED") : "SIGNED OUT", session && youtubeDiscoveryReady ? "ok" : "");
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

  function clearReferenceLibraryState() {
    workspaceId = null;
    libraryPanel.hidden = true;
    libraryWorkspace.textContent = "—";
    libraryCount.textContent = "0";
    libraryList.replaceChildren();
    selectedSourceIds.clear();
    clearReferenceDetailState();
    clearReferenceCompareState({ clearSelection: false });
    setLibraryStatus("SIGNED OUT");
  }

  function setLibraryLoading(label = "LOADING") {
    libraryPanel.hidden = false;
    setLibraryStatus(label);
    libraryList.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "library-state";
    loading.textContent = "보관함을 불러오는 중입니다.";
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
    libraryCompare.disabled = selectedSourceIds.size < 2;
  }

  function pruneSelection(records) {
    const available = new Set(records.map((record) => record.source_id));
    for (const sourceId of selectedSourceIds) {
      if (!available.has(sourceId)) selectedSourceIds.delete(sourceId);
    }
    if (detailSourceId && !available.has(detailSourceId)) clearReferenceDetailState();
    updateCompareControls();
  }

  function renderReferenceLibrary(records) {
    libraryList.replaceChildren();
    libraryCount.textContent = String(records.length);
    setLibraryStatus("READY", "ok");
    pruneSelection(records);

    if (records.length === 0) {
      const empty = document.createElement("p");
      empty.className = "library-state";
      empty.textContent = "아직 저장된 레퍼런스가 없습니다.";
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
      const provenance = document.createElement("span");
      provenance.textContent = `provenance ${record.analysis_provenance}`;
      const revision = document.createElement("span");
      revision.textContent = `rev ${record.revision}`;
      const updated = document.createElement("span");
      updated.textContent = `updated ${formatUpdatedAt(record.updated_at)}`;
      meta.append(provenance, revision, updated);
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

  function renderDiscoveryCandidates(result) {
    discoveryResults.replaceChildren();
    const candidates = Array.isArray(result.candidates) ? result.candidates : [];
    discoveryCount.textContent = String(candidates.length);
    discoveryProvider.textContent = "HOSTED SECRET";
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
      const creator = document.createElement("span");
      creator.textContent = candidate.creator || "채널 미확인";
      const duration = document.createElement("span");
      duration.textContent = typeof candidate.duration_seconds === "number" ? `${candidate.duration_seconds}초` : "길이 미확인";
      const views = document.createElement("span");
      views.textContent = `조회 ${formatViews(candidate.native_metrics?.view_count)}`;
      const published = document.createElement("span");
      published.textContent = candidate.published_at ? formatUpdatedAt(candidate.published_at) : "게시일 미확인";
      meta.append(creator, duration, views, published);
      const url = document.createElement("p");
      url.className = "discovery-url";
      url.textContent = candidate.canonical_url;
      card.append(rank, title, meta, url);
      discoveryResults.append(card);
    });
    setDiscoveryStatus("READY", "ok");
  }

  async function parseError(response) {
    try {
      const body = await response.json();
      return body.msg || body.message || body.error_description || body.details || body.error || `${response.status}`;
    } catch {
      return `${response.status} ${response.statusText}`.trim();
    }
  }

  function authHeaders(activeSession, extra = {}) {
    return {
      apikey: config.supabase_publishable_key,
      Authorization: `Bearer ${activeSession.access_token}`,
      ...extra
    };
  }

  async function login(email, password) {
    const response = await fetch(`${config.supabase_url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: config.supabase_publishable_key, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password })
    });
    if (!response.ok) throw new Error(await parseError(response));
    const body = await response.json();
    if (!body.access_token || !body.user?.id) throw new Error("Supabase session response is incomplete");
    return body;
  }

  async function probeHostedApi(activeSession) {
    const response = await fetch(`${config.api_base_url}/masterv-api-boundary`, {
      method: "GET",
      headers: authHeaders(activeSession, { Accept: "application/json" })
    });
    if (!response.ok) throw new Error(`Hosted API ${await parseError(response)}`);
    const body = await response.json();
    if (body.contract_version !== config.api_contract_version) {
      throw new Error(`Hosted API contract mismatch: ${body.contract_version || "missing"}`);
    }
    if (body.authenticated !== true || body.capabilities?.boundary_probe !== true) {
      throw new Error("Hosted API authentication boundary was not verified");
    }
    return body;
  }

  async function bootstrapPersonalReferenceWorkspace(activeSession) {
    const personalWorkspaceId = `user:${activeSession.user.id}`;
    const params = new URLSearchParams({ on_conflict: "workspace_id,user_id" });
    const response = await fetch(`${config.supabase_url}/rest/v1/masterv_workspace_members?${params.toString()}`, {
      method: "POST",
      headers: authHeaders(activeSession, {
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal"
      }),
      body: JSON.stringify({ workspace_id: personalWorkspaceId, user_id: activeSession.user.id, role: "owner" })
    });
    if (!response.ok) throw new Error(`Workspace bootstrap ${await parseError(response)}`);
    return personalWorkspaceId;
  }

  async function listReferenceLibrary(activeSession, activeWorkspaceId) {
    const params = new URLSearchParams();
    params.set("select", REFERENCE_LIBRARY_LIST_PROJECTION.join(","));
    params.set("workspace_id", `eq.${activeWorkspaceId}`);
    params.set("order", "updated_at.desc,source_id.asc");
    const response = await fetch(`${config.supabase_url}/rest/v1/reference_library_entries?${params.toString()}`, {
      method: "GET",
      headers: authHeaders(activeSession, { Accept: "application/json" })
    });
    if (!response.ok) throw new Error(`Reference Library list ${await parseError(response)}`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error("Reference Library list response is not an array");
    return body;
  }

  async function fetchReferenceDetail(activeSession, activeWorkspaceId, sourceId) {
    const params = new URLSearchParams();
    params.set("select", REFERENCE_LIBRARY_DETAIL_PROJECTION.join(","));
    params.set("workspace_id", `eq.${activeWorkspaceId}`);
    params.set("source_id", `eq.${sourceId}`);
    params.set("limit", "1");
    const response = await fetch(`${config.supabase_url}/rest/v1/reference_library_entries?${params.toString()}`, {
      method: "GET",
      headers: authHeaders(activeSession, { Accept: "application/json" })
    });
    if (!response.ok) throw new Error(`Reference detail ${await parseError(response)}`);
    const body = await response.json();
    if (!Array.isArray(body) || body.length !== 1 || !body[0]?.analysis) {
      throw new Error("Reference detail response is missing persisted analysis");
    }
    return body[0];
  }

  async function compileHostedReferenceWorkflow(activeSession, sourceIds) {
    const response = await fetch(`${config.api_base_url}/masterv-api-boundary`, {
      method: "POST",
      headers: authHeaders(activeSession, { "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ operation: "reference_workflow", source_ids: sourceIds })
    });
    if (!response.ok) throw new Error(`Hosted reference compiler ${await parseError(response)}`);
    const body = await response.json();
    if (body.contract_version !== config.api_contract_version || body.operation !== "reference_workflow") {
      throw new Error("Hosted reference compiler contract mismatch");
    }
    if (body.compiler?.comparison !== "canonical" || body.compiler?.evidence !== "canonical") {
      throw new Error("Hosted reference compiler authority mismatch");
    }
    if (body.authority?.workspace !== "jwt-derived" || body.authority?.persistence !== "user-jwt-rls") {
      throw new Error("Hosted reference compiler authorization authority mismatch");
    }
    if (!body.comparison || !body.evidence_rules) {
      throw new Error("Hosted reference compiler response is incomplete");
    }
    return body;
  }

  async function discoverHostedYouTube(activeSession, query, options) {
    const response = await fetch(`${config.api_base_url}/masterv-api-boundary`, {
      method: "POST",
      headers: authHeaders(activeSession, { "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ operation: "youtube_discovery", query, options })
    });
    if (!response.ok) throw new Error(`Hosted YouTube discovery ${await parseError(response)}`);
    const body = await response.json();
    if (body.contract_version !== config.api_contract_version || body.operation !== "youtube_discovery" || body.provider !== "youtube") {
      throw new Error("Hosted YouTube discovery contract mismatch");
    }
    if (body.provider_authority !== "hosted-secret" || body.analysis_authority !== "metadata-only") {
      throw new Error("Hosted YouTube discovery authority mismatch");
    }
    if (!Array.isArray(body.candidates) || body.diagnostics?.gemini_requests !== 0) {
      throw new Error("Hosted YouTube discovery response is incomplete");
    }
    return body;
  }

  async function loadReferenceLibrary() {
    if (!session || !workspaceId) throw new Error("Reference Library session is not ready");
    setLibraryLoading();
    try {
      const records = await listReferenceLibrary(session, workspaceId);
      renderReferenceLibrary(records);
      return records;
    } catch (error) {
      renderLibraryError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async function loadYouTubeDiscovery() {
    if (!session || !youtubeDiscoveryReady) throw new Error("Hosted YouTube discovery is not ready");
    const query = discoveryQuery.value.trim();
    if (!query) throw new Error("검색어를 입력해 주세요.");
    const options = {
      max_results: 50,
      shortlist_limit: 12,
      min_duration_seconds: 1,
      max_duration_seconds: Number(discoveryDuration.value || 180),
      max_per_creator: 2
    };
    if (discoveryRegion.value) options.region_code = discoveryRegion.value;
    if (discoveryLanguage.value) options.relevance_language = discoveryLanguage.value;

    discoveryResults.replaceChildren();
    discoveryCount.textContent = "0";
    setDiscoveryStatus("SEARCHING");
    try {
      const result = await discoverHostedYouTube(session, query, options);
      renderDiscoveryCandidates(result);
      return result;
    } catch (error) {
      setDiscoveryStatus("ERROR", "error");
      const errorText = document.createElement("p");
      errorText.className = "library-state error-text discovery-empty";
      errorText.textContent = error instanceof Error ? error.message : String(error);
      discoveryResults.replaceChildren(errorText);
      throw error;
    }
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
    appendFact(facts, "Product first seen", formatSeconds(analysis.product_presentation?.first_seen_seconds));
    appendFact(facts, "CTA", analysis.persuasion?.cta || "—");
    appendFact(facts, "Observation segments", String(Array.isArray(analysis.observation_segments) ? analysis.observation_segments.length : 0));
    appendFact(facts, "Provenance", record.analysis_provenance || "—");
    appendFact(facts, "Revision", String(record.revision ?? "—"));
    detailContent.append(heading, facts);
    setDetailStatus("READY", "ok");
  }

  async function loadReferenceDetail(sourceId) {
    if (!session || !workspaceId) throw new Error("Reference Library session is not ready");
    detailPanel.hidden = false;
    detailContent.replaceChildren();
    setDetailStatus("LOADING");
    try {
      const record = await fetchReferenceDetail(session, workspaceId, sourceId);
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

  function renderReferenceComparison(result) {
    const comparison = result.comparison;
    const ruleSet = result.evidence_rules;
    comparePanel.hidden = false;
    compareContent.replaceChildren();
    compareCount.textContent = String(comparison.sample_size ?? 0);

    const authority = document.createElement("p");
    authority.className = "muted small";
    authority.dataset.compilerAuthority = "canonical";
    authority.textContent = "Hosted canonical Compare/Evidence compiler 결과입니다. raw persisted analysis는 비교를 위해 Desktop으로 전송하지 않습니다.";
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

    if (Array.isArray(ruleSet.notes) && ruleSet.notes.length) {
      const notes = document.createElement("ul");
      notes.className = "muted small";
      for (const text of ruleSet.notes) {
        const item = document.createElement("li");
        item.textContent = text;
        notes.append(item);
      }
      compareContent.append(notes);
    }
    setCompareStatus("READY", "ok");
  }

  async function loadReferenceComparison() {
    if (!session || !workspaceId) throw new Error("Reference Library session is not ready");
    const sourceIds = [...selectedSourceIds];
    if (sourceIds.length < 2) throw new Error("비교하려면 레퍼런스를 2개 이상 선택해야 합니다.");
    comparePanel.hidden = false;
    compareContent.replaceChildren();
    compareCount.textContent = String(sourceIds.length);
    setCompareStatus("LOADING");
    try {
      const result = await compileHostedReferenceWorkflow(session, sourceIds);
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

  async function deleteReferenceLibraryEntry(sourceId) {
    if (!session || !workspaceId) throw new Error("Reference Library session is not ready");
    const params = new URLSearchParams();
    params.set("workspace_id", `eq.${workspaceId}`);
    params.set("source_id", `eq.${sourceId}`);
    const response = await fetch(`${config.supabase_url}/rest/v1/reference_library_entries?${params.toString()}`, {
      method: "DELETE",
      headers: authHeaders(session, { Prefer: "return=minimal" })
    });
    if (!response.ok) throw new Error(`Reference Library delete ${await parseError(response)}`);
    selectedSourceIds.delete(sourceId);
    if (detailSourceId === sourceId) clearReferenceDetailState();
    const records = await loadReferenceLibrary();
    if (records.some((record) => record.source_id === sourceId)) {
      throw new Error("Reference Library delete did not converge with persisted state");
    }
    if (selectedSourceIds.size < 2) clearReferenceCompareState({ clearSelection: false });
  }

  async function connect(email, password) {
    session = await login(email, password);
    authStatus.textContent = "AUTHENTICATED";
    authStatus.classList.add("ok");
    const hosted = await probeHostedApi(session);
    apiStatus.textContent = "CONNECTED";
    apiStatus.classList.add("ok");
    setCapability(capBoundary, hosted.capabilities?.boundary_probe);
    setCapability(capReferenceCompiler, hosted.capabilities?.reference_compiler);
    setCapability(capAnalyze, hosted.capabilities?.analyze);
    setCapability(capYoutube, hosted.capabilities?.youtube_discovery);
    setCapability(capProductTruth, hosted.capabilities?.product_truth);
    youtubeDiscoveryReady = hosted.capabilities?.youtube_discovery === true;
    discoveryPanel.hidden = false;
    setDiscoveryStatus(youtubeDiscoveryReady ? "READY" : "NOT CONFIGURED", youtubeDiscoveryReady ? "ok" : "error");
    updateDiscoveryControl();
    logoutButton.hidden = false;

    setLibraryLoading("WORKSPACE");
    try {
      workspaceId = await bootstrapPersonalReferenceWorkspace(session);
      libraryWorkspace.textContent = workspaceId;
      await loadReferenceLibrary();
      setMessage(youtubeDiscoveryReady ? "인증된 hosted API, YouTube Discovery, Reference Library에 연결되었습니다." : "인증된 hosted API와 Reference Library에 연결되었습니다. YouTube Discovery hosted secret은 아직 설정되지 않았습니다.", true);
    } catch (error) {
      renderLibraryError(error instanceof Error ? error.message : String(error));
      setMessage("Hosted API는 연결되었지만 Reference Library 초기화에 실패했습니다.");
    }
  }

  function logout() {
    session = null;
    youtubeDiscoveryReady = false;
    authStatus.textContent = "SIGNED OUT";
    authStatus.classList.remove("ok");
    apiStatus.classList.remove("ok");
    resetCapabilities();
    clearDiscoveryState({ hide: true, clearQuery: true });
    clearReferenceLibraryState();
    logoutButton.hidden = true;
    passwordInput.value = "";
    setMessage("세션과 Search/Discovery, Reference Library 상세/비교 화면을 이 프로세스 메모리에서 제거했습니다.", true);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");
    resetCapabilities();
    clearDiscoveryState({ hide: true });
    clearReferenceLibraryState();
    if (!configured()) {
      setMessage("이 Desktop 빌드에는 Supabase/Hosted API public config가 주입되지 않았습니다.");
      return;
    }
    loginButton.disabled = true;
    authStatus.textContent = "CONNECTING";
    try {
      await connect(emailInput.value, passwordInput.value);
    } catch (error) {
      session = null;
      youtubeDiscoveryReady = false;
      authStatus.textContent = "SIGNED OUT";
      authStatus.classList.remove("ok");
      apiStatus.textContent = "FAILED";
      apiStatus.classList.remove("ok");
      clearDiscoveryState({ hide: true });
      clearReferenceLibraryState();
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      loginButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", logout);

  discoveryQuery.addEventListener("input", updateDiscoveryControl);

  discoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session || !youtubeDiscoveryReady) return;
    discoverySearch.disabled = true;
    try {
      const result = await loadYouTubeDiscovery();
      setMessage(`Hosted YouTube metadata discovery로 ${result.candidates.length}개 후보를 불러왔습니다.`, true);
      discoveryPanel.scrollIntoView({ block: "start" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      updateDiscoveryControl();
    }
  });

  libraryRefresh.addEventListener("click", async () => {
    if (!session || !workspaceId) return;
    libraryRefresh.disabled = true;
    try {
      await loadReferenceLibrary();
      setMessage("Reference Library를 새로고침했습니다.", true);
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
      setMessage("선택한 레퍼런스를 hosted canonical Compare/Evidence compiler로 처리했습니다.", true);
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
    if (target.checked) selectedSourceIds.add(sourceId);
    else selectedSourceIds.delete(sourceId);
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
        setMessage("선택한 레퍼런스의 persisted analysis를 상세 화면에 불러왔습니다.", true);
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
      setMessage("Reference Library 항목을 삭제했습니다.", true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      try {
        await loadReferenceLibrary();
      } catch {
        // The library error state is already rendered by loadReferenceLibrary.
      }
    }
  });

  clearDiscoveryState({ hide: true });
  clearReferenceLibraryState();
  if (!configured()) {
    setMessage("Desktop shell static build 완료. Runtime public config는 아직 연결되지 않았습니다.");
  }
})();
