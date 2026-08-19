(() => {
  "use strict";

  function create({ gatewaySession, legacySession, localWorkData, legacyWorkData, gatewayRemote, legacyRemote }) {
    function sessionFor(session) {
      return session?.provider === "masterv-gateway" ? gatewaySession : legacySession;
    }

    const session = Object.freeze({
      configured() {
        return gatewaySession.configured() || legacySession.configured();
      },
      async openSession(credentials = {}) {
        if (credentials.kind === "product_key" || credentials.kind === "resume") {
          return await gatewaySession.openSession(credentials);
        }
        if (credentials.kind === "email_password") {
          return await legacySession.openSession(credentials);
        }
        throw new Error(`Unsupported Desktop credential kind ${credentials.kind || "missing"}`);
      },
      async closeSession(activeSession) {
        return await sessionFor(activeSession).closeSession(activeSession);
      },
      describeSession(activeSession) {
        return sessionFor(activeSession).describeSession(activeSession);
      }
    });

    function localAvailable() {
      return localWorkData.configured();
    }

    const workData = Object.freeze({
      configured() {
        return localAvailable() || legacyWorkData.configured();
      },
      async bootstrapPersonalWorkspace(activeSession) {
        if (localAvailable()) return await localWorkData.bootstrapPersonalWorkspace(activeSession);
        return await legacyWorkData.bootstrapPersonalWorkspace(activeSession);
      },
      async listReferenceLibrary(activeSession, workspaceId) {
        if (localAvailable()) return await localWorkData.listReferenceLibrary(activeSession, workspaceId);
        return await legacyWorkData.listReferenceLibrary(activeSession, workspaceId);
      },
      async fetchReferenceDetail(activeSession, workspaceId, sourceId) {
        if (localAvailable()) return await localWorkData.fetchReferenceDetail(activeSession, workspaceId, sourceId);
        return await legacyWorkData.fetchReferenceDetail(activeSession, workspaceId, sourceId);
      },
      async deleteReferenceLibraryEntry(activeSession, workspaceId, sourceId) {
        if (localAvailable()) return await localWorkData.deleteReferenceLibraryEntry(activeSession, workspaceId, sourceId);
        return await legacyWorkData.deleteReferenceLibraryEntry(activeSession, workspaceId, sourceId);
      },
      upsertReferenceLibraryEntry: localWorkData.upsertReferenceLibraryEntry,
      saveAnalysisResult: localWorkData.saveAnalysisResult,
      saveComparisonEntry: localWorkData.saveComparisonEntry,
      saveProductionGuidance: localWorkData.saveProductionGuidance,
      migrateLegacyReferenceLibrary: localWorkData.migrateLegacyReferenceLibrary,
      authority: Object.freeze({
        primary: "local-sqlite",
        fallback: "legacy-supabase",
        fallback_scope: "0.1.2-migration-only"
      })
    });

    function remoteFor(activeSession) {
      return activeSession?.provider === "masterv-gateway" ? gatewayRemote : legacyRemote;
    }

    const remoteOperations = Object.freeze({
      configured() {
        return gatewayRemote.configured() || legacyRemote.configured();
      },
      probeCapabilities(activeSession) {
        return remoteFor(activeSession).probeCapabilities(activeSession);
      },
      compileReferenceWorkflow(activeSession, ...args) {
        return remoteFor(activeSession).compileReferenceWorkflow(activeSession, ...args);
      },
      discoverYouTube(activeSession, ...args) {
        return remoteFor(activeSession).discoverYouTube(activeSession, ...args);
      },
      analyzeYouTube(activeSession, ...args) {
        return remoteFor(activeSession).analyzeYouTube(activeSession, ...args);
      },
      generateProductionGuidance(activeSession, ...args) {
        return remoteFor(activeSession).generateProductionGuidance(activeSession, ...args);
      },
      probeBackgroundBatch(activeSession, ...args) {
        return remoteFor(activeSession).probeBackgroundBatch(activeSession, ...args);
      },
      listBackgroundBatchJobs(activeSession, ...args) {
        return remoteFor(activeSession).listBackgroundBatchJobs(activeSession, ...args);
      },
      submitBackgroundBatchJob(activeSession, ...args) {
        return remoteFor(activeSession).submitBackgroundBatchJob(activeSession, ...args);
      },
      checkBackgroundBatchJob(activeSession, ...args) {
        return remoteFor(activeSession).checkBackgroundBatchJob(activeSession, ...args);
      },
      authority: Object.freeze({
        primary: "masterv-gateway",
        fallback: "legacy-hosted-api",
        fallback_scope: "0.1.2-migration-only"
      })
    });

    return Object.freeze({ session, workData, remoteOperations });
  }

  window.MASTERV_TRANSITION_PROVIDER = Object.freeze({ create });
})();
