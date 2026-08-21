(() => {
  "use strict";

  const tauri = window.__TAURI__;
  const invoke = tauri?.core?.invoke;
  const updaterConfig = window.MASTERV_UPDATER_CONFIG || {};
  if (typeof invoke !== "function" || updaterConfig.enabled !== true) return;

  const shell = document.querySelector("main.shell");
  const hero = document.querySelector("header.hero");
  if (!shell || !hero) return;

  const panel = document.createElement("section");
  panel.className = "card";
  panel.id = "desktop-updater-panel";
  panel.dataset.channel = updaterConfig.channel || "stable";
  panel.dataset.transport = updaterConfig.transport || "tauri-static-signed";
  panel.dataset.subscriptionIndependent = String(updaterConfig.subscription_independent === true);
  panel.dataset.configAuthority = "independent-updater";
  panel.innerHTML = `
    <div class="surface-heading">
      <div>
        <p class="eyebrow">SIGNED DESKTOP UPDATE</p>
        <h2>MasterV 업데이트</h2>
        <p class="muted small">로그인·구독 상태와 무관하게 공개 업데이트 채널을 확인합니다. 설치 파일은 Tauri 서명을 검증한 뒤에만 설치됩니다.</p>
      </div>
      <span class="badge" id="desktop-updater-version">stable</span>
    </div>
    <div class="library-summary" aria-live="polite">
      <span>상태 <strong id="desktop-updater-status">확인 대기</strong></span>
      <span>채널 <strong>STABLE</strong></span>
    </div>
    <div class="library-heading-actions">
      <button id="desktop-updater-check" class="secondary compact" type="button">업데이트 확인</button>
      <button id="desktop-updater-install" class="compact" type="button" hidden>업데이트 설치</button>
    </div>
    <p id="desktop-updater-notes" class="muted small">앱 시작 후 자동으로 한 번 확인하며, 언제든 수동으로 다시 확인할 수 있습니다.</p>
  `;
  hero.insertAdjacentElement("afterend", panel);

  const checkButton = panel.querySelector("#desktop-updater-check");
  const installButton = panel.querySelector("#desktop-updater-install");
  const status = panel.querySelector("#desktop-updater-status");
  const notes = panel.querySelector("#desktop-updater-notes");
  let availableVersion = null;
  let checking = false;

  function setStatus(text, tone = "") {
    status.textContent = text;
    status.classList.toggle("ok", tone === "ok");
    status.classList.toggle("error", tone === "error");
  }

  async function checkForUpdate(automatic = false) {
    if (checking) return;
    checking = true;
    checkButton.disabled = true;
    installButton.hidden = true;
    availableVersion = null;
    setStatus(automatic ? "자동 확인 중" : "확인 중");
    notes.textContent = "";
    try {
      const release = await invoke("desktop_update_check");
      if (!release) {
        setStatus("최신 버전", "ok");
        notes.textContent = "현재 설치된 MasterV가 stable 채널의 최신 버전입니다.";
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
      checking = false;
      checkButton.disabled = false;
    }
  }

  async function installUpdate() {
    if (!availableVersion) return;
    checkButton.disabled = true;
    installButton.disabled = true;
    setStatus("다운로드 · 서명 검증 · 설치 중");
    notes.textContent = "Windows에서는 설치가 시작되면 MasterV가 자동으로 종료될 수 있습니다.";
    try {
      const version = await invoke("desktop_update_install");
      setStatus(`${version} 설치 완료`, "ok");
      notes.textContent = "MasterV가 자동으로 종료되지 않았다면 앱을 다시 실행해 주세요.";
    } catch (error) {
      setStatus("설치 실패", "error");
      notes.textContent = error instanceof Error ? error.message : String(error);
      installButton.disabled = false;
      checkButton.disabled = false;
    }
  }

  checkButton.addEventListener("click", () => checkForUpdate(false));
  installButton.addEventListener("click", installUpdate);
  setTimeout(() => checkForUpdate(true), 500);
})();
