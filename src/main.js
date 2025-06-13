/**
 * EzTalk 설정 관리자 - 메인 애플리케이션
 * 리팩토링된 모듈들을 통합하여 앱을 구성합니다.
 */

/**
 * 앱 초기화
 */
async function init() {
  try {
    // 작업 디렉토리 초기화
    await ServerManager.initializeWorkingDirectory();

    // 템플릿 로드 (실패 시 여기서 throw 되어 catch 블록으로 이동)
    await ServerManager.loadTemplate();

    // 서버 목록 새로고침 및 렌더링
    const serverList = await ServerManager.refreshServerList();
    renderServerList(serverList);

    console.log("앱 초기화 완료");
  } catch (error) {
    console.error("초기화 오류:", error);
    AppUtils.showNotification(
      "초기화 중 오류가 발생했습니다: " + error.message, // error.message 사용
      "error"
    );
  }
}

/**
 * 서버 목록 렌더링
 */
function renderServerList(serverList = null) {
  const emptyState = AppUtils.elements.emptyServerState();
  const container = AppUtils.elements.serverListContainer();

  if (!emptyState || !container) return;

  const servers = serverList || ServerManager.getServerList();

  if (servers.length === 0) {
    emptyState.classList.remove("hidden");
    container.classList.add("hidden");
  } else {
    emptyState.classList.add("hidden");
    container.classList.remove("hidden");

    container.innerHTML = "";
    servers.forEach((server) => {
      const serverItem = createServerItem(server);
      container.appendChild(serverItem);
    });
  }
}

/**
 * 서버 아이템 생성 (복사 버튼 추가)
 */
function createServerItem(server) {
  const template = document.getElementById("serverItemTemplate");
  const clone = template.content.cloneNode(true);

  // 데이터 바인딩
  clone.querySelector(".server-name").textContent = server.name;

  // 설정 파일 개수 표시
  const detailsEl = clone.querySelector(".server-details");
  if (server.fileCount !== undefined) {
    detailsEl.textContent = `설정 파일 ${server.fileCount}개`;
  } else {
    detailsEl.textContent = "설정 확인 중...";
  }

  // 서버 선택 이벤트
  const itemEl = clone.querySelector(".server-item");
  itemEl.onclick = (e) => {
    // 복사 버튼 클릭시에는 서버 선택 안함
    if (e.target.closest(".server-copy-btn")) return;
    selectServer(server);
  };

  // 복사 버튼 추가
  const serverActions = document.createElement("div");
  serverActions.className = "server-actions";
  serverActions.style.cssText = `
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    opacity: 0;
    transition: opacity 0.2s;
  `;

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn btn-secondary btn-mini server-copy-btn";
  copyBtn.innerHTML = "📋 복사";
  copyBtn.title = "이 서버 설정을 복사합니다";
  copyBtn.onclick = (e) => {
    e.stopPropagation();
    showServerCopyDialog(server);
  };

  serverActions.appendChild(copyBtn);
  itemEl.appendChild(serverActions);

  // 호버 효과로 복사 버튼 표시
  itemEl.addEventListener("mouseenter", () => {
    serverActions.style.opacity = "1";
  });
  itemEl.addEventListener("mouseleave", () => {
    serverActions.style.opacity = "0";
  });

  // 활성 상태 표시 - ConfigEditor가 로드된 후에만 체크
  if (window.ConfigEditor) {
    const currentConfig = ConfigEditor.getCurrentConfig();
    if (currentConfig.server?.name === server.name) {
      itemEl.classList.add("active");
    }
  }

  return clone;
}

/**
 * 서버 선택 (최신 파일 로드)
 */
