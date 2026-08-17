(() => {
  const originalFetch = window.fetch.bind(window);
  let accessToken = null;

  function publish(authenticated) {
    window.dispatchEvent(new CustomEvent("masterv:session", {
      detail: { authenticated: Boolean(authenticated) }
    }));
  }

  window.MASTERV_SESSION_BRIDGE = Object.freeze({
    getAccessToken() {
      return accessToken;
    }
  });

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const request = args[0];
    const url = typeof request === "string" ? request : request?.url || "";

    if (/\/auth\/v1\/token(?:\?|$)/.test(url) && response.ok) {
      try {
        const payload = await response.clone().json();
        accessToken = typeof payload?.access_token === "string" ? payload.access_token : null;
        publish(Boolean(accessToken));
      } catch {
        accessToken = null;
        publish(false);
      }
    } else if (/\/auth\/v1\/logout(?:\?|$)/.test(url) && response.ok) {
      accessToken = null;
      publish(false);
    }

    return response;
  };
})();
