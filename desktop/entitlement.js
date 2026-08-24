(() => {
  "use strict";

  const backend = window.MASTERV_BACKEND;
  if (!backend) throw new Error("MasterV backend provider was not initialized before entitlement.js");

  const $ = (id) => document.getElementById(id);
  const panel = $("entitlement-panel");
  const status = $("entitlement-status");
  const refresh = $("entitlement-refresh");
  const plan = $("entitlement-plan");
  const license = $("entitlement-license");
  const subscription = $("entitlement-subscription");
  const credits = $("entitlement-credits");
  const deviceLimit = $("entitlement-device-limit");
  const periodEnd = $("entitlement-period-end");
  const sessionExpiry = $("entitlement-session-expiry");

  const required = [panel, status, refresh, plan, license, subscription, credits, deviceLimit, periodEnd, sessionExpiry];
  if (required.some((value) => !value)) throw new Error("MasterV entitlement projection surface is incomplete");

  let session = null;
  let entitlement = null;
  let refreshInFlight = false;

  panel.dataset.authority = "gateway-polar-readback";
  panel.dataset.desktopAuthority = "projection-only";
  panel.dataset.localDataAuthority = "local-sqlite";
  panel.dataset.paidOperationAuthority = "masterv-gateway";

  function text(value, fallback = "—") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function upper(value) {
    return text(value).toUpperCase();
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function setTone(target, tone = "") {
    target.classList.toggle("ok", tone === "ok");
    target.classList.toggle("error", tone === "error");
  }

  function reset() {
    entitlement = null;
    panel.hidden = true;
    status.textContent = "LOCAL ONLY";
    status.title = "";
    setTone(status);
    for (const target of [plan, license, subscription, credits, deviceLimit, periodEnd, sessionExpiry]) target.textContent = "—";
    refresh.disabled = true;
  }

  function render(nextEntitlement, nextSession = session) {
    if (!nextSession || !nextEntitlement) {
      reset();
      return;
    }
    entitlement = nextEntitlement;
    panel.hidden = false;
    status.title = "";
    const licenseActive = nextEntitlement.license_status === "active";
    const capabilityAvailable = Object.values(nextEntitlement.capabilities || {}).some((value) => value === true);
    status.textContent = licenseActive && capabilityAvailable ? "ENTITLED" : "LIMITED";
    setTone(status, licenseActive && capabilityAvailable ? "ok" : "error");
    plan.textContent = upper(nextEntitlement.plan);
    license.textContent = upper(nextEntitlement.license_status);
    setTone(license, licenseActive ? "ok" : "error");
    subscription.textContent = `${upper(nextEntitlement.subscription_status)}${nextEntitlement.grace_active ? " / GRACE" : ""}`;
    setTone(subscription, ["active", "trial", "cancel_at_period_end"].includes(nextEntitlement.subscription_status) || nextEntitlement.grace_active ? "ok" : "error");
    credits.textContent = nextEntitlement.owner
      ? "UNLIMITED"
      : Number.isFinite(Number(nextEntitlement.usage_remaining))
        ? String(Number(nextEntitlement.usage_remaining))
        : "—";
    deviceLimit.textContent = nextEntitlement.device_limit === null || nextEntitlement.device_limit === undefined
      ? "—"
      : String(nextEntitlement.device_limit);
    periodEnd.textContent = formatDate(nextEntitlement.current_period_end);
    sessionExpiry.textContent = formatDate(nextSession.expires_at);
    refresh.disabled = refreshInFlight;
  }

  backend.session.subscribe((nextSession) => {
    session = nextSession;
    if (!session) {
      reset();
      return;
    }
    render(session.entitlement || entitlement, session);
  });

  backend.remoteOperations.subscribeCapabilities((body) => {
    if (!session || !body?.entitlement) return;
    render(body.entitlement, backend.session.current() || session);
  });

  refresh.addEventListener("click", async () => {
    if (!session || refreshInFlight) return;
    refreshInFlight = true;
    refresh.disabled = true;
    status.textContent = "REFRESHING";
    setTone(status);
    try {
      const body = await backend.remoteOperations.probeCapabilities(session);
      render(body.entitlement, backend.session.current() || session);
    } catch (error) {
      status.textContent = "READBACK ERROR";
      setTone(status, "error");
      status.title = backend.formatError ? backend.formatError(error) : error instanceof Error ? error.message : String(error);
    } finally {
      refreshInFlight = false;
      if (session) refresh.disabled = false;
    }
  });

  reset();
})();
