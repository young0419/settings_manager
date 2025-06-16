/**
 * 절대적으로 안전한 JSON 키 순서 보존 시스템
 * 이 모듈은 JSON 키 순서가 100% 보존됨을 보장합니다.
 */

/**
 * 절대적으로 안전한 키 순서 보존 JSON 문자열 생성
 * @param {object} obj - 객체
 * @param {Array} keyOrder - 키 순서 배열 (필수)
 * @param {number} indent - 들여쓰기
 * @returns {string} 순서가 100% 보장된 JSON 문자열
 */
function stringifyWithAbsoluteOrder(obj, keyOrder, indent = 2) {
  // 절대 안전장치 1: keyOrder가 없으면 에러
  if (!keyOrder || !Array.isArray(keyOrder)) {
    throw new Error('CRITICAL: keyOrder는 필수입니다. JSON 순서를 보장할 수 없습니다!');
  }
  
  // 절대 안전장치 2: 수동으로 키 순서 재구성
  const orderedObj = {};
  const objKeys = Object.keys(obj);
  
  console.log('🔒 키 순서 보존 시작:');
  console.log('  - 원본 객체 키:', objKeys.slice(0, 10));
  console.log('  - 요구 순서:', keyOrder.slice(0, 10));
  
  // 1단계: keyOrder에 있는 키들을 정확한 순서로 추가
  keyOrder.forEach((orderedKey, index) => {
    if (orderedKey in obj) {
      orderedObj[orderedKey] = obj[orderedKey];
      console.log(`  ✓ [${index}] ${orderedKey} 추가됨`);
    } else {
      console.log(`  ⚠️ [${index}] ${orderedKey} 객체에 없음 (삭제된 키)`);
    }
  });
  
  // 2단계: keyOrder에 없는 새 키들을 마지막에 추가
  const missingKeys = objKeys.filter(key => !keyOrder.includes(key));
  if (missingKeys.length > 0) {
    console.log('  🆕 새로 추가된 키들:', missingKeys);
    missingKeys.forEach(key => {
      orderedObj[key] = obj[key];
      console.log(`  ✓ [추가] ${key} 추가됨`);
    });
  }
  
  // 3단계: 최종 검증
  const finalKeys = Object.keys(orderedObj);
  console.log('  📋 최종 키 순서:', finalKeys.slice(0, 10));
  
  // 절대 안전장치 3: 키 개수 검증
  if (finalKeys.length !== objKeys.length) {
    throw new Error(`CRITICAL: 키 개수 불일치! 원본: ${objKeys.length}, 결과: ${finalKeys.length}`);
  }
  
  // 절대 안전장치 4: 모든 키 존재 검증
  objKeys.forEach(key => {
    if (!(key in orderedObj)) {
      throw new Error(`CRITICAL: 키 '${key}'가 결과에서 누락됨!`);
    }
  });
  
  console.log('  ✅ 키 순서 보존 완료');
  
  // JSON 문자열 생성
  const jsonString = JSON.stringify(orderedObj, null, indent);
  
  // 절대 안전장치 5: 재파싱 검증
  try {
    const reparsed = JSON.parse(jsonString);
    const reparsedKeys = Object.keys(reparsed);
    
    // 순서 검증
    const expectedOrder = [...keyOrder.filter(k => objKeys.includes(k)), ...missingKeys];
    const orderMatches = expectedOrder.every((key, index) => key === reparsedKeys[index]);
    
    if (!orderMatches) {
      console.error('🚨 순서 검증 실패:');
      console.error('  예상:', expectedOrder.slice(0, 10));
      console.error('  실제:', reparsedKeys.slice(0, 10));
      throw new Error('CRITICAL: JSON 키 순서 보존에 실패했습니다!');
    }
    
    console.log('  ✅ JSON 문자열 검증 완료');
    return jsonString;
    
  } catch (parseError) {
    throw new Error(`CRITICAL: JSON 파싱 실패 - ${parseError.message}`);
  }
}

/**
 * 절대 안전 검증 함수 - 키 순서가 보존되었는지 확인
 * @param {string} jsonString - JSON 문자열
 * @param {Array} expectedOrder - 예상 키 순서
 * @returns {boolean} 순서가 보존되었는지 여부
 */
function verifyKeyOrderAbsolute(jsonString, expectedOrder) {
  try {
    const parsed = JSON.parse(jsonString);
    const actualOrder = Object.keys(parsed);
    
    console.log('🔍 절대 검증 시작:');
    console.log('  - 예상 순서:', expectedOrder.slice(0, 10));
    console.log('  - 실제 순서:', actualOrder.slice(0, 10));
    
    if (actualOrder.length !== expectedOrder.length) {
      console.error('🚨 키 개수 불일치:', actualOrder.length, 'vs', expectedOrder.length);
      return false;
    }
    
    for (let i = 0; i < expectedOrder.length; i++) {
      if (expectedOrder[i] !== actualOrder[i]) {
        console.error(`🚨 순서 불일치 [${i}]:`, expectedOrder[i], 'vs', actualOrder[i]);
        return false;
      }
    }
    
    console.log('✅ 절대 검증 통과 - 키 순서 100% 일치');
    return true;
    
  } catch (error) {
    console.error('🚨 검증 중 오류:', error.message);
    return false;
  }
}

// 전역으로 내보내기 (showCriticalWarning 제거)
window.SafeJSON = {
  stringifyWithAbsoluteOrder,
  verifyKeyOrderAbsolute
};

console.log('🛡️ 절대 안전 JSON 키 순서 보존 시스템 로드됨');
