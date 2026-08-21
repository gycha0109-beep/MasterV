(() => {
  "use strict";

  const contract = window.MASTERV_BACKEND_PROVIDER_CONTRACT;
  const gatewaySessionFactory = window.MASTERV_GATEWAY_SESSION_PROVIDER;
  const gatewayRemoteFactory = window.MASTERV_GATEWAY_REMOTE_PROVIDER;
  const localWorkDataFactory = window.MASTERV_LOCAL_WORK_DATA_PROVIDER;
  const transitionFactory = window.MASTERV_TRANSITION_PROVIDER;

  if (!contract || !gatewaySessionFactory || !gatewayRemoteFactory || !localWorkDataFactory || !transitionFactory) {
    throw new Error("MasterV EXIT-3 backend provider assets were not loaded in dependency order");
  }

  const gatewaySession = gatewaySessionFactory.create();
  const gatewayRemote = gatewayRemoteFactory.create();
  const localWorkData = localWorkDataFactory.create();
  const transition = transitionFactory.create({ gatewaySession, localWorkData, gatewayRemote });

  const backend = contract.createBackendProvider({
    session: transition.session,
    workData: transition.workData,
    remoteOperations: transition.remoteOperations,
    authority: {
      architecture_stage: "MV-EXIT-3-CLEAN-CUT",
      release_track: "0.1.3-clean-cut",
      adapter_mode: "gateway+local-sqlite",
      consumer_wired: true,
      consumer_scope: "desktop-visible-runtime",
      deep_analysis_consumer_wired: true,
      background_batch_consumer_wired: true,
      product_authority_active: true,
      local_sqlite_authority_active: true,
      gateway_active: true,
      polar_active: true,
      runtime_vendor_dependency_zero: true,
      update_channel: "independent-tauri-signed"
    }
  });

  Object.defineProperty(window, "MASTERV_BACKEND", {
    value: backend,
    enumerable: true,
    configurable: false,
    writable: false
  });

  if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("masterv:backend-ready"));
  }

  const deepPanel = document.getElementById("deep-analysis-panel");
  if (deepPanel) {
    deepPanel.dataset.providerAuthority = "masterv-gateway";
    deepPanel.dataset.computeAuthority = "gateway-deep-analysis";
    deepPanel.dataset.persistenceAuthority = "local-sqlite";
    deepPanel.dataset.transportAuthority = "native-gateway-provider";
  }
  const guidancePanel = document.getElementById("production-guidance-panel");
  if (guidancePanel) {
    guidancePanel.dataset.providerAuthority = "masterv-gateway";
    guidancePanel.dataset.computeAuthority = "gateway-production-guidance";
    guidancePanel.dataset.referenceAnalysisAuthority = "validated-gateway-result-transit";
    guidancePanel.dataset.persistenceAuthority = "local-sqlite";
    guidancePanel.dataset.backgroundBatchMigrated = "true";
    guidancePanel.dataset.transportAuthority = "native-gateway-provider";
  }
  const diagnosticsNote = document.querySelector("#developer-diagnostics .muted.small");
  if (diagnosticsNote) diagnosticsNote.textContent = "Gateway execution, Local SQLite persistence, local Reference Compare, independent updater 경계를 확인합니다.";
})();
