(() => {
  "use strict";

  function create(invoke = window.__TAURI__?.core?.invoke) {
    function configured() {
      return typeof invoke === "function";
    }

    function requireSession(session) {
      if (!configured()) throw new Error("Native MasterV Gateway remote provider is unavailable");
      if (!session?.credential || session.provider !== "masterv-gateway") {
        throw new Error("A MasterV Gateway session is required");
      }
      return session.credential;
    }

    async function probeCapabilities(session) {
      const sessionCredential = requireSession(session);
      const body = await invoke("desktop_gateway_entitlement", { sessionCredential });
      const entitlement = body?.entitlement || session.entitlement || {};
      const capabilities = entitlement.capabilities || {};
      return Object.freeze({
        contract_version: "mv-gateway-desktop-v1",
        provider: "masterv-gateway",
        entitlement,
        capabilities: Object.freeze({
          boundary_probe: true,
          reference_compiler: false,
          analyze: capabilities.analyze === true,
          youtube_discovery: capabilities.discovery === true,
          deep_analysis_route: true,
          deep_analysis: capabilities.analyze === true,
          product_truth_route: true,
          product_truth: capabilities.guidance === true,
          production_guidance_route: true,
          production_guidance: capabilities.guidance === true,
          background_batch: false
        })
      });
    }

    async function compileReferenceWorkflow() {
      throw new Error("Reference comparison is local-only in the 0.1.2 bridge and is wired by EXIT-2C");
    }

    async function discoverYouTube(session, query, options = {}) {
      const sessionCredential = requireSession(session);
      return await invoke("desktop_gateway_discover", { sessionCredential, query, options });
    }

    async function analyzeYouTube(session, url) {
      const sessionCredential = requireSession(session);
      const body = await invoke("desktop_gateway_analyze", { sessionCredential, url });
      if (!body?.analysis || !body?.source) throw new Error("MasterV Gateway analyze response is incomplete");
      return Object.freeze({
        ...body,
        diagnostics: Object.freeze({
          gemini_requests: body.provider === "gemini" ? 1 : 0,
          persistence_writes: 0,
          persistence_authority: "none"
        })
      });
    }

    async function generateProductionGuidance(session, analysis, productTruth) {
      const sessionCredential = requireSession(session);
      return await invoke("desktop_gateway_guidance", {
        sessionCredential,
        analysis,
        productTruth
      });
    }

    async function unavailableBatch() {
      throw new Error("Background Batch remains a transition-only legacy surface and is not exposed by the stateless Gateway");
    }

    return Object.freeze({
      configured,
      probeCapabilities,
      compileReferenceWorkflow,
      discoverYouTube,
      analyzeYouTube,
      generateProductionGuidance,
      probeBackgroundBatch: unavailableBatch,
      listBackgroundBatchJobs: unavailableBatch,
      submitBackgroundBatchJob: unavailableBatch,
      checkBackgroundBatchJob: unavailableBatch,
      authority: Object.freeze({
        compute: "masterv-gateway",
        provider_secrets: "gateway-only",
        persistence: "none",
        background_batch: "legacy-transition-only"
      })
    });
  }

  window.MASTERV_GATEWAY_REMOTE_PROVIDER = Object.freeze({ create });
})();
