/**
 * 템플릿 에디터 렌더링 - 올바른 버전
 * @param {object} templateConfig - 템플릿 설정
 * @returns {HTMLElement} 템플릿 에디터 요소
 */
function renderTemplateEditor(templateConfig) {
  console.log("템플릿 에디터 렌더링 시작:", templateConfig);
  
  if (!templateConfig) {
    console.error("템플릿 설정이 없습니다");
    return null;
  }

  const container = document.createElement("div");
  container.className = "template-editor-container";
  
  // 경고 메시지 추가
  const warning = document.createElement("div");
  warning.className = "template-warning";
  warning.innerHTML = `
    <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
      <h4 style="margin: 0 0 0.5rem 0; color: #856404; font-size: 0.9rem;">⚠️ 주의</h4>
      <p style="margin: 0; font-size: 0.8rem; color: #856404; line-height: 1.4;">
        템플릿 변경은 신중하게 하세요. 새 서버 생성시 기본값으로 사용됩니다.<br>
        안전을 위해 삭제 기능은 비활성화되어 있습니다.
      </p>
    </div>
  `;
  container.appendChild(warning);

  // 템플릿 설정을 일반 편집처럼 렌더링 (카드 섹션 사용)
  try {
    console.log("createDynamicForm 호출 중...");
    const templateForm = createDynamicForm(templateConfig, "", null, {
      isTemplate: true,
    });
    console.log("템플릿 폼 생성 완료:", templateForm);
    
    container.appendChild(templateForm);
  } catch (error) {
    console.error("템플릿 폼 생성 오류:", error);
    const errorDiv = document.createElement("div");
    errorDiv.textContent = "템플릿 렌더링 오류: " + error.message;
    errorDiv.style.color = "red";
    container.appendChild(errorDiv);
  }
  
  console.log("최종 컨테이너:", container);
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

  // 템플릿 변경사항도 추적 (템플릿에 대한 별도 플래그는 사용하지 않음)
  console.log(`템플릿 변경: ${path} = ${value}`);
  AppUtils.updateStatus(`템플릿 ${path} 설정이 변경되었습니다.`);
}
// 현재 편집 중인 설정 정보
let currentServer = null;
let currentConfig = null;
let originalConfig = null;
let configKeyOrder = null; // 키 순서 정보 저장
let hasUnsavedChanges = false; // 저장되지 않은 변경사항 추적

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
    } else {
      console.log(`keyOrder에 있지만 객체에 없는 키: ${key}`);
    }
  });

  // 2. keyOrder에 없는 나머지 키들을 마지막에 추가
  Object.keys(obj).forEach((key) => {
    if (!processedKeys.has(key)) {
      orderedEntries.push([key, obj[key]]);
    }
  });

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
  resetChangeTracking(); // 새 설정 로드 시 초기화
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
 * 설정 에디터 렌더링
 */
function renderConfigEditor() {
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

  editor.className = "editor-loaded";

  const configContent = editor.querySelector(".config-content");
  if (!configContent) {
    console.error(".config-content 요소를 찾을 수 없음");
    return;
  }

  configContent.innerHTML = "";

  try {
    const form = ConfigEditor.createDynamicForm(currentConfig, "", configKeyOrder);
    configContent.appendChild(form);
  } catch (error) {
    console.error("createDynamicForm 오류:", error);
  }
}

/**
 * 배열을 청크로 나누는 유틸리티 함수
 */
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * 대량 데이터를 청크 단위로 렌더링
 */
