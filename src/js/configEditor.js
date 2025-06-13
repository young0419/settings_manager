/**
 * 템플릿 에디터 렌더링
 * @param {object} templateConfig - 템플릿 설정
 * @returns {HTMLElement} 템플릿 에디터 요소
 */
function renderTemplateEditor(templateConfig) {
  if (!templateConfig) return null;

  const container = document.createElement("div");

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
    안전을 위해 삭제 기능은 비활성화되어 있습니다.
  `;
  container.appendChild(warningDiv);

  // 템플릿용 동적 폼 생성 (삭제 버튼 없음)
  const form = createDynamicForm(templateConfig, "", null, { isTemplate: true });
  container.appendChild(form);

  return container;
}
/**
 * 템플릿 값 업데이트
 * @param {string} path - 설정 경로
 * @param {any} value - 새 값
 */
function updateTemplateValue(path, value) {
  const templateConfig = ServerManager.getTemplateConfig();
  if (!templateConfig) return;

  const keys = path.split(".");
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

  AppUtils.updateStatus(`템플릿 ${path} 설정이 변경되었습니다.`);
}
// 현재 편집 중인 설정 정보
let currentServer = null;
let currentConfig = null;
let originalConfig = null;
let configKeyOrder = null; // 키 순서 정보 저장

// DEFAULT_KEY_ORDER 상수는 이제 사용하지 않으므로 제거합니다.

/**
 * 기본 키 순서 반환
 * ServerManager에서 로드된 템플릿의 최상위 키들을 반환합니다.
 * @returns {Array} 기본 키 순서 배열
 */
function getDefaultKeyOrder() {
  const template = ServerManager.getTemplateConfig();
  if (template) {
    return Object.keys(template); // 템플릿 객체의 최상위 키들을 반환
  }
  // 템플릿이 로드되지 않은 경우 (예: 초기화 실패 시) 빈 배열 반환
  return [];
}

/**
 * 설정 편집기 관련 함수들
 */

/**
 * JSON 문자열에서 키 순서를 보존하면서 파싱 (최신 버전)
 * @param {string} jsonString - JSON 문자열
 * @returns {object} 순서가 보존된 객체와 키 순서 정보
 */
function parseJsonWithOrder(jsonString) {
  const topLevelKeyOrder = [];

  try {
    console.log("JSON 문자열 파싱 시작...");

    // 특수 경우: 탐색 + 접근법으로 더 정확하게 파싱
    let cleanedJson = jsonString.trim();

    // 최상위 레벨 키들만 추출
    let depth = 0;
    let inString = false;
    let inTopLevel = false;

    for (let i = 0; i < cleanedJson.length; i++) {
      const char = cleanedJson[i];
      const prevChar = i > 0 ? cleanedJson[i - 1] : "";

      // 문자열 내부 처리 (에스케이프 문자 고려)
      if (char === '"' && prevChar !== "\\") {
        inString = !inString;
      }

      if (inString) continue;

      // 중괄호 depth 추적
      if (char === "{") {
        depth++;
        if (depth === 1) inTopLevel = true;
      } else if (char === "}") {
        depth--;
        if (depth === 0) inTopLevel = false;
      }

      // 최상위 레벨에서 키 찾기
      if (inTopLevel && depth === 1) {
        const remaining = cleanedJson.slice(i);
        const keyMatch = remaining.match(/^\s*"([^"]+)"\s*:/);

        if (keyMatch && !topLevelKeyOrder.includes(keyMatch[1])) {
          topLevelKeyOrder.push(keyMatch[1]);
          console.log(`키 발견: ${keyMatch[1]} (position: ${i})`);

          // 다음 키로 이동
          i += keyMatch[0].length - 1;
        }
      }
    }

    console.log("최종 추출된 키 순서:", topLevelKeyOrder);
    console.log("추출된 키 개수:", topLevelKeyOrder.length);

    // 일반적인 JSON 파싱
    const parsed = JSON.parse(jsonString);
    const objectKeys = Object.keys(parsed);

    console.log("Object.keys 순서:", objectKeys);
    console.log("Object.keys 개수:", objectKeys.length);

    // 두 순서가 다르면 경고
    const isOrderDifferent = !topLevelKeyOrder.every(
      (key, index) => key === objectKeys[index]
    );
    if (isOrderDifferent) {
      console.warn("⚠️ JSON 키 순서가 Object.keys()와 다름!!");
      console.warn("추출된 순서:", topLevelKeyOrder.slice(0, 10));
      console.warn("Object.keys 순서:", objectKeys.slice(0, 10));
    }

    return {
      data: parsed,
      keyOrder: topLevelKeyOrder.length > 0 ? topLevelKeyOrder : objectKeys,
    };
  } catch (error) {
    console.error("JSON 파싱 오류:", error);
    // 오류 발생시 기본 Object.keys() 순서 사용
    const parsed = JSON.parse(jsonString);
    return {
      data: parsed,
      keyOrder: Object.keys(parsed),
    };
  }
}

/**
 * 키 순서를 보존하면서 객체를 순회 (개선된 버전)
 * @param {object} obj - 객체
 * @param {Array} keyOrder - 키 순서 배열
 * @returns {Array} [key, value] 쌍의 배열
 */
function getOrderedEntries(obj, keyOrder = null) {
  console.log("getOrderedEntries 호출:", { obj: Object.keys(obj), keyOrder });

  if (!keyOrder || keyOrder.length === 0) {
    const result = Object.entries(obj);
    console.log(
      "keyOrder가 없음, Object.entries 사용:",
      result.map(([key]) => key)
    );
    return result;
  }

  const orderedEntries = [];
  const processedKeys = new Set();

  // 1. keyOrder에 있는 키들을 순서대로 처리
  keyOrder.forEach((key) => {
    if (obj.hasOwnProperty(key)) {
      orderedEntries.push([key, obj[key]]);
      processedKeys.add(key);
      console.log(`순서대로 추가: ${key}`);
    } else {
      console.log(`keyOrder에 있지만 객체에 없는 키: ${key}`);
    }
  });

  // 2. keyOrder에 없는 나머지 키들을 마지막에 추가
  Object.keys(obj).forEach((key) => {
    if (!processedKeys.has(key)) {
      orderedEntries.push([key, obj[key]]);
      console.log(`추가로 추가: ${key}`);
    }
  });

  console.log(
    "최종 순서:",
    orderedEntries.map(([key]) => key)
  );
  return orderedEntries;
}

/**
 * 현재 서버 설정
 * @param {object} server - 서버 정보
 * @param {object} config - 설정 객체
 * @param {object} original - 원본 설정
 * @param {Array} keyOrder - 키 순서 정보
 */
function setCurrentConfig(server, config, original, keyOrder = null) {
  currentServer = server;
  currentConfig = config;
  originalConfig = original;
  configKeyOrder = keyOrder;
  console.log("설정된 키 순서:", configKeyOrder);
}

/**
 * 현재 설정 정보 반환
 * @returns {object} 현재 설정 정보
 */
function getCurrentConfig() {
  return {
    server: currentServer,
    config: currentConfig,
    original: originalConfig,
  };
}

/**
 * 서버 정보 UI 업데이트
 * @param {object} server - 서버 정보
 */
function updateServerInfo(server) {
  const titleEl = AppUtils.elements.currentServerTitle();
  const pathEl = AppUtils.elements.currentServerPath();
  const changeLogBtn = AppUtils.elements.changeLogBtn();
  const saveBtn = AppUtils.elements.saveBtn();

  if (titleEl) {
    titleEl.textContent = server.name;
    if (server.latestFile) {
      titleEl.textContent += ` - ${server.latestFile}`;
    }
  }

  if (pathEl) {
    pathEl.textContent = `${ServerManager.getWorkingDirectory()}\\${
      server.name
    }`;
    if (server.fileCount !== undefined) {
      pathEl.textContent += ` (총 ${server.fileCount}개 파일)`;
    }
  }

  if (changeLogBtn) changeLogBtn.disabled = false;
  if (saveBtn) saveBtn.disabled = false;
}

/**
 * 설정 에디터 UI 초기화 (서버 미선택 상태)
 */
function clearConfigEditor() {
  currentServer = null;
  currentConfig = null;
  originalConfig = null;

  const titleEl = AppUtils.elements.currentServerTitle();
  const pathEl = AppUtils.elements.currentServerPath();
  const changeLogBtn = AppUtils.elements.changeLogBtn();
  const saveBtn = AppUtils.elements.saveBtn();
  const editor = AppUtils.elements.configEditor();

  if (titleEl) titleEl.textContent = "서버를 선택해주세요";
  if (pathEl) pathEl.textContent = "";
  if (changeLogBtn) changeLogBtn.disabled = true;
  if (saveBtn) saveBtn.disabled = true;
  if (editor) editor.className = "editor-empty";
}

/**
 * 동적 설정 에디터 렌더링
 */
function renderConfigEditor() {
  console.log("renderConfigEditor 호출됨");
  const editor = AppUtils.elements.configEditor();
  if (!editor) {
    console.error("configEditor 요소를 찾을 수 없음");
    return;
  }

  if (!currentConfig) {
    console.log("currentConfig가 비어있음");
    editor.className = "editor-empty";
    return;
  }

  console.log("currentConfig:", currentConfig);
  console.log("configKeyOrder:", configKeyOrder);

  // 원본 객체의 키 순서 확인
  console.log("Object.keys(currentConfig):", Object.keys(currentConfig));
  console.log(
    "Object.entries(currentConfig) 순서:",
    Object.entries(currentConfig).map(([key]) => key)
  );

  editor.className = "editor-loaded";

  const configContent = editor.querySelector(".config-content");
  if (!configContent) {
    console.error(".config-content 요소를 찾을 수 없음");
    return;
  }

  configContent.innerHTML = "";

  // 템플릿에서 항목 추가 버튼
  const addFromTemplateBtn = document.createElement("button");
  addFromTemplateBtn.className = "btn btn-secondary";
  addFromTemplateBtn.style.marginBottom = "1rem";
  addFromTemplateBtn.textContent = "템플릿에서 항목 추가";
  addFromTemplateBtn.onclick = () => window.openAddFromTemplateModal();
  configContent.appendChild(addFromTemplateBtn);

  try {
    const form = createDynamicForm(currentConfig, "", configKeyOrder);
    console.log("createDynamicForm 성공:", form);
    configContent.appendChild(form);
  } catch (error) {
    console.error("createDynamicForm 오류:", error);
  }
}

/**
 * 동적 폼 생성
 * @param {object} obj - 설정 객체
 * @param {string} path - 경로
 * @param {Array} keyOrder - 키 순서 정보
 * @param {object} options - 옵션 {isTemplate: boolean}
 * @returns {HTMLElement} 폼 요소
 */
function createDynamicForm(obj, path = "", keyOrder = null, options = {}) {
  const container = document.createElement("div");

  // 키 순서를 보존하면서 처리
  const entries = getOrderedEntries(obj, keyOrder);
  console.log(
    `사용된 키 순서 (path: ${path}):`,
    entries.map(([key]) => key)
  );

  entries.forEach(([key, value]) => {
    const fieldPath = path ? `${path}.${key}` : key;

    console.log(`처리 중: ${key}, 타입: ${typeof value}, 값:`, value);

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // 중첩 객체는 객체 그룹으로 처리
      console.log(`중첩 객체 생성: ${key}`);
      const objectGroup = createNestedObjectField(key, value, fieldPath, options);
      if (objectGroup) {
        container.appendChild(objectGroup);
      }
    } else {
      // 단순 값들은 개별 필드로 처리
      console.log(`단순 필드 생성: ${key}`);
      const field = createDynamicField(key, value, fieldPath, options);
      if (field) {
        // DocumentFragment인 경우 직접 스타일을 적용할 수 없으므로
        // 컨테이너로 감싸서 처리
        if (field.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
          const wrapper = document.createElement("div");
          wrapper.style.marginBottom = "1rem";
          wrapper.appendChild(field);
          container.appendChild(wrapper);
        } else if (field.style) {
          // 일반 DOM 요소인 경우
          field.style.marginBottom = "1rem";
          container.appendChild(field);
        } else {
          // 기타 경우 - 그냥 추가
          container.appendChild(field);
        }
      } else {
        console.warn(
          `createDynamicField가 null을 반환: key=${key}, value=`,
          value
        );
      }
    }
  });

  return container;
}

/**
 * 기본 설정 그룹 생성
 * @param {Array} fields - 단순 필드들
 * @param {string} basePath - 기본 경로
 * @returns {HTMLElement} 기본 설정 그룹
 */
function createBasicSettingsGroup(fields, basePath) {
  const container = document.createElement("div");
  container.className = "nested-object-container";
  container.style.marginBottom = "1rem";

  // 기본 설정 헤더
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

  const toggleIcon = document.createElement("span");
  toggleIcon.textContent = "📁";
  toggleIcon.style.marginRight = "0.5rem";

  const title = document.createElement("span");
  title.textContent = `기본 설정 (${fields.length}개 항목)`;
  title.style.fontWeight = "600";
  title.style.flex = "1";

  header.appendChild(toggleIcon);
  header.appendChild(title);

  // 내용 영역
  const content = document.createElement("div");
  content.className = "object-content";
  content.style.cssText = `
    margin-left: 1.5rem;
    border-left: 2px solid #e9ecef;
    padding-left: 1rem;
    display: block;
  `;

  // 각 단순 필드 추가 - 순서 유지
  fields.forEach(({ key, value }) => {
    const fieldPath = basePath ? `${basePath}.${key}` : key;
    const field = createDynamicField(key, value, fieldPath);

    if (field) {
      // DocumentFragment인 경우 컨테이너로 감싸서 처리
      if (field.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        const wrapper = document.createElement("div");
        wrapper.style.marginBottom = "0.5rem";
        wrapper.appendChild(field);
        content.appendChild(wrapper);
      } else if (field.style) {
        // 일반 DOM 요소인 경우
        field.style.marginBottom = "0.5rem";
        content.appendChild(field);
      } else {
        // 기타 경우
        content.appendChild(field);
      }
    } else {
      console.warn(
        `createDynamicField가 null을 반환: key=${key}, value=${value}`
      );
    }
  });

  // 헤더 클릭 토글
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
 * 동적 필드 생성
 * @param {string} key - 필드 키
 * @param {any} value - 필드 값
 * @param {string} path - 필드 경로
 * @param {object} options - 옵션 {isTemplate: boolean}
 * @returns {HTMLElement} 필드 요소
 */
function createDynamicField(key, value, path, options = {}) {
  console.log(`createDynamicField: key=${key}, value=`, value, `path=${path}`);

  try {
    if (typeof value === "boolean") {
      return createCheckboxField(key, value, path, options);
    } else if (typeof value === "number") {
      return createNumberField(key, value, path, options);
    } else if (typeof value === "string") {
      return createTextField(key, value, path, options);
    } else if (Array.isArray(value)) {
      return createArrayField(key, value, path, options);
    } else if (typeof value === "object" && value !== null) {
      // 중첩 객체는 여기서 처리하지 말고 경고 메시지
      console.warn(`중첩 객체가 createDynamicField로 전달됨: ${key}`);
      return createNestedObjectField(key, value, path, options);
    } else {
      // null, undefined 등
      return createTextField(key, value || "", path, options);
    }
  } catch (error) {
    console.error(`createDynamicField 오류 (key=${key}):`, error);
    // 오류 발생시 기본 텍스트 필드 반환
    return createTextField(key, String(value || ""), path, options);
  }
}

/**
 * 텍스트 필드 생성 (템플릿 사용)
 * @param {string} key - 필드 키
 * @param {string} value - 필드 값
 * @param {string} path - 필드 경로
 * @param {object} options - 옵션 {isTemplate: boolean}
 * @returns {HTMLElement} 텍스트 필드 요소
 */
function createTextField(key, value, path, options = {}) {
  const template = document.getElementById("textFieldTemplate");
  const clone = template.content.cloneNode(true);

  // 데이터 바인딩
  clone.querySelector(".field-label").textContent = key;
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
    if (options.isTemplate) {
      updateTemplateValue(path, input.value);
    } else {
      updateConfigValue(path, input.value);
    }
  });

  // 삭제 버튼 이벤트 - 템플릿에서는 삭제 버튼 숨김
  const deleteBtn = clone.querySelector(".field-delete-btn");
  if (options.isTemplate) {
    deleteBtn.style.display = "none";
  } else {
    deleteBtn.onclick = () => {
      AppUtils.showConfirmDialog(`'${key}' 필드를 삭제하시겠습니까?`, () =>
        deleteField(path)
      );
    };
  }

  return clone;
}

/**
 * 숫자 필드 생성
 * @param {string} key - 필드 키
 * @param {number} value - 필드 값
 * @param {string} path - 필드 경로
 * @param {object} options - 옵션 {isTemplate: boolean}
 * @returns {HTMLElement} 숫자 필드 요소
 */
function createNumberField(key, value, path, options = {}) {
  const template = document.getElementById("numberFieldTemplate");
  const clone = template.content.cloneNode(true);

  clone.querySelector(".field-label").textContent = key;
  const input = clone.querySelector(".field-input");
  input.value = value;

  input.addEventListener("change", () => {
    if (options.isTemplate) {
      updateTemplateValue(path, parseInt(input.value) || 0);
    } else {
      updateConfigValue(path, parseInt(input.value) || 0);
    }
  });

  // 삭제 버튼 이벤트 - 템플릿에서는 삭제 버튼 숨김
  const deleteBtn = clone.querySelector(".field-delete-btn");
  if (options.isTemplate) {
    deleteBtn.style.display = "none";
  } else {
    deleteBtn.onclick = () => {
      AppUtils.showConfirmDialog(`'${key}' 필드를 삭제하시겠습니까?`, () =>
        deleteField(path)
      );
    };
  }

  return clone;
}

/**
 * 체크박스 필드 생성
 * @param {string} key - 필드 키
 * @param {boolean} value - 필드 값
 * @param {string} path - 필드 경로
 * @param {object} options - 옵션 {isTemplate: boolean}
 * @returns {HTMLElement} 체크박스 필드 요소
 */
function createCheckboxField(key, value, path, options = {}) {
  const template = document.getElementById("checkboxFieldTemplate");
  const clone = template.content.cloneNode(true);

  clone.querySelector(".field-label").textContent = key;
  const checkbox = clone.querySelector(".field-checkbox");
  checkbox.checked = value;

  checkbox.addEventListener("change", () => {
    if (options.isTemplate) {
      updateTemplateValue(path, checkbox.checked);
    } else {
      updateConfigValue(path, checkbox.checked);
    }
  });

  // 삭제 버튼 이벤트 - 템플릿에서는 삭제 버튼 숨김
  const deleteBtn = clone.querySelector(".field-delete-btn");
  if (options.isTemplate) {
    deleteBtn.style.display = "none";
  } else {
    deleteBtn.onclick = () => {
      AppUtils.showConfirmDialog(`'${key}' 필드를 삭제하시겠습니까?`, () => {
        deleteField(path);
      });
    };
  }

  return clone;
}

/**
 * 배열 필드 생성 (테이블 스타일)
 * @param {string} key - 필드 키
 * @param {Array} array - 배열 값
 * @param {string} path - 필드 경로
 * @param {object} options - 옵션 {isTemplate: boolean}
 * @returns {HTMLElement} 배열 필드 요소
 */
function createArrayField(key, array, path, options = {}) {
  const template = document.getElementById("arrayFieldTemplate");
  if (!template) {
    console.error("arrayFieldTemplate을 찾을 수 없습니다");
    return null;
  }

  const clone = template.content.cloneNode(true);
  const wrapper = document.createElement("div");
  wrapper.appendChild(clone);
  const fieldGroup = wrapper.querySelector(".field-group");

  if (!fieldGroup) {
    console.error("field-group 요소를 찾을 수 없습니다");
    return null;
  }

  const label = fieldGroup.querySelector(".field-label");
  const tbody = fieldGroup.querySelector(".array-tbody");

  if (label) label.textContent = key;
  if (tbody) {
    // 배열 아이템들을 테이블 행으로 렌더링
    array.forEach((item, index) => {
      const row = createArrayRow(item, `${path}[${index}]`, index, options);
      if (row) tbody.appendChild(row);
    });
  }

  // 추가 버튼 이벤트
  const addButton = fieldGroup.querySelector(".array-add-btn");
  if (addButton) {
    addButton.addEventListener("click", () => {
      addArrayItem(array, path, tbody, options);
    });
  }

  // 삭제 버튼 이벤트 - 템플릿에서는 삭제 버튼 숨김
  const deleteBtn = fieldGroup.querySelector(".field-delete-btn");
  if (deleteBtn) {
    if (options.isTemplate) {
      deleteBtn.style.display = "none";
    } else {
      deleteBtn.onclick = () => {
        AppUtils.showConfirmDialog(`'${key}' 배열을 삭제하시겠습니까?`, () =>
          deleteField(path)
        );
      };
    }
  }

  wrapper.removeChild(fieldGroup);
  return fieldGroup;
}

/**
 * 배열 행 생성
 * @param {any} item - 배열 아이템
 * @param {string} itemPath - 아이템 경로
 * @param {number} index - 인덱스
 * @param {object} options - 옵션 {isTemplate: boolean}
 * @returns {HTMLElement} 배열 행 요소
 */
function createArrayRow(item, itemPath, index, options = {}) {
  const template = document.getElementById("arrayRowTemplate");
  if (!template) {
    console.error("arrayRowTemplate을 찾을 수 없습니다");
    return null;
  }

  const clone = template.content.cloneNode(true);
  const wrapper = document.createElement("div");
  wrapper.appendChild(clone);
  const row = wrapper.querySelector(".array-row");

  if (!row) {
    console.error("array-row 요소를 찾을 수 없습니다");
    return null;
  }

  const input = row.querySelector(".array-input");
  const deleteBtn = row.querySelector(".array-delete-btn");

  if (input) {
    if (typeof item === "object") {
      // 객체인 경우 JSON 문자열로 표시
      input.value = JSON.stringify(item);
      input.addEventListener("change", () => {
        try {
          const parsed = JSON.parse(input.value);
          if (options.isTemplate) {
            updateTemplateValue(itemPath, parsed);
          } else {
            updateConfigValue(itemPath, parsed);
          }
          input.style.borderColor = ""; // 오류 상태 해제
        } catch (e) {
          console.error("JSON 파싱 오류:", e);
          input.style.borderColor = "#e74c3c";
        }
      });
    } else {
      // 단순 값인 경우
      input.value = item;
      input.addEventListener("change", () => {
        if (options.isTemplate) {
          updateTemplateValue(itemPath, input.value);
        } else {
          updateConfigValue(itemPath, input.value);
        }
      });
    }
  }

  // 삭제 버튼 - 템플릿에서는 숨김
  if (deleteBtn) {
    if (options.isTemplate) {
      deleteBtn.style.display = "none";
    } else {
      deleteBtn.addEventListener("click", () => {
        AppUtils.showConfirmDialog("이 항목을 삭제하시겠습니까?", () =>
          removeArrayRow(itemPath, row)
        );
      });
    }
  }

  wrapper.removeChild(row);
  return row;
}

/**
 * 중첩 객체 필드 생성 (계층적 들여쓰기 방식)
 * @param {string} key - 필드 키
 * @param {object} obj - 객체 값
 * @param {string} path - 필드 경로
 * @returns {HTMLElement} 중첩 객체 필드 요소
 */
function createNestedObjectField(key, obj, path, options = {}) {
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
    border-left: 3px solid #007bff;
    margin-bottom: 0.5rem;
    cursor: pointer;
  `;

  // 폴더 아이콘 및 제목
  const toggleIcon = document.createElement("span");
  toggleIcon.textContent = "📁";
  toggleIcon.style.marginRight = "0.5rem";

  const title = document.createElement("span");
  title.textContent = `${key} (${Object.keys(obj).length}개 속성)`;
  title.style.fontWeight = "600";
  title.style.flex = "1";

  header.appendChild(toggleIcon);
  header.appendChild(title);

  // 삭제 버튼 - 템플릿에서는 숨김
  if (!options.isTemplate) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-mini";
    deleteBtn.textContent = "전체 삭제";
    deleteBtn.style.marginLeft = "0.5rem";

    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      console.log("삭제 버튼 클릭:", key, path);
      AppUtils.showConfirmDialog(`'${key}' 객체 전체를 삭제하시겠습니까?`, () =>
        deleteField(path)
      );
    };

    header.appendChild(deleteBtn);
  }

  // 속성 목록 컨테이너
  const content = document.createElement("div");
  content.className = "object-content";
  content.style.cssText = `
    margin-left: 1.5rem;
    border-left: 2px solid #e9ecef;
    padding-left: 1rem;
    display: block;
  `;

  // 각 속성을 들여쓰기로 표시 - 순서 유지
  const entries = Object.entries(obj);
  entries.forEach(([itemKey, item]) => {
    const itemRow = createPropertyRow(itemKey, item, `${path}.${itemKey}`, options);
    content.appendChild(itemRow);
  });

  // 헤더 클릭시 토글
  header.onclick = (e) => {
    // 삭제 버튼 클릭시 토글 방지
    if (e.target.classList.contains('btn')) {
      return;
    }
    const isVisible = content.style.display !== "none";
    content.style.display = isVisible ? "none" : "block";
    toggleIcon.textContent = isVisible ? "📂" : "📁";
  };

  container.appendChild(header);
  container.appendChild(content);

  return container;
}

