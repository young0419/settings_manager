#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
  )]
  #![allow(clippy::unnecessary_to_owned)]
  
  use std::fs;
  use std::path::Path;
  use serde_json::{Value, from_str, to_string_pretty};
  use tauri::command;
  use chrono::{Utc, Local};
  
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
  
  // 🔍 특정 서버 폴더에서 최신 설정 파일 찾기
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
              
              // 파일명으로 정렬 (날짜순)
              json_files.sort_by(|a, b| b.0.cmp(&a.0)); // 최신순
              
              let latest = &json_files[0];
              let latest_date = extract_date_from_filename(&latest.0).unwrap_or_default();
              
              Ok((latest.1.clone(), latest_date, json_files.len()))
          },
          Err(e) => Err(format!("폴더 읽기 오류: {}", e))
      }
  }
  
  // 📅 파일명에서 날짜 추출
  fn extract_date_from_filename(filename: &str) -> Option<String> {
      // 서버명_20250127.json -> 20250127 추출
      if let Some(underscore_pos) = filename.rfind('_') {
          if let Some(dot_pos) = filename.rfind('.') {
              let date_part = &filename[underscore_pos + 1..dot_pos];
              if date_part.len() == 8 && date_part.chars().all(|c| c.is_ascii_digit()) {
                  return Some(format!("{}-{}-{}", 
                      &date_part[0..4], 
                      &date_part[4..6], 
                      &date_part[6..8]
                  ));
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
  
  // 💾 새 서버 폴더 생성
  #[command]
  fn create_new_server(base_directory: String, server_name: String, use_template: bool) -> Result<String, String> {
      let server_folder = format!("{}\\settings\\{}", base_directory, server_name);
      
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
  
  // ⚡ 최소 템플릿 반환
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
      
      // 같은 날짜 파일이 이미 있는지 확인
      if Path::new(&config_file).exists() {
          // 시간까지 포함한 파일명으로 생성
          let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
          let config_file = format!("{}\\{}_{}.json", server_folder, server_name, timestamp);
          write_json_file(config_file.clone(), content)?;
          Ok(format!("설정 저장 완료: {}", config_file))
      } else {
          write_json_file(config_file.clone(), content)?;
          Ok(format!("설정 저장 완료: {}", config_file))
      }
  }
  
  // 📋 기존 백업 함수 (특정 파일용)
  #[command]
  fn backup_config(file_path: String) -> Result<String, String> {
      let backup_path = format!("{}.backup.{}", file_path, Utc::now().format("%Y%m%d_%H%M%S"));
      
      match fs::copy(&file_path, &backup_path) {
          Ok(_) => Ok(format!("백업 생성: {}", backup_path)),
          Err(e) => Err(format!("백업 생성 실패: {}", e))
      }
  }
  
  // 📋 템플릿 관련 함수들
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
  
  // 서버 삭제 (폴더 전체)
  #[command]
  fn delete_server(base_directory: String, server_name: String) -> Result<String, String> {
      let server_folder = format!("{}\\{}", base_directory, server_name);
      
      // 백업을 위해 압축하거나 별도 위치로 이동
      let backup_folder = format!("{}.deleted.{}", server_folder, Local::now().format("%Y%m%d_%H%M%S"));
      
      match fs::rename(&server_folder, &backup_folder) {
          Ok(_) => Ok(format!("서버 폴더가 삭제되었습니다 (백업: {})", backup_folder)),
          Err(e) => Err(format!("서버 삭제 오류: {}", e))
      }
  }
  
  fn main() {
      tauri::Builder::default()
          .invoke_handler(tauri::generate_handler![
              read_json_file,
              write_json_file,
              list_servers,
              get_latest_server_config,
              get_default_config_path,
              backup_config,
              get_template_config,
              save_template_config,
              create_new_server,
              save_server_config,
              delete_server
          ])
          .run(tauri::generate_context!())
          .expect("error while running tauri application");
  }