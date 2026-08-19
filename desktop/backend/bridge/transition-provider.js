(() => {
  "use strict";

  const ANALYSIS_SCHEMA_VERSION = "gateway-analysis-v1";
  const COMPARISON_SCHEMA_VERSION = "reference-compare-v1";
  const GUIDANCE_SCHEMA_VERSION = "production-guidance-v1";

  function requireCompiler() {
    const compiler = window.MASTERV_LOCAL_REFERENCE_COMPILER;
    if (!compiler || typeof compiler.compile !== "function") {
      throw new Error("Local canonical Reference Compare compiler is unavailable");
    }
    return compiler;
  }

  function create({ gatewaySession, legacySession, localWorkData, legacyWorkData, gatewayRemote, legacyRemote }) {
    let latestGatewaySource = null;

    const session = Object.freeze({
      configured() {
        return gatewaySession.configured();
      },
      async openSession(credentials = {}) {
        if (credentials.kind !== "product_key" && credentials.kind !== "resume") {
          throw new Error(`Visible Desktop session only supports Product Key activation/device resume, received ${credentials.kind || "missing"}`);
        }
        return await gatewaySession.openSession(credentials);
      },
      async closeSession(activeSession) {
        latestGatewaySource = null;
        return await gatewaySession.closeSession(activeSession);
      },
      describeSession(activeSession) {
        return gatewaySession.describeSession(activeSession);
      }
    });

    const workData = Object.freeze({
      configured() {
        return localWorkData.configured();
      },
      bootstrapPersonalWorkspace(activeSession) {
        return localWorkData.bootstrapPersonalWorkspace(activeSession);
      },
      listReferenceLibrary(activeSession, workspaceId) {
        return localWorkData.listReferenceLibrary(activeSession, workspaceId);
      },
      fetchReferenceDetail(activeSession, workspaceId, sourceId) {
        return localWorkData.fetchReferenceDetail(activeSession, workspaceId, sourceId);
      },
      deleteReferenceLibraryEntry(activeSession, workspaceId, sourceId) {
        return localWorkData.deleteReferenceLibraryEntry(activeSession, workspaceId, sourceId);
      },
      upsertReferenceLibraryEntry: localWorkData.upsertReferenceLibraryEntry,
      saveAnalysisResult: localWorkData.saveAnalysisResult,
      saveComparisonEntry: localWorkData.saveComparisonEntry,
      saveProductionGuidance: localWorkData.saveProductionGuidance,
      async migrateLegacyReferenceLibrary(credentials = {}) {
        if (!legacySession.configured() || !legacyWorkData.configured()) {
          throw new Error("Legacy Supabase migration adapter is not configured in this 0.1.2 build");
        }
        const email = String(credentials.email || "").trim();
        const password = String(credentials.password || "");
        if (!email || !password) throw new Error("Legacy email and password are required only for existing-data migration");

        const migrationSession = await legacySession.openSession({ kind: "email_password", email, password });
        try {
          const legacyWorkspaceId = await legacyWorkData.bootstrapPersonalWorkspace(migrationSession);
          const records = await legacyWorkData.exportReferenceLibraryForMigration(migrationSession, legacyWorkspaceId);
          const result = await localWorkData.migrateLegacyReferenceLibrary(records);
          return Object.freeze({
            ...result,
            legacy_workspace_id: legacyWorkspaceId,
            exported_count: records.length,
            legacy_provider: "supabase",
            local_authority_after_migration: true
          });
        } finally {
          await legacySession.closeSession(migrationSession);
        }
      },
      authority: Object.freeze({
        primary: "local-sqlite",
        fallback: "none-for-normal-work-data",
        legacy_scope: "existing-data-migration-only",
        migration_policy: "backup-first+transactional+local-wins+idempotent+post-import-integrity"
      })
    });

    function requireGatewaySession(activeSession) {
      if (activeSession?.provider !== "masterv-gateway") {
        throw new Error("A Product-Key activated MasterV Gateway session is required for paid/remote operations");
      }
      return activeSession;
    }

    const remoteOperations = Object.freeze({
      configured() {
        return gatewayRemote.configured();
      },
      async probeCapabilities(activeSession) {
        const body = await gatewayRemote.probeCapabilities(requireGatewaySession(activeSession));
        return Object.freeze({
          ...body,
          capabilities: Object.freeze({
            ...(body.capabilities || {}),
            reference_compiler: localWorkData.configured() && Boolean(window.MASTERV_LOCAL_REFERENCE_COMPILER)
          })
        });
      },
      async compileReferenceWorkflow(_activeSession, sourceIds) {
        if (!Array.isArray(sourceIds) || sourceIds.length < 2) throw new Error("Reference comparison requires at least two local references");
        const workspaceId = await localWorkData.bootstrapPersonalWorkspace(null);
        const records = [];
        for (const sourceId of sourceIds) {
          records.push(await localWorkData.fetchReferenceDetail(null, workspaceId, sourceId));
        }
        const result = requireCompiler().compile(records);
        const sortedIds = [...sourceIds].sort();
        await localWorkData.saveComparisonEntry({
          id: `reference-compare:${sortedIds.join("|")}`,
          payload: {
            source_ids: sortedIds,
            comparison: result.comparison,
            evidence_rules: result.evidence_rules
          },
          schema_version: COMPARISON_SCHEMA_VERSION
        });
        return Object.freeze({
          ...result,
          provider: "local-canonical",
          persistence_authority: "local-sqlite",
          gateway_requests: 0
        });
      },
      discoverYouTube(activeSession, ...args) {
        return gatewayRemote.discoverYouTube(requireGatewaySession(activeSession), ...args);
      },
      async analyzeYouTube(activeSession, ...args) {
        const result = await gatewayRemote.analyzeYouTube(requireGatewaySession(activeSession), ...args);
        const source = result?.source;
        if (!source?.source_id || !source?.platform) throw new Error("Gateway analysis source identity is incomplete");
        latestGatewaySource = Object.freeze({ platform: source.platform, source_id: source.source_id });
        await localWorkData.saveAnalysisResult({
          id: `analysis:${source.platform}:${source.source_id}:${result.request_id || "latest"}`,
          source_platform: source.platform,
          source_id: source.source_id,
          analysis: result.analysis,
          analysis_cache_key: null,
          schema_version: ANALYSIS_SCHEMA_VERSION
        });
        return Object.freeze({
          ...result,
          diagnostics: Object.freeze({
            ...(result.diagnostics || {}),
            persistence_writes: 1,
            persistence_authority: "local-sqlite"
          })
        });
      },
      async generateProductionGuidance(activeSession, ...args) {
        const result = await gatewayRemote.generateProductionGuidance(requireGatewaySession(activeSession), ...args);
        if (!latestGatewaySource) throw new Error("Production Guidance local persistence requires a preceding Gateway analysis in this Desktop session");
        await localWorkData.saveProductionGuidance({
          id: `guidance:${latestGatewaySource.platform}:${latestGatewaySource.source_id}:${result.request_id || "latest"}`,
          source_platform: latestGatewaySource.platform,
          source_id: latestGatewaySource.source_id,
          guidance: result,
          schema_version: GUIDANCE_SCHEMA_VERSION
        });
        return Object.freeze({
          ...result,
          diagnostics: Object.freeze({
            ...(result.diagnostics || {}),
            persistence_writes: 1,
            persistence_authority: "local-sqlite"
          })
        });
      },
      async probeBackgroundBatch(activeSession, ...args) {
        if (activeSession?.provider === "legacy-supabase") return await legacyRemote.probeBackgroundBatch(activeSession, ...args);
        throw new Error("Background Batch is not exposed by the stateless Gateway in the 0.1.2 visible cutover");
      },
      async listBackgroundBatchJobs(activeSession, ...args) {
        if (activeSession?.provider === "legacy-supabase") return await legacyRemote.listBackgroundBatchJobs(activeSession, ...args);
        throw new Error("Background Batch is transition-only and unavailable to Product-Key sessions");
      },
      async submitBackgroundBatchJob(activeSession, ...args) {
        if (activeSession?.provider === "legacy-supabase") return await legacyRemote.submitBackgroundBatchJob(activeSession, ...args);
        throw new Error("Background Batch is transition-only and unavailable to Product-Key sessions");
      },
      async checkBackgroundBatchJob(activeSession, ...args) {
        if (activeSession?.provider === "legacy-supabase") return await legacyRemote.checkBackgroundBatchJob(activeSession, ...args);
        throw new Error("Background Batch is transition-only and unavailable to Product-Key sessions");
      },
      authority: Object.freeze({
        primary: "masterv-gateway",
        reference_compare: "local-canonical",
        user_work_data_transport_to_gateway: false,
        legacy_scope: "0.1.2-migration-only"
      })
    });

    return Object.freeze({ session, workData, remoteOperations });
  }

  window.MASTERV_TRANSITION_PROVIDER = Object.freeze({ create });
})();
