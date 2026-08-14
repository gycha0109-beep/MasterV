(() => {
  const config = window.MASTERV_DESKTOP_CONFIG || {};
  const authStatus = document.getElementById("auth-status");
  const apiStatus = document.getElementById("api-status");
  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");
  const message = document.getElementById("message");
  const capBoundary = document.getElementById("cap-boundary");
  const capAnalyze = document.getElementById("cap-analyze");
  const capYoutube = document.getElementById("cap-youtube");
  const capProductTruth = document.getElementById("cap-product-truth");

  let session = null;

  function configured() {
    return Boolean(config.supabase_url && config.supabase_publishable_key && config.api_base_url);
  }

  function setMessage(text, success = false) {
    message.textContent = text || "";
    message.classList.toggle("success", success);
  }

  function setCapability(target, value) {
    target.textContent = value === true ? "READY" : value === false ? "PENDING" : "—";
  }

  function resetCapabilities() {
    [capBoundary, capAnalyze, capYoutube, capProductTruth].forEach((target) => setCapability(target, null));
    apiStatus.textContent = "NOT CHECKED";
  }

  async function parseError(response) {
    try {
      const body = await response.json();
      return body.msg || body.message || body.error_description || body.error || `${response.status}`;
    } catch {
      return `${response.status} ${response.statusText}`.trim();
    }
  }

  async function login(email, password) {
    const response = await fetch(`${config.supabase_url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: config.supabase_publishable_key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password })
    });
    if (!response.ok) throw new Error(await parseError(response));
    const body = await response.json();
    if (!body.access_token || !body.user?.id) throw new Error("Supabase session response is incomplete");
    return body;
  }

  async function probeHostedApi(activeSession) {
    const response = await fetch(`${config.api_base_url}/masterv-api-boundary`, {
      method: "GET",
      headers: {
        apikey: config.supabase_publishable_key,
        Authorization: `Bearer ${activeSession.access_token}`,
        Accept: "application/json"
      }
    });
    if (!response.ok) throw new Error(`Hosted API ${await parseError(response)}`);
    const body = await response.json();
    if (body.contract_version !== config.api_contract_version) {
      throw new Error(`Hosted API contract mismatch: ${body.contract_version || "missing"}`);
    }
    if (body.authenticated !== true || body.capabilities?.boundary_probe !== true) {
      throw new Error("Hosted API authentication boundary was not verified");
    }
    return body;
  }

  async function connect(email, password) {
    session = await login(email, password);
    authStatus.textContent = "AUTHENTICATED";
    authStatus.classList.add("ok");
    const hosted = await probeHostedApi(session);
    apiStatus.textContent = "CONNECTED";
    apiStatus.classList.add("ok");
    setCapability(capBoundary, hosted.capabilities?.boundary_probe);
    setCapability(capAnalyze, hosted.capabilities?.analyze);
    setCapability(capYoutube, hosted.capabilities?.youtube_discovery);
    setCapability(capProductTruth, hosted.capabilities?.product_truth);
    logoutButton.hidden = false;
    setMessage("인증된 hosted API 경계에 연결되었습니다.", true);
  }

  function logout() {
    session = null;
    authStatus.textContent = "SIGNED OUT";
    authStatus.classList.remove("ok");
    apiStatus.classList.remove("ok");
    resetCapabilities();
    logoutButton.hidden = true;
    passwordInput.value = "";
    setMessage("세션을 이 기기 메모리에서 제거했습니다.", true);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");
    resetCapabilities();
    if (!configured()) {
      setMessage("이 Desktop 빌드에는 Supabase/Hosted API public config가 주입되지 않았습니다.");
      return;
    }
    loginButton.disabled = true;
    authStatus.textContent = "CONNECTING";
    try {
      await connect(emailInput.value, passwordInput.value);
    } catch (error) {
      session = null;
      authStatus.textContent = "SIGNED OUT";
      authStatus.classList.remove("ok");
      apiStatus.textContent = "FAILED";
      apiStatus.classList.remove("ok");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      loginButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", logout);

  if (!configured()) {
    setMessage("Desktop shell static build 완료. Runtime public config는 아직 연결되지 않았습니다.");
  }
})();
