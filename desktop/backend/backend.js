(() => {
  "use strict";

  const legacyConfig = window.MASTERV_LEGACY_RUNTIME_CONFIG || {};
  const contract = window.MASTERV_BACKEND_PROVIDER_CONTRACT;
  const sessionFactory = window.MASTERV_LEGACY_SUPABASE_SESSION_PROVIDER;
  const workDataFactory = window.MASTERV_LEGACY_SUPABASE_WORK_DATA_PROVIDER;
  const remoteOperationsFactory = window.MASTERV_LEGACY_HOSTED_API_CLIENT;

  if (!contract || !sessionFactory || !workDataFactory || !remoteOperationsFactory) {
    throw new Error("MasterV backend provider assets were not loaded in dependency order");
  }

  const backend = contract.createBackendProvider({
    session: sessionFactory.create(legacyConfig),
    workData: workDataFactory.create(legacyConfig),
    remoteOperations: remoteOperationsFactory.create(legacyConfig),
    authority: {
      migration_stage: "MV-SUPABASE-EXIT-1B-5",
      adapter_mode: "legacy-supabase-hosted",
      consumer_wired: true,
      consumer_scope: "desktop/app.js+desktop/deep-analysis.js+desktop/background-batch.js+desktop/updater.js",
      deep_analysis_consumer_wired: true,
      background_batch_consumer_wired: true,
      updater_session_consumer_wired: true,
      build_config_boundary: "legacy-runtime-config",
      desktop_config_vendor_neutral: true,
      legacy_runtime_config_isolated: true,
      session_bridge_active: false,
      session_credential_observer_active: false,
      fetch_monkey_patch_active: false,
      supabase_authority_unchanged: true,
      local_sqlite_authority_active: false,
      gateway_active: false,
      polar_active: false
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
})();
