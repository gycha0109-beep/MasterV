(() => {
  "use strict";

  function create(invoke = window.__TAURI__?.core?.invoke) {
    function configured() {
      return typeof invoke === "function";
    }

    function requireConfigured() {
      if (!configured()) throw new Error("Native MasterV Gateway session provider is unavailable");
    }

    async function openSession(credentials = {}) {
      requireConfigured();
      if (credentials.kind === "product_key") {
        const productKey = String(credentials.product_key || "").trim();
        if (!productKey) throw new Error("Product Key is required");
        return Object.freeze(await invoke("desktop_gateway_activate", {
          productKey,
          deviceLabel: String(credentials.device_label || "MasterV Desktop")
        }));
      }
      if (credentials.kind === "resume") {
        return Object.freeze(await invoke("desktop_gateway_resume_session"));
      }
      throw new Error(`MasterV Gateway session provider does not support credential kind ${credentials.kind || "missing"}`);
    }

    async function closeSession() {
      // Session credential is memory-only. Closing the provider session deliberately
      // does not delete the long-lived DPAPI-protected device credential.
      return undefined;
    }

    function describeSession(session) {
      return Object.freeze({
        authenticated: Boolean(session?.credential),
        provider: session?.provider || null,
        subject_id: session?.subject_id || null,
        expires_at: session?.expires_at ?? null,
        install_id: session?.install_id ?? null,
        entitlement: session?.entitlement ?? null
      });
    }

    return Object.freeze({ configured, openSession, closeSession, describeSession });
  }

  window.MASTERV_GATEWAY_SESSION_PROVIDER = Object.freeze({ create });
})();
