(() => {
  "use strict";

  function normalizedBaseUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  async function parseError(response) {
    try {
      const body = await response.json();
      return body.msg || body.message || body.error_description || body.details || body.error || body.code || `${response.status}`;
    } catch {
      return `${response.status} ${response.statusText}`.trim();
    }
  }

  function create(config = {}, fetchImpl = window.fetch.bind(window)) {
    const apiBaseUrl = normalizedBaseUrl(config.api_base_url);
    const publishableKey = String(config.supabase_publishable_key || "").trim();
    const apiContractVersion = String(config.api_contract_version || "").trim();

    function configured() {
      return Boolean(apiBaseUrl && publishableKey && apiContractVersion);
    }

    function requireSession(session) {
      if (!configured()) throw new Error("Legacy hosted API client is not configured");
      if (!session?.credential) throw new Error("Authenticated provider session is required");
    }

    function authHeaders(session, extra = {}) {
      requireSession(session);
      return { apikey: publishableKey, Authorization: `Bearer ${session.credential}`, ...extra };
    }

    async function requestBoundary(session, method, body) {
      const response = await fetchImpl(`${apiBaseUrl}/masterv-api-boundary`, {
        method,
        headers: authHeaders(session, { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }),
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (!response.ok) throw new Error(await parseError(response));
      return await response.json();
    }

    async function probeCapabilities(session) {
      const body = await requestBoundary(session, "GET");
      if (body.contract_version !== apiContractVersion || body.authenticated !== true || body.capabilities?.boundary_probe !== true) throw new Error("Hosted API authentication boundary was not verified");
      return body;
    }

    async function compileReferenceWorkflow(session, sourceIds) {
      const body = await requestBoundary(session, "POST", { operation: "reference_workflow", source_ids: sourceIds });
      if (body.contract_version !== apiContractVersion || body.operation !== "reference_workflow") throw new Error("Hosted reference compiler contract mismatch");
      if (body.compiler?.comparison !== "canonical" || body.compiler?.evidence !== "canonical") throw new Error("Hosted reference compiler authority mismatch");
      if (body.authority?.workspace !== "jwt-derived" || body.authority?.persistence !== "user-jwt-rls") throw new Error("Hosted reference compiler authorization authority mismatch");
      if (!body.comparison || !body.evidence_rules) throw new Error("Hosted reference compiler response is incomplete");
      return body;
    }

    async function discoverYouTube(session, query, options) {
      const body = await requestBoundary(session, "POST", { operation: "youtube_discovery", query, options });
      if (body.contract_version !== apiContractVersion || body.operation !== "youtube_discovery" || body.provider !== "youtube") throw new Error("Hosted YouTube discovery contract mismatch");
      if (body.provider_authority !== "hosted-secret" || body.analysis_authority !== "metadata-only") throw new Error("Hosted YouTube discovery authority mismatch");
      if (!Array.isArray(body.candidates) || body.diagnostics?.gemini_requests !== 0) throw new Error("Hosted YouTube discovery response is incomplete");
      return body;
    }

    async function analyzeYouTube(session, url) {
      const body = await requestBoundary(session, "POST", { operation: "youtube_deep_analysis", url });
      if (body.contract_version !== apiContractVersion || body.operation !== "youtube_deep_analysis" || body.provider !== "gemini") throw new Error("Hosted Deep Analysis response contract mismatch");
      if (body.provider_authority !== "hosted-secret" || body.compute_authority !== "hosted-deep-analysis" || body.analysis_tier !== "deep" || body.persistence_authority !== "none") throw new Error("Hosted Deep Analysis authority mismatch");
      if (!body.analysis || !body.derived_metrics || body.diagnostics?.gemini_requests !== 1 || body.diagnostics?.persistence_writes !== 0) throw new Error("Hosted Deep Analysis response is incomplete");
      return body;
    }

    async function generateProductionGuidance(session, analysis, productTruth) {
      const body = await requestBoundary(session, "POST", { operation: "production_guidance", analysis, product_truth: productTruth });
      if (body.contract_version !== apiContractVersion || body.operation !== "production_guidance") throw new Error("Hosted Production Guidance response contract mismatch");
      if (body.provider_authority !== "hosted-secret" || body.compute_authority !== "hosted-production-guidance" || body.product_truth_authority !== "user-input-raw" || body.reference_analysis_authority !== "validated-hosted-result-transit" || body.metrics_authority !== "server-derived" || body.persistence_authority !== "none") throw new Error("Hosted Production Guidance authority mismatch");
      if (!body.guide || body.diagnostics?.persistence_writes !== 0 || body.diagnostics?.background_batch_requests !== 0) throw new Error("Hosted Production Guidance response is incomplete");
      return body;
    }

    async function requestBackgroundBatch(session, method, payload) {
      const response = await fetchImpl(`${apiBaseUrl}/masterv-background-batch-boundary`, {
        method,
        headers: authHeaders(session, { Accept: "application/json", ...(payload === undefined ? {} : { "Content-Type": "application/json" }) }),
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
      });
      if (!response.ok && !(payload?.operation === "background_batch_check" && response.status === 409)) throw new Error(await parseError(response));
      return await response.json();
    }

    async function probeBackgroundBatch(session) {
      const body = await requestBackgroundBatch(session, "GET");
      if (body?.contract_version !== "background-batch-hosted-v1" || body?.capabilities?.boundary_probe !== true || body?.capabilities?.durable_ledger !== true) throw new Error("Background Batch capability contract mismatch");
      return body;
    }

    async function listBackgroundBatchJobs(session) {
      return await requestBackgroundBatch(session, "POST", { operation: "background_batch_list" });
    }

    async function submitBackgroundBatchJob(session, requestId, url) {
      return await requestBackgroundBatch(session, "POST", { operation: "background_batch_submit", request_id: requestId, url });
    }

    async function checkBackgroundBatchJob(session, requestId) {
      return await requestBackgroundBatch(session, "POST", { operation: "background_batch_check", request_id: requestId });
    }

    return { configured, probeCapabilities, compileReferenceWorkflow, discoverYouTube, analyzeYouTube, generateProductionGuidance, probeBackgroundBatch, listBackgroundBatchJobs, submitBackgroundBatchJob, checkBackgroundBatchJob };
  }

  window.MASTERV_LEGACY_HOSTED_API_CLIENT = Object.freeze({ create });
})();
