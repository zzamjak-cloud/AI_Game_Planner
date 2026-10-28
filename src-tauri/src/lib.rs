mod mcp_commands;
mod mcp_runtime;
mod mcp_setup;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // 앱 업데이트 후 에이전트에 등록된 gp-mcp 사본을 새 버전으로 맞춘다
            mcp_commands::refresh_installed_server(&app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mcp_commands::mcp_setup_status,
            mcp_commands::mcp_register,
            mcp_commands::mcp_unregister,
            mcp_commands::mcp_config_snippet,
            mcp_commands::mcp_download_server,
            mcp_commands::mcp_inbox_take,
            mcp_commands::mcp_inbox_ack
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
