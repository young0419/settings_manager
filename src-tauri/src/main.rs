#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use std::fs;
use std::path::Path;
use serde_json::{Value, from_str, to_string_pretty};
use tauri::command;
use chrono::Utc;

#[command]
fn read_json_file(file_path: String) -> Result<String, String> {
    match fs::read_to_string(&file_path) {
        Ok(content) => {
            // JSON 유효성 검사
            match from_str::<Value>(&content) {
                Ok(_) => Ok(content),
                Err(e) => Err(format!("JSON 파싱 오류: {}", e))
            }
        },
        Err(e) => Err(format!("파일 읽기 오류: {}", e))
    }
}

#[command]
fn write_json_file(file_path: String, content: String) -> Result<String, String> {
    // JSON 유효성 검사
    match from_str::<Value>(&content) {
        Ok(json_value) => {
            // 예쁜 형태로 포맷팅
            let formatted = to_string_pretty(&json_value).unwrap();
            
            // 디렉토리 확인 및 생성
            if let Some(parent) = Path::new(&file_path).parent() {
                if let Err(e) = fs::create_dir_all(parent) {
                    return Err(format!("디렉토리 생성 오류: {}", e));
                }
            }
            
            match fs::write(&file_path, formatted) {
                Ok(_) => Ok("파일이 성공적으로 저장되었습니다.".to_string()),
                Err(e) => Err(format!("파일 쓰기 오류: {}", e))
            }
        },
        Err(e) => Err(format!("JSON 유효성 검사 실패: {}", e))
    }
}

#[command]
fn list_json_files(directory: String) -> Result<Vec<String>, String> {
    match fs::read_dir(&directory) {
        Ok(entries) => {
            let mut json_files = Vec::new();
            for entry in entries.flatten() {  // ← 수정!
                let path = entry.path();
                if let Some(extension) = path.extension() {
                    if extension == "json" {
                        if let Some(file_name) = path.file_name() {
                            json_files.push(file_name.to_string_lossy().to_string());
                        }
                    }
                }
            }
            Ok(json_files)
        },
        Err(e) => Err(format!("디렉토리 읽기 오류: {}", e))
    }
}

#[command]
fn get_default_config_path() -> String {
    if cfg!(target_os = "windows") {
        format!("{}\\json-configs", std::env::var("USERPROFILE").unwrap_or_default())
    } else {
        format!("{}/json-configs", std::env::var("HOME").unwrap_or_default())
    }
}

#[command]
fn backup_config(file_path: String) -> Result<String, String> {
    let backup_path = format!("{}.backup.{}", file_path, Utc::now().format("%Y%m%d_%H%M%S"));
    
    match fs::copy(&file_path, &backup_path) {
        Ok(_) => Ok(format!("백업 생성: {}", backup_path)),
        Err(e) => Err(format!("백업 생성 실패: {}", e))
    }
}