async function renderLargeConfigChunked(obj, path = "", keyOrder = null, options = {}) {
  const container = document.createElement("div");
  
  // 템플릿 에디터가 아닌 경우에만 템플릿 추가 버튼 표시
  if (!options.isTemplate && !path) {
    const addFromTemplateBtn = document.createElement("button");
    addFromTemplateBtn.className = "btn btn-secondary";
    addFromTemplateBtn.style.marginBottom = "1rem";
    addFromTemplateBtn.textContent = "템플릿에서 항목 추가";
    addFromTemplateBtn.onclick = () => window.openAddFromTemplateModal();
    container.appendChild(addFromTemplateBtn);
  }

  // 키 순서를 보존하면서 처리
  const entries = getOrderedEntries(obj, keyOrder);
  
  // 단순 값과 중첩 객체 분리
  const simpleFields = [];
  const complexSections = [];
  
  entries.forEach(([key, value]) => {
    const fieldPath = path ? `${path}.${key}` : key;
    
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // 중첩 객체는 별도 섹션으로
      complexSections.push({ key, value, fieldPath });
    } else {
      // 단순 값들은 기본 설정 그룹에 포함
      simpleFields.push({ key, value, fieldPath });
    }
  });
  
  // 단순 필드들을 기본 설정 그룹으로 생성
  if (simpleFields.length > 0) {
    const basicGroup = createBasicSettingsGroup(simpleFields, options);
    if (basicGroup) {
      container.appendChild(basicGroup);
    }
  }
  
  // 대량 중첩 섹션들을 청크로 처리
  if (complexSections.length > 20) {
    await renderComplexSectionsChunked(container, complexSections, options);
  } else {
    // 적은 양이면 일반 렌더링
    complexSections.forEach(({ key, value, fieldPath }) => {
      const section = createConfigSection(key, value, fieldPath, options);
      if (section) {
        container.appendChild(section);
      }
    });
  }

  return container;
}

/**
 * 대량 섹션을 청크로 렌더링
 */
async function renderComplexSectionsChunked(container, complexSections, options) {
  const chunks = chunkArray(complexSections, 10); // 10개씩 청크
  
  for (const chunk of chunks) {
    // 청크 렌더링
    chunk.forEach(({ key, value, fieldPath }) => {
      const section = createConfigSection(key, value, fieldPath, options);
      if (section) {
        container.appendChild(section);
      }
    });
    
    // 브라우저에게 숙쉴 시간 제공
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/**
 * 동적 폼 생성 - 기본 설정 그룹화 지원 및 성능 최적화
 * @param {object} obj - 설정 객체
 * @param {string} path - 경로
 * @param {Array} keyOrder - 키 순서 정보
 * @param {object} options - 옵션 {isTemplate: boolean}
 * @returns {HTMLElement} 폼 요소
 */
function createDynamicForm(obj, path = "", keyOrder = null, options = {}) {
  const totalItems = Object.keys(obj).length;
  
  // 대량 데이터인 경우 청크 렌더링 사용
  if (totalItems > 50) {
    console.log(`대량 데이터 감지: ${totalItems}개 항목, 청크 렌더링 사용`);
    return renderLargeConfigChunked(obj, path, keyOrder, options);
  }
  
  // 기존 로직 유지 (소량 데이터)
  const container = document.createElement("div");
  
  // 템플릿 편집이 아닌 경우에만 템플릿 추가 버튼 표시
  if (!options.isTemplate && !path) {
    const addFromTemplateBtn = document.createElement("button");
    addFromTemplateBtn.className = "btn btn-secondary";
    addFromTemplateBtn.style.marginBottom = "1rem";
    addFromTemplateBtn.textContent = "템플릿에서 항목 추가";
    addFromTemplateBtn.onclick = () => window.openAddFromTemplateModal();
    container.appendChild(addFromTemplateBtn);
  }

  // 키 순서를 보존하면서 처리
  const entries = getOrderedEntries(obj, keyOrder);
  
  // 단순 값과 중첩 객체 분리
  const simpleFields = [];
  const complexSections = [];
  
  entries.forEach(([key, value]) => {
    const fieldPath = path ? `${path}.${key}` : key;
    
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // 중첩 객체는 별도 섹션으로
      complexSections.push({ key, value, fieldPath });
    } else {
      // 단순 값들은 기본 설정 그룹에 포함
      simpleFields.push({ key, value, fieldPath });
    }
  });
  
  // 단순 필드들을 기본 설정 그룹으로 생성
  if (simpleFields.length > 0) {
    const basicGroup = createBasicSettingsGroup(simpleFields, options);
    if (basicGroup) {
      container.appendChild(basicGroup);
    }
  }
  
  // 중첩 객체들은 개별 섹션으로 생성
  complexSections.forEach(({ key, value, fieldPath }) => {
    const section = createConfigSection(key, value, fieldPath, options);
    if (section) {
      container.appendChild(section);
    }
  });

  return container;
}

/**
 * 기본 설정 그룹 생성
 * @param {Array} fields - 단순 필드들
 * @param {object} options - 옵션
 * @returns {HTMLElement} 기본 설정 그룹
 */
function createBasicSettingsGroup(fields, options = {}) {
  const template = document.getElementById("configSectionTemplate");
  if (!template) {
    // 폴백: 섹션 템플릿이 없으면 개별 필드로 처리
    const container = document.createElement("div");
    fields.forEach(({ key, value, fieldPath }) => {
      const field = createDynamicField(key, value, fieldPath, options);
      if (field) {
        if (field.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
          const wrapper = document.createElement("div");
          wrapper.style.marginBottom = "1rem";
          wrapper.appendChild(field);
          container.appendChild(wrapper);
        } else {
          field.style.marginBottom = "1rem";
          container.appendChild(field);
        }
      }
    });
    return container;
  }

  const clone = template.content.cloneNode(true);
  const wrapper = document.createElement("div");
  wrapper.appendChild(clone);
  const section = wrapper.querySelector(".config-section");

  if (!section) {
    return createBasicSettingsGroup(fields, options); // 재귀 호출로 폴백
  }

  // 섹션 제목 설정
  const titleEl = section.querySelector(".section-title");
  if (titleEl) {
    titleEl.textContent = `기본 설정 (${fields.length}개 항목)`;
  }

  // 섹션 내용 영역
  const contentEl = section.querySelector(".section-content");
  if (contentEl) {
    // 각 단순 필드를 추가
    fields.forEach(({ key, value, fieldPath }) => {
      const field = createDynamicField(key, value, fieldPath, options);
      if (field) {
        if (field.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
          const wrapper = document.createElement("div");
          wrapper.appendChild(field);
          contentEl.appendChild(wrapper);
        } else {
          contentEl.appendChild(field);
        }
      }
    });
  }

  // 기본적으로 확장 상태로 설정
  if (contentEl) {
    contentEl.classList.add("expanded");
  }
  
  // 토글 기능
  const header = section.querySelector(".section-header");
  const toggle = section.querySelector(".toggle");
  if (header && toggle && contentEl) {
    // 초기 토글 아이콘 설정
    toggle.textContent = "▼";
    
    header.onclick = (e) => {
      if (e.target.classList.contains("btn")) return;
      
      const isExpanded = contentEl.classList.contains("expanded");
      if (isExpanded) {
        contentEl.classList.remove("expanded");
        toggle.textContent = "▶";
      } else {
        contentEl.classList.add("expanded");
        toggle.textContent = "▼";
      }
    };
  }

  // 삭제 버튼 - 템플릿에서는 숨김
  const deleteBtn = section.querySelector(".section-delete-btn");
  if (deleteBtn) {
    if (options.isTemplate) {
      deleteBtn.style.display = "none";
    } else {
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        AppUtils.showConfirmDialog("기본 설정 전체를 삭제하시겠습니까?", () => {
          fields.forEach(({ fieldPath }) => {
            deleteField(fieldPath);
          });
          renderConfigEditor();
        });
      };
    }
  }

  wrapper.removeChild(section);
  return section;
}

