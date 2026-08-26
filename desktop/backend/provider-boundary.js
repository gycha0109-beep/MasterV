(() => {
  "use strict";

  const CONTRACT_VERSION = "mv-backend-provider-v1";
  const SESSION_REFRESH_SKEW_MS = 60_000;
  const REQUIRED_METHODS = Object.freeze({
    session: Object.freeze(["configured", "openSession", "closeSession", "describeSession"]),
    workData: Object.freeze(["configured", "bootstrapPersonalWorkspace", "listReferenceLibrary", "fetchReferenceDetail", "deleteReferenceLibraryEntry"]),
    remoteOperations: Object.freeze(["configured", "probeCapabilities", "compileReferenceWorkflow", "discoverYouTube", "analyzeYouTube", "generateProductionGuidance", "probeBackgroundBatch", "listBackgroundBatchJobs", "submitBackgroundBatchJob", "checkBackgroundBatchJob"])
  });

  const GATEWAY_ERROR_MESSAGES = Object.freeze({
    GATEWAY_LICENSE_INACTIVE: "라이선스가 비활성 상태입니다. Local SQLite 데이터는 계속 사용할 수 있습니다.",
    GATEWAY_CAPABILITY_DENIED: "현재 라이선스/구독에서는 이 AI 기능을 사용할 수 없습니다. Local SQLite 데이터는 계속 사용할 수 있습니다.",
    GATEWAY_USAGE_DENIED: "AI 크레딧이 부족합니다. Local SQLite 데이터는 계속 사용할 수 있습니다.",
    GATEWAY_CREDENTIAL_EXPIRED: "Gateway 세션 자격증명이 만료되었습니다. 저장된 기기 자격증명으로 다시 연결해 주세요.",
    GATEWAY_CREDENTIAL_INVALID: "Gateway 자격증명을 사용할 수 없습니다. 기기 세션을 다시 연결해 주세요.",
    GATEWAY_SESSION_REQUIRED: "Gateway 세션이 필요합니다. 제품키 활성화 또는 기기 세션 연결 후 다시 시도해 주세요.",
    GATEWAY_DEVICE_MISMATCH: "이 기기와 저장된 라이선스 activation 정보가 일치하지 않습니다.",
    GATEWAY_PLAN_NOT_CONFIGURED: "라이선스 플랜 정보가 아직 구성되지 않았습니다.",
    GATEWAY_USAGE_METER_NOT_CONFIGURED: "AI 사용량 Meter가 아직 구성되지 않았습니다.",
    POLAR_UPSTREAM_ERROR: "라이선스 서비스 요청에 실패했습니다. 진단된 Polar 단계와 상태를 확인해 주세요.",
    POLAR_ACTIVATION_ROLLBACK_FAILED: "새 activation 초기화 실패 후 보상 해제를 확인하지 못했습니다. activation slot 상태를 확인하기 전에는 제품키 활성화를 다시 시도하지 마세요."
  });

  function assertProvider(label, provider, requiredMethods) {
    if (!provider || typeof provider !== "object") throw new TypeError(`${label} provider is required`);
    for (const method of requiredMethods) if (typeof provider[method] !== "function") throw new TypeError(`${label} provider is missing method ${method}`);
    return provider;
  }

  function rawErrorMessage(error) {
    return error instanceof Error ? error.message : String(error ?? "Unknown error");
  }

  function gatewayErrorCode(error) {
    const match = rawErrorMessage(error).match(/^([A-Z][A-Z0-9_]+):\s*/);
    return match?.[1] || null;
  }

  function safePolarDiagnostic(error) {
    const raw = rawErrorMessage(error);
    const parts = [];
    const upstream = raw.match(/\[phase=(?:activate|deactivate|license|activation|customer_state|usage_ingest) upstream_status=(?:network|\d{3})\]/);
    if (upstream) parts.push(upstream[0]);
    if (raw.includes("[activation_rollback=completed]")) parts.push("[activation_rollback=completed]");
    const rollbackFailure = raw.match(/\[root_code=[A-Z][A-Z0-9_]+ rollback_code=[A-Z][A-Z0-9_]+\]/);
    if (rollbackFailure) parts.push(rollbackFailure[0]);
    return parts.join(" ");
  }

  function formatGatewayError(error) {
    const code = gatewayErrorCode(error);
    const friendly = code ? GATEWAY_ERROR_MESSAGES[code] : null;
    if (!friendly) return rawErrorMessage(error);
    const diagnostic = code === "POLAR_UPSTREAM_ERROR" || code === "POLAR_ACTIVATION_ROLLBACK_FAILED"
      ? safePolarDiagnostic(error)
      : "";
    return `[${code}] ${friendly}${diagnostic ? ` ${diagnostic}` : ""}`;
  }

  function surfaceError(error) {
    const formatted = formatGatewayError(error);
    return error instanceof Error && error.message === formatted ? error : new Error(formatted);
  }

  function sessionNeedsRefresh(session, now = Date.now()) {
    if (!session?.credential || session.provider !== "masterv-gateway") return true;
    const expiresAt = Date.parse(session.expires_at || "");
    return !Number.isFinite(expiresAt) || expiresAt - now <= SESSION_REFRESH_SKEW_MS;
  }

  function createBackendProvider({ session, workData, remoteOperations, authority = {} }) {
    const sessionProvider = assertProvider("session", session, REQUIRED_METHODS.session);
    const workDataProvider = assertProvider("workData", workData, REQUIRED_METHODS.workData);
    const remoteOperationsProvider = assertProvider("remoteOperations", remoteOperations, REQUIRED_METHODS.remoteOperations);
    const sessionListeners = new Set();
    const capabilityListeners = new Set();
    let activeSession = null;
    let capabilitySnapshot = null;
    let refreshInFlight = null;

    const frozenAuthority = Object.freeze({
      architecture_stage: "MV-EXIT-3-CLEAN-CUT",
      provider_boundary_active: true,
      consumer_wired: true,
      product_authority_active: true,
      session_credential_persistence: "memory-only",
      session_refresh_authority: "device-credential-via-gateway",
      entitlement_projection_authority: "gateway-polar-readback",
      ...authority
    });

    const notify = (listeners, value) => { for (const listener of [...listeners]) listener(value); };

    function replaceActiveSession(nextSession) {
      activeSession = nextSession;
      capabilitySnapshot = null;
      notify(capabilityListeners, null);
      notify(sessionListeners, activeSession);
      return activeSession;
    }

    async function refreshActiveSession() {
      if (!activeSession) throw new Error("GATEWAY_SESSION_REQUIRED: A MasterV Gateway session is not active.");
      if (refreshInFlight) return await refreshInFlight;
      const startingSession = activeSession;
      const refresh = (async () => {
        const refreshed = await sessionProvider.openSession({ kind: "resume" });
        if (activeSession !== startingSession) {
          throw new Error("GATEWAY_SESSION_SUPERSEDED: The active Desktop session changed while refresh was in progress.");
        }
        return replaceActiveSession(refreshed);
      })();
      refreshInFlight = refresh;
      try {
        return await refresh;
      } finally {
        if (refreshInFlight === refresh) refreshInFlight = null;
      }
    }

    async function ensureActiveSession() {
      if (!activeSession) throw new Error("GATEWAY_SESSION_REQUIRED: A MasterV Gateway session is not active.");
      if (!sessionNeedsRefresh(activeSession)) return activeSession;
      return await refreshActiveSession();
    }

    async function refreshCapabilitySnapshot(sessionToUse = activeSession) {
      if (!sessionToUse) throw new Error("GATEWAY_SESSION_REQUIRED: A MasterV Gateway session is not active.");
      capabilitySnapshot = await remoteOperationsProvider.probeCapabilities(sessionToUse);
      notify(capabilityListeners, capabilitySnapshot);
      return capabilitySnapshot;
    }

    async function withFreshSession(operation) {
      let current = await ensureActiveSession();
      try {
        return await operation(current);
      } catch (error) {
        if (gatewayErrorCode(error) !== "GATEWAY_CREDENTIAL_EXPIRED") throw error;
        current = await refreshActiveSession();
        return await operation(current);
      }
    }

    async function postPaidOperationReadback() {
      try {
        const current = await ensureActiveSession();
        await refreshCapabilitySnapshot(current);
      } catch {
        // Paid operation success must not be converted into a failure solely because
        // the subsequent entitlement readback is temporarily unavailable.
      }
    }

    const sessionRuntime = Object.freeze({
      configured: sessionProvider.configured.bind(sessionProvider),
      async openSession(credentials) {
        try {
          const opened = await sessionProvider.openSession(credentials);
          return replaceActiveSession(opened);
        } catch (error) {
          throw surfaceError(error);
        }
      },
      async closeSession(sessionToClose = activeSession) {
        const closingSession = sessionToClose || activeSession;
        activeSession = null;
        capabilitySnapshot = null;
        refreshInFlight = null;
        notify(capabilityListeners, null);
        notify(sessionListeners, null);
        return await sessionProvider.closeSession(closingSession);
      },
      describeSession: sessionProvider.describeSession.bind(sessionProvider),
      current: () => activeSession,
      ensureFresh: ensureActiveSession,
      refresh: refreshActiveSession,
      subscribe(listener) {
        if (typeof listener !== "function") throw new TypeError("session listener must be a function");
        sessionListeners.add(listener);
        listener(activeSession);
        return () => sessionListeners.delete(listener);
      }
    });

    const remoteRuntime = Object.freeze({
      configured: remoteOperationsProvider.configured.bind(remoteOperationsProvider),
      async probeCapabilities() {
        try {
          const current = await ensureActiveSession();
          return await refreshCapabilitySnapshot(current);
        } catch (error) {
          throw surfaceError(error);
        }
      },
      compileReferenceWorkflow: remoteOperationsProvider.compileReferenceWorkflow.bind(remoteOperationsProvider),
      async discoverYouTube(_session, ...args) {
        try {
          return await withFreshSession((current) => remoteOperationsProvider.discoverYouTube(current, ...args));
        } catch (error) {
          throw surfaceError(error);
        }
      },
      async analyzeYouTube(_session, ...args) {
        try {
          const result = await withFreshSession((current) => remoteOperationsProvider.analyzeYouTube(current, ...args));
          await postPaidOperationReadback();
          return result;
        } catch (error) {
          throw surfaceError(error);
        }
      },
      async generateProductionGuidance(_session, ...args) {
        try {
          const result = await withFreshSession((current) => remoteOperationsProvider.generateProductionGuidance(current, ...args));
          await postPaidOperationReadback();
          return result;
        } catch (error) {
          throw surfaceError(error);
        }
      },
      async probeBackgroundBatch(_session, ...args) {
        try {
          return await withFreshSession((current) => remoteOperationsProvider.probeBackgroundBatch(current, ...args));
        } catch (error) {
          throw surfaceError(error);
        }
      },
      async listBackgroundBatchJobs(_session, ...args) {
        try {
          return await withFreshSession((current) => remoteOperationsProvider.listBackgroundBatchJobs(current, ...args));
        } catch (error) {
          throw surfaceError(error);
        }
      },
      async submitBackgroundBatchJob(_session, ...args) {
        try {
          return await withFreshSession((current) => remoteOperationsProvider.submitBackgroundBatchJob(current, ...args));
        } catch (error) {
          throw surfaceError(error);
        }
      },
      async checkBackgroundBatchJob(_session, ...args) {
        try {
          return await withFreshSession((current) => remoteOperationsProvider.checkBackgroundBatchJob(current, ...args));
        } catch (error) {
          throw surfaceError(error);
        }
      },
      currentCapabilities: () => capabilitySnapshot,
      subscribeCapabilities(listener) {
        if (typeof listener !== "function") throw new TypeError("capability listener must be a function");
        capabilityListeners.add(listener);
        listener(capabilitySnapshot);
        return () => capabilityListeners.delete(listener);
      }
    });

    return Object.freeze({
      contract_version: CONTRACT_VERSION,
      authority: frozenAuthority,
      configured: () => sessionProvider.configured() && workDataProvider.configured() && remoteOperationsProvider.configured(),
      formatError: formatGatewayError,
      session: sessionRuntime,
      workData: Object.freeze(workDataProvider),
      remoteOperations: remoteRuntime
    });
  }

  window.MASTERV_BACKEND_PROVIDER_CONTRACT = Object.freeze({
    contract_version: CONTRACT_VERSION,
    required_methods: REQUIRED_METHODS,
    session_refresh_skew_ms: SESSION_REFRESH_SKEW_MS,
    createBackendProvider
  });
})();