/**
 * 속성 행 생성 (간단한 key-value 형태)
 * @param {string} key - 속성 키
 * @param {any} value - 속성 값
 * @param {string} itemPath - 속성 경로
 * @param {object} options - 옵션 {isTemplate: boolean}
 * @returns {HTMLElement} 속성 행 요소
 */
function createPropertyRow(key, value, itemPath, options = {}) {
  const row = document.createElement("div");
  row.className = "property-row";
  row.style.cssText = `
    display: flex;
    align-items: center;
    padding: 0.25rem 0;
    border-bottom: 1px solid #f1f3f4;
    margin-bottom: 0.25rem;
  `;

  // 속성명
  const nameSpan = document.createElement("span");
  nameSpan.textContent = key;
  nameSpan.style.cssText = `
    font-weight: 500;
    min-width: 120px;
    color: #495057;
  `;

  // 값 입력 영역
  const valueContainer = document.createElement("div");
  valueContainer.style.cssText = `
    flex: 1;
    margin: 0 0.5rem;
  `;

  // 값 타입별 입력 요소 생성
  let inputElement;
  if (typeof value === "boolean") {
    inputElement = document.createElement("input");
    inputElement.type = "checkbox";
    inputElement.checked = value;
    inputElement.addEventListener("change", () => {
      if (options.isTemplate) {
        updateTemplateValue(itemPath, inputElement.checked);
      } else {
        updateConfigValue(itemPath, inputElement.checked);
      }
    });
  } else if (typeof value === "number") {
    inputElement = document.createElement("input");
    inputElement.type = "number";
    inputElement.value = value;
    inputElement.style.width = "100px";
    inputElement.addEventListener("change", () => {
      if (options.isTemplate) {
        updateTemplateValue(itemPath, parseInt(inputElement.value) || 0);
      } else {
        updateConfigValue(itemPath, parseInt(inputElement.value) || 0);
      }
    });
  } else if (typeof value === "string") {
    inputElement = document.createElement("input");
    inputElement.type = "text";
    inputElement.value = value;
    inputElement.style.width = "200px";
    if (value.includes("http") || key.toLowerCase().includes("url")) {
      inputElement.classList.add("url-field");
    }
    inputElement.addEventListener("change", () => {
      if (options.isTemplate) {
        updateTemplateValue(itemPath, inputElement.value);
      } else {
        updateConfigValue(itemPath, inputElement.value);
      }
    });
  } else if (Array.isArray(value)) {
    inputElement = document.createElement("textarea");
    inputElement.value = JSON.stringify(value, null, 2);
    inputElement.rows = 2;
    inputElement.style.width = "200px";
    inputElement.addEventListener("change", () => {
      try {
        const parsed = JSON.parse(inputElement.value);
        if (options.isTemplate) {
          updateTemplateValue(itemPath, parsed);
        } else {
          updateConfigValue(itemPath, parsed);
        }
        inputElement.style.borderColor = "";
      } catch (e) {
        inputElement.style.borderColor = "#e74c3c";
      }
    });
  } else if (typeof value === "object" && value !== null) {
    // 중첩 객체는 재귀 호출
    return createNestedObjectField(key, value, itemPath, options);
  } else {
    inputElement = document.createElement("span");
    inputElement.textContent = String(value);
    inputElement.style.color = "#6c757d";
    inputElement.style.fontStyle = "italic";
  }

  valueContainer.appendChild(inputElement);

  // 삭제 버튼 - 템플릿에서는 숨김
  row.appendChild(nameSpan);
  row.appendChild(valueContainer);
  
  if (!options.isTemplate) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-mini";
    deleteBtn.textContent = "삭제";
    deleteBtn.style.fontSize = "0.7rem";

    deleteBtn.onclick = () => {
      console.log("속성 삭제 버튼 클릭:", key, itemPath);
      AppUtils.showConfirmDialog(`'${key}' 속성을 삭제하시겠습니까?`, () =>
        deleteField(itemPath)
      );
    };

    row.appendChild(deleteBtn);
  }

  return row;
}

