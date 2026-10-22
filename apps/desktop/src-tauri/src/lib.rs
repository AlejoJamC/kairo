use std::sync::Mutex;

use tauri::{Emitter, Manager};

/// Session tokens delivered by the kairo:// deep link, held until the
/// dashboard asks for them once.
#[derive(Default)]
struct Handoff {
    tokens: Mutex<Option<serde_json::Value>>,
}

/// Tokens delivered by the kairo:// deep link, or null. Idempotent: the first
/// call consumes them.
#[tauri::command]
fn take_handoff_tokens(state: tauri::State<'_, Handoff>) -> Option<serde_json::Value> {
    state.tokens.lock().unwrap().take()
}

/// Opens a URL in the system browser. Identity providers reject embedded
/// webviews, so OAuth never runs inside the Kairo window.
#[tauri::command]
fn open_external(url: String) {
    if let Err(err) = tauri_plugin_opener::open_url(url, None::<String>) {
        eprintln!("open_external failed: {err}");
    }
}

/// Sends a native notification.
#[tauri::command]
fn notify(title: String, body: String, app: tauri::AppHandle) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Extracts `access_token` and `refresh_token` from a `kairo://` URL.
fn parse_handoff(url: &url::Url) -> Option<serde_json::Value> {
    let mut access = None;
    let mut refresh = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "access_token" => access = Some(value.into_owned()),
            "refresh_token" => refresh = Some(value.into_owned()),
            _ => {}
        }
    }
    let access = access?;
    let refresh = refresh?;
    Some(serde_json::json!({ "access_token": access, "refresh_token": refresh }))
}

/// Runs before the dashboard bundle so `createPlatform()` in client-core can
/// pick the desktop ports instead of the browser ones.
const INIT_SCRIPT: &str = "Object.defineProperty(window,'__KAIRO_DESKTOP__',{value:{openExternal:function(url){return window.__TAURI_INTERNALS__.invoke('open_external',{url:url});},takeHandoffTokens:function(){return window.__TAURI_INTERNALS__.invoke('take_handoff_tokens');},notify:function(title,body){return window.__TAURI_INTERNALS__.invoke('notify',{title:title,body:body});}},configurable:false});";

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Handoff::default())
        .setup(|app| {
            use tauri_plugin_deep_link::DeepLinkExt;
            let handle = app.handle().clone();

            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("Kairo")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 640.0)
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .initialization_script(INIT_SCRIPT)
                .build()?;

            app.deep_link().on_open_url(move |request| {
                for url in request.urls() {
                    if url.scheme() != "kairo" {
                        continue;
                    }
                    if let Some(tokens) = parse_handoff(&url) {
                        if let Some(state) = handle.try_state::<Handoff>() {
                            *state.tokens.lock().unwrap() = Some(tokens);
                        }
                        let _ = handle.emit("kairo://handoff", ());
                        // Reload so the dashboard re-mounts and reads the tokens
                        // through AuthHandoffPort (take_handoff_tokens).
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = window.eval("window.location.reload()");
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![take_handoff_tokens, open_external, notify])
        .run(tauri::generate_context!())
        .expect("error while running the Kairo desktop app");
}