/**
 * 지연 로딩을 지원하는 카드 기반 설정 섹션 생성
 * @param {string} key - 섹션 키
 * @param {object} obj - 섹션 객체
 * @param {string} path - 섹션 경로
 * @param {object} options - 옵션
 * @returns {HTMLElement} 섹션 요소
 */
function createConfigSection(key, obj, path, options = {}) {
  const template = document.getElementById("configSectionTemplate");
  if (!template) {
    console.error("configSectionTemplate을 찾을 수 없습니다");
    return createNestedObjectField(key, obj, path, options);
  }

  const clone = template.content.cloneNode(true);
  const wrapper = document.createElement("div");
  wrapper.appendChild(clone);
  const section = wrapper.querySelector(".config-section");

  if (!section) {
    console.error("config-section 요소를 찾을 수 없습니다");
    return createNestedObjectField(key, obj, path, options);
  }

  // 섹션 제목 설정
  const titleEl = section.querySelector(".section-title");
  if (titleEl) {
    titleEl.textContent = `${key} (${Object.keys(obj).length}개 항목)`;
  }

  // 섹션 내용 영역
  const contentEl = section.querySelector(".section-content");
  
  // 모든 섹션을 즉시 렌더링 (지연 로딩 제거)
  renderSectionContent(contentEl, obj, path, options);

  // 기본적으로 확장 상태로 설정
  if (contentEl) {
    contentEl.classList.add("expanded");
  }
  
  // 토글 기능
  const header = section.querySelector(".section-header");
  const toggle = section.querySelector(".toggle");
  if (header && toggle && contentEl) {
    // 초기 토글 아이콘 설정
    toggle.textContent = "▼";
    
    header.onclick = (e) => {
      if (e.target.classList.contains("btn")) return; // 삭제 버튼 클릭 방지
      
      const isExpanded = contentEl.classList.contains("expanded");
      if (isExpanded) {
        contentEl.classList.remove("expanded");
        toggle.textContent = "▶";
      } else {
        contentEl.classList.add("expanded");
        toggle.textContent = "▼";
      }
    };
  }

  // 삭제 버튼 - 템플릿에서는 숨김
  const deleteBtn = section.querySelector(".section-delete-btn");
  if (deleteBtn) {
    if (options.isTemplate) {
      deleteBtn.style.display = "none";
    } else {
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        AppUtils.showConfirmDialog(`'${key}' 섹션을 삭제하시겠습니까?`, () => {
          deleteField(path);
          renderConfigEditor();
        });
      };
    }
  }

  wrapper.removeChild(section);
  return section;
}

