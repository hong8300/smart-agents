//! 設定とチャット履歴を アプリデータディレクトリ の JSON ファイルに保存する。

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 作業フォルダ未指定のときにエージェントを走らせる空のディレクトリ
pub fn workspace_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("workspace");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn file_for(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let valid = !name.is_empty()
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err(format!("不正なファイル名: {name}"));
    }
    Ok(data_dir(app)?.join(format!("{name}.json")))
}

#[tauri::command]
pub fn load_json(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = file_for(&app, &name)?;
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_json(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let path = file_for(&app, &name)?;
    // 書き込み途中で落ちても壊れないよう、一時ファイルに書いてから置き換える
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn data_dir_path(app: AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?.to_string_lossy().into_owned())
}
