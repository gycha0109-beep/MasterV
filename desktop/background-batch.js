(() => {
  "use strict";

  function initialize(backend) {
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

  if (!backend || !panel || !cap || !form || !urlInput || !submit || !refresh || !status || !providerPrecondition || !liveVerified || !activation || !count || !list || !logout) return;

  let session = null;
  let submitReady = false;
  let probeInFlight = false;
  let listInFlight = false;

  panel.dataset.providerAuthority = "hosted-secret";
  panel.dataset.providerCredentialsInClient = "false";
  panel.dataset.modelAuthority = "hosted-config";
  panel.dataset.persistenceAuthority = "durable-ledger";
  panel.dataset.ledgerWriteAuthority = "hosted-admin-only";
  panel.dataset.workspaceAuthority = "jwt-derived-personal";
  panel.dataset.createIdempotency = "request-id-reservation";
  panel.dataset.autoRetry = "false";
  panel.dataset.referenceLibraryWrites = "0";
  panel.dataset.directGeminiRequests = "0";
  panel.dataset.transportAuthority = "backend-provider";

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
    submit.disabled = !session || !submitReady || !urlInput.value.trim();
    refresh.disabled = !session || listInFlight;
  }

  function applyCapability(body) {
    const capabilities = body?.capabilities;
    if (body?.contract_version !== "background-batch-hosted-v1" || capabilities?.boundary_probe !== true || capabilities?.durable_ledger !== true) return false;
    providerPrecondition.textContent = capabilities.provider_precondition_confirmed ? "CONFIRMED" : "BLOCKED";
    liveVerified.textContent = capabilities.live_batch_verified ? "VERIFIED" : "NOT VERIFIED";
    activation.textContent = capabilities.desktop_submit_enabled ? "ENABLED" : "OFF";
    setCapability(capabilities.submit === true);
    setStatus(capabilities.submit === true ? "READY" : "PROVIDER PRECONDITION BLOCKED", capabilities.submit === true ? "ok" : "error");
    panel.hidden = !session;
    return true;
  }

  async function refreshCapability() {
    if (!session || probeInFlight) return;
    probeInFlight = true;
    try {
      const body = await backend.remoteOperations.probeBackgroundBatch(session);
      if (!applyCapability(body)) throw new Error("Background Batch capability contract mismatch");
    } catch (error) {
      setCapability(false);
      setStatus(error instanceof Error ? error.message : String(error), "error");
    } finally {
      probeInFlight = false;
    }
  }

  function terminal(value) {
    return ["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"].includes(value);
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
    if (!session || listInFlight) return;
    listInFlight = true;
    updateControls();
    try {
      const body = await backend.remoteOperations.listBackgroundBatchJobs(session);
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
    if (!session || !submitReady || !urlInput.value.trim()) return;
    const requestId = crypto.randomUUID();
    submit.disabled = true;
    setStatus("SUBMITTING");
    try {
      const request = { operation: "background_batch_submit", request_id: requestId, url: urlInput.value.trim() };
      await backend.remoteOperations.submitBackgroundBatchJob(session, request.request_id, request.url);
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
    if (!session || !requestId) return;
    setStatus("CHECKING");
    try {
      const request = { operation: "background_batch_check", request_id: requestId };
      await backend.remoteOperations.checkBackgroundBatchJob(session, request.request_id);
      setStatus("CHECKED", "ok");
      await refreshJobs();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
  }

  function clearState() {
    session = null;
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

  backend.session.subscribe((nextSession) => {
    if (!nextSession) {
      clearState();
      return;
    }
    session = nextSession;
    panel.hidden = false;
    setCapability(null);
    setStatus("CHECK REQUIRED");
    updateControls();
  });

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
  logout.addEventListener("click", clearState);
  list.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-batch-check-request-id]") : null;
    if (button instanceof HTMLButtonElement) void checkJob(button.dataset.batchCheckRequestId);
  });
  }

  if (window.MASTERV_BACKEND) initialize(window.MASTERV_BACKEND);
  else window.addEventListener("masterv:backend-ready", () => initialize(window.MASTERV_BACKEND), { once: true });
})();
