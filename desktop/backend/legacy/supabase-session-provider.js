(() => {
  "use strict";

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

    function requireConfigured() {
      if (!configured()) throw new Error("Legacy Supabase session provider is not configured");
    }

    async function openSession(credentials = {}) {
      requireConfigured();
      if (credentials.kind !== "email_password") {
        throw new Error(`Legacy Supabase session provider does not support credential kind ${credentials.kind || "missing"}`);
      }
      const email = String(credentials.email || "").trim().toLowerCase();
      const password = String(credentials.password || "");
      if (!email || !password) throw new Error("Email and password are required");

      const response = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });
      if (!response.ok) throw new Error(await parseError(response));

      const body = await response.json();
      if (!body.access_token || !body.user?.id) {
        throw new Error("Supabase session response is incomplete");
      }

      return Object.freeze({
        provider: "legacy-supabase",
        credential_kind: "bearer",
        credential: body.access_token,
        subject_id: body.user.id,
        expires_at: body.expires_at ?? null,
        user: Object.freeze({
          id: body.user.id,
          email: body.user.email || email
        })
      });
    }

    async function closeSession() {
      // EXIT-1B-1 preserves the current Desktop logout semantics: in-memory session disposal only.
      return undefined;
    }

    function describeSession(session) {
      return Object.freeze({
        authenticated: Boolean(session?.credential && session?.subject_id),
        provider: session?.provider || null,
        subject_id: session?.subject_id || null,
        expires_at: session?.expires_at ?? null
      });
    }

    return {
      configured,
      openSession,
      closeSession,
      describeSession
    };
  }

  window.MASTERV_LEGACY_SUPABASE_SESSION_PROVIDER = Object.freeze({ create });
})();