/**
 * 설정 값 업데이트
 * @param {string} path - 설정 경로
 * @param {any} value - 새 값
 */
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

  AppUtils.updateStatus(`${path} 설정이 변경되었습니다.`);
}

/**
 * 필드 삭제
 * @param {string} path - 삭제할 필드 경로
 */
function deleteField(path) {
  if (!currentConfig) return;

  const keys = path.split(".");
  let current = currentConfig;
  const parentKeys = keys.slice(0, -1);
  const lastKey = keys[keys.length - 1];

  // 부모 객체 찾기
  for (const key of parentKeys) {
    if (key.includes("[") && key.includes("]")) {
      const [arrayKey, indexStr] = key.split("[");
      const index = parseInt(indexStr.replace("]", ""));
      current = current[arrayKey][index];
    } else {
      current = current[key];
    }
  }

  // 삭제
  if (lastKey.includes("[") && lastKey.includes("]")) {
    const [arrayKey, indexStr] = lastKey.split("[");
    const index = parseInt(indexStr.replace("]", ""));
    current[arrayKey].splice(index, 1);
  } else {
    delete current[lastKey];
  }

  renderConfigEditor();
  AppUtils.updateStatus(`${path} 필드가 삭제되었습니다.`);
}

/**
 * 배열 아이템 추가 (테이블 형태)
 * @param {Array} array - 배열
 * @param {string} path - 배열 경로
 * @param {HTMLElement} tbody - 테이블 바디
 * @param {object} options - 옵션 {isTemplate: boolean}
 */