async function selectServer(server) {
  const configData = await ServerManager.loadServerConfig(server);

  // 기본 키 순서를 사용하여 순서 보정
  // DEFAULT_KEY_ORDER 대신 ServerManager에서 로드된 템플릿 기반으로 키 순서 가져옴
  let keyOrder = ConfigEditor.getDefaultKeyOrder();

  // 현재 설정에 없는 키들은 마지막에 추가
  const currentKeys = Object.keys(configData.config);
  const missingKeys = currentKeys.filter((key) => !keyOrder.includes(key));
  keyOrder = [
    ...keyOrder.filter((key) => currentKeys.includes(key)),
    ...missingKeys,
  ];

  console.log("사용할 키 순서:", keyOrder);
  console.log("현재 객체 키 순서:", currentKeys);

  // ConfigEditor에 설정 데이터와 키 순서 전달
  ConfigEditor.setCurrentConfig(
    configData.server,
    configData.config,
    configData.originalConfig,
    keyOrder
  );

  // UI 업데이트
  ConfigEditor.updateServerInfo(configData.server);
  ConfigEditor.renderConfigEditor();
  renderServerList(); // 활성 상태 업데이트
}

/**
 * 설정 저장
 */
async function saveCurrentConfig() {
  const currentConfig = ConfigEditor.getCurrentConfig();

  if (!currentConfig.server || !currentConfig.config) {
    AppUtils.showNotification("저장할 설정이 없습니다.", "error");
    return;
  }

  await ServerManager.saveServerConfig(
    currentConfig.server,
    currentConfig.config,
    currentConfig.original
  );

  // 서버 목록 새로고침 후 현재 서버 다시 선택
  await refreshServerList();
  await selectServer(currentConfig.server);
}

/**
 * 서버 복사 다이얼로그 표시
 */
