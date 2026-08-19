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
  const transition = transitionFactory.create({
    gatewaySession,
    legacySession,
    localWorkData,
    legacyWorkData,
    gatewayRemote,
    legacyRemote
  });

  const backend = contract.createBackendProvider({
    session: transition.session,
    workData: transition.workData,
    remoteOperations: transition.remoteOperations,
    authority: {
      migration_stage: "MV-SUPABASE-EXIT-2C",
      adapter_mode: "0.1.2-visible-migration-cutover",
      consumer_wired: true,
      consumer_scope: "desktop-visible-runtime",
      production_ui_cutover_active: true,
      product_authority_active: true,
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
})();
