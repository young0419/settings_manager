/**
 * 서버 설정 파일 원본 JSON 문자열 읽기
 * @param {string} serverName - 서버 이름
 * @returns {Promise<string>} JSON 문자열
 */
async function getServerConfigJsonString(serverName) {
  try {
    const content = await invoke("get_latest_server_config", {
      baseDirectory: workingDirectory,
      serverName: serverName,
    });
    return content;
  } catch (error) {
    console.error("JSON 문자열 읽기 오류:", error);
    return null;
  }
}

/**
 * 서버 및 파일 관리 관련 함수들
 */

// 전역 변수
let invoke = null;
let serverList = [];
let workingDirectory = "";
let templateConfig = null;
let changeLog = [];

/**
 * Tauri invoke 함수 설정
 * @param {Function} invokeFunc - Tauri invoke 함수
 */
function setInvokeFunction(invokeFunc) {
  invoke = invokeFunc;
}

/**
 * 작업 디렉토리 초기화
 */
async function initializeWorkingDirectory() {
  try {
    workingDirectory = await invoke("get_default_config_path");
    const pathEl = AppUtils.elements.workingDirectory();
    if (pathEl) {
      const pathValue = pathEl.querySelector(".path-value");
      if (pathValue) pathValue.textContent = workingDirectory;
    }
    return workingDirectory;
  } catch (error) {
    console.error("작업 디렉토리 초기화 오류:", error);
    throw error;
  }
}

/**
 * 마스터 템플릿 로드
 */
async function loadTemplate() {
  try {
    const content = await invoke("get_template_config");
    templateConfig = JSON.parse(content);
    AppUtils.updateStatus("마스터 템플릿을 로드했습니다.");
    return templateConfig;
  } catch (error) {
    console.warn("템플릿 로드 실패:", error);
    templateConfig = AppUtils.getDefaultTemplate();
    return templateConfig;
  }
}

/**
 * 서버 목록 새로고침
 */
async function refreshServerList() {
  AppUtils.showLoadingState(true);

  try {
    const servers = await invoke("list_servers", {
      directory: workingDirectory,
    });

    serverList = servers.map((serverName) => ({
      name: serverName,
    }));

    AppUtils.updateStatus(`${servers.length}개의 서버를 찾았습니다.`);
    return serverList;
  } catch (error) {
    console.error("서버 목록 로드 오류:", error);
    serverList = [];
    AppUtils.updateStatus("서버를 찾을 수 없습니다.");
    return [];
  } finally {
    AppUtils.showLoadingState(false);
  }
}

/**
 * 서버 설정 파일 읽기
 * @param {object} server - 서버 정보
 * @returns {Promise<object>} 서버 설정과 메타데이터
 */
async function loadServerConfig(server) {
  try {
    AppUtils.updateStatus("설정 파일을 읽는 중...");

    // 최신 설정 파일 정보 가져오기
    let latestFile = "";
    let fileCount = 0;

    try {
      const files = await invoke("list_server_files", {
        baseDirectory: workingDirectory,
        serverName: server.name,
      });

      fileCount = files.length;
      if (files.length > 0) {
        latestFile = files[0]; // 가장 최신 파일 (이미 정렬됨)
      }
    } catch (e) {
      console.warn("파일 목록 가져오기 실패:", e);
    }

    const content = await invoke("get_latest_server_config", {
      baseDirectory: workingDirectory,
      serverName: server.name,
    });

    const config = JSON.parse(content);
    
    // 서버 정보 업데이트
    server.latestFile = latestFile;
    server.fileCount = fileCount;

    AppUtils.updateStatus("설정 파일을 성공적으로 로드했습니다.");
    
    return {
      server,
      config,
      originalConfig: JSON.parse(content) // 원본 저장
    };
  } catch (error) {
    console.error("파일 읽기 오류:", error);
    AppUtils.showNotification("설정 파일을 읽을 수 없습니다: " + error, "error");
    AppUtils.updateStatus("파일 읽기 실패");
    throw error;
  }
}

/**
 * 서버 설정 저장
 * @param {object} server - 서버 정보
 * @param {object} config - 설정 객체
 * @param {object} originalConfig - 원본 설정 (변경 감지용)
 */
async function saveServerConfig(server, config, originalConfig) {
  try {
    AppUtils.updateStatus("설정을 저장하는 중...");

    // 변경사항 감지
    const changes = AppUtils.detectChanges(originalConfig, config);

    const result = await invoke("save_server_config", {
      baseDirectory: workingDirectory,
      serverName: server.name,
      content: JSON.stringify(config, null, 2),
    });

    // 변경 로그 추가
    if (changes.length > 0) {
      const logEntry = {
        timestamp: new Date().toLocaleString("ko-KR"),
        server: server.name,
        file: result.match(/([^\\]+\.json)$/)?.[1] || "unknown",
        changes: changes,
      };
      changeLog.unshift(logEntry); // 최신 로그를 앞에 추가

      // 로그를 파일로 저장
      await saveChangeLog(logEntry, server.name);
    }

    AppUtils.showNotification("설정이 성공적으로 저장되었습니다!");
    AppUtils.updateStatus(result);
    
    return result;
  } catch (error) {
    console.error("저장 오류:", error);
    AppUtils.showNotification("저장 중 오류가 발생했습니다: " + error, "error");
    AppUtils.updateStatus("저장 실패");
    throw error;
  }
}

