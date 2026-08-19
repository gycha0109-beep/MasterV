(() => {
  "use strict";

  const legacyConfig = window.MASTERV_LEGACY_RUNTIME_CONFIG || {};
  const contract = window.MASTERV_BACKEND_PROVIDER_CONTRACT;
  const gatewaySessionFactory = window.MASTERV_GATEWAY_SESSION_PROVIDER;
  const gatewayRemoteFactory = window.MASTERV_GATEWAY_REMOTE_PROVIDER;
  const localWorkDataFactory = window.MASTERV_LOCAL_WORK_DATA_PROVIDER;
  const transitionFactory = window.MASTERV_TRANSITION_PROVIDER;
  const legacySessionFactory = window.MASTERV_LEGACY_SUPABASE_SESSION_PROVIDER;
  const legacyWorkDataFactory = window.MASTERV_LEGACY_SUPABASE_WORK_DATA_PROVIDER;
  const legacyRemoteFactory = window.MASTERV_LEGACY_HOSTED_API_CLIENT;

  if (!contract || !gatewaySessionFactory || !gatewayRemoteFactory || !localWorkDataFactory || !transitionFactory || !legacySessionFactory || !legacyWorkDataFactory || !legacyRemoteFactory) {
    throw new Error("MasterV EXIT-2C backend provider assets were not loaded in dependency order");
  }

  const gatewaySession = gatewaySessionFactory.create();
  const gatewayRemote = gatewayRemoteFactory.create();
  const localWorkData = localWorkDataFactory.create();
  const legacySession = legacySessionFactory.create(legacyConfig);
  const legacyWorkData = legacyWorkDataFactory.create(legacyConfig);
  const legacyRemote = legacyRemoteFactory.create(legacyConfig);
  const transition = transitionFactory.create({ gatewaySession, legacySession, localWorkData, legacyWorkData, gatewayRemote, legacyRemote });

  const backend = contract.createBackendProvider({
    session: transition.session,
    workData: transition.workData,
    remoteOperations: transition.remoteOperations,
    authority: {
      migration_stage: "MV-SUPABASE-EXIT-2C",
      adapter_mode: "0.1.2-visible-migration-cutover",
      consumer_wired: true,
      consumer_scope: "desktop-visible-runtime",
      deep_analysis_consumer_wired: true,
      background_batch_consumer_wired: true,
      session_bridge_active: false,
      session_credential_observer_active: false,
      fetch_monkey_patch_active: false,
      build_config_boundary: "legacy-runtime-config",
      desktop_config_vendor_neutral: true,
      legacy_runtime_config_isolated: true,
      production_ui_cutover_active: true,
      product_authority_active: true,
      legacy_authority_unchanged: false,
      supabase_authority_unchanged: false,
      local_sqlite_authority_active: true,
      gateway_active: true,
      polar_active: true,
      supabase_primary_authority_active: false,
      legacy_runtime_scope: "existing-data-migration-only",
      supabase_runtime_dependency_zero_claimed: false,
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
  if (diagnosticsNote) {
    diagnosticsNote.textContent = "Gateway execution, Local SQLite persistence, local Reference Compare, session-local Background orchestration 경계를 확인합니다.";
  }
})();
