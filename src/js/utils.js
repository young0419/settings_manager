/**
 * 공통 유틸리티 함수들
 */

// DOM 요소 캐시
const elements = {
  emptyServerState: () => document.getElementById("emptyServerState"),
  loadingState: () => document.getElementById("loadingState"),
  serverListContainer: () => document.getElementById("serverListContainer"),
  workingDirectory: () => document.getElementById("workingDirectory"),
  configEditor: () => document.getElementById("configEditor"),
  currentServerTitle: () => document.getElementById("currentServerTitle"),
  currentServerPath: () => document.getElementById("currentServerPath"),
  changeLogBtn: () => document.getElementById("changeLogBtn"),
  saveBtn: () => document.getElementById("saveBtn"),
  statusText: () => document.getElementById("statusText"),
  notification: () => document.getElementById("notification"),
};

/**
 * 상태 메시지 업데이트
 * @param {string} message - 표시할 메시지
 */
function updateStatus(message) {
  const statusEl = elements.statusText();
  if (statusEl) {
    statusEl.textContent = message;
    console.log("상태:", message);
  }
}

/**
 * 알림 표시
 * @param {string} message - 알림 메시지
 * @param {string} type - 알림 타입 (success, error, warning)
 */
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

/**
 * 로딩 상태 표시/숨김
 * @param {boolean} show - 로딩 표시 여부
 */
function showLoadingState(show) {
  const loadingEl = elements.loadingState();
  if (loadingEl) {
    loadingEl.style.display = show ? "block" : "none";
  }
}

/**
 * 필드 라벨 포맷팅 (camelCase를 읽기 좋은 형태로 변환)
 * @param {string} key - 필드 키
 * @returns {string} 포맷된 라벨
 */
function formatFieldLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * 카테고리 이름 생성 (동적)
 * @param {string} key - 키 이름
 * @returns {string} 카테고리 이름
 */
function getCategoryName(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * 값 포맷팅
 * @param {any} value - 포맷할 값
 * @returns {string} 포맷된 문자열
 */
function formatValue(value) {
  if (typeof value === "string") {
    return `"${value}"`;
  } else if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  } else {
    return String(value);
  }
}

/**
 * 기본 템플릿 반환
 * @returns {object} 기본 템플릿 객체
 */
function getDefaultTemplate() {
  return {
    defaultCompanyId: "",
    multiCompany: false,
    useIPPermit: false,
    checkPushToken: true,
    logoutAfter: 14,
  };
}

/**
 * Tauri API 안전 로딩
 * @returns {Promise<boolean>} Tauri 로딩 성공 여부
 */
function waitForTauri() {
  return new Promise((resolve) => {
    const checkTauri = () => {
      if (window.__TAURI__) {
        const invokeFunc =
          window.__TAURI__.invoke ||
          window.__TAURI__.core?.invoke ||
          window.__TAURI__.tauri?.invoke;

        if (invokeFunc) {
          console.log("Tauri API 로드 완료");
          window.globalInvoke = invokeFunc; // 전역으로 저장
          resolve(invokeFunc);
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

/**
 * 변경사항 감지
 * @param {object} original - 원본 객체
 * @param {object} current - 현재 객체
 * @param {string} path - 경로
 * @returns {Array} 변경사항 배열
 */
function detectChanges(original, current, path = "") {
  const changes = [];

  // 현재 객체의 모든 키 확인
  for (const key in current) {
    const currentPath = path ? `${path}.${key}` : key;

    if (!(key in original)) {
      // 새로 추가된 필드
      changes.push({
        type: "added",
        path: currentPath,
        newValue: current[key],
      });
    } else if (
      typeof current[key] === "object" &&
      current[key] !== null &&
      !Array.isArray(current[key])
    ) {
      // 중첩 객체인 경우 재귀 호출
      if (typeof original[key] === "object" && original[key] !== null) {
        changes.push(
          ...detectChanges(original[key], current[key], currentPath)
        );
      } else {
        changes.push({
          type: "modified",
          path: currentPath,
          oldValue: original[key],
          newValue: current[key],
        });
      }
    } else if (JSON.stringify(original[key]) !== JSON.stringify(current[key])) {
      // 값이 변경된 경우
      changes.push({
        type: "modified",
        path: currentPath,
        oldValue: original[key],
        newValue: current[key],
      });
    }
  }

  // 삭제된 필드 확인
  for (const key in original) {
    if (!(key in current)) {
      const currentPath = path ? `${path}.${key}` : key;
      changes.push({
        type: "deleted",
        path: currentPath,
        oldValue: original[key],
      });
    }
  }

  return changes;
}

/**
 * 커스텀 확인 대화상자 표시
 * @param {string} message - 표시할 메시지
 * @param {Function} onConfirm - 확인 콜백
 * @param {Function} onCancel - 취소 콜백
 */
function showConfirmDialog(message, onConfirm, onCancel = null) {
  // 기존 대화상자가 있으면 제거
  const existingDialog = document.getElementById('customConfirmDialog');
  if (existingDialog) {
    existingDialog.remove();
  }

  // 대화상자 HTML 생성
  const dialogHTML = `
    <div id="customConfirmDialog" class="modal" style="display: block;">
      <div class="modal-content" style="width: 400px; max-width: 90vw;">
        <div class="modal-header">
          <h3>확인</h3>
        </div>
        <div style="padding: 1rem;">
          <p>${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="confirmCancel">취소</button>
          <button class="btn btn-danger" id="confirmOk">확인</button>
        </div>
      </div>
    </div>
  `;

  // 대화상자를 바디에 추가
  document.body.insertAdjacentHTML('beforeend', dialogHTML);

  const dialog = document.getElementById('customConfirmDialog');
  const cancelBtn = document.getElementById('confirmCancel');
  const okBtn = document.getElementById('confirmOk');

  // 이벤트 리스너 추가
  cancelBtn.onclick = () => {
    dialog.remove();
    if (onCancel) onCancel();
  };

  okBtn.onclick = () => {
    dialog.remove();
    if (onConfirm) onConfirm();
  };

  // 배경 클릭시 닫기
  dialog.onclick = (e) => {
    if (e.target === dialog) {
      dialog.remove();
      if (onCancel) onCancel();
    }
  };

  // ESC 키로 닫기
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      dialog.remove();
      document.removeEventListener('keydown', handleEsc);
      if (onCancel) onCancel();
    }
  };
  document.addEventListener('keydown', handleEsc);
}

// 내보내기
window.AppUtils = {
  elements,
  updateStatus,
  showNotification,
  showLoadingState,
  formatFieldLabel,
  getCategoryName,
  formatValue,
  getDefaultTemplate,
  waitForTauri,
  detectChanges,
  showConfirmDialog
};
