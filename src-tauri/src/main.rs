#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::fs;
use std::path::Path;
use serde_json::{Value, from_str, to_string_pretty};
use tauri::command;
use chrono::{Local};

#[command]
fn read_log_file(file_path: String) -> Result<String, String> {
    match fs::read_to_string(&file_path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("파일 읽기 오류: {}", e)),
    }
}

#[command]
fn append_log_file(file_path: String, log_entry: String) -> Result<String, String> {
    // 기존 내용 읽기 (없으면 빈 문자열)
    let existing_content = fs::read_to_string(&file_path).unwrap_or_else(|_| "".to_string());

    // 새로운 로그 + 기존 내용 합치기
    let new_content = format!("{}\n{}", log_entry, existing_content);

    // 파일에 다시 전체 내용을 덮어쓰기
    match fs::write(&file_path, new_content) {
        Ok(_) => Ok("로그가 성공적으로 추가되었습니다.".to_string()),
        Err(e) => Err(format!("로그 저장 오류: {}", e)),
    }
}

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

// 서버 목록 조회 (루트 디렉토리의 서버 폴더들)
#[command]
fn list_servers(directory: String) -> Result<Vec<String>, String> {
    match fs::read_dir(&directory) {
        Ok(entries) => {
            let mut servers = Vec::new();
            
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(folder_name) = path.file_name() {
                        let folder_name_str = folder_name.to_string_lossy().to_string();
                        // template.json 등 파일은 제외하고 서버 폴더만
                        if !folder_name_str.ends_with(".json") {
                            servers.push(folder_name_str);
                        }
                    }
                }
            }
            
            // 이름순 정렬
            servers.sort();
            Ok(servers)
        },
        Err(e) => Err(format!("디렉토리 읽기 오류: {}", e))
    }
}

// 서버 폴더의 JSON 파일 목록 조회
#[command]
fn list_server_files(base_directory: String, server_name: String) -> Result<Vec<String>, String> {
    let server_folder = format!("{}\\{}", base_directory, server_name);
    
    match fs::read_dir(&server_folder) {
        Ok(entries) => {
            let mut files = Vec::new();
            
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(extension) = path.extension() {
                    if extension == "json" {
                        if let Some(file_name) = path.file_name() {
                            files.push(file_name.to_string_lossy().to_string());
                        }
                    }
                }
            }
            
            // 날짜 기반 정렬 (최신순)
            files.sort_by(|a, b| {
                let date_a = extract_date_from_filename(a).unwrap_or_else(|| "00000000".to_string());
                let date_b = extract_date_from_filename(b).unwrap_or_else(|| "00000000".to_string());
                
                // 날짜가 같으면 파일명 전체로 비교
                if date_a == date_b {
                    b.cmp(a)
                } else {
                    date_b.cmp(&date_a) // 최신순 (내림차순)
                }
            });
            
            Ok(files)
        },
        Err(e) => Err(format!("서버 폴더 읽기 오류: {}", e))
    }
}

// 특정 서버의 최신 설정 파일 내용 가져오기
#[command]
fn get_latest_server_config(base_directory: String, server_name: String) -> Result<String, String> {
    let server_folder = format!("{}\\{}", base_directory, server_name);
    
    match get_latest_config_file(&server_folder) {
        Ok((latest_file_path, _, _)) => {
            read_json_file(latest_file_path)
        },
        Err(e) => Err(e)
    }
}

// 특정 서버 폴더에서 최신 설정 파일 찾기
fn get_latest_config_file(server_folder: &str) -> Result<(String, String, usize), String> {
    match fs::read_dir(server_folder) {
        Ok(entries) => {
            let mut json_files = Vec::new();
            
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(extension) = path.extension() {
                    if extension == "json" {
                        if let Some(file_name) = path.file_name() {
                            let file_name_str = file_name.to_string_lossy().to_string();
                            json_files.push((file_name_str, path.to_string_lossy().to_string()));
                        }
                    }
                }
            }
            
            if json_files.is_empty() {
                return Err("설정 파일이 없습니다".to_string());
            }
            
            // 날짜 기반 정렬 (최신순)
            json_files.sort_by(|a, b| {
                let date_a = extract_date_from_filename(&a.0).unwrap_or_else(|| "00000000".to_string());
                let date_b = extract_date_from_filename(&b.0).unwrap_or_else(|| "00000000".to_string());
                
                // 날짜가 같으면 파일명 전체로 비교
                if date_a == date_b {
                    b.0.cmp(&a.0)
                } else {
                    date_b.cmp(&date_a) // 최신순 (내림차순)
                }
            });
            
            let latest = &json_files[0];
            let latest_date = extract_date_from_filename(&latest.0)
                .map(|date| format!("{}-{}-{}", &date[0..4], &date[4..6], &date[6..8]))
                .unwrap_or_default();
            
            Ok((latest.1.clone(), latest_date, json_files.len()))
        },
        Err(e) => Err(format!("폴더 읽기 오류: {}", e))
    }
}

