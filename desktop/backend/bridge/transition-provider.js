(() => {
  "use strict";

  const ANALYSIS_SCHEMA_VERSION = "gateway-analysis-v1";
  const COMPARISON_SCHEMA_VERSION = "reference-compare-v1";
  const GUIDANCE_SCHEMA_VERSION = "production-guidance-v1";
  const BACKGROUND_BATCH_CONTRACT_VERSION = "background-batch-local-gateway-v1";

  function requireCompiler() {
    const compiler = window.MASTERV_LOCAL_REFERENCE_COMPILER;
    if (!compiler || typeof compiler.compile !== "function") {
      throw new Error("Local canonical Reference Compare compiler is unavailable");
    }
    return compiler;
  }

  function create({ gatewaySession, legacySession, localWorkData, legacyWorkData, gatewayRemote, legacyRemote }) {
    let latestGatewaySource = null;
    const backgroundJobs = new Map();

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

    async function persistAnalysis(result, idPrefix = "analysis") {
      const source = result?.source;
      if (!source?.source_id || !source?.platform) throw new Error("Gateway analysis source identity is incomplete");
      latestGatewaySource = Object.freeze({ platform: source.platform, source_id: source.source_id });
      await localWorkData.saveAnalysisResult({
        id: `${idPrefix}:${source.platform}:${source.source_id}:${result.request_id || "latest"}`,
        source_platform: source.platform,
        source_id: source.source_id,
        analysis: result.analysis,
        analysis_cache_key: null,
        schema_version: ANALYSIS_SCHEMA_VERSION
      });
      return source;
    }

    function snapshotJob(job) {
      return Object.freeze({ ...job });
    }

    async function executeBackgroundJob(activeSession, requestId) {
      const current = backgroundJobs.get(requestId);
      if (!current || current.status !== "QUEUED") return;
      current.status = "RUNNING";
      current.provider_state = "gateway-analyze";
      current.updated_at = new Date().toISOString();
      try {
        const result = await gatewayRemote.analyzeYouTube(requireGatewaySession(activeSession), current.canonical_url);
        const source = await persistAnalysis(result, `background-analysis:${requestId}`);
        current.status = "SUCCEEDED";
        current.source_id = source.source_id;
        current.model = result.model || result.diagnostics?.model || "gateway";
        current.provider_state = "gateway-complete/local-sqlite-persisted";
        current.error = null;
      } catch (error) {
        current.status = "FAILED";
        current.provider_state = "gateway-failed";
        current.error = error instanceof Error ? error.message : String(error);
      } finally {
        current.updated_at = new Date().toISOString();
      }
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
            reference_compiler: localWorkData.configured() && Boolean(window.MASTERV_LOCAL_REFERENCE_COMPILER),
            background_batch: true
          })
        });
      },
      async compileReferenceWorkflow(_activeSession, sourceIds) {
        if (!Array.isArray(sourceIds) || sourceIds.length < 2) throw new Error("Reference comparison requires at least two local references");
        const workspaceId = await localWorkData.bootstrapPersonalWorkspace(null);
        const records = [];
        for (const sourceId of sourceIds) records.push(await localWorkData.fetchReferenceDetail(null, workspaceId, sourceId));
        const result = requireCompiler().compile(records);
        const sortedIds = [...sourceIds].sort();
        await localWorkData.saveComparisonEntry({
          id: `reference-compare:${sortedIds.join("|")}`,
          payload: { source_ids: sortedIds, comparison: result.comparison, evidence_rules: result.evidence_rules },
          schema_version: COMPARISON_SCHEMA_VERSION
        });
        return Object.freeze({ ...result, provider: "local-canonical", persistence_authority: "local-sqlite", gateway_requests: 0 });
      },
      discoverYouTube(activeSession, ...args) {
        return gatewayRemote.discoverYouTube(requireGatewaySession(activeSession), ...args);
      },
      async analyzeYouTube(activeSession, ...args) {
        const result = await gatewayRemote.analyzeYouTube(requireGatewaySession(activeSession), ...args);
        await persistAnalysis(result);
        return Object.freeze({
          ...result,
          diagnostics: Object.freeze({ ...(result.diagnostics || {}), persistence_writes: 1, persistence_authority: "local-sqlite" })
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
          diagnostics: Object.freeze({ ...(result.diagnostics || {}), persistence_writes: 1, persistence_authority: "local-sqlite" })
        });
      },
      async probeBackgroundBatch(activeSession) {
        requireGatewaySession(activeSession);
        return Object.freeze({
          contract_version: BACKGROUND_BATCH_CONTRACT_VERSION,
          capabilities: Object.freeze({
            boundary_probe: true,
            local_session_queue: true,
            gateway_execution: true,
            local_analysis_persistence: true,
            desktop_submit_enabled: true,
            submit: true,
            restart_durability: false
          })
        });
      },
      async listBackgroundBatchJobs(activeSession) {
        requireGatewaySession(activeSession);
        const jobs = [...backgroundJobs.values()]
          .sort((left, right) => right.created_at.localeCompare(left.created_at))
          .map(snapshotJob);
        return Object.freeze({ contract_version: BACKGROUND_BATCH_CONTRACT_VERSION, jobs });
      },
      async submitBackgroundBatchJob(activeSession, requestId, url) {
        requireGatewaySession(activeSession);
        const id = String(requestId || "").trim();
        const canonicalUrl = String(url || "").trim();
        if (!id || !canonicalUrl) throw new Error("Background operation request_id and URL are required");
        const existing = backgroundJobs.get(id);
        if (existing) return snapshotJob(existing);
        const now = new Date().toISOString();
        const job = {
          request_id: id,
          source_id: null,
          canonical_url: canonicalUrl,
          status: "QUEUED",
          model: null,
          provider_state: "local-session-queue",
          error: null,
          created_at: now,
          updated_at: now
        };
        backgroundJobs.set(id, job);
        void executeBackgroundJob(activeSession, id);
        return snapshotJob(job);
      },
      async checkBackgroundBatchJob(activeSession, requestId) {
        requireGatewaySession(activeSession);
        const job = backgroundJobs.get(String(requestId || ""));
        if (!job) throw new Error(`Background operation not found: ${requestId}`);
        return Object.freeze({ contract_version: BACKGROUND_BATCH_CONTRACT_VERSION, job: snapshotJob(job) });
      },
      authority: Object.freeze({
        primary: "masterv-gateway",
        reference_compare: "local-canonical",
        background_operations: "local-session-orchestrated+gateway-executed",
        background_job_restart_durability: false,
        background_result_persistence: "local-sqlite",
        user_work_data_transport_to_gateway: false,
        legacy_scope: "0.1.2-migration-only"
      })
    });

    return Object.freeze({ session, workData, remoteOperations });
  }

  window.MASTERV_TRANSITION_PROVIDER = Object.freeze({ create });
})();
