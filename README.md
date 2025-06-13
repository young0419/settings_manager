# EzTalk 설정 관리자

> 사내 그룹웨어 메신저 JSON 설정을 쉽게 관리하는 데스크톱 애플리케이션

## 🎯 주요 기능

- **📁 서버별 설정 관리**: 개발/운영/스테이징 서버별 설정 파일 분리 관리
- **🔄 동적 폼 생성**: JSON 구조에 따라 자동으로 편집 가능한 UI 생성
- **📄 마스터 템플릿**: 새 서버 생성시 기본 설정 자동 적용
- **📅 날짜별 버전 관리**: 설정 저장시 날짜별 파일로 자동 관리 (동일 날짜 내 덮어쓰기)
- **🎨 직관적 UI**: 복잡한 JSON도 쉽게 편집할 수 있는 사용자 친화적 인터페이스
- **🔍 실시간 검증**: JSON 형식 오류 즉시 감지 및 알림

## 🏗️ 기술 스택

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Rust (Tauri Framework)
- **UI Framework**: Custom CSS with Modern Design
- **File Management**: Native File System API

## 📦 설치 및 실행

### 요구사항

- Node.js 18+
- Rust 1.70+
- Tauri CLI

### 개발 환경 설정

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

### 프로덕션 빌드

```bash
# 애플리케이션 빌드
npm run build
```

빌드된 실행 파일은 `src-tauri/target/release/` 디렉토리에 생성됩니다.

## 📁 프로젝트 구조

```
eztalk-settings-manager/
├── src/
│   ├── index.html          # 메인 HTML 파일
│   ├── main.js             # 메인 JavaScript 로직
│   └── styles.css          # 스타일시트
├── src-tauri/
│   ├── src/
│   │   └── main.rs         # Rust 백엔드 로직
│   ├── Cargo.toml          # Rust 의존성
│   └── tauri.conf.json     # Tauri 설정
├── package.json            # Node.js 의존성
└── README.md               # 프로젝트 문서
```

## 🚀 사용법

### 1. 서버 추가

- **새 서버 추가** 버튼 클릭
- 서버 이름 입력 (예: 개발서버, 운영서버)
- 템플릿 사용 여부 선택
- **생성** 버튼으로 완료

### 2. 설정 편집

- 왼쪽 사이드바에서 서버 선택
- 오른쪽 패널에서 설정 값 편집
- 섹션별로 그룹화된 설정 항목들을 펼쳐서 편집
- **저장** 버튼으로 변경사항 저장

### 3. 템플릿 관리

- **마스터 템플릿 편집** 버튼 클릭
- 새 서버 생성시 기본값으로 사용될 설정 편집
- **템플릿 저장** 버튼으로 완료

## 🎨 지원되는 데이터 타입

- **문자열**: 일반 텍스트, URL 등
- **숫자**: 정수, 포트 번호 등
- **불린**: true/false 체크박스
- **배열**: 동적 추가/삭제 가능한 목록
- **객체**: 중첩된 설정 그룹 (테이블 형태)

## ⚙️ 설정 파일 구조

```json
{
  "defaultCompanyId": "company-123",
  "multiCompany": true,
  "useIPPermit": false,
  "checkPushToken": true,
  "logoutAfter": 14,
  "serverUrls": [
    "https://api.company.com/v1",
    "https://websocket.company.com:8443"
  ],
  "database": {
    "host": "db.company.local",
    "port": 5432,
    "ssl": true,
    "connectionPool": {
      "min": 5,
      "max": 100,
      "timeout": 30000
    }
  }
}
```

## 🔧 키보드 단축키

- `Ctrl + S`: 현재 설정 저장
- `Ctrl + R`: 서버 목록 새로고침

## 🛡️ 파일 관리 및 보안

- 날짜별 설정 파일 버전 관리 (YYYYMMDD 형식)
- 동일 날짜 내 여러 번 저장시 최신 내용으로 덮어쓰기
- JSON 형식 검증으로 데이터 무결성 보장
- 네트워크 경로 지원으로 팀 공유 가능

## 🐛 문제 해결

### 네트워크 경로 접근 오류

- Windows 네트워크 드라이브가 연결되어 있는지 확인
- 로컬 경로로 폴백하여 동작 계속

### JSON 파싱 오류

- 설정 파일 형식 확인
- 백업 파일에서 복원 시도

### 권한 오류

- 관리자 권한으로 실행
- 설정 파일 경로의 쓰기 권한 확인

## 📄 라이선스

사내 전용 도구입니다.

---

**EzTalk 설정 관리자**로 복잡한 JSON 설정을 쉽고 안전하게 관리하세요! 🚀
