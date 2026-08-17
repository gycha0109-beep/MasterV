(() => {
  const tauri = window.__TAURI__;
  const invoke = tauri?.core?.invoke;
  const config = window.MASTERV_DESKTOP_CONFIG || {};
  const bridge = window.MASTERV_SESSION_BRIDGE;
  if (typeof invoke !== "function" || !bridge || config.updater_ui !== true) return;

  const shell = document.querySelector("main.shell");
  const hero = document.querySelector("section.hero");
  if (!shell || !hero) return;

  const panel = document.createElement("section");
  panel.className = "card";
  panel.id = "desktop-updater-panel";
  panel.dataset.channel = "private-test";
  panel.dataset.tokenPersistence = "false";
  panel.innerHTML = `
    <div class="surface-heading">
      <div>
        <p class="eyebrow">PRIVATE TEST UPDATE</p>
        <h2>MasterV 업데이트</h2>
        <p class="muted small">로그인 세션으로 비공개 업데이트 채널을 확인합니다. 업데이트 파일은 Tauri 서명을 검증한 뒤에만 설치됩니다.</p>
      </div>
      <span class="badge" id="desktop-updater-version">v0.1.1 bootstrap</span>
    </div>
    <div class="library-summary" aria-live="polite">
      <span>상태 <strong id="desktop-updater-status">로그인 필요</strong></span>
      <span>채널 <strong>PRIVATE TEST</strong></span>
    </div>
    <div class="library-heading-actions">
      <button id="desktop-updater-check" class="secondary compact" type="button" disabled>업데이트 확인</button>
      <button id="desktop-updater-install" class="compact" type="button" hidden>업데이트 설치</button>
    </div>
    <p id="desktop-updater-notes" class="muted small"></p>
  `;
  hero.insertAdjacentElement("afterend", panel);

  const checkButton = panel.querySelector("#desktop-updater-check");
  const installButton = panel.querySelector("#desktop-updater-install");
  const status = panel.querySelector("#desktop-updater-status");
  const notes = panel.querySelector("#desktop-updater-notes");
  let availableVersion = null;
  let autoCheckedToken = null;

  function token() {
    return bridge.getAccessToken();
  }

  function setStatus(text, tone = "") {
    status.textContent = text;
    status.classList.toggle("ok", tone === "ok");
    status.classList.toggle("error", tone === "error");
  }

  function syncAuth() {
    const current = token();
    checkButton.disabled = !current;
    if (!current) {
      availableVersion = null;
      installButton.hidden = true;
      installButton.disabled = false;
      notes.textContent = "로그인 후 자동으로 한 번 확인하며, 언제든 수동으로 다시 확인할 수 있습니다.";
      setStatus("로그인 필요");
      autoCheckedToken = null;
      return;
    }
    if (autoCheckedToken !== current) {
      autoCheckedToken = current;
      setTimeout(() => checkForUpdate(true), 500);
    }
  }

  async function checkForUpdate(automatic = false) {
    const accessToken = token();
    if (!accessToken) return syncAuth();
    checkButton.disabled = true;
    installButton.hidden = true;
    availableVersion = null;
    setStatus(automatic ? "자동 확인 중" : "확인 중");
    notes.textContent = "";
    try {
      const release = await invoke("desktop_update_check", {
        accessToken,
        apikey: config.supabase_publishable_key
      });
      if (!release) {
        setStatus("최신 버전", "ok");
        notes.textContent = "현재 설치된 MasterV가 private-test 채널의 최신 버전입니다.";
        return;
      }
      availableVersion = release[0] || "새 버전";
      const releaseNotes = release[1] || "새 MasterV 업데이트가 준비되었습니다.";
      setStatus(`${availableVersion} 사용 가능`, "ok");
      notes.textContent = releaseNotes;
      installButton.textContent = `${availableVersion} 설치`;
      installButton.hidden = false;
    } catch (error) {
      setStatus("확인 실패", "error");
      notes.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      checkButton.disabled = !token();
    }
  }

  async function installUpdate() {
    const accessToken = token();
    if (!accessToken || !availableVersion) return syncAuth();
    checkButton.disabled = true;
    installButton.disabled = true;
    setStatus("다운로드 · 서명 검증 · 설치 중");
    notes.textContent = "Windows에서는 설치가 시작되면 MasterV가 자동으로 종료될 수 있습니다.";
    try {
      const version = await invoke("desktop_update_install", {
        accessToken,
        apikey: config.supabase_publishable_key
      });
      setStatus(`${version} 설치 완료`, "ok");
      notes.textContent = "MasterV가 자동으로 종료되지 않았다면 앱을 다시 실행해 주세요.";
    } catch (error) {
      setStatus("설치 실패", "error");
      notes.textContent = error instanceof Error ? error.message : String(error);
      installButton.disabled = false;
      checkButton.disabled = !token();
    }
  }

  checkButton.addEventListener("click", () => checkForUpdate(false));
  installButton.addEventListener("click", installUpdate);
  window.addEventListener("masterv:session", syncAuth);
  syncAuth();
})();
