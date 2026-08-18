(() => {
  "use strict";

  const CONTRACT_VERSION = "mv-backend-provider-v1";
  const REQUIRED_METHODS = Object.freeze({
    session: Object.freeze([
      "configured",
      "openSession",
      "closeSession",
      "describeSession"
    ]),
    workData: Object.freeze([
      "configured",
      "bootstrapPersonalWorkspace",
      "listReferenceLibrary",
      "fetchReferenceDetail",
      "deleteReferenceLibraryEntry"
    ]),
    remoteOperations: Object.freeze([
      "configured",
      "probeCapabilities",
      "compileReferenceWorkflow",
      "discoverYouTube",
      "analyzeYouTube",
      "generateProductionGuidance",
      "probeBackgroundBatch",
      "listBackgroundBatchJobs",
      "submitBackgroundBatchJob",
      "checkBackgroundBatchJob"
    ])
  });

  function assertProvider(label, provider, requiredMethods) {
    if (!provider || typeof provider !== "object") {
      throw new TypeError(`${label} provider is required`);
    }
    for (const method of requiredMethods) {
      if (typeof provider[method] !== "function") {
        throw new TypeError(`${label} provider is missing method ${method}`);
      }
    }
    return provider;
  }

  function createBackendProvider({ session, workData, remoteOperations, authority = {} }) {
    const sessionProvider = assertProvider("session", session, REQUIRED_METHODS.session);
    const workDataProvider = assertProvider("workData", workData, REQUIRED_METHODS.workData);
    const remoteOperationsProvider = assertProvider("remoteOperations", remoteOperations, REQUIRED_METHODS.remoteOperations);

    const frozenAuthority = Object.freeze({
      migration_stage: "MV-SUPABASE-EXIT-1B",
      provider_boundary_active: true,
      consumer_wired: false,
      product_authority_active: false,
      legacy_authority_unchanged: true,
      ...authority
    });

    function configured() {
      return sessionProvider.configured() && workDataProvider.configured() && remoteOperationsProvider.configured();
    }

    return Object.freeze({
      contract_version: CONTRACT_VERSION,
      authority: frozenAuthority,
      configured,
      session: Object.freeze(sessionProvider),
      workData: Object.freeze(workDataProvider),
      remoteOperations: Object.freeze(remoteOperationsProvider)
    });
  }

  window.MASTERV_BACKEND_PROVIDER_CONTRACT = Object.freeze({
    contract_version: CONTRACT_VERSION,
    required_methods: REQUIRED_METHODS,
    createBackendProvider
  });
})();
