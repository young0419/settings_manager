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

    // 템플릿 로드
    await ServerManager.loadTemplate();

    // 서버 목록 새로고침 및 렌더링
    const serverList = await ServerManager.refreshServerList();
    renderServerList(serverList);

    console.log("앱 초기화 완료");
  } catch (error) {
    console.error("초기화 오류:", error);
    AppUtils.showNotification(
      "초기화 중 오류가 발생했습니다: " + error,
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
 * 서버 아이템 생성 (템플릿 사용)
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

  // 이벤트 바인딩 - 전체 클릭시 서버 선택
  const itemEl = clone.querySelector(".server-item");
  itemEl.onclick = () => {
    selectServer(server);
  };

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
    await ServerManager.loadTemplate();
  }

  const modal = document.getElementById("templateModal");
  if (modal) {
    modal.style.display = "block";
    renderTemplateEditor();
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
 * 템플릿 에디터 렌더링
 */
function renderTemplateEditor() {
  const templateConfig = ServerManager.getTemplateConfig();
  if (!templateConfig) return;

  const templateEditor = document.getElementById("templateEditor");
  if (!templateEditor) return;

  templateEditor.innerHTML = "";

  // 경고 메시지 추가
  const warningDiv = document.createElement("div");
  warningDiv.style.cssText = `
    background: #fff3cd;
    border: 1px solid #ffeaa7;
    border-radius: 4px;
    padding: 1rem;
    margin-bottom: 1rem;
    color: #856404;
  `;
  warningDiv.innerHTML = `
    <strong>⚠️ 주의</strong><br>
    템플릿 편집은 신중하게 하세요. 새 서버 생성시 기본값으로 사용됩니다.<br>
    삭제 기능은 안전을 위해 비활성화되어 있습니다.
  `;
  templateEditor.appendChild(warningDiv);

  // ConfigEditor의 동적 폼 생성 기능 재사용
  const form = createDynamicFormForTemplate(templateConfig);
  templateEditor.appendChild(form);
}

/**
 * 템플릿용 동적 폼 생성 (ConfigEditor의 함수 재사용)
 */
function createDynamicFormForTemplate(obj, path = "template") {
  const container = document.createElement("div");
  const categories = groupConfigKeysForTemplate(obj);

  for (const [categoryName, keys] of Object.entries(categories)) {
    const section = createConfigSectionForTemplate(
      categoryName,
      obj,
      keys,
      path
    );
    container.appendChild(section);
  }

  return container;
}

/**
 * 템플릿용 키 그룹화
 */
function groupConfigKeysForTemplate(obj) {
  const categories = {};
  const rootFields = [];

  for (const key of Object.keys(obj)) {
    if (
      typeof obj[key] === "object" &&
      obj[key] !== null &&
      !Array.isArray(obj[key])
    ) {
      const categoryName = AppUtils.getCategoryName(key);
      categories[categoryName] = [key];
    } else {
      rootFields.push(key);
    }
  }

  const orderedCategories = {};
  if (rootFields.length > 0) {
    orderedCategories["기본 설정"] = rootFields;
  }

  Object.entries(categories).forEach(([key, value]) => {
    orderedCategories[key] = value;
  });

  return orderedCategories;
}

/**
 * 템플릿용 설정 섹션 생성
 */
function createConfigSectionForTemplate(categoryName, obj, keys, basePath) {
  const template = document.getElementById("configSectionTemplate");
  const clone = template.content.cloneNode(true);

  clone.querySelector(".section-title").textContent = categoryName;
  const content = clone.querySelector(".section-content");

  // 템플릿에서는 섹션 삭제 기능 비활성화
  const deleteBtn = clone.querySelector(".section-delete-btn");
  deleteBtn.style.display = "none";

  keys.forEach((key) => {
    const field = createDynamicFieldForTemplate(
      key,
      obj[key],
      basePath ? `${basePath}.${key}` : key
    );
    content.appendChild(field);
  });

  const header = clone.querySelector(".section-header");
  header.addEventListener("click", () => {
    const isExpanded = content.classList.contains("expanded");
    content.classList.toggle("expanded");
    header.querySelector(".toggle").textContent = isExpanded ? "▶" : "▼";
  });

  return clone;
}

/**
 * 템플릿용 동적 필드 생성
 */
function createDynamicFieldForTemplate(key, value, path) {
  if (typeof value === "boolean") {
    return createCheckboxFieldForTemplate(key, value, path);
  } else if (typeof value === "number") {
    return createNumberFieldForTemplate(key, value, path);
  } else if (typeof value === "string") {
    return createTextFieldForTemplate(key, value, path);
  } else if (Array.isArray(value)) {
    return createArrayFieldForTemplate(key, value, path);
  } else if (typeof value === "object" && value !== null) {
    return createNestedObjectFieldForTemplate(key, value, path);
  } else {
    return createTextFieldForTemplate(key, value || "", path);
  }
}

/**
 * 템플릿용 텍스트 필드 생성
 */
function createTextFieldForTemplate(key, value, path) {
  const template = document.getElementById("textFieldTemplate");
  const clone = template.content.cloneNode(true);

  clone.querySelector(".field-label").textContent =
    AppUtils.formatFieldLabel(key);
  const input = clone.querySelector(".field-input");
  input.value = value;

  input.addEventListener("change", () => {
    updateTemplateValue(path, input.value);
  });

  // 템플릿에서는 삭제 버튼 숨김
  const deleteBtn = clone.querySelector(".field-delete-btn");
  deleteBtn.style.display = "none";

  return clone;
}

/**
 * 템플릿용 숫자 필드 생성
 */
function createNumberFieldForTemplate(key, value, path) {
  const template = document.getElementById("numberFieldTemplate");
  const clone = template.content.cloneNode(true);

  clone.querySelector(".field-label").textContent =
    AppUtils.formatFieldLabel(key);
  const input = clone.querySelector(".field-input");
  input.value = value;

  input.addEventListener("change", () => {
    updateTemplateValue(path, parseInt(input.value) || 0);
  });

  // 템플릿에서는 삭제 버튼 숨김
  const deleteBtn = clone.querySelector(".field-delete-btn");
  deleteBtn.style.display = "none";

  return clone;
}

/**
 * 템플릿용 체크박스 필드 생성
 */
function createCheckboxFieldForTemplate(key, value, path) {
  const template = document.getElementById("checkboxFieldTemplate");
  const clone = template.content.cloneNode(true);

  clone.querySelector(".field-label").textContent =
    AppUtils.formatFieldLabel(key);
  const checkbox = clone.querySelector(".field-checkbox");
  checkbox.checked = value;

  checkbox.addEventListener("change", () => {
    updateTemplateValue(path, checkbox.checked);
  });

  // 템플릿에서는 삭제 버튼 숨김
  const deleteBtn = clone.querySelector(".field-delete-btn");
  deleteBtn.style.display = "none";

  return clone;
}

/**
 * 템플릿용 배열 필드 생성
 */
function createArrayFieldForTemplate(key, array, path) {
  const template = document.getElementById("arrayFieldTemplate");
  const clone = template.content.cloneNode(true);

  clone.querySelector(".field-label").textContent =
    AppUtils.formatFieldLabel(key);
  const tbody = clone.querySelector(".array-tbody");

  // 배열 아이템들을 테이블 행으로 렌더링
  array.forEach((item, index) => {
    const row = createArrayRowForTemplate(item, `${path}[${index}]`, index);
    tbody.appendChild(row);
  });

  // 추가 버튼 이벤트
  const addButton = clone.querySelector(".array-add-btn");
  addButton.addEventListener("click", () => {
    addArrayItemForTemplate(array, path, tbody);
  });

  // 템플릿에서는 삭제 버튼 숨김
  const deleteBtn = clone.querySelector(".field-delete-btn");
  deleteBtn.style.display = "none";

  return clone;
}

/**
 * 템플릿용 배열 행 생성
 */
function createArrayRowForTemplate(item, itemPath, _index) {
  const template = document.getElementById("arrayRowTemplate");
  const clone = template.content.cloneNode(true);

  const input = clone.querySelector(".array-input");
  const deleteBtn = clone.querySelector(".array-delete-btn");
  deleteBtn.style.display = "none";

  if (typeof item === "object") {
    input.value = JSON.stringify(item);
    input.addEventListener("change", () => {
      try {
        const parsed = JSON.parse(input.value);
        updateTemplateValue(itemPath, parsed);
      } catch (e) {
        console.error("JSON 파싱 오류:", e);
        input.style.borderColor = "#e74c3c";
      }
    });
  } else {
    input.value = item;
    input.addEventListener("change", () => {
      updateTemplateValue(itemPath, input.value);
    });
  }

  return clone;
}

/**
 * 템플릿용 중첩 객체 필드 생성 (삭제 버튼 없음)
 */
function createNestedObjectFieldForTemplate(key, obj, path) {
  const container = document.createElement("div");
  container.className = "nested-object-container";
  container.style.marginBottom = "1rem";

  // 객체 헤더
  const header = document.createElement("div");
  header.className = "object-header";
  header.style.cssText = `
    display: flex;
    align-items: center;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 4px;
    border-left: 3px solid #28a745;
    margin-bottom: 0.5rem;
    cursor: pointer;
  `;

  // 폴더 아이콘 및 제목
  const toggleIcon = document.createElement("span");
  toggleIcon.textContent = "📁";
  toggleIcon.style.marginRight = "0.5rem";

  const title = document.createElement("span");
  title.textContent = `${AppUtils.formatFieldLabel(key)} (${
    Object.keys(obj).length
  }개 속성)`;
  title.style.fontWeight = "600";
  title.style.flex = "1";

  header.appendChild(toggleIcon);
  header.appendChild(title);

  // 속성 목록 컨테이너
  const content = document.createElement("div");
  content.className = "object-content";
  content.style.cssText = `
    margin-left: 1.5rem;
    border-left: 2px solid #e9ecef;
    padding-left: 1rem;
    display: block;
  `;

  // 각 속성을 템플릿용으로 생성
  Object.entries(obj).forEach(([itemKey, item]) => {
    const itemField = createDynamicFieldForTemplate(
      itemKey,
      item,
      `${path}.${itemKey}`
    );
    if (itemField) {
      content.appendChild(itemField);
    }
  });

  // 헤더 클릭시 토글
  header.onclick = () => {
    const isVisible = content.style.display !== "none";
    content.style.display = isVisible ? "none" : "block";
    toggleIcon.textContent = isVisible ? "📂" : "📁";
  };

  container.appendChild(header);
  container.appendChild(content);

  return container;
}

/**
 * 템플릿용 배열 아이템 추가
 */
function addArrayItemForTemplate(array, path, tbody) {
  const newItem = typeof array[0] === "object" ? {} : "";
  array.push(newItem);

  const row = createArrayRowForTemplate(
    newItem,
    `${path}[${array.length - 1}]`,
    array.length - 1
  );
  tbody.appendChild(row);

  AppUtils.updateStatus("새 항목이 추가되었습니다.");
}

/**
 * 템플릿용 배열 행 제거
 */
function removeArrayRowForTemplate(_itemPath, rowElement) {
  rowElement.remove();
  renderTemplateEditor(); // 전체 다시 렌더링으로 인덱스 재정렬
  AppUtils.updateStatus("항목이 삭제되었습니다.");
}

/**
 * 템플릿 값 업데이트
 */
function updateTemplateValue(path, value) {
  const templateConfig = ServerManager.getTemplateConfig();
  if (!templateConfig) return;

  // "template." prefix 제거
  const cleanPath = path.replace(/^template\./, "");
  const keys = cleanPath.split(".");
  let current = templateConfig;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (key.includes("[") && key.includes("]")) {
      const [arrayKey, indexStr] = key.split("[");
      const index = parseInt(indexStr.replace("]", ""));
      current = current[arrayKey][index];
    } else {
      current = current[key];
    }
  }

  const finalKey = keys[keys.length - 1];
  if (finalKey.includes("[") && finalKey.includes("]")) {
    const [arrayKey, indexStr] = finalKey.split("[");
    const index = parseInt(indexStr.replace("]", ""));
    current[arrayKey][index] = value;
  } else {
    current[finalKey] = value;
  }

  AppUtils.updateStatus(`템플릿 ${cleanPath} 설정이 변경되었습니다.`);
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
    alert("애플리케이션 로드 중 오류가 발생했습니다.");
    return;
  }

  // Tauri API 로딩 대기
  const invoke = await AppUtils.waitForTauri();

  if (!invoke) {
    alert("Tauri API를 로드할 수 없습니다.\n데스크톱 앱에서만 작동합니다.");
    return;
  }

  // 각 매니저에 invoke 함수 전달
  ServerManager.setInvokeFunction(invoke);

  // 이벤트 리스너 설정
  setupEventListeners();

  // 앱 초기화
  await init();

  console.log("앱 로드 완료!");
});

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
