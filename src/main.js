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
          console.log("✅ Tauri API 로드 완료");
          resolve(true);
        } else {
          console.error("❌ invoke 함수를 찾을 수 없음");
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
  // 서버 목록 관련
  emptyServerState: () => document.getElementById("emptyServerState"),
  loadingState: () => document.getElementById("loadingState"),
  serverListContainer: () => document.getElementById("serverListContainer"),
  workingDirectory: () => document.getElementById("workingDirectory"),

  // 에디터 관련
  configEditor: () => document.getElementById("configEditor"),
  currentServerTitle: () => document.getElementById("currentServerTitle"),
  currentServerPath: () => document.getElementById("currentServerPath"),
  backupBtn: () => document.getElementById("backupBtn"),
  saveBtn: () => document.getElementById("saveBtn"),

  // 기타
  statusText: () => document.getElementById("statusText"),
  notification: () => document.getElementById("notification"),
};

// 초기화
async function init() {
  try {
    workingDirectory = await invoke("get_default_config_path");
    const pathEl = elements.workingDirectory();
    if (pathEl) pathEl.textContent = `작업 경로: ${workingDirectory}`;

    // 마스터 템플릿 로드
    await loadTemplate();
    await refreshServerList();
    console.log("🎉 앱 초기화 완료");
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

// 🏗️ 서버 목록 새로고침 (폴더 기반)
async function refreshServerList() {
  showLoadingState(true);

  try {
    const servers = await invoke("list_servers", {
      directory: workingDirectory,
    });

    serverList = servers.map((server) => ({
      name: server.name,
      folderPath: server.folder_path,
      latestFile: server.latest_file,
      latestDate: server.latest_date,
      fileCount: server.file_count,
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

// 🎯 서버 아이템 생성 (새 구조)
function createServerItem(server) {
  const div = document.createElement("div");
  div.className = "server-item";

  const hasFiles = server.fileCount > 0;
  const statusColor = hasFiles ? "#28a745" : "#ffc107";
  const statusText = hasFiles ? `${server.fileCount}개 파일` : "빈 폴더";

  div.innerHTML = `
    <div class="server-info">
      <h3 class="server-name">${server.name}</h3>
      <p class="server-details">
        <span style="color: ${statusColor};">📄 ${statusText}</span>
        ${
          server.latestDate
            ? `<span style="margin-left: 1rem;">📅 ${server.latestDate}</span>`
            : ""
        }
      </p>
    </div>
    <div class="server-actions">
      <button class="btn btn-danger btn-small delete-btn">🗑️</button>
    </div>
  `;

  // 클릭 이벤트
  div.onclick = () => selectServer(server);

  // 삭제 버튼
  const deleteBtn = div.querySelector(".delete-btn");
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    deleteServer(server);
  };

  // 활성 상태 표시
  if (currentServer?.name === server.name) {
    div.classList.add("active");
  }

  return div;
}

// 🎯 서버 선택 (최신 파일 로드)
async function selectServer(server) {
  if (!server.latestFile) {
    showNotification("이 서버에는 설정 파일이 없습니다.", "warning");
    return;
  }

  try {
    updateStatus("설정 파일을 읽는 중...");
    const content = await invoke("read_json_file", {
      filePath: server.latestFile,
    });

    currentServer = server;
    currentConfig = JSON.parse(content);

    updateServerInfo(server);
    renderConfigEditor();
    renderServerList(); // 활성 상태 업데이트
    updateStatus(`설정 파일을 성공적으로 로드했습니다. (${server.latestDate})`);
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

  if (titleEl)
    titleEl.textContent = `${server.name} (${
      server.latestDate || "날짜 없음"
    })`;
  if (pathEl) pathEl.textContent = server.latestFile;
  if (backupBtn) backupBtn.disabled = false;
  if (saveBtn) saveBtn.disabled = false;
}

// 🚀 동적 설정 에디터 렌더링
function renderConfigEditor() {
  const editor = elements.configEditor();
  if (!editor) return;

  if (!currentConfig) {
    editor.className = "editor-empty";
    return;
  }

  editor.className = "editor-loaded";

  // 기존 내용 제거
  const configContent = editor.querySelector(".config-content");
  if (configContent) {
    configContent.innerHTML = "";

    // JSON 구조를 기반으로 동적 폼 생성
    const form = createDynamicForm(currentConfig);
    configContent.appendChild(form);
  }
}

// 🎯 동적 폼 생성 함수
function createDynamicForm(obj, path = "") {
  const container = document.createElement("div");

  // 객체의 키를 카테고리별로 그룹화
  const categories = groupConfigKeys(obj);

  for (const [categoryName, keys] of Object.entries(categories)) {
    const section = createConfigSection(categoryName, obj, keys, path);
    container.appendChild(section);
  }

  return container;
}

// 설정 키를 카테고리별로 그룹화
function groupConfigKeys(obj) {
  const categories = {
    "🔧 기본 설정": [],
    "🔐 보안 설정": [],
    "📱 앱 설정": [],
    "👥 사용자 설정": [],
    "🎨 UI 설정": [],
    "🔗 URL 설정": [],
    "⚙️ 기타 설정": [],
  };

  for (const key of Object.keys(obj)) {
    if (key.includes("Company") || key.includes("default")) {
      categories["🔧 기본 설정"].push(key);
    } else if (
      key.includes("IP") ||
      key.includes("token") ||
      key.includes("sso") ||
      key.includes("password")
    ) {
      categories["🔐 보안 설정"].push(key);
    } else if (
      key.includes("app") ||
      key.includes("App") ||
      key.includes("mobile") ||
      key.includes("download")
    ) {
      categories["📱 앱 설정"].push(key);
    } else if (
      key.includes("login") ||
      key.includes("user") ||
      key.includes("admin")
    ) {
      categories["👥 사용자 설정"].push(key);
    } else if (
      key.includes("menu") ||
      key.includes("message") ||
      key.includes("color") ||
      key.includes("theme")
    ) {
      categories["🎨 UI 설정"].push(key);
    } else if (
      key.includes("Url") ||
      key.includes("url") ||
      key.includes("Uri")
    ) {
      categories["🔗 URL 설정"].push(key);
    } else {
      categories["⚙️ 기타 설정"].push(key);
    }
  }

  // 빈 카테고리 제거
  return Object.fromEntries(
    Object.entries(categories).filter(([_, keys]) => keys.length > 0)
  );
}

// 설정 섹션 생성
function createConfigSection(categoryName, obj, keys, basePath) {
  const section = document.createElement("div");
  section.className = "config-section";

  // 섹션 헤더
  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `
    <span class="toggle">▼</span>
    <span class="section-title">${categoryName}</span>
  `;

  // 섹션 내용
  const content = document.createElement("div");
  content.className = "section-content expanded";

  // 각 키에 대한 필드 생성
  keys.forEach((key) => {
    const field = createDynamicField(
      key,
      obj[key],
      basePath ? `${basePath}.${key}` : key
    );
    content.appendChild(field);
  });

  // 토글 기능
  header.addEventListener("click", () => {
    const isExpanded = content.classList.contains("expanded");
    content.classList.toggle("expanded");
    header.querySelector(".toggle").textContent = isExpanded ? "▶" : "▼";
  });

  section.appendChild(header);
  section.appendChild(content);

  return section;
}

// 🎯 동적 필드 생성 (타입별 자동 감지)
function createDynamicField(key, value, path) {
  const fieldGroup = document.createElement("div");
  fieldGroup.className = "field-group";

  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = formatFieldLabel(key);

  let input;

  if (typeof value === "boolean") {
    input = createCheckboxField(key, value, path);
  } else if (typeof value === "number") {
    input = createNumberField(key, value, path);
  } else if (typeof value === "string") {
    input = createTextField(key, value, path);
  } else if (Array.isArray(value)) {
    return createArrayField(key, value, path);
  } else if (typeof value === "object" && value !== null) {
    return createNestedObjectField(key, value, path);
  } else {
    input = createTextField(key, value || "", path);
  }

  if (input) {
    fieldGroup.appendChild(label);
    fieldGroup.appendChild(input);
  }

  return fieldGroup;
}

// 체크박스 필드 생성
function createCheckboxField(key, value, path) {
  const container = document.createElement("div");
  container.className = "field-checkbox-group";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "field-checkbox";
  checkbox.checked = value;
  checkbox.addEventListener("change", () => {
    updateConfigValue(path, checkbox.checked);
  });

  container.appendChild(checkbox);
  return container;
}

// 숫자 필드 생성
function createNumberField(key, value, path) {
  const input = document.createElement("input");
  input.type = "number";
  input.className = "field-input";
  input.value = value;
  input.addEventListener("change", () => {
    updateConfigValue(path, parseInt(input.value) || 0);
  });

  return input;
}

// 텍스트 필드 생성
function createTextField(key, value, path) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "field-input";
  input.value = value;

  // URL인 경우 특별 스타일 적용
  if (
    typeof value === "string" &&
    (value.includes("http") || key.toLowerCase().includes("url"))
  ) {
    input.style.fontFamily = "monospace";
    input.style.fontSize = "0.85rem";
  }

  input.addEventListener("change", () => {
    updateConfigValue(path, input.value);
  });

  return input;
}

// 배열 필드 생성
function createArrayField(key, array, path) {
  const fieldGroup = document.createElement("div");
  fieldGroup.className = "field-group";

  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = formatFieldLabel(key);

  const arrayContainer = document.createElement("div");
  arrayContainer.className = "array-container";

  // 배열 아이템들 렌더링
  array.forEach((item, index) => {
    const itemElement = createArrayItem(item, `${path}[${index}]`, index);
    arrayContainer.appendChild(itemElement);
  });

  // 새 아이템 추가 버튼
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "btn btn-secondary btn-small";
  addButton.textContent = "➕ 추가";
  addButton.addEventListener("click", () => {
    addArrayItem(array, path, arrayContainer);
  });

  fieldGroup.appendChild(label);
  fieldGroup.appendChild(arrayContainer);
  fieldGroup.appendChild(addButton);

  return fieldGroup;
}

// 배열 아이템 생성
function createArrayItem(item, itemPath, index) {
  const itemDiv = document.createElement("div");
  itemDiv.className = "array-item";

  if (typeof item === "object") {
    // 객체인 경우 중첩 폼 생성
    const nestedForm = createDynamicForm(item, itemPath);
    itemDiv.appendChild(nestedForm);
  } else {
    // 단순 값인 경우
    const input = document.createElement("input");
    input.type = "text";
    input.className = "field-input";
    input.value = item;
    input.addEventListener("change", () => {
      updateConfigValue(itemPath, input.value);
    });
    itemDiv.appendChild(input);
  }

  // 삭제 버튼
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-danger btn-small";
  deleteBtn.textContent = "🗑️";
  deleteBtn.style.marginTop = "0.5rem";
  deleteBtn.addEventListener("click", () => {
    removeArrayItem(itemPath, itemDiv);
  });

  itemDiv.appendChild(deleteBtn);
  return itemDiv;
}

// 중첩 객체 필드 생성
function createNestedObjectField(key, obj, path) {
  const fieldGroup = document.createElement("div");
  fieldGroup.className = "field-group";

  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = formatFieldLabel(key);
  label.style.fontSize = "1.1rem";
  label.style.fontWeight = "600";
  label.style.color = "#667eea";

  const nestedContainer = document.createElement("div");
  nestedContainer.style.marginLeft = "1rem";
  nestedContainer.style.paddingLeft = "1rem";
  nestedContainer.style.borderLeft = "3px solid rgba(102, 126, 234, 0.3)";

  const nestedForm = createDynamicForm(obj, path);
  nestedContainer.appendChild(nestedForm);

  fieldGroup.appendChild(label);
  fieldGroup.appendChild(nestedContainer);

  return fieldGroup;
}

// 설정 값 업데이트
function updateConfigValue(path, value) {
  if (!currentConfig) return;

  const keys = path.split(".");
  let current = currentConfig;

  // 중첩된 객체까지 탐색
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (key.includes("[") && key.includes("]")) {
      // 배열 인덱스 처리
      const [arrayKey, indexStr] = key.split("[");
      const index = parseInt(indexStr.replace("]", ""));
      current = current[arrayKey][index];
    } else {
      current = current[key];
    }
  }

  // 최종 값 설정
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
    .replace(/([A-Z])/g, " $1") // camelCase를 공백으로 분리
    .replace(/^./, (str) => str.toUpperCase()) // 첫 글자 대문자
    .trim();
}

// 배열 아이템 추가
function addArrayItem(array, path, container) {
  const newItem = typeof array[0] === "object" ? {} : "";
  array.push(newItem);

  const itemElement = createArrayItem(
    newItem,
    `${path}[${array.length - 1}]`,
    array.length - 1
  );
  container.appendChild(itemElement);

  updateStatus("새 항목이 추가되었습니다.");
}

// 배열 아이템 제거
function removeArrayItem(itemPath, itemElement) {
  if (!confirm("이 항목을 삭제하시겠습니까?")) return;

  // DOM에서 제거
  itemElement.remove();

  // 배열에서도 제거 (실제로는 전체 폼을 다시 렌더링하는 것이 안전)
  renderConfigEditor();
  updateStatus("항목이 삭제되었습니다.");
}

// 💾 설정 저장 (새 날짜 파일로)
async function saveCurrentConfig() {
  if (!currentServer || !currentConfig) {
    showNotification("저장할 설정이 없습니다.", "error");
    return;
  }

  try {
    updateStatus("설정을 저장하는 중...");
    const result = await invoke("save_server_config", {
      serverFolder: currentServer.folderPath,
      serverName: currentServer.name,
      content: JSON.stringify(currentConfig, null, 2),
    });

    showNotification("설정이 성공적으로 저장되었습니다!");
    updateStatus(result);

    // 서버 목록 새로고침 (새 파일 반영)
    await refreshServerList();
  } catch (error) {
    console.error("저장 오류:", error);
    showNotification("저장 중 오류가 발생했습니다: " + error, "error");
    updateStatus("저장 실패");
  }
}

// 백업 생성
async function backupCurrentConfig() {
  if (!currentServer || !currentServer.latestFile) {
    showNotification("백업할 파일이 없습니다.", "error");
    return;
  }

  try {
    updateStatus("백업을 생성하는 중...");
    const result = await invoke("backup_config", {
      filePath: currentServer.latestFile,
    });

    showNotification("백업이 성공적으로 생성되었습니다!");
    updateStatus(result);
  } catch (error) {
    console.error("백업 오류:", error);
    showNotification("백업 생성 중 오류가 발생했습니다: " + error, "error");
    updateStatus("백업 실패");
  }
}

// 🏗️ 새 서버 추가
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

// 🗑️ 서버 삭제
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
      serverFolder: server.folderPath,
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

// 🚀 동적 템플릿 에디터 렌더링
function renderTemplateEditor() {
  if (!templateConfig) return;

  const templateEditor = document.getElementById("templateEditor");
  if (!templateEditor) return;

  // 기존 내용 제거하고 동적으로 생성
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
    console.log("📋", message);
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
    console.error("❌", message);
  } else {
    console.log("✅", message);
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

    if (event.target === addModal) {
      closeAddServerModal();
    }
    if (event.target === templateModal) {
      closeTemplateModal();
    }
  };
}

// 앱 시작
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 앱 시작...");

  const tauriReady = await waitForTauri();

  if (!tauriReady) {
    alert("❌ Tauri API를 로드할 수 없습니다.\n데스크톱 앱에서만 작동합니다.");
    return;
  }

  setupEventListeners();
  await init();

  console.log("✨ 앱 로드 완료!");
});
