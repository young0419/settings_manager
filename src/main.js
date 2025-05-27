// Tauri API 안전 로딩
let invoke;

function waitForTauri() {
  return new Promise((resolve) => {
    const checkTauri = () => {
      if (window.__TAURI__) {
        invoke =
          window.__TAURI__.invoke ||
          window.__TAURI__.core?.invoke ||
          window.__TAURI__.tauri?.invoke;

        if (invoke) {
          console.log("Tauri API 로드 완료");
          resolve(true);
        } else {
          console.error("invoke 함수를 찾을 수 없음");
          resolve(false);
        }
      } else {
        setTimeout(checkTauri, 100);
      }
    };
    checkTauri();
  });
}

// 전역 변수
let currentServer = null;
let currentConfig = null;
let templateConfig = null;
let serverList = [];
let workingDirectory = "";

// DOM 요소들
const elements = {
  emptyServerState: () => document.getElementById("emptyServerState"),
  loadingState: () => document.getElementById("loadingState"),
  serverListContainer: () => document.getElementById("serverListContainer"),
  workingDirectory: () => document.getElementById("workingDirectory"),
  configEditor: () => document.getElementById("configEditor"),
  currentServerTitle: () => document.getElementById("currentServerTitle"),
  currentServerPath: () => document.getElementById("currentServerPath"),
  backupBtn: () => document.getElementById("backupBtn"),
  saveBtn: () => document.getElementById("saveBtn"),
  statusText: () => document.getElementById("statusText"),
  notification: () => document.getElementById("notification"),
};

// 초기화
async function init() {
  try {
    workingDirectory = await invoke("get_default_config_path");
    const pathEl = elements.workingDirectory();
    if (pathEl) pathEl.textContent = `작업 경로: ${workingDirectory}`;

    await loadTemplate();
    await refreshServerList();
    console.log("앱 초기화 완료");
  } catch (error) {
    console.error("초기화 오류:", error);
    showNotification("초기화 중 오류가 발생했습니다: " + error, "error");
  }
}

// 마스터 템플릿 로드
async function loadTemplate() {
  try {
    const content = await invoke("get_template_config");
    templateConfig = JSON.parse(content);
    updateStatus("마스터 템플릿을 로드했습니다.");
  } catch (error) {
    console.warn("템플릿 로드 실패:", error);
    templateConfig = getDefaultTemplate();
  }
}

// 기본 템플릿 반환
function getDefaultTemplate() {
  return {
    defaultCompanyId: "",
    multiCompany: false,
    useIPPermit: false,
    checkPushToken: true,
    logoutAfter: 14,
  };
}

// 서버 목록 새로고침
async function refreshServerList() {
  showLoadingState(true);

  try {
    const servers = await invoke("list_servers", {
      directory: workingDirectory,
    });

    serverList = servers.map((serverName) => ({
      name: serverName,
    }));

    renderServerList();
    updateStatus(`${servers.length}개의 서버를 찾았습니다.`);
  } catch (error) {
    console.error("서버 목록 로드 오류:", error);
    serverList = [];
    renderServerList();
    updateStatus("서버를 찾을 수 없습니다.");
  }

  showLoadingState(false);
}

// 로딩 상태 표시/숨김
function showLoadingState(show) {
  const loadingEl = elements.loadingState();
  if (loadingEl) {
    loadingEl.style.display = show ? "block" : "none";
  }
}

// 서버 목록 렌더링
function renderServerList() {
  const emptyState = elements.emptyServerState();
  const container = elements.serverListContainer();

  if (!emptyState || !container) return;

  if (serverList.length === 0) {
    emptyState.classList.remove("hidden");
    container.classList.add("hidden");
  } else {
    emptyState.classList.add("hidden");
    container.classList.remove("hidden");

    container.innerHTML = "";
    serverList.forEach((server) => {
      const serverItem = createServerItem(server);
      container.appendChild(serverItem);
    });
  }
}

