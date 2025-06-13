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

// 서버 복사
#[command]
fn copy_server(base_directory: String, source_server_name: String, target_server_name: String) -> Result<String, String> {
    let source_folder = format!("{}\\{}", base_directory, source_server_name);
    let target_folder = format!("{}\\{}", base_directory, target_server_name);
    
    // 원본 폴더 존재 확인
    if !Path::new(&source_folder).exists() {
        return Err(format!("원본 서버 '{}' 폴더가 존재하지 않습니다.", source_server_name));
    }
    
    // 대상 폴더가 이미 존재하는지 확인
    if Path::new(&target_folder).exists() {
        return Err(format!("대상 서버 '{}' 폴더가 이미 존재합니다.", target_server_name));
    }
    
    // 대상 폴더 생성
    if let Err(e) = fs::create_dir_all(&target_folder) {
        return Err(format!("대상 폴더 생성 오류: {}", e));
    }
    
    // 원본 폴더의 모든 파일 복사
    match copy_directory_contents(&source_folder, &target_folder, &source_server_name, &target_server_name) {
        Ok(copied_files) => {
            Ok(format!(
                "서버 '{}' → '{}' 복사 완료. {} 개 파일이 복사되었습니다.", 
                source_server_name, target_server_name, copied_files
            ))
        },
        Err(e) => {
            // 실패시 생성된 폴더 정리
            let _ = fs::remove_dir_all(&target_folder);
            Err(format!("파일 복사 오류: {}", e))
        }
    }
}

// 디렉토리 내용 복사 (파일명 변경 포함)
fn copy_directory_contents(
    source_dir: &str,
    target_dir: &str,
    source_name: &str,
    target_name: &str
) -> Result<usize, Box<dyn std::error::Error>> {
    let mut copied_files = 0;
    
    for entry in fs::read_dir(source_dir)? {
        let entry = entry?;
        let source_path = entry.path();
        
        if source_path.is_file() {
            if let Some(file_name) = source_path.file_name() {
                let file_name_str = file_name.to_string_lossy();
                
                // 파일명에서 서버명 변경
                let new_file_name = if file_name_str.contains(source_name) {
                    file_name_str.replace(source_name, target_name)
                } else {
                    file_name_str.to_string()
                };
                
                let target_path = Path::new(target_dir).join(new_file_name);
                
                // JSON 파일인 경우 내용도 서버명 변경
                if source_path.extension().is_some_and(|ext| ext == "json") {
                    copy_and_update_json_file(&source_path, &target_path, source_name, target_name)?;
                } else {
                    // 일반 파일은 그대로 복사
                    fs::copy(&source_path, &target_path)?;
                }
                
                copied_files += 1;
            }
        }
    }
    
    Ok(copied_files)
}

// JSON 파일 복사 및 내용 업데이트
fn copy_and_update_json_file(
    source_path: &Path,
    target_path: &Path,
    source_name: &str,
    target_name: &str
) -> Result<(), Box<dyn std::error::Error>> {
    // 원본 JSON 읽기
    let content = fs::read_to_string(source_path)?;
    
    // JSON 파싱 시도
    match from_str::<Value>(&content) {
        Ok(mut json_value) => {
            // JSON 내용에서 서버명 관련 값들 업데이트
            update_json_server_references(&mut json_value, source_name, target_name);
            
            // 예쁘게 포맷팅해서 저장
            let formatted = to_string_pretty(&json_value)?;
            fs::write(target_path, formatted)?;
        },
        Err(_) => {
            // JSON 파싱 실패시 원본 그대로 복사
            fs::copy(source_path, target_path)?;
        }
    }
    
    Ok(())
}

// JSON 내용에서 서버명 참조 업데이트
fn update_json_server_references(json_value: &mut Value, source_name: &str, target_name: &str) {
    match json_value {
        Value::String(s) => {
            if s.contains(source_name) {
                *s = s.replace(source_name, target_name);
            }
        },
        Value::Object(map) => {
            for (_, value) in map.iter_mut() {
                update_json_server_references(value, source_name, target_name);
            }
        },
        Value::Array(arr) => {
            for value in arr.iter_mut() {
                update_json_server_references(value, source_name, target_name);
            }
        },
        _ => {} // 다른 타입은 변경하지 않음
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
            copy_server, // 새로 추가
            create_new_server,
            save_server_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}