#[command]
fn get_template_config() -> Result<String, String> {
    let template_path = if cfg!(target_os = "windows") {
        format!("{}\\json-configs\\template.json", std::env::var("USERPROFILE").unwrap_or_default())
    } else {
        format!("{}/json-configs/template.json", std::env::var("HOME").unwrap_or_default())
    };
    
    match fs::read_to_string(&template_path) {
        Ok(content) => {
            match from_str::<Value>(&content) {
                Ok(_) => Ok(content),
                Err(e) => Err(format!("템플릿 JSON 파싱 오류: {}", e))
            }
        },
        Err(_) => {
            // 템플릿 파일이 없으면 기본 템플릿 생성
            let default_template = r#"{
  "defaultCompanyId": "s907000",
  "multiCompany": false,
  "useIPPermit": false,
  "ipCheckUrl": "https://gwapp.ktbizoffice.com/checkIP.aspx",
  "useEmoticBox": false,
  "checkPushToken": true,
  "logoutAfter": 14,
  "appDownloadPage": "https://mekp.kaoni.com/app/down.html",
  "androidDownloadUri": "https://dl.dropboxusercontent.com/s/pjguee7ul9ln0bn/ezTalk30.apk",
  "iOSDownloadUri": "itms-services://?action=download-manifest&amp;url=https://dl.dropboxusercontent.com/s/uhqt7n0dbvbt6ve/ezTalk30.plist",
  "ssoUrl": "https://lab-gwx.kaoni.com/ezTalkGate.aspx",
  "ssoNonce": false,
  "blockScreenCapture": false,
  "pcScreenCapture": true,
  "notiCheckTime": 120,
  "updatedMemberRequestTime": 60,
  "zoomCompanyId": "",
  "kaoniConference": "",
  "useFold": true,
  "timeZone": 540,
  "useTimeZone": true,
  "escToTray": true,
  "readUpToCount": 5,
  "maxReadUpToCount": 250,
  "admin": {
    "server": "svr",
    "sysAdmin": "__sys_admin__"
  },
  "canary": {
    "reply": {
      "domain": "kaoni",
      "enabled": true
    },
    "sticker": {
      "domain": "kaoni",
      "enabled": true
    },
    "attachFileMobile": {
      "domain": "kaoni,withkt",
      "enabled": true
    },
    "aiSummary": {
      "domain": "kaoni",
      "enabled": true
    },
    "useBackgroundColor": {
      "domain": "kaoni",
      "enabled": true
    },
    "category": {
      "domain": "kaoni,withkt",
      "enabled": true
    },
    "useUrlPreview": {
      "domain": "kaoni,withkt",
      "enabled": true
    }
  },
  "login": {
    "showEnteredUserId": true,
    "checkFailCount": false,
    "lidToUid": false,
    "autoLogin": false,
    "showAutoLogin": true,
    "autoStart": true,
    "showAutoStart": true,
    "lowerCase": true,
    "minInputId": 0,
    "maxInputId": 20,
    "minInputPassword": 0,
    "maxInputPassword": 30,
    "showBottomMessage": true,
    "bottomMessage": "STR_M_LOGIN_BOTTOM"
  },
  "menu": {
    "menuTop": [
      {"key": "group", "name1": "STR_M_GROUP"},
      {"key": "talk", "name1": "STR_M_ROOM"},
      {"key": "org", "name1": "STR_M_ORG"}
    ],
    "menuBottom": [
      {"key": "companyNotice", "name1": "STR_M_COMPANY_NOTICE"},
      {"key": "timeCard", "name1": "STR_M_TIME_CARD"},
      {"key": "email", "name1": "STR_M_MAIL_BOX"}
    ]
  },
  "message": {
    "attachFile": "Y",
    "saveFile": "Y",
    "attachImage": "Y",
    "reply": true,
    "useSticker": true,
    "aiSummary": false,
    "useUrlPreview": true
  }
}"#;
            
            // 디렉토리 생성
            if let Some(parent) = std::path::Path::new(&template_path).parent() {
                let _ = fs::create_dir_all(parent);
            }
            
            // 기본 템플릿 파일 생성
            match fs::write(&template_path, default_template) {
                Ok(_) => Ok(default_template.to_string()),
                Err(e) => Err(format!("템플릿 파일 생성 오류: {}", e))
            }
        }
    }
}

#[command]
fn save_template_config(content: String) -> Result<String, String> {
    let template_path = if cfg!(target_os = "windows") {
        format!("{}\\json-configs\\template.json", std::env::var("USERPROFILE").unwrap_or_default())
    } else {
        format!("{}/json-configs/template.json", std::env::var("HOME").unwrap_or_default())
    };
    
    // JSON 유효성 검사
    match from_str::<Value>(&content) {
        Ok(json_value) => {
            let formatted = to_string_pretty(&json_value).unwrap();
            
            match fs::write(&template_path, formatted) {
                Ok(_) => Ok("마스터 템플릿이 저장되었습니다.".to_string()),
                Err(e) => Err(format!("템플릿 저장 오류: {}", e))
            }
        },
        Err(e) => Err(format!("JSON 유효성 검사 실패: {}", e))
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_json_file,
            write_json_file,
            list_json_files,
            get_default_config_path,
            backup_config,
            get_template_config,
            save_template_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}