/**
 * 섹션 컨텐츠 렌더링 (지연 로딩용)
 */
function renderSectionContent(contentEl, obj, path, options) {
  // 각 속성을 필드로 추가
  Object.entries(obj).forEach(([itemKey, item]) => {
    const field = createDynamicField(itemKey, item, `${path}.${itemKey}`, options);
    if (field) {
      if (field.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        const wrapper = document.createElement("div");
        wrapper.appendChild(field);
        contentEl.appendChild(wrapper);
      } else {
        contentEl.appendChild(field);
      }
    }
  });
}

/**
 * 지연 로딩 실행
 */
function loadSectionContent(contentEl, obj, path, options) {
  // 로딩 시작
  const placeholder = contentEl.querySelector('.lazy-placeholder');
  if (placeholder) {
    placeholder.querySelector('p').textContent = '로딩 중...';
    placeholder.querySelector('.lazy-spinner').style.display = 'block';
  }
  
  // 비동기 렌더링 (브라우저 블로킹 방지)
  setTimeout(() => {
    // 기존 컨텐츠 제거
    contentEl.innerHTML = '';
    
    // 새 컨텐츠 렌더링
    renderSectionContent(contentEl, obj, path, options);
    
    // 로드 완료 표시
    contentEl.dataset.loaded = 'true';
    delete contentEl.dataset.lazyLoad;
  }, 50); // 50ms 지연으로 브라우저 숙쉴 시간 제공
}

/**
 * 단순 필드를 위한 카드 섹션 생성 (템플릿용)
 * @param {string} key - 필드 키
 * @param {any} value - 필드 값
 * @param {string} path - 필드 경로
 * @param {object} options - 옵션
 * @returns {HTMLElement} 섹션 요소
 */