// 서버 아이템 생성 (템플릿 사용)
function createServerItem(server) {
  const template = document.getElementById("serverItemTemplate");
  const clone = template.content.cloneNode(true);

  // 데이터 바인딩
  clone.querySelector(".server-name").textContent = server.name;

  // 이벤트 바인딩
  const itemEl = clone.querySelector(".server-item");
  itemEl.onclick = () => selectServer(server);

  const deleteBtn = clone.querySelector(".delete-btn");
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    deleteServer(server);
  };

  // 활성 상태 표시
  if (currentServer?.name === server.name) {
    itemEl.classList.add("active");
  }

  return clone;
}

// 서버 선택 (최신 파일 로드)
async function selectServer(server) {
  try {
    updateStatus("설정 파일을 읽는 중...");
    const content = await invoke("get_latest_server_config", {
      baseDirectory: workingDirectory,
      serverName: server.name,
    });

    currentServer = server;
    currentConfig = JSON.parse(content);

    updateServerInfo(server);
    renderConfigEditor();
    renderServerList();
    updateStatus("설정 파일을 성공적으로 로드했습니다.");
  } catch (error) {
    console.error("파일 읽기 오류:", error);
    showNotification("설정 파일을 읽을 수 없습니다: " + error, "error");
    updateStatus("파일 읽기 실패");
  }
}

// 서버 정보 업데이트
function updateServerInfo(server) {
  const titleEl = elements.currentServerTitle();
  const pathEl = elements.currentServerPath();
  const backupBtn = elements.backupBtn();
  const saveBtn = elements.saveBtn();

  if (titleEl) titleEl.textContent = server.name;
  if (pathEl) pathEl.textContent = `${workingDirectory}\\${server.name}`;
  if (backupBtn) backupBtn.disabled = false;
  if (saveBtn) saveBtn.disabled = false;
}

// 동적 설정 에디터 렌더링
function renderConfigEditor() {
  const editor = elements.configEditor();
  if (!editor) return;

  if (!currentConfig) {
    editor.className = "editor-empty";
    return;
  }

  editor.className = "editor-loaded";

  const configContent = editor.querySelector(".config-content");
  if (configContent) {
    configContent.innerHTML = "";

    // 템플릿에서 항목 추가 버튼
    const addFromTemplateBtn = document.createElement("button");
    addFromTemplateBtn.className = "btn btn-secondary";
    addFromTemplateBtn.style.marginBottom = "1rem";
    addFromTemplateBtn.textContent = "템플릿에서 항목 추가";
    addFromTemplateBtn.onclick = () => openAddFromTemplateModal();
    configContent.appendChild(addFromTemplateBtn);

    const form = createDynamicForm(currentConfig);
    configContent.appendChild(form);
  }
}

// 동적 폼 생성
function createDynamicForm(obj, path = "") {
  const container = document.createElement("div");
  const categories = groupConfigKeys(obj);

  for (const [categoryName, keys] of Object.entries(categories)) {
    const section = createConfigSection(categoryName, obj, keys, path);
    container.appendChild(section);
  }

  return container;
}

// 설정 키 그룹화 (동적)
function groupConfigKeys(obj) {
  const categories = {};

  // 루트 레벨 단순 필드들을 기본 설정으로
  const rootFields = [];

  for (const key of Object.keys(obj)) {
    if (
      typeof obj[key] === "object" &&
      obj[key] !== null &&
      !Array.isArray(obj[key])
    ) {
      // 중첩 객체는 개별 카테고리로
      const categoryName = getCategoryName(key);
      categories[categoryName] = [key];
    } else {
      // 단순 값들은 기본 설정으로
      rootFields.push(key);
    }
  }

  // 기본 설정이 있으면 추가
  if (rootFields.length > 0) {
    categories["기본 설정"] = rootFields;
  }

  return categories;
}

// 카테고리 이름 생성 (동적)
function getCategoryName(key) {
  // camelCase를 읽기 좋은 형태로 변환
  return key
    .replace(/([A-Z])/g, " $1") // camelCase 분리
    .replace(/^./, (str) => str.toUpperCase()) // 첫 글자 대문자
    .trim();
}

