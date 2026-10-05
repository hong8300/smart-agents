mod agents;
mod shellpath;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ログインシェルからの PATH 取得は数秒かかることがあるので、起動直後に裏で済ませておく
    std::thread::spawn(|| {
        shellpath::augmented_path();
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(agents::RunRegistry::default())
        .invoke_handler(tauri::generate_handler![
            agents::run_agent,
            agents::cancel_run,
            agents::check_agent,
            storage::load_json,
            storage::save_json,
            storage::data_dir_path,
            agents::list_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
