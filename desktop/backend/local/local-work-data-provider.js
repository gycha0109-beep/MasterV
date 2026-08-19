(() => {
  "use strict";

  const LOCAL_WORKSPACE_ID = "local:masterv";

  function create(invoke = window.__TAURI__?.core?.invoke) {
    function configured() {
      return typeof invoke === "function";
    }

    function requireConfigured() {
      if (!configured()) throw new Error("Native local work-data provider is unavailable");
    }

    function assertWorkspace(workspaceId) {
      if (workspaceId && workspaceId !== LOCAL_WORKSPACE_ID) {
        throw new Error(`Local work-data provider rejected non-local workspace: ${workspaceId}`);
      }
    }

    async function bootstrapPersonalWorkspace() {
      requireConfigured();
      const workspaceId = await invoke("desktop_local_workspace_id");
      if (workspaceId !== LOCAL_WORKSPACE_ID) throw new Error("Native local workspace authority mismatch");
      return workspaceId;
    }

    async function listReferenceLibrary(_session, workspaceId) {
      requireConfigured();
      assertWorkspace(workspaceId);
      return await invoke("desktop_local_reference_library_list");
    }

    async function fetchReferenceDetail(_session, workspaceId, sourceId) {
      requireConfigured();
      assertWorkspace(workspaceId);
      return await invoke("desktop_local_reference_detail", { sourceId });
    }

    async function deleteReferenceLibraryEntry(_session, workspaceId, sourceId) {
      requireConfigured();
      assertWorkspace(workspaceId);
      return await invoke("desktop_local_reference_delete", { sourceId });
    }

    async function upsertReferenceLibraryEntry(input) {
      requireConfigured();
      return await invoke("desktop_local_reference_upsert", { input });
    }

    async function saveAnalysisResult(input) {
      requireConfigured();
      return await invoke("desktop_local_analysis_save", { input });
    }

    async function saveComparisonEntry(input) {
      requireConfigured();
      return await invoke("desktop_local_comparison_save", { input });
    }

    async function saveProductionGuidance(input) {
      requireConfigured();
      return await invoke("desktop_local_guidance_save", { input });
    }

    async function migrateLegacyReferenceLibrary(records) {
      requireConfigured();
      return await invoke("desktop_local_migrate_legacy_reference_library", { records });
    }

    return Object.freeze({
      configured,
      bootstrapPersonalWorkspace,
      listReferenceLibrary,
      fetchReferenceDetail,
      deleteReferenceLibraryEntry,
      upsertReferenceLibraryEntry,
      saveAnalysisResult,
      saveComparisonEntry,
      saveProductionGuidance,
      migrateLegacyReferenceLibrary,
      authority: Object.freeze({
        workspace: LOCAL_WORKSPACE_ID,
        persistence: "local-sqlite",
        product_authority_active: true,
        server_sync: false
      })
    });
  }

  window.MASTERV_LOCAL_WORK_DATA_PROVIDER = Object.freeze({ create, LOCAL_WORKSPACE_ID });
})();
