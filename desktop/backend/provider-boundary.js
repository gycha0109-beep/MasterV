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
    if (!provider || typeof provider !== "object") throw new TypeError(`${label} provider is required`);
    for (const method of requiredMethods) {
      if (typeof provider[method] !== "function") throw new TypeError(`${label} provider is missing method ${method}`);
    }
    return provider;
  }

  function createBackendProvider({ session, workData, remoteOperations, authority = {} }) {
    const sessionProvider = assertProvider("session", session, REQUIRED_METHODS.session);
    const workDataProvider = assertProvider("workData", workData, REQUIRED_METHODS.workData);
    const remoteOperationsProvider = assertProvider("remoteOperations", remoteOperations, REQUIRED_METHODS.remoteOperations);
    const sessionListeners = new Set();
    const capabilityListeners = new Set();
    let activeSession = null;
    let capabilitySnapshot = null;

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

    function notify(listeners, value) {
      for (const listener of [...listeners]) listener(value);
    }

    const sessionRuntime = Object.freeze({
      configured: sessionProvider.configured.bind(sessionProvider),
      async openSession(credentials) {
        const nextSession = await sessionProvider.openSession(credentials);
        activeSession = nextSession;
        capabilitySnapshot = null;
        notify(capabilityListeners, null);
        notify(sessionListeners, activeSession);
        return activeSession;
      },
      async closeSession(sessionToClose = activeSession) {
        const closingSession = sessionToClose || activeSession;
        activeSession = null;
        capabilitySnapshot = null;
        notify(capabilityListeners, null);
        notify(sessionListeners, null);
        return await sessionProvider.closeSession(closingSession);
      },
      describeSession: sessionProvider.describeSession.bind(sessionProvider),
      current() {
        return activeSession;
      },
      subscribe(listener) {
        if (typeof listener !== "function") throw new TypeError("session listener must be a function");
        sessionListeners.add(listener);
        listener(activeSession);
        return () => sessionListeners.delete(listener);
      }
    });

    const remoteRuntime = Object.freeze({
      configured: remoteOperationsProvider.configured.bind(remoteOperationsProvider),
      async probeCapabilities(session = activeSession) {
        const body = await remoteOperationsProvider.probeCapabilities(session);
        capabilitySnapshot = body;
        notify(capabilityListeners, capabilitySnapshot);
        return body;
      },
      compileReferenceWorkflow: remoteOperationsProvider.compileReferenceWorkflow.bind(remoteOperationsProvider),
      discoverYouTube: remoteOperationsProvider.discoverYouTube.bind(remoteOperationsProvider),
      analyzeYouTube: remoteOperationsProvider.analyzeYouTube.bind(remoteOperationsProvider),
      generateProductionGuidance: remoteOperationsProvider.generateProductionGuidance.bind(remoteOperationsProvider),
      probeBackgroundBatch: remoteOperationsProvider.probeBackgroundBatch.bind(remoteOperationsProvider),
      listBackgroundBatchJobs: remoteOperationsProvider.listBackgroundBatchJobs.bind(remoteOperationsProvider),
      submitBackgroundBatchJob: remoteOperationsProvider.submitBackgroundBatchJob.bind(remoteOperationsProvider),
      checkBackgroundBatchJob: remoteOperationsProvider.checkBackgroundBatchJob.bind(remoteOperationsProvider),
      currentCapabilities() {
        return capabilitySnapshot;
      },
      subscribeCapabilities(listener) {
        if (typeof listener !== "function") throw new TypeError("capability listener must be a function");
        capabilityListeners.add(listener);
        listener(capabilitySnapshot);
        return () => capabilityListeners.delete(listener);
      }
    });

    return Object.freeze({
      contract_version: CONTRACT_VERSION,
      authority: frozenAuthority,
      configured,
      session: sessionRuntime,
      workData: Object.freeze(workDataProvider),
      remoteOperations: remoteRuntime
    });
  }

  window.MASTERV_BACKEND_PROVIDER_CONTRACT = Object.freeze({
    contract_version: CONTRACT_VERSION,
    required_methods: REQUIRED_METHODS,
    createBackendProvider
  });
})();