function addArrayItem(array, path, tbody, options = {}) {
  const newItem = typeof array[0] === "object" ? {} : "";
  array.push(newItem);

  const row = createArrayRow(
    newItem,
    `${path}[${array.length - 1}]`,
    array.length - 1,
    options
  );
  tbody.appendChild(row);

  AppUtils.updateStatus("새 항목이 추가되었습니다.");
}

/**
 * 배열 행 제거
 * @param {string} itemPath - 아이템 경로
 * @param {HTMLElement} rowElement - 행 요소
 */
function removeArrayRow(itemPath, rowElement) {
  rowElement.remove();
  renderConfigEditor(); // 전체 다시 렌더링으로 인덱스 재정렬
  AppUtils.updateStatus("항목이 삭제되었습니다.");
}

/**
 * 템플릿에서 선택된 항목들을 현재 설정에 추가
 * @param {Array} selectedPaths - 선택된 경로들
 */
function addSelectedTemplateItems(selectedPaths) {
  const templateConfig = ServerManager.getTemplateConfig();
  if (!templateConfig || !currentConfig) {
    AppUtils.showNotification(
      "템플릿 또는 현재 설정이 로드되지 않았습니다.",
      "error"
    );
    return;
  }

  let addedCount = 0;

  selectedPaths.forEach((path) => {
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

  renderConfigEditor(); // 설정 에디터 다시 렌더링
  AppUtils.showNotification(`${addedCount}개 항목이 추가되었습니다.`);
  AppUtils.updateStatus(`템플릿에서 ${addedCount}개 항목을 추가했습니다.`);
}

// 내보내기
window.ConfigEditor = {
  setCurrentConfig,
  getCurrentConfig,
  updateServerInfo,
  clearConfigEditor,
  renderConfigEditor,
  renderTemplateEditor, // 새로 추가
  addSelectedTemplateItems,
  parseJsonWithOrder,
  getDefaultKeyOrder, // 변경됨

  // 필드 생성 함수들
  createTextField,
  createNumberField,
  createCheckboxField,
  createArrayField,
  createNestedObjectField,
  updateTemplateValue, // 새로 추가
};