function showServerCopyDialog(server) {
  // 기본 복사본 이름 생성
  const defaultName = `${server.name}_복사본`;

  // 인라인 다이얼로그 생성
  const dialog = document.createElement("div");
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    z-index: 10000;
    min-width: 400px;
  `;

  dialog.innerHTML = `
    <h3 style="margin: 0 0 1rem 0; color: #333;">📋 서버 복사</h3>
    <p style="margin: 0 0 1rem 0; color: #666; font-size: 0.9rem;">
      <strong>${server.name}</strong>의 설정을 복사합니다.
    </p>
    <div style="margin-bottom: 1rem;">
      <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">새 서버 이름:</label>
      <input type="text" id="newServerName" 
             style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;" 
             value="${defaultName}" placeholder="예: ${server.name}_개발">
      <small style="color: #666; font-size: 0.75rem; margin-top: 0.25rem; display: block;">
        서버 이름은 폴더명으로 사용됩니다.
      </small>
    </div>
    <div style="text-align: right; margin-top: 1.5rem;">
      <button id="cancelCopy" style="margin-right: 0.5rem; padding: 0.5rem 1rem; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">취소</button>
      <button id="confirmCopy" style="padding: 0.5rem 1rem; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">📋 복사 시작</button>
    </div>
  `;

  // 배경 오버레이
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 9999;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  // 이벤트 처리
  const nameInput = dialog.querySelector("#newServerName");
  const cancelBtn = dialog.querySelector("#cancelCopy");
  const confirmBtn = dialog.querySelector("#confirmCopy");

  nameInput.focus();
  nameInput.select(); // 기본 이름 선택

  function closeDialog() {
    document.body.removeChild(overlay);
    document.body.removeChild(dialog);
  }

  cancelBtn.onclick = closeDialog;
  overlay.onclick = closeDialog;

  confirmBtn.onclick = async () => {
    const newName = nameInput.value.trim();
    if (!newName) {
      AppUtils.showNotification("서버 이름을 입력하세요.", "error");
      nameInput.focus();
      return;
    }

    if (newName === server.name) {
      AppUtils.showNotification("다른 이름을 입력하세요.", "error");
      nameInput.focus();
      return;
    }

    closeDialog();
    await executeServerCopy(server.name, newName);
  };

  // Enter 키로 복사 시작
  nameInput.onkeypress = (e) => {
    if (e.key === "Enter") confirmBtn.click();
  };
}

/**
 * 서버 복사 실행
 */
async function executeServerCopy(sourceServerName, targetServerName) {
  try {
    // 진행 상태 표시
    AppUtils.showNotification(
      `${sourceServerName} → ${targetServerName} 복사 중...`,
      "info"
    );
    AppUtils.updateStatus("서버 복사 중...");

    // 서버 복사 실행
    await ServerManager.copyServer(sourceServerName, targetServerName);

    // 성공 피드백
    AppUtils.showNotification(
      `✅ ${targetServerName} 서버가 성공적으로 복사되었습니다!`,
      "success"
    );
    AppUtils.updateStatus("복사 완료");

    // 서버 목록 새로고침
    await refreshServerList();

    // 새로 생성된 서버 자동 선택 (옵션)
    const servers = ServerManager.getServerList();
    const newServer = servers.find((s) => s.name === targetServerName);
    if (newServer) {
      selectServer(newServer);
    }
  } catch (error) {
    console.error("서버 복사 오류:", error);
    AppUtils.showNotification(
      `❌ 복사 실패: ${error.message || error}`,
      "error"
    );
    AppUtils.updateStatus("복사 실패");
  }
}

/**
 * 서버 목록 새로고침
 */
async function refreshServerList() {
  const serverList = await ServerManager.refreshServerList();
  renderServerList(serverList);
}

/**
 * 새 서버 추가 모달 열기
 */
function addNewServer() {
  const modal = document.getElementById("addServerModal");
  if (modal) {
    modal.style.display = "block";
    const nameInput = document.getElementById("serverName");
    const useTemplateCheck = document.getElementById("useTemplate");
    if (nameInput) nameInput.value = "";
    if (useTemplateCheck) useTemplateCheck.checked = true;
  }
}

/**
 * 서버 추가 모달 닫기
 */
function closeAddServerModal() {
  const modal = document.getElementById("addServerModal");
  if (modal) modal.style.display = "none";
}

/**
 * 서버 생성
 */
async function createServerConfig() {
  const nameInput = document.getElementById("serverName");
  const useTemplateCheck = document.getElementById("useTemplate");

  if (!nameInput) return;

  const name = nameInput.value.trim();
  const useTemplate = useTemplateCheck ? useTemplateCheck.checked : true;

  if (!name) {
    AppUtils.showNotification("서버 이름을 입력해주세요.", "error");
    return;
  }

  await ServerManager.createNewServer(name, useTemplate);
  closeAddServerModal();
  await refreshServerList();
}

/**
 * 변경 로그 보기
 */
function viewChangeLog() {
  const modal = document.getElementById("changeLogModal");
  if (modal) {
    modal.style.display = "block";
    loadAndRenderChangeLog();
  }
}

/**
 * 변경 로그 모달 닫기
 */
function closeChangeLogModal() {
  const modal = document.getElementById("changeLogModal");
  if (modal) modal.style.display = "none";
}

/**
 * 변경 로그 로드 및 렌더링
 */
async function loadAndRenderChangeLog() {
  const currentConfig = ConfigEditor.getCurrentConfig();
  if (!currentConfig.server) return;

  const logText = await ServerManager.loadChangeLog(currentConfig.server.name);
  renderChangeLog(logText);
}

/**
 * 변경 로그 렌더링
 */
function renderChangeLog(logText) {
  const container = document.getElementById("changeLogContent");
  if (!container) return;

  if (!logText || logText.trim() === "") {
    container.innerHTML =
      '<p style="text-align: center; color: #666; padding: 2rem;">변경 로그가 없습니다.</p>';
    return;
  }

  const lines = logText.split(/\r?\n/);
  const lastLines = lines.slice(-10);

  container.innerHTML = "";

  lastLines.forEach((line) => {
    const lineDiv = document.createElement("div");
    lineDiv.className = "log-line";
    lineDiv.textContent = line;
    container.appendChild(lineDiv);
  });
}

/**
 * 템플릿 편집 모달 열기
 */
async function openTemplateEditor() {
  const templateConfig = ServerManager.getTemplateConfig();
  if (!templateConfig) {
    AppUtils.showNotification(
      "템플릿 설정이 로드되지 않아 템플릿 편집을 열 수 없습니다.",
      "error"
    );
    return;
  }

  const modal = document.getElementById("templateModal");
  if (modal) {
    modal.style.display = "block";
    
    // ConfigEditor의 통합 함수 사용 (경고 메시지 포함)
    const templateEditor = document.getElementById("templateEditor");
    if (templateEditor) {
      templateEditor.innerHTML = "";
      
      // ConfigEditor의 renderTemplateEditor 사용 (경고 메시지가 이미 포함됨)
      const editorElement = ConfigEditor.renderTemplateEditor(templateConfig);
      if (editorElement) {
        templateEditor.appendChild(editorElement);
      }
    }
  }
}

/**
 * 템플릿 모달 닫기
 */
function closeTemplateModal() {
  const modal = document.getElementById("templateModal");
  if (modal) modal.style.display = "none";
}





/**
 * 템플릿 저장
 */
async function saveTemplate() {
  const templateConfig = ServerManager.getTemplateConfig();
  if (!templateConfig) return;
  await ServerManager.saveTemplate(templateConfig);
  closeTemplateModal();
}

/**
 * 템플릿에서 항목 추가 모달 열기
 */
function openAddFromTemplateModal() {
  const currentConfig = ConfigEditor.getCurrentConfig();
  if (!currentConfig.config) {
    AppUtils.showNotification(
      "템플릿 또는 현재 설정이 로드되지 않았습니다.",
      "error"
    );
    return;
  }

  const modal = document.getElementById("addFromTemplateModal");
  if (modal) {
    modal.style.display = "block";
    renderMissingTemplateItems();
  }
}

/**
 * 템플릿 항목 추가 모달 닫기
 */
function closeAddFromTemplateModal() {
  const modal = document.getElementById("addFromTemplateModal");
  if (modal) modal.style.display = "none";
}

/**
 * 누락된 템플릿 항목들 렌더링
 */
function renderMissingTemplateItems() {
  const container = document.getElementById("templateItemsList");
  if (!container) return;

  container.innerHTML = "";

  const currentConfig = ConfigEditor.getCurrentConfig();
  const missingItems = ServerManager.findMissingTemplateItems(
    currentConfig.config
  );

  if (missingItems.length === 0) {
    container.innerHTML =
      '<p style="text-align: center; color: #666; padding: 2rem;">추가할 수 있는 템플릿 항목이 없습니다.</p>';
    return;
  }

  missingItems.forEach((item) => {
    const template = document.getElementById("templateItemTemplate");
    const clone = template.content.cloneNode(true);

    const checkbox = clone.querySelector(".template-item-checkbox");
    const nameSpan = clone.querySelector(".template-item-name");
    const typeSpan = clone.querySelector(".template-item-type");

    checkbox.value = item.path;
    nameSpan.textContent = item.key;
    typeSpan.textContent = `(${item.type})`;

    container.appendChild(clone);
  });
}

/**
 * 선택된 템플릿 항목들을 현재 설정에 추가
 */
function addSelectedTemplateItems() {
  const checkboxes = document.querySelectorAll(
    "#templateItemsList .template-item-checkbox:checked"
  );

  if (checkboxes.length === 0) {
    AppUtils.showNotification("추가할 항목을 선택해주세요.", "warning");
    return;
  }

  const selectedPaths = Array.from(checkboxes).map((cb) => cb.value);

  ConfigEditor.addSelectedTemplateItems(selectedPaths);
  closeAddFromTemplateModal();
}

/**
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "s":
          e.preventDefault();
          saveCurrentConfig();
          break;
        case "l":
          e.preventDefault();
          viewChangeLog();
          break;
        case "r":
          e.preventDefault();
          refreshServerList();
          break;
      }
    }
  });

  // 모달 외부 클릭시 닫기
  window.onclick = function (event) {
    const addModal = document.getElementById("addServerModal");
    const templateModal = document.getElementById("templateModal");
    const addFromTemplateModal = document.getElementById(
      "addFromTemplateModal"
    );
    const changeLogModal = document.getElementById("changeLogModal");

    if (event.target === addModal) {
      closeAddServerModal();
    }
    if (event.target === templateModal) {
      closeTemplateModal();
    }
    if (event.target === addFromTemplateModal) {
      closeAddFromTemplateModal();
    }
    if (event.target === changeLogModal) {
      closeChangeLogModal();
    }
  };
}

/**
 * 앱 시작
 */
document.addEventListener("DOMContentLoaded", async () => {
  console.log("앱 시작...");

  // 모든 스크립트가 로드될 때까지 짧은 지연
  await new Promise((resolve) => setTimeout(resolve, 100));

  // 필수 객체들이 로드되었는지 확인
  if (!window.ServerManager || !window.ConfigEditor || !window.AppUtils) {
    console.error("필수 모듈들이 로드되지 않았습니다");
    AppUtils.showNotification(
      "애플리케이션 로드 중 오류가 발생했습니다.",
      "error"
    );
    return;
  }

  // Tauri API 로딩 대기
  const invoke = await AppUtils.waitForTauri();

  if (!invoke) {
    AppUtils.showNotification(
      "Tauri API를 로드할 수 없습니다. 데스크톱 앱에서만 작동합니다.",
      "error"
    );
    // Tauri API 로드 실패 시에도 더 이상 진행하지 않음
    return;
  }

  // 각 매니저에 invoke 함수 전달
  ServerManager.setInvokeFunction(invoke);

  // 앱 초기화
  await init(); // init에서 템플릿 로드 실패 시 throw하여 앱 종료

  console.log("앱 로드 완료!");
});

/**
 * 템플릿 항목 추가 모달 표시
 * @param {string} parentPath - 부모 경로 (비어있으면 최상위)
 */
function showAddTemplateItemModal(parentPath = "") {
  const modalHTML = `
    <div id="addTemplateItemModal" class="modal" style="display: block;">
      <div class="modal-content" style="width: 400px; max-width: 90vw;">
        <div class="modal-header">
          <h3>${
            parentPath ? `${parentPath}에 항목 추가` : "최상위에 항목 추가"
          }</h3>
        </div>
        <div style="padding: 1rem;">
          <div class="field-group">
            <label class="field-label">항목 이름</label>
            <input type="text" id="newItemKey" class="field-input" placeholder="예: newProperty">
          </div>
          <div class="field-group">
            <label class="field-label">타입</label>
            <select id="newItemType" class="field-input">
              <option value="string">문자열</option>
              <option value="number">숫자</option>
              <option value="boolean">참/거짓</option>
              <option value="array">배열</option>
              <option value="object">객체</option>
            </select>
          </div>
          <div class="field-group" id="defaultValueGroup">
            <label class="field-label">기본값</label>
            <input type="text" id="newItemValue" class="field-input" placeholder="기본값">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeAddTemplateItemModal()">취소</button>
          <button class="btn btn-primary" onclick="addTemplateItem('${parentPath}')">추가</button>
        </div>
      </div>
    </div>
  `;

  // 기존 모달 제거
  const existingModal = document.getElementById("addTemplateItemModal");
  if (existingModal) existingModal.remove();

  // 모달 추가
  document.body.insertAdjacentHTML("beforeend", modalHTML);

  // 타입 변경 시 기본값 입력 필드 업데이트
  document.getElementById("newItemType").onchange = updateDefaultValueField;
  updateDefaultValueField(); // 초기 설정

  // 이름 입력 필드에 포커스
  document.getElementById("newItemKey").focus();
}

/**
 * 타입에 따른 기본값 필드 업데이트
 */
function updateDefaultValueField() {
  const typeSelect = document.getElementById("newItemType");
  const valueInput = document.getElementById("newItemValue");
  const valueGroup = document.getElementById("defaultValueGroup");

  if (!typeSelect || !valueInput) return;

  const type = typeSelect.value;

  switch (type) {
    case "string":
      valueInput.type = "text";
      valueInput.placeholder = "예: Hello World";
      valueGroup.style.display = "block";
      break;
    case "number":
      valueInput.type = "number";
      valueInput.placeholder = "예: 100";
      valueGroup.style.display = "block";
      break;
    case "boolean":
      valueInput.type = "text";
      valueInput.placeholder = "true 또는 false";
      valueGroup.style.display = "block";
      break;
    case "array":
      valueInput.type = "text";
      valueInput.placeholder = '["항목1", "항목2"]';
      valueGroup.style.display = "block";
      break;
    case "object":
      valueGroup.style.display = "none";
      break;
  }
}

/**
 * 템플릿 항목 추가 모달 닫기
 */
function closeAddTemplateItemModal() {
  const modal = document.getElementById("addTemplateItemModal");
  if (modal) modal.remove();
}

/**
 * 템플릿에 새 항목 추가
 * @param {string} parentPath - 부모 경로
 */
function addTemplateItem(parentPath) {
  const keyInput = document.getElementById("newItemKey");
  const typeSelect = document.getElementById("newItemType");
  const valueInput = document.getElementById("newItemValue");

  if (!keyInput || !typeSelect) return;

  const key = keyInput.value.trim();
  const type = typeSelect.value;

  if (!key) {
    AppUtils.showNotification("항목 이름을 입력해주세요.", "error");
    keyInput.focus();
    return;
  }

  // 기본값 생성
  let defaultValue;
  switch (type) {
    case "string":
      defaultValue = valueInput.value || "";
      break;
    case "number":
      defaultValue = parseInt(valueInput.value) || 0;
      break;
    case "boolean":
      defaultValue = valueInput.value.toLowerCase() === "true";
      break;
    case "array":
      try {
        defaultValue = valueInput.value ? JSON.parse(valueInput.value) : [];
      } catch (e) {
        defaultValue = [];
      }
      break;
    case "object":
      defaultValue = {};
      break;
    default:
      defaultValue = "";
  }

  // 템플릿에 항목 추가
  const templateConfig = ServerManager.getTemplateConfig();
  if (!templateConfig) {
    AppUtils.showNotification("템플릿을 찾을 수 없습니다.", "error");
    return;
  }

  // 경로에 따라 항목 추가
  if (parentPath) {
    const keys = parentPath.split(".");
    let current = templateConfig;

    for (const pathKey of keys) {
      if (!current[pathKey]) {
        current[pathKey] = {};
      }
      current = current[pathKey];
    }

    if (current[key]) {
      AppUtils.showNotification(`'${key}' 항목이 이미 있습니다.`, "error");
      return;
    }

    current[key] = defaultValue;
  } else {
    if (templateConfig[key]) {
      AppUtils.showNotification(`'${key}' 항목이 이미 있습니다.`, "error");
      return;
    }

    templateConfig[key] = defaultValue;
  }

  // 성공 메시지 및 UI 업데이트
  AppUtils.showNotification(`'${key}' 항목이 추가되었습니다.`, "success");
  closeAddTemplateItemModal();
  
  // 템플릿 에디터 재렌더링
  const templateEditor = document.getElementById("templateEditor");
  templateEditor.innerHTML = "";
  const editorElement = ConfigEditor.renderTemplateEditor(templateConfig);
  if (editorElement) {
    templateEditor.appendChild(editorElement);
  }
}

// 전역 함수들 (HTML에서 직접 호출되는 함수들)
window.addNewServer = addNewServer;
window.closeAddServerModal = closeAddServerModal;
window.createServerConfig = createServerConfig;
window.saveCurrentConfig = saveCurrentConfig;
window.refreshServerList = refreshServerList;
window.viewChangeLog = viewChangeLog;
window.closeChangeLogModal = closeChangeLogModal;
window.openTemplateEditor = openTemplateEditor;
window.closeTemplateModal = closeTemplateModal;
window.saveTemplate = saveTemplate;
window.openAddFromTemplateModal = openAddFromTemplateModal;
window.closeAddFromTemplateModal = closeAddFromTemplateModal;
window.addSelectedTemplateItems = addSelectedTemplateItems;
window.showAddTemplateItemModal = showAddTemplateItemModal;
window.closeAddTemplateItemModal = closeAddTemplateItemModal;
window.addTemplateItem = addTemplateItem;
