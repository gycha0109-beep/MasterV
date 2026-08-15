(() => {
  const config = window.MASTERV_DESKTOP_CONFIG || {};
  const originalFetch = window.fetch.bind(window);
  const panel = document.getElementById("background-batch-panel");
  const cap = document.getElementById("cap-background-batch");
  const form = document.getElementById("background-batch-form");
  const urlInput = document.getElementById("background-batch-url");
  const submit = document.getElementById("background-batch-submit");
  const refresh = document.getElementById("background-batch-refresh");
  const status = document.getElementById("background-batch-status");
  const providerPrecondition = document.getElementById("background-batch-provider-precondition");
  const liveVerified = document.getElementById("background-batch-live-verified");
  const activation = document.getElementById("background-batch-activation");
  const count = document.getElementById("background-batch-count");
  const list = document.getElementById("background-batch-list");
  const logout = document.getElementById("logout-button");

  if (!panel || !cap || !form || !urlInput || !submit || !refresh || !status || !providerPrecondition || !liveVerified || !activation || !count || !list || !logout) return;

  let accessToken = "";
  let submitReady = false;
  let probeInFlight = false;
  let listInFlight = false;

  panel.dataset.providerAuthority = "hosted-secret";
  panel.dataset.modelAuthority = "hosted-config";
  panel.dataset.persistenceAuthority = "durable-ledger";
  panel.dataset.ledgerWriteAuthority = "hosted-admin-only";
  panel.dataset.workspaceAuthority = "jwt-derived-personal";
  panel.dataset.createIdempotency = "request-id-reservation";
  panel.dataset.autoRetry = "false";
  panel.dataset.referenceLibraryWrites = "0";
  panel.dataset.directGeminiRequests = "0";

  function setStatus(text, tone = "") {
    status.textContent = text;
    status.classList.toggle("ok", tone === "ok");
    status.classList.toggle("error", tone === "error");
  }

  function setCapability(value) {
    submitReady = value === true;
    cap.textContent = value === true ? "READY" : value === false ? "BLOCKED" : "—";
    updateControls();
  }

  function updateControls() {
    submit.disabled = !accessToken || !submitReady || !urlInput.value.trim();
    refresh.disabled = !accessToken || listInFlight;
  }

  function requestUrl(input) {
    return typeof input === "string" ? input : input instanceof URL ? input.toString() : input instanceof Request ? input.url : "";
  }

  function authorizationFrom(input, init) {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const authorization = headers.get("Authorization") || headers.get("authorization") || "";
    return authorization.replace(/^Bearer\s+/i, "").trim();
  }

  function authHeaders(extra = {}) {
    return {
      apikey: config.supabase_publishable_key,
      Authorization: `Bearer ${accessToken}`,
      ...extra
    };
  }

  async function parseError(response) {
    try {
      const body = await response.json();
      return body.error || body.message || body.code || `${response.status}`;
    } catch {
      return `${response.status} ${response.statusText}`.trim();
    }
  }

  function applyCapability(body) {
    const capabilities = body?.capabilities;
    if (body?.contract_version !== "background-batch-hosted-v1" || capabilities?.boundary_probe !== true || capabilities?.durable_ledger !== true) return false;
    providerPrecondition.textContent = capabilities.provider_precondition_confirmed ? "CONFIRMED" : "BLOCKED";
    liveVerified.textContent = capabilities.live_batch_verified ? "VERIFIED" : "NOT VERIFIED";
    activation.textContent = capabilities.desktop_submit_enabled ? "ENABLED" : "OFF";
    setCapability(capabilities.submit === true);
    setStatus(capabilities.submit === true ? "READY" : "PROVIDER PRECONDITION BLOCKED", capabilities.submit === true ? "ok" : "error");
    panel.hidden = !accessToken;
    return true;
  }

  async function refreshCapability() {
    if (!accessToken || probeInFlight) return;
    probeInFlight = true;
    try {
      const response = await originalFetch(`${config.api_base_url}/masterv-background-batch-boundary`, {
        method: "GET",
        headers: authHeaders({ Accept: "application/json" })
      });
      if (!response.ok) throw new Error(await parseError(response));
      const body = await response.json();
      if (!applyCapability(body)) throw new Error("Background Batch capability contract mismatch");
    } catch (error) {
      setCapability(false);
      setStatus(error instanceof Error ? error.message : String(error), "error");
    } finally {
      probeInFlight = false;
    }
  }

  function terminal(statusValue) {
    return ["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"].includes(statusValue);
  }

  function renderJobs(jobs) {
    list.replaceChildren();
    const rows = Array.isArray(jobs) ? jobs : [];
    count.textContent = String(rows.length);
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "library-state";
      empty.textContent = "Background Batch job이 없습니다.";
      list.append(empty);
      return;
    }

    for (const job of rows) {
      const item = document.createElement("article");
      item.className = "library-item";
      item.dataset.batchRequestId = job.request_id;
      const content = document.createElement("div");
      content.className = "library-item-main";
      const title = document.createElement("strong");
      title.className = "library-label";
      title.textContent = job.source_id || job.request_id;
      const url = document.createElement("div");
      url.className = "library-url";
      url.textContent = job.canonical_url || "—";
      const meta = document.createElement("div");
      meta.className = "library-meta";
      for (const text of [job.status || "—", job.model || "—", job.provider_state || "provider pending"]) {
        const span = document.createElement("span");
        span.textContent = text;
        meta.append(span);
      }
      content.append(title, url, meta);

      const actions = document.createElement("div");
      actions.className = "library-item-actions";
      if (!terminal(job.status) && job.provider_job_name) {
        const check = document.createElement("button");
        check.type = "button";
        check.className = "secondary compact";
        check.dataset.batchCheckRequestId = job.request_id;
        check.textContent = "상태 확인";
        actions.append(check);
      }
      item.append(content, actions);
      list.append(item);
    }
  }

  async function refreshJobs() {
    if (!accessToken || listInFlight) return;
    listInFlight = true;
    updateControls();
    try {
      const response = await originalFetch(`${config.api_base_url}/masterv-background-batch-boundary`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ operation: "background_batch_list" })
      });
      if (!response.ok) throw new Error(await parseError(response));
      const body = await response.json();
      renderJobs(body.jobs);
    } catch (error) {
      list.replaceChildren();
      const message = document.createElement("p");
      message.className = "library-state error-text";
      message.textContent = error instanceof Error ? error.message : String(error);
      list.append(message);
      count.textContent = "—";
    } finally {
      listInFlight = false;
      updateControls();
    }
  }

  async function submitJob() {
    if (!accessToken || !submitReady || !urlInput.value.trim()) return;
    const requestId = crypto.randomUUID();
    submit.disabled = true;
    setStatus("SUBMITTING");
    try {
      const response = await originalFetch(`${config.api_base_url}/masterv-background-batch-boundary`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ operation: "background_batch_submit", request_id: requestId, url: urlInput.value.trim() })
      });
      if (!response.ok) throw new Error(await parseError(response));
      setStatus("SUBMITTED", "ok");
      await refreshJobs();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), "error");
      await refreshCapability();
    } finally {
      updateControls();
    }
  }

  async function checkJob(requestId) {
    if (!accessToken || !requestId) return;
    setStatus("CHECKING");
    try {
      const response = await originalFetch(`${config.api_base_url}/masterv-background-batch-boundary`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ operation: "background_batch_check", request_id: requestId })
      });
      if (!response.ok && response.status !== 409) throw new Error(await parseError(response));
      setStatus("CHECKED", "ok");
      await refreshJobs();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
  }

  function clearState() {
    accessToken = "";
    submitReady = false;
    panel.hidden = true;
    urlInput.value = "";
    count.textContent = "0";
    list.replaceChildren();
    providerPrecondition.textContent = "—";
    liveVerified.textContent = "—";
    activation.textContent = "OFF";
    setCapability(null);
    setStatus("SIGNED OUT");
  }

  window.fetch = async function masterVBackgroundBatchFetch(input, init) {
    const token = authorizationFrom(input, init);
    const url = requestUrl(input);
    const isHostedFunction = url.includes("/functions/v1/");
    const tokenChanged = Boolean(isHostedFunction && token && token !== accessToken);
    if (tokenChanged) {
      accessToken = token;
      panel.hidden = false;
      setStatus("CHECK REQUIRED");
      updateControls();
    }
    return await originalFetch(input, init);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitJob();
  });
  urlInput.addEventListener("input", updateControls);
  refresh.addEventListener("click", () => {
    void (async () => {
      await refreshCapability();
      await refreshJobs();
    })();
  });
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-batch-check-request-id]");
    if (button) void checkJob(button.dataset.batchCheckRequestId);
  });
  logout.addEventListener("click", clearState);
  clearState();
})();