/**
 * 새 서버 생성
 * @param {string} serverName - 서버 이름
 * @param {boolean} useTemplate - 템플릿 사용 여부
 */
async function createNewServer(serverName, useTemplate = true) {
  try {
    AppUtils.updateStatus("새 서버를 생성하는 중...");
    const result = await invoke("create_new_server", {
      baseDirectory: workingDirectory,
      serverName: serverName,
      useTemplate: useTemplate,
    });

    AppUtils.showNotification(`${serverName} 서버가 생성되었습니다!`);
    AppUtils.updateStatus(result);
    return result;
  } catch (error) {
    console.error("서버 생성 오류:", error);
    AppUtils.showNotification("서버 생성 중 오류가 발생했습니다: " + error, "error");
    AppUtils.updateStatus("서버 생성 실패");
    throw error;
  }
}

/**
 * 템플릿 저장
 * @param {object} template - 템플릿 객체
 */
async function saveTemplate(template) {
  try {
    AppUtils.updateStatus("마스터 템플릿을 저장하는 중...");
    await invoke("save_template_config", {
      content: JSON.stringify(template, null, 2),
    });

    templateConfig = template;
    AppUtils.showNotification("마스터 템플릿이 저장되었습니다!");
    AppUtils.updateStatus("템플릿 저장 완료");
  } catch (error) {
    console.error("템플릿 저장 오류:", error);
    AppUtils.showNotification("템플릿 저장 중 오류가 발생했습니다: " + error, "error");
    AppUtils.updateStatus("템플릿 저장 실패");
    throw error;
  }
}

/**
 * 변경 로그 저장
 * @param {object} logEntry - 로그 항목
 * @param {string} serverName - 서버 이름
 */
async function saveChangeLog(logEntry, serverName) {
  try {
    const logFileName = `changelog_${serverName}.log`;
    const logPath = `${workingDirectory}\\${serverName}\\${logFileName}`;

    // 로그 항목을 사람이 읽기 좋은 문자열로 변환
    const timestamp = logEntry.timestamp;
    const changesText = logEntry.changes
      .map((change) => {
        switch (change.type) {
          case "added":
            return `추가됨: ${change.path} = ${JSON.stringify(change.newValue)}`;
          case "modified":
            return `변경됨: ${change.path} ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`;
          case "deleted":
            return `삭제됨: ${change.path} (기존값: ${JSON.stringify(change.oldValue)})`;
          default:
            return "";
        }
      })
      .join("; ");

    const fullLogLine = `[${timestamp}] 서버: ${logEntry.server}, 파일: ${logEntry.file}, 변경사항: ${changesText}`;

    // Rust 쪽에 한 줄 추가 요청
    await invoke("append_log_file", {
      filePath: logPath,
      logEntry: fullLogLine,
    });
  } catch (error) {
    console.error("로그 저장 실패:", error);
  }
}

/**
 * 변경 로그 읽기
 * @param {string} serverName - 서버 이름
 * @returns {Promise<string>} 로그 내용
 */
async function loadChangeLog(serverName) {
  try {
    const logFileName = `changelog_${serverName}.log`;
    const logPath = `${workingDirectory}\\${serverName}\\${logFileName}`;

    const content = await invoke("read_log_file", { filePath: logPath });
    return content;
  } catch (error) {
    console.error("로그 파일 읽기 실패:", error);
    return null;
  }
}

/**
 * 현재 설정에 없는 템플릿 항목들 찾기
 * @param {object} currentConfig - 현재 설정
 * @returns {Array} 누락된 항목들
 */
function findMissingTemplateItems(currentConfig) {
  if (!templateConfig || !currentConfig) {
    return [];
  }

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

// 내보내기
window.ServerManager = {
  setInvokeFunction,
  initializeWorkingDirectory,
  loadTemplate,
  refreshServerList,
  loadServerConfig,
  getServerConfigJsonString, // 추가
  saveServerConfig,
  createNewServer,
  saveTemplate,
  loadChangeLog,
  findMissingTemplateItems,
  
  // 데이터 접근자
  getServerList: () => serverList,
  getWorkingDirectory: () => workingDirectory,
  getTemplateConfig: () => templateConfig,
  getChangeLog: () => changeLog
};
