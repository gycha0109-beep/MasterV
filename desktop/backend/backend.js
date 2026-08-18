(() => {
  "use strict";

  const config = window.MASTERV_DESKTOP_CONFIG || {};
  const contract = window.MASTERV_BACKEND_PROVIDER_CONTRACT;
  const sessionFactory = window.MASTERV_LEGACY_SUPABASE_SESSION_PROVIDER;
  const workDataFactory = window.MASTERV_LEGACY_SUPABASE_WORK_DATA_PROVIDER;
  const remoteOperationsFactory = window.MASTERV_LEGACY_HOSTED_API_CLIENT;

  if (!contract || !sessionFactory || !workDataFactory || !remoteOperationsFactory) {
    throw new Error("MasterV backend provider assets were not loaded in dependency order");
  }

  const backend = contract.createBackendProvider({
    session: sessionFactory.create(config),
    workData: workDataFactory.create(config),
    remoteOperations: remoteOperationsFactory.create(config),
    authority: {
      migration_stage: "MV-SUPABASE-EXIT-1B-3",
      adapter_mode: "legacy-supabase-hosted",
      consumer_wired: true,
      consumer_scope: "desktop/app.js+desktop/deep-analysis.js+desktop/background-batch.js",
      deep_analysis_consumer_wired: true,
      background_batch_consumer_wired: true,
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
