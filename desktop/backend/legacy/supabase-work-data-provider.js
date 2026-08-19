(() => {
  "use strict";

  const MIGRATION_PROJECTION = Object.freeze([
    "source_platform",
    "source_id",
    "native_id",
    "canonical_url",
    "label",
    "analysis",
    "analysis_cache_key",
    "analysis_provenance",
    "schema_version",
    "first_saved_at",
    "updated_at"
  ]);

  function normalizedBaseUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  async function parseError(response) {
    try {
      const body = await response.json();
      return body.msg || body.message || body.error_description || body.details || body.error || `${response.status}`;
    } catch {
      return `${response.status} ${response.statusText}`.trim();
    }
  }

  function create(config = {}, fetchImpl = window.fetch.bind(window)) {
    const supabaseUrl = normalizedBaseUrl(config.supabase_url);
    const publishableKey = String(config.supabase_publishable_key || "").trim();

    function configured() {
      return Boolean(supabaseUrl && publishableKey);
    }

    function requireSession(session) {
      if (!configured()) throw new Error("Legacy Supabase work-data provider is not configured");
      if (session?.provider !== "legacy-supabase" || !session?.credential || !session?.subject_id) {
        throw new Error("Legacy Supabase migration session is required");
      }
    }

    function authHeaders(session, extra = {}) {
      requireSession(session);
      return {
        apikey: publishableKey,
        Authorization: `Bearer ${session.credential}`,
        ...extra
      };
    }

    async function bootstrapPersonalWorkspace(session) {
      requireSession(session);
      const workspaceId = `user:${session.subject_id}`;
      const params = new URLSearchParams({ on_conflict: "workspace_id,user_id" });
      const response = await fetchImpl(`${supabaseUrl}/rest/v1/masterv_workspace_members?${params.toString()}`, {
        method: "POST",
        headers: authHeaders(session, { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" }),
        body: JSON.stringify({ workspace_id: workspaceId, user_id: session.subject_id, role: "owner" })
      });
      if (!response.ok) throw new Error(`Workspace bootstrap ${await parseError(response)}`);
      return workspaceId;
    }

    async function listReferenceLibrary(session, workspaceId, projection) {
      requireSession(session);
      if (!Array.isArray(projection) || projection.length === 0) throw new Error("Reference Library projection is required");
      const params = new URLSearchParams();
      params.set("select", projection.join(","));
      params.set("workspace_id", `eq.${workspaceId}`);
      params.set("order", "updated_at.desc,source_id.asc");
      const response = await fetchImpl(`${supabaseUrl}/rest/v1/reference_library_entries?${params.toString()}`, {
        method: "GET",
        headers: authHeaders(session, { Accept: "application/json" })
      });
      if (!response.ok) throw new Error(`Reference Library list ${await parseError(response)}`);
      const body = await response.json();
      if (!Array.isArray(body)) throw new Error("Reference Library list response is not an array");
      return body;
    }

    async function exportReferenceLibraryForMigration(session, workspaceId) {
      requireSession(session);
      const rows = await listReferenceLibrary(session, workspaceId, MIGRATION_PROJECTION);
      return rows.map((row) => Object.freeze({
        source_platform: row.source_platform,
        source_id: row.source_id,
        native_id: row.native_id,
        canonical_url: row.canonical_url,
        label: row.label,
        analysis: row.analysis,
        analysis_cache_key: row.analysis_cache_key,
        analysis_provenance: row.analysis_provenance,
        schema_version: row.schema_version,
        first_saved_at: row.first_saved_at ?? null,
        updated_at: row.updated_at ?? null
      }));
    }

    async function fetchReferenceDetail(session, workspaceId, sourceId, projection) {
      requireSession(session);
      if (!Array.isArray(projection) || projection.length === 0) throw new Error("Reference detail projection is required");
      const params = new URLSearchParams();
      params.set("select", projection.join(","));
      params.set("workspace_id", `eq.${workspaceId}`);
      params.set("source_id", `eq.${sourceId}`);
      params.set("limit", "1");
      const response = await fetchImpl(`${supabaseUrl}/rest/v1/reference_library_entries?${params.toString()}`, {
        method: "GET",
        headers: authHeaders(session, { Accept: "application/json" })
      });
      if (!response.ok) throw new Error(`Reference detail ${await parseError(response)}`);
      const body = await response.json();
      if (!Array.isArray(body) || body.length !== 1 || !body[0]?.analysis) throw new Error("Reference detail response is missing persisted analysis");
      return body[0];
    }

    async function deleteReferenceLibraryEntry(session, workspaceId, sourceId) {
      requireSession(session);
      const params = new URLSearchParams();
      params.set("workspace_id", `eq.${workspaceId}`);
      params.set("source_id", `eq.${sourceId}`);
      const response = await fetchImpl(`${supabaseUrl}/rest/v1/reference_library_entries?${params.toString()}`, {
        method: "DELETE",
        headers: authHeaders(session, { Prefer: "return=minimal" })
      });
      if (!response.ok) throw new Error(`Reference Library delete ${await parseError(response)}`);
    }

    return Object.freeze({
      configured,
      bootstrapPersonalWorkspace,
      listReferenceLibrary,
      exportReferenceLibraryForMigration,
      fetchReferenceDetail,
      deleteReferenceLibraryEntry,
      authority: Object.freeze({ scope: "0.1.2-existing-data-migration-only" })
    });
  }

  window.MASTERV_LEGACY_SUPABASE_WORK_DATA_PROVIDER = Object.freeze({ create, MIGRATION_PROJECTION });
})();
