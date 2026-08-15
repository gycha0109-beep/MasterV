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

  const authStatus = document.getElementById("auth-status");
  const apiStatus = document.getElementById("api-status");
  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");
  const message = document.getElementById("message");
  const capBoundary = document.getElementById("cap-boundary");
  const capAnalyze = document.getElementById("cap-analyze");
  const capYoutube = document.getElementById("cap-youtube");
  const capProductTruth = document.getElementById("cap-product-truth");
  const libraryPanel = document.getElementById("reference-library-panel");
  const libraryStatus = document.getElementById("library-status");
  const libraryWorkspace = document.getElementById("library-workspace");
  const libraryCount = document.getElementById("library-count");
  const libraryList = document.getElementById("reference-library-list");
  const libraryRefresh = document.getElementById("library-refresh");

  let session = null;
  let workspaceId = null;

  libraryPanel.dataset.projection = REFERENCE_LIBRARY_LIST_PROJECTION.join(",");

  function configured() {
    return Boolean(config.supabase_url && config.supabase_publishable_key && config.api_base_url);
  }

  function setMessage(text, success = false) {
    message.textContent = text || "";
    message.classList.toggle("success", success);
  }

  function setCapability(target, value) {
    target.textContent = value === true ? "READY" : value === false ? "PENDING" : "—";
  }

  function resetCapabilities() {
    [capBoundary, capAnalyze, capYoutube, capProductTruth].forEach((target) => setCapability(target, null));
    apiStatus.textContent = "NOT CHECKED";
  }

  function setLibraryStatus(text, tone = "") {
    libraryStatus.textContent = text;
    libraryStatus.classList.toggle("ok", tone === "ok");
    libraryStatus.classList.toggle("error", tone === "error");
  }

  function clearReferenceLibraryState() {
    workspaceId = null;
    libraryPanel.hidden = true;
    libraryWorkspace.textContent = "—";
    libraryCount.textContent = "0";
    libraryList.replaceChildren();
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
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function renderReferenceLibrary(records) {
    libraryList.replaceChildren();
    libraryCount.textContent = String(records.length);
    setLibraryStatus("READY", "ok");

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

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger ghost";
      remove.dataset.deleteSourceId = record.source_id;
      remove.textContent = "삭제";

      item.append(content, remove);
      libraryList.append(item);
    }
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
      headers: {
        apikey: config.supabase_publishable_key,
        "Content-Type": "application/json"
      },
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
      body: JSON.stringify({
        workspace_id: personalWorkspaceId,
        user_id: activeSession.user.id,
        role: "owner"
      })
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

  async function loadReferenceLibrary() {
    if (!session || !workspaceId) throw new Error("Reference Library session is not ready");
    setLibraryLoading();
    try {
      const records = await listReferenceLibrary(session, workspaceId);
      renderReferenceLibrary(records);
      return records;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      renderLibraryError(text);
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
    const records = await loadReferenceLibrary();
    if (records.some((record) => record.source_id === sourceId)) {
      throw new Error("Reference Library delete did not converge with persisted state");
    }
  }

  async function connect(email, password) {
    session = await login(email, password);
    authStatus.textContent = "AUTHENTICATED";
    authStatus.classList.add("ok");
    const hosted = await probeHostedApi(session);
    apiStatus.textContent = "CONNECTED";
    apiStatus.classList.add("ok");
    setCapability(capBoundary, hosted.capabilities?.boundary_probe);
    setCapability(capAnalyze, hosted.capabilities?.analyze);
    setCapability(capYoutube, hosted.capabilities?.youtube_discovery);
    setCapability(capProductTruth, hosted.capabilities?.product_truth);
    logoutButton.hidden = false;

    setLibraryLoading("WORKSPACE");
    try {
      workspaceId = await bootstrapPersonalReferenceWorkspace(session);
      libraryWorkspace.textContent = workspaceId;
      await loadReferenceLibrary();
      setMessage("인증된 hosted API와 Reference Library에 연결되었습니다.", true);
    } catch (error) {
      renderLibraryError(error instanceof Error ? error.message : String(error));
      setMessage("Hosted API는 연결되었지만 Reference Library 초기화에 실패했습니다.");
    }
  }

  function logout() {
    session = null;
    authStatus.textContent = "SIGNED OUT";
    authStatus.classList.remove("ok");
    apiStatus.classList.remove("ok");
    resetCapabilities();
    clearReferenceLibraryState();
    logoutButton.hidden = true;
    passwordInput.value = "";
    setMessage("세션과 보관함 화면을 이 프로세스 메모리에서 제거했습니다.", true);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");
    resetCapabilities();
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
      authStatus.textContent = "SIGNED OUT";
      authStatus.classList.remove("ok");
      apiStatus.textContent = "FAILED";
      apiStatus.classList.remove("ok");
      clearReferenceLibraryState();
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      loginButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", logout);

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

  libraryList.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-delete-source-id]") : null;
    if (!(target instanceof HTMLButtonElement)) return;
    const sourceId = target.dataset.deleteSourceId;
    if (!sourceId) return;
    target.disabled = true;
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

  clearReferenceLibraryState();
  if (!configured()) {
    setMessage("Desktop shell static build 완료. Runtime public config는 아직 연결되지 않았습니다.");
  }
})();