function createSimpleFieldSection(key, value, path, options = {}) {
  const template = document.getElementById("configSectionTemplate");
  if (!template) {
    return createDynamicField(key, value, path, options); // 폴백
  }

  const clone = template.content.cloneNode(true);
  const wrapper = document.createElement("div");
  wrapper.appendChild(clone);
  const section = wrapper.querySelector(".config-section");

  if (!section) {
    return createDynamicField(key, value, path, options);
  }

  // 섹션 제목
  const titleEl = section.querySelector(".section-title");
  if (titleEl) {
    titleEl.textContent = key;
  }

  // 섹션 내용
  const contentEl = section.querySelector(".section-content");
  if (contentEl) {
    const field = createDynamicField(key, value, path, options);
    if (field) {
      // 필드를 섹션 컨텐츠에 넣고, 레이블은 숨김
      if (field.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        const wrapper = document.createElement("div");
        wrapper.appendChild(field);
        // 레이블 숨김
        const label = wrapper.querySelector(".field-label");
        if (label) label.style.display = "none";
        contentEl.appendChild(wrapper);
      } else {
        const label = field.querySelector(".field-label");
        if (label) label.style.display = "none";
        contentEl.appendChild(field);
      }
    }
  }

  // 토글 기능
  const header = section.querySelector(".section-header");
  const toggle = section.querySelector(".toggle");
  if (header && toggle && contentEl) {
    header.onclick = (e) => {
      if (e.target.classList.contains("btn")) return;
      
      const isExpanded = contentEl.classList.contains("expanded");
      if (isExpanded) {
        contentEl.classList.remove("expanded");
        toggle.textContent = "▶";
      } else {
        contentEl.classList.add("expanded");
        toggle.textContent = "▼";
      }
    };
  }

  // 삭제 버튼 숨김 (템플릿용)
  const deleteBtn = section.querySelector(".section-delete-btn");
  if (deleteBtn) {
    deleteBtn.style.display = "none";
  }

  wrapper.removeChild(section);
  return section;
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
      // 중첩 객체는 일반 편집과 동일하게 처리
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

  // 삭제 버튼 이벤트 - 호버 시에만 표시
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

  // 삭제 버튼 이벤트 - 호버 시에만 표시
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
 * 체크박스 필드 생성 (가로 배치)
 * @param {string} key - 필드 키
 * @param {boolean} value - 필드 값
 * @param {string} path - 필드 경로
 * @param {object} options - 옵션 {isTemplate: boolean}
 * @returns {HTMLElement} 체크박스 필드 요소
 */
function createCheckboxField(key, value, path, options = {}) {
  const fieldGroup = document.createElement('div');
  fieldGroup.className = 'field-checkbox-group';
  
  // 레이블
  const label = document.createElement('label');
  label.className = 'field-label';
  label.textContent = key;
  label.setAttribute('for', `checkbox_${path.replace(/\./g, '_')}`);
  
  // 체크박스
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'field-checkbox';
  checkbox.id = `checkbox_${path.replace(/\./g, '_')}`;
  checkbox.checked = value;
  
  checkbox.addEventListener('change', () => {
    if (options.isTemplate) {
      updateTemplateValue(path, checkbox.checked);
    } else {
      updateConfigValue(path, checkbox.checked);
    }
  });
  
  // 삭제 버튼
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-danger btn-mini field-delete-btn';
  deleteBtn.textContent = '삭제';
  
  if (options.isTemplate) {
    deleteBtn.style.display = 'none';
  } else {
    deleteBtn.onclick = () => {
      AppUtils.showConfirmDialog(`'${key}' 필드를 삭제하시겠습니까?`, () =>
        deleteField(path)
      );
    };
  }
  
  fieldGroup.appendChild(label);
  fieldGroup.appendChild(checkbox);
  fieldGroup.appendChild(deleteBtn);
  
  return fieldGroup;
}

/**
 * 배열 필드 생성 (테이블 스타일, 가로 배치)
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
  
  // 배열 필드 클래스 추가
  fieldGroup.classList.add('array-field');

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

  // 삭제 버튼 - 호버 시에만 표시
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
 * 중첩 객체 필드 생성 (카드 섹션 통일)
 * @param {string} key - 필드 키
 * @param {object} obj - 객체 값
 * @param {string} path - 필드 경로
 * @param {object} options - 옵션
 * @returns {HTMLElement} 중첩 객체 필드 요소
 */
function createNestedObjectField(key, obj, path, options = {}) {
  // createConfigSection과 동일한 카드 섹션 사용
  return createConfigSection(key, obj, path, options);
}

// createPropertyRow 함수 제거 - 더 이상 사용되지 않음

/**
 * 저장되지 않은 변경사항 UI 업데이트
 */
function updateUnsavedChangesUI() {
  const title = document.querySelector('title');
  const serverTitle = document.getElementById('currentServerTitle');
  
  if (hasUnsavedChanges) {
    if (title) title.textContent = '* EzTalk 설정 관리자';
    if (serverTitle && currentServer) {
      serverTitle.textContent = `* ${currentServer.name}${currentServer.latestFile ? ` - ${currentServer.latestFile}` : ''}`;
    }
  } else {
    if (title) title.textContent = 'EzTalk 설정 관리자';
    if (serverTitle && currentServer) {
      serverTitle.textContent = `${currentServer.name}${currentServer.latestFile ? ` - ${currentServer.latestFile}` : ''}`;
    }
  }
}

/**
 * 변경사항 표시 및 경고 설정
 */
function markAsChanged() {
  if (!hasUnsavedChanges) {
    hasUnsavedChanges = true;
    updateUnsavedChangesUI();
    console.log('변경사항 감지: 페이지 나가기 경고 활성화');
  }
}

/**
 * 현재 설정 설정 시 변경사항 플래그 초기화
 */
function resetChangeTracking() {
  if (hasUnsavedChanges) {
    hasUnsavedChanges = false;
    updateUnsavedChangesUI();
    console.log('새 설정 로드: 페이지 나가기 경고 비활성화');
  }
}

/**
 * 키 순서를 보존하며 객체에 새 프로퍼티 추가
 * @param {object} obj - 대상 객체
 * @param {string} key - 추가할 키
 * @param {any} value - 값
 * @param {Array} keyOrder - 키 순서 배열
 */
function setPropertyPreservingOrder(obj, key, value, keyOrder) {
  if (key in obj) {
    // 기존 키인 경우 단순 대입
    obj[key] = value;
  } else {
    // 새 키인 경우 순서 보존하여 추가
    const newObj = {};
    
    // 1. 기존 keyOrder에 있는 키들 먼저
    if (keyOrder) {
      keyOrder.forEach(orderedKey => {
        if (orderedKey in obj) {
          newObj[orderedKey] = obj[orderedKey];
        }
      });
    }
    
    // 2. keyOrder에 없는 기존 키들
    Object.keys(obj).forEach(objKey => {
      if (!keyOrder || !keyOrder.includes(objKey)) {
        newObj[objKey] = obj[objKey];
      }
    });
    
    // 3. 새 키 추가
    newObj[key] = value;
    
    // 4. 원본 객체의 모든 프로퍼티 삭제 후 새 객체로 복사
    Object.keys(obj).forEach(key => delete obj[key]);
    Object.assign(obj, newObj);
    
    // 5. configKeyOrder 업데이트
    if (keyOrder && obj === currentConfig) {
      configKeyOrder = [...(keyOrder || []), key].filter((k, i, arr) => arr.indexOf(k) === i);
    }
  }
}

/**
 * 설정 값 업데이트 (키 순서 보존)
 * @param {string} path - 설정 경로
 * @param {any} value - 새 값
 */
function updateConfigValue(path, value) {
  if (!currentConfig) return;

  const keys = path.split(".");
  let current = currentConfig;
  let currentKeyOrder = configKeyOrder;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (key.includes("[") && key.includes("]")) {
      const [arrayKey, indexStr] = key.split("[");
      const index = parseInt(indexStr.replace("]", ""));
      current = current[arrayKey][index];
      currentKeyOrder = null; // 배열 내부는 순서 공지 없음
    } else {
      current = current[key];
      currentKeyOrder = null; // 중첩 객체는 순서 공지 없음
    }
  }

  const finalKey = keys[keys.length - 1];
  if (finalKey.includes("[") && finalKey.includes("]")) {
    const [arrayKey, indexStr] = finalKey.split("[");
    const index = parseInt(indexStr.replace("]", ""));
    current[arrayKey][index] = value;
  } else {
    // 최상위 레벨인 경우에만 키 순서 보존
    if (current === currentConfig && keys.length === 1) {
      setPropertyPreservingOrder(current, finalKey, value, configKeyOrder);
    } else {
      current[finalKey] = value;
    }
  }
  
  // 변경사항 표시
  markAsChanged();

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
  
  // 변경사항 표시
  markAsChanged();

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

/**
 * 저장 완료 표시
 */
function markAsSaved() {
  if (hasUnsavedChanges) {
    hasUnsavedChanges = false;
    updateUnsavedChangesUI();
    console.log('변경사항 저장됨: 페이지 나가기 경고 비활성화');
  }
}

/**
 * 변경사항 여부 확인
 */
function hasChanges() {
  return hasUnsavedChanges;
}

// 내보내기
window.ConfigEditor = {
  setCurrentConfig,
  getCurrentConfig,
  updateServerInfo,
  clearConfigEditor,
  renderConfigEditor,
  renderTemplateEditor,
  addSelectedTemplateItems,
  parseJsonWithOrder,
  getDefaultKeyOrder,
  markAsSaved,
  hasChanges,

  // 동적 폼 생성 함수들
  createDynamicForm,
  createConfigSection,
  createSimpleFieldSection,

  // 필드 생성 함수들
  createTextField,
  createNumberField,
  createCheckboxField,
  createArrayField,
  createNestedObjectField,
  updateTemplateValue,
};