// 설정 섹션 생성 (템플릿 사용)
function createConfigSection(categoryName, obj, keys, basePath) {
  const template = document.getElementById("configSectionTemplate");
  const clone = template.content.cloneNode(true);

  clone.querySelector(".section-title").textContent = categoryName;
  const content = clone.querySelector(".section-content");

  keys.forEach((key) => {
    const field = createDynamicField(
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

// 동적 필드 생성
function createDynamicField(key, value, path) {
  if (typeof value === "boolean") {
    return createCheckboxField(key, value, path);
  } else if (typeof value === "number") {
    return createNumberField(key, value, path);
  } else if (typeof value === "string") {
    return createTextField(key, value, path);
  } else if (Array.isArray(value)) {
    return createArrayField(key, value, path);
  } else if (typeof value === "object" && value !== null) {
    return createNestedObjectField(key, value, path);
  } else {
    return createTextField(key, value || "", path);
  }
}

// 체크박스 필드 생성
function createCheckboxField(key, value, path) {
  const template = document.getElementById("checkboxFieldTemplate");
  const clone = template.content.cloneNode(true);

  clone.querySelector(".field-label").textContent = formatFieldLabel(key);
  const checkbox = clone.querySelector(".field-checkbox");
  checkbox.checked = value;

  checkbox.addEventListener("change", () => {
    updateConfigValue(path, checkbox.checked);
  });

  return clone;
}

// 숫자 필드 생성
function createNumberField(key, value, path) {
  const template = document.getElementById("numberFieldTemplate");
  const clone = template.content.cloneNode(true);

  clone.querySelector(".field-label").textContent = formatFieldLabel(key);
  const input = clone.querySelector(".field-input");
  input.value = value;

  input.addEventListener("change", () => {
    updateConfigValue(path, parseInt(input.value) || 0);
  });

  return clone;
}

// 텍스트 필드 생성 (템플릿 사용)
function createTextField(key, value, path) {
  const template = document.getElementById("textFieldTemplate");
  const clone = template.content.cloneNode(true);

  // 데이터 바인딩
  clone.querySelector(".field-label").textContent = formatFieldLabel(key);
  const input = clone.querySelector(".field-input");
  input.value = value;

  // URL인 경우 특별 스타일 적용
  if (
    typeof value === "string" &&
    (value.includes("http") || key.toLowerCase().includes("url"))
  ) {
    input.classList.add("url-field");
  }

  // 이벤트 바인딩
  input.addEventListener("change", () => {
    updateConfigValue(path, input.value);
  });

  return clone;
}

// 배열 필드 생성 (테이블 스타일)
function createArrayField(key, array, path) {
  const template = document.getElementById("arrayFieldTemplate");
  const clone = template.content.cloneNode(true);

  clone.querySelector(".field-label").textContent = formatFieldLabel(key);
  const tbody = clone.querySelector(".array-tbody");

  // 배열 아이템들을 테이블 행으로 렌더링
  array.forEach((item, index) => {
    const row = createArrayRow(item, `${path}[${index}]`, index);
    tbody.appendChild(row);
  });

  // 추가 버튼 이벤트
  const addButton = clone.querySelector(".array-add-btn");
  addButton.addEventListener("click", () => {
    addArrayItem(array, path, tbody);
  });

  return clone;
}

// 배열 행 생성
function createArrayRow(item, itemPath, index) {
  const template = document.getElementById("arrayRowTemplate");
  const clone = template.content.cloneNode(true);

  const input = clone.querySelector(".array-input");
  const deleteBtn = clone.querySelector(".array-delete-btn");

  if (typeof item === "object") {
    // 객체인 경우 JSON 문자열로 표시
    input.value = JSON.stringify(item);
    input.addEventListener("change", () => {
      try {
        const parsed = JSON.parse(input.value);
        updateConfigValue(itemPath, parsed);
      } catch (e) {
        console.error("JSON 파싱 오류:", e);
        input.style.borderColor = "#e74c3c";
      }
    });
  } else {
    // 단순 값인 경우
    input.value = item;
    input.addEventListener("change", () => {
      updateConfigValue(itemPath, input.value);
    });
  }

  // 삭제 버튼
  deleteBtn.addEventListener("click", () => {
    if (confirm("이 항목을 삭제하시겠습니까?")) {
      removeArrayRow(itemPath, clone.querySelector(".array-row"));
    }
  });

  return clone;
}

// 중첩 객체 필드 생성 (모든 객체를 테이블로)
function createNestedObjectField(key, obj, path) {
  const fieldGroup = document.createElement("div");
  fieldGroup.className = "field-group";

  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = formatFieldLabel(key);
  label.style.fontSize = "1.1rem";
  label.style.fontWeight = "600";
  label.style.color = "#667eea";
  label.style.marginBottom = "1rem";

  const table = document.createElement("table");
  table.className = "nested-object-table";

  // 테이블 헤더
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th style="min-width: 200px;">속성</th>
      <th style="min-width: 80px;">타입</th>
      <th style="min-width: 250px;">값</th>
    </tr>
  `;
  table.appendChild(thead);

  // 테이블 바디
  const tbody = document.createElement("tbody");

  Object.keys(obj).forEach((itemKey) => {
    const item = obj[itemKey];
    const row = createObjectTableRow(itemKey, item, `${path}.${itemKey}`);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);

  fieldGroup.appendChild(label);
  fieldGroup.appendChild(table);

  return fieldGroup;
}

// 객체 테이블 행 생성
function createObjectTableRow(key, value, itemPath) {
  const row = document.createElement("tr");
  row.className = "object-row";

  // 속성명
  const nameCell = document.createElement("td");
  nameCell.textContent = formatFieldLabel(key);
  nameCell.style.fontWeight = "500";

  // 타입
  const typeCell = document.createElement("td");
  const valueType = Array.isArray(value) ? "array" : typeof value;
  typeCell.innerHTML = `<span class="type-badge type-${valueType}">${valueType}</span>`;

  // 값
  const valueCell = document.createElement("td");

  if (typeof value === "boolean") {
    // Boolean
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.gap = "0.5rem";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "object-checkbox";
    checkbox.checked = value;
    checkbox.addEventListener("change", () => {
      updateConfigValue(itemPath, checkbox.checked);
    });

    const label = document.createElement("span");
    label.textContent = value ? "true" : "false";
    label.style.fontSize = "0.85rem";
    label.style.color = value ? "#28a745" : "#6c757d";

    checkbox.addEventListener("change", () => {
      label.textContent = checkbox.checked ? "true" : "false";
      label.style.color = checkbox.checked ? "#28a745" : "#6c757d";
    });

    container.appendChild(checkbox);
    container.appendChild(label);
    valueCell.appendChild(container);
  } else if (typeof value === "number") {
    // Number
    const input = document.createElement("input");
    input.type = "number";
    input.className = "object-input";
    input.value = value;
    input.addEventListener("change", () => {
      updateConfigValue(itemPath, parseInt(input.value) || 0);
    });
    valueCell.appendChild(input);
  } else if (typeof value === "string") {
    // String
    const input = document.createElement("input");
    input.type = "text";
    input.className = "object-input";
    input.value = value;

    // URL인 경우 스타일 적용
    if (value.includes("http") || key.toLowerCase().includes("url")) {
      input.classList.add("url-field");
    }

    input.addEventListener("change", () => {
      updateConfigValue(itemPath, input.value);
    });
    valueCell.appendChild(input);
  } else if (Array.isArray(value)) {
    // Array - 간단히 JSON으로 표시하고 편집 가능
    const textarea = document.createElement("textarea");
    textarea.className = "object-textarea";
    textarea.value = JSON.stringify(value, null, 2);
    textarea.rows = Math.min(value.length + 1, 5);
    textarea.addEventListener("change", () => {
      try {
        const parsed = JSON.parse(textarea.value);
        updateConfigValue(itemPath, parsed);
        textarea.style.borderColor = "";
      } catch (e) {
        textarea.style.borderColor = "#e74c3c";
      }
    });
    valueCell.appendChild(textarea);
  } else if (typeof value === "object" && value !== null) {
    // 중첩 객체 - 펼쳐서 표시
    const nestedTable = createNestedObjectField("", value, itemPath);
    nestedTable.style.margin = "0";
    valueCell.appendChild(nestedTable);
  } else {
    // null, undefined 등
    const span = document.createElement("span");
    span.textContent = String(value);
    span.style.color = "#999";
    span.style.fontStyle = "italic";
    valueCell.appendChild(span);
  }

  row.appendChild(nameCell);
  row.appendChild(typeCell);
  row.appendChild(valueCell);

  return row;
}

// 설정 값 업데이트
function updateConfigValue(path, value) {
  if (!currentConfig) return;

  const keys = path.split(".");
  let current = currentConfig;

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

  updateStatus(`${path} 설정이 변경되었습니다.`);
}

// 필드 라벨 포맷팅
function formatFieldLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// 배열 아이템 추가 (테이블 형태)
function addArrayItem(array, path, tbody) {
  const newItem = typeof array[0] === "object" ? {} : "";
  array.push(newItem);

  const row = createArrayRow(
    newItem,
    `${path}[${array.length - 1}]`,
    array.length - 1
  );
  tbody.appendChild(row);

  updateStatus("새 항목이 추가되었습니다.");
}

// 배열 행 제거
function removeArrayRow(itemPath, rowElement) {
  rowElement.remove();
  renderConfigEditor(); // 전체 다시 렌더링으로 인덱스 재정렬
  updateStatus("항목이 삭제되었습니다.");
}

// 설정 저장
async function saveCurrentConfig() {
  if (!currentServer || !currentConfig) {
    showNotification("저장할 설정이 없습니다.", "error");
    return;
  }

  try {
    updateStatus("설정을 저장하는 중...");
    const result = await invoke("save_server_config", {
      baseDirectory: workingDirectory,
      serverName: currentServer.name,
      content: JSON.stringify(currentConfig, null, 2),
    });

    showNotification("설정이 성공적으로 저장되었습니다!");
    updateStatus(result);
    await refreshServerList();
  } catch (error) {
    console.error("저장 오류:", error);
    showNotification("저장 중 오류가 발생했습니다: " + error, "error");
    updateStatus("저장 실패");
  }
}

// 백업 생성
async function backupCurrentConfig() {
  if (!currentServer) {
    showNotification("백업할 서버가 선택되지 않았습니다.", "error");
    return;
  }

  try {
    updateStatus("백업을 생성하는 중...");
    const latestConfig = await invoke("get_latest_server_config", {
      baseDirectory: workingDirectory,
      serverName: currentServer.name,
    });

    const tempPath = `${workingDirectory}\\${currentServer.name}\\temp_for_backup.json`;
    await invoke("write_json_file", {
      filePath: tempPath,
      content: latestConfig,
    });

    const result = await invoke("backup_config", {
      filePath: tempPath,
    });

    showNotification("백업이 성공적으로 생성되었습니다!");
    updateStatus(result);
  } catch (error) {
    console.error("백업 오류:", error);
    showNotification("백업 생성 중 오류가 발생했습니다: " + error, "error");
    updateStatus("백업 실패");
  }
}

// 새 서버 추가
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

function closeAddServerModal() {
  const modal = document.getElementById("addServerModal");
  if (modal) modal.style.display = "none";
}

// 서버 생성
async function createServerConfig() {
  const nameInput = document.getElementById("serverName");
  const useTemplateCheck = document.getElementById("useTemplate");

  if (!nameInput) return;

  const name = nameInput.value.trim();
  const useTemplate = useTemplateCheck ? useTemplateCheck.checked : true;

  if (!name) {
    showNotification("서버 이름을 입력해주세요.", "error");
    return;
  }

  try {
    updateStatus("새 서버를 생성하는 중...");
    const result = await invoke("create_new_server", {
      baseDirectory: workingDirectory,
      serverName: name,
      useTemplate: useTemplate,
    });

    closeAddServerModal();
    await refreshServerList();
    showNotification(`${name} 서버가 생성되었습니다!`);
    updateStatus(result);
  } catch (error) {
    console.error("서버 생성 오류:", error);
    showNotification("서버 생성 중 오류가 발생했습니다: " + error, "error");
    updateStatus("서버 생성 실패");
  }
}

// 서버 삭제
async function deleteServer(server) {
  if (
    !confirm(
      `'${server.name}' 서버를 삭제하시겠습니까?\n(모든 설정 파일이 삭제됩니다)`
    )
  ) {
    return;
  }

  try {
    updateStatus("서버를 삭제하는 중...");
    const result = await invoke("delete_server", {
      baseDirectory: workingDirectory,
      serverName: server.name,
    });

    await refreshServerList();

    if (currentServer?.name === server.name) {
      currentServer = null;
      currentConfig = null;

      const titleEl = elements.currentServerTitle();
      const pathEl = elements.currentServerPath();
      const backupBtn = elements.backupBtn();
      const saveBtn = elements.saveBtn();
      const editor = elements.configEditor();

      if (titleEl) titleEl.textContent = "서버를 선택해주세요";
      if (pathEl) pathEl.textContent = "";
      if (backupBtn) backupBtn.disabled = true;
      if (saveBtn) saveBtn.disabled = true;
      if (editor) editor.className = "editor-empty";
    }

    showNotification(`${server.name} 서버가 삭제되었습니다 (백업됨)`);
    updateStatus(result);
  } catch (error) {
    console.error("서버 삭제 오류:", error);
    showNotification("서버 삭제 중 오류가 발생했습니다: " + error, "error");
    updateStatus("서버 삭제 실패");
  }
}

// 템플릿에서 항목 추가 모달 열기
function openAddFromTemplateModal() {
  if (!templateConfig || !currentConfig) {
    showNotification("템플릿 또는 현재 설정이 로드되지 않았습니다.", "error");
    return;
  }

  const modal = document.getElementById("addFromTemplateModal");
  if (modal) {
    modal.style.display = "block";
    renderMissingTemplateItems();
  }
}

function closeAddFromTemplateModal() {
  const modal = document.getElementById("addFromTemplateModal");
  if (modal) modal.style.display = "none";
}

// 현재 설정에 없는 템플릿 항목들 찾기
function findMissingTemplateItems() {
  const missingItems = [];

  function checkMissingRecursive(templateObj, currentObj, path = "") {
    for (const key in templateObj) {
      const currentPath = path ? `${path}.${key}` : key;

      if (!(key in currentObj)) {
        // 현재 설정에 없는 항목 발견
        missingItems.push({
          key: key,
          path: currentPath,
          value: templateObj[key],
          type: typeof templateObj[key],
        });
      } else if (
        typeof templateObj[key] === "object" &&
        templateObj[key] !== null &&
        !Array.isArray(templateObj[key]) &&
        typeof currentObj[key] === "object" &&
        currentObj[key] !== null
      ) {
        // 중첩 객체인 경우 재귀 검사
        checkMissingRecursive(templateObj[key], currentObj[key], currentPath);
      }
    }
  }

  checkMissingRecursive(templateConfig, currentConfig);
  return missingItems;
}

// 누락된 템플릿 항목들 렌더링
function renderMissingTemplateItems() {
  const container = document.getElementById("templateItemsList");
  if (!container) return;

  container.innerHTML = "";

  const missingItems = findMissingTemplateItems();

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

// 선택된 템플릿 항목들을 현재 설정에 추가
function addSelectedTemplateItems() {
  const checkboxes = document.querySelectorAll(
    "#templateItemsList .template-item-checkbox:checked"
  );

  if (checkboxes.length === 0) {
    showNotification("추가할 항목을 선택해주세요.", "warning");
    return;
  }

  let addedCount = 0;

  checkboxes.forEach((checkbox) => {
    const path = checkbox.value;
    const keys = path.split(".");

    // 템플릿에서 값 가져오기
    let templateValue = templateConfig;
    let currentTarget = currentConfig;

    // 중첩된 경로 탐색
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      templateValue = templateValue[key];

      // 현재 설정에 중간 객체가 없으면 생성
      if (!(key in currentTarget)) {
        currentTarget[key] = {};
      }
      currentTarget = currentTarget[key];
    }

    // 최종 키에 값 설정
    const finalKey = keys[keys.length - 1];
    templateValue = templateValue[finalKey];
    currentTarget[finalKey] = JSON.parse(JSON.stringify(templateValue)); // 깊은 복사

    addedCount++;
  });

  closeAddFromTemplateModal();
  renderConfigEditor(); // 설정 에디터 다시 렌더링
  showNotification(`${addedCount}개 항목이 추가되었습니다.`);
  updateStatus(`템플릿에서 ${addedCount}개 항목을 추가했습니다.`);
}

// 템플릿 편집
async function openTemplateEditor() {
  if (!templateConfig) {
    await loadTemplate();
  }

  const modal = document.getElementById("templateModal");
  if (modal) {
    modal.style.display = "block";
    renderTemplateEditor();
  }
}

function closeTemplateModal() {
  const modal = document.getElementById("templateModal");
  if (modal) modal.style.display = "none";
}

// 템플릿 에디터 렌더링
function renderTemplateEditor() {
  if (!templateConfig) return;

  const templateEditor = document.getElementById("templateEditor");
  if (!templateEditor) return;

  templateEditor.innerHTML = "";
  const form = createDynamicForm(templateConfig, "template");
  templateEditor.appendChild(form);
}

// 템플릿 저장
async function saveTemplate() {
  if (!templateConfig) return;

  try {
    updateStatus("마스터 템플릿을 저장하는 중...");
    await invoke("save_template_config", {
      content: JSON.stringify(templateConfig, null, 2),
    });

    showNotification("마스터 템플릿이 저장되었습니다!");
    closeTemplateModal();
    updateStatus("템플릿 저장 완료");
  } catch (error) {
    console.error("템플릿 저장 오류:", error);
    showNotification("템플릿 저장 중 오류가 발생했습니다: " + error, "error");
    updateStatus("템플릿 저장 실패");
  }
}

// 유틸리티 함수들
function updateStatus(message) {
  const statusEl = elements.statusText();
  if (statusEl) {
    statusEl.textContent = message;
    console.log("상태:", message);
  }
}

function showNotification(message, type = "success") {
  const notification = elements.notification();
  if (notification) {
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = "block";

    setTimeout(() => {
      notification.style.display = "none";
    }, 4000);
  }

  if (type === "error") {
    console.error("오류:", message);
  } else {
    console.log("성공:", message);
  }
}

// 이벤트 리스너
function setupEventListeners() {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "s":
          e.preventDefault();
          saveCurrentConfig();
          break;
        case "b":
          e.preventDefault();
          backupCurrentConfig();
          break;
        case "r":
          e.preventDefault();
          refreshServerList();
          break;
      }
    }
  });

  window.onclick = function (event) {
    const addModal = document.getElementById("addServerModal");
    const templateModal = document.getElementById("templateModal");
    const addFromTemplateModal = document.getElementById(
      "addFromTemplateModal"
    );

    if (event.target === addModal) {
      closeAddServerModal();
    }
    if (event.target === templateModal) {
      closeTemplateModal();
    }
    if (event.target === addFromTemplateModal) {
      closeAddFromTemplateModal();
    }
  };
}

// 앱 시작
document.addEventListener("DOMContentLoaded", async () => {
  console.log("앱 시작...");

  const tauriReady = await waitForTauri();

  if (!tauriReady) {
    alert("Tauri API를 로드할 수 없습니다.\n데스크톱 앱에서만 작동합니다.");
    return;
  }

  setupEventListeners();
  await init();

  console.log("앱 로드 완료!");
});