// 파일명에서 날짜 추출 (개선된 버전)
fn extract_date_from_filename(filename: &str) -> Option<String> {
    // YYYYMMDD 패턴을 찾는 정규식
    if let Some(captures) = regex::Regex::new(r"(\d{8})")
        .ok()?
        .captures(filename) {
        if let Some(date_match) = captures.get(1) {
            let date_str = date_match.as_str();
            // 날짜 유효성 간단 검사
            let year: i32 = date_str[0..4].parse().ok()?;
            let month: i32 = date_str[4..6].parse().ok()?;
            let day: i32 = date_str[6..8].parse().ok()?;
            
            // 기본적인 날짜 유효성 검사
            if (2020..=2100).contains(&year) && (1..=12).contains(&month) && (1..=31).contains(&day) {
                return Some(date_str.to_string());
            }
        }
    }
    
    // 기존 방식도 시도 (하위 호환성)
    if let Some(underscore_pos) = filename.rfind('_') {
        if let Some(dot_pos) = filename.rfind('.') {
            let date_part = &filename[underscore_pos + 1..dot_pos];
            if date_part.len() == 8 && date_part.chars().all(|c| c.is_ascii_digit()) {
                let year: i32 = date_part[0..4].parse().ok()?;
                let month: i32 = date_part[4..6].parse().ok()?;
                let day: i32 = date_part[6..8].parse().ok()?;
                
                if (2020..=2100).contains(&year) && (1..=12).contains(&month) && (1..=31).contains(&day) {
                    return Some(date_part.to_string());
                }
            }
        }
    }
    
    None
}

#[command]
fn get_default_config_path() -> String {
    let network_path = "\\\\10.0.171.36\\midev\\talk\\sitesettings";
    
    // 네트워크 경로 접근 가능한지 체크하고 폴더 생성
    match std::fs::create_dir_all(network_path) {
        Ok(_) => network_path.to_string(),
        Err(_) => {
            // 네트워크 접근 실패시 로컬 폴백
            let local_path = format!("{}\\sitesettings", std::env::var("USERPROFILE").unwrap_or_default());
            let _ = std::fs::create_dir_all(&local_path);
            local_path
        }
    }
}

// 새 서버 폴더 생성
#[command]
fn create_new_server(base_directory: String, server_name: String, use_template: bool) -> Result<String, String> {
    let server_folder = format!("{}\\{}", base_directory, server_name);
    
    // 서버 폴더 생성
    if let Err(e) = fs::create_dir_all(&server_folder) {
        return Err(format!("서버 폴더 생성 오류: {}", e));
    }
    
    // 현재 날짜로 파일명 생성
    let today = Local::now().format("%Y%m%d").to_string();
    let config_file = format!("{}\\{}_{}.json", server_folder, server_name, today);
    
    // 템플릿 기반 설정 파일 생성
    let config_content = if use_template {
        match get_template_config() {
            Ok(template) => template,
            Err(_) => get_minimal_template()
        }
    } else {
        get_minimal_template()
    };
    
    match write_json_file(config_file.clone(), config_content) {
        Ok(_) => Ok(format!("서버 '{}' 생성 완료: {}", server_name, config_file)),
        Err(e) => Err(format!("설정 파일 생성 오류: {}", e))
    }
}

// 최소 템플릿 반환
fn get_minimal_template() -> String {
    r#"{
  "defaultCompanyId": "",
  "multiCompany": false,
  "useIPPermit": false,
  "checkPushToken": true,
  "logoutAfter": 14
}"#.to_string()
}

// 설정 저장 (새 날짜 파일로)
#[command]
fn save_server_config(base_directory: String, server_name: String, content: String) -> Result<String, String> {
    let server_folder = format!("{}\\{}", base_directory, server_name);
    
    // 현재 날짜로 새 파일명 생성
    let today = Local::now().format("%Y%m%d").to_string();
    let config_file = format!("{}\\{}_{}.json", server_folder, server_name, today);
    write_json_file(config_file.clone(), content)?;
    Ok(format!("설정 저장 완료: {}", config_file))
}

// 템플릿 관련 함수들
#[command]
fn get_template_config() -> Result<String, String> {
    let base_path = get_default_config_path();
    
    // 1. 개인 template.json 먼저 확인
    let personal_template = format!("{}\\template.json", base_path);
    if let Ok(content) = fs::read_to_string(&personal_template) {
        if from_str::<Value>(&content).is_ok() {
            return Ok(content);
        }
    }
    
    // 2. 팀 공유 default_template.json 확인
    let default_template = format!("{}\\default_template.json", base_path);
    if let Ok(content) = fs::read_to_string(&default_template) {
        if from_str::<Value>(&content).is_ok() {
            return Ok(content);
        }
    }
    
    // 3. 둘 다 없으면 최소 템플릿 생성
    let minimal = get_minimal_template();
    let _ = fs::write(&personal_template, &minimal);
    Ok(minimal)
}

#[command]
fn save_template_config(content: String) -> Result<String, String> {
    let base_path = get_default_config_path();
    let template_path = format!("{}\\template.json", base_path);
    
    // JSON 유효성 검사
    match from_str::<Value>(&content) {
        Ok(json_value) => {
            let formatted = to_string_pretty(&json_value).unwrap();
            
            match fs::write(&template_path, formatted) {
                Ok(_) => Ok("개인 템플릿이 저장되었습니다.".to_string()),
                Err(e) => Err(format!("템플릿 저장 오류: {}", e))
            }
        },
        Err(e) => Err(format!("JSON 유효성 검사 실패: {}", e))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_log_file,
            append_log_file,
            read_json_file,
            write_json_file,
            list_servers,
            list_server_files,
            get_latest_server_config,
            get_default_config_path,
            get_template_config,
            save_template_config,
            create_new_server,
            save_server_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}