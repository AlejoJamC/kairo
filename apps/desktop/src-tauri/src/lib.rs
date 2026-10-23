mod menu;

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::{Emitter, Manager};

/// Session tokens delivered by the kairo:// deep link, held until the
/// dashboard asks for them once.
#[derive(Default)]
struct Handoff {
    tokens: Mutex<Option<serde_json::Value>>,
    /// Counts the sign-in listeners: a newer one retires the older ones.
    generation: AtomicU64,
}

/// Keeps the tokens for the dashboard, brings the window forward and reloads it
/// so the dashboard reads them through AuthHandoffPort (take_handoff_tokens).
fn deliver_tokens(handle: &tauri::AppHandle, tokens: serde_json::Value) {
    if let Some(state) = handle.try_state::<Handoff>() {
        *state.tokens.lock().unwrap() = Some(tokens);
    }
    let _ = handle.emit("kairo://handoff", ());
    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.eval("window.location.reload()");
    }
}

const LOOPBACK_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Kairo</title><body style=\"font-family:system-ui;margin:15vh auto;max-width:360px;text-align:center\"><h1 style=\"font-size:20px\">Kairo</h1><p>You can close this tab and go back to the app.</p>";

/// Waits on 127.0.0.1 for the sign-in page of the browser to hand over the
/// session. Works wherever the app runs, including `tauri dev` on macOS, where
/// the kairo:// link cannot reach an unbundled app. Returns the port.
#[tauri::command]
fn start_sign_in_listener(app: tauri::AppHandle, state: tauri::State<'_, Handoff>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|err| err.to_string())?;
    listener.set_nonblocking(true).map_err(|err| err.to_string())?;
    let port = listener.local_addr().map_err(|err| err.to_string())?.port();
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let handle = app.clone();
    std::thread::spawn(move || {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(600);
        while std::time::Instant::now() < deadline {
            let current = handle.try_state::<Handoff>().map(|s| s.generation.load(Ordering::SeqCst));
            if current != Some(generation) {
                return;
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut buffer = [0u8; 8192];
                    let read = stream.read(&mut buffer).unwrap_or(0);
                    let request = String::from_utf8_lossy(&buffer[..read]);
                    let path = request.lines().next().and_then(|line| line.split_whitespace().nth(1)).unwrap_or("/");
                    let tokens = url::Url::parse(&format!("http://127.0.0.1{path}")).ok().and_then(|url| parse_handoff(&url));
                    let (status, body) = if tokens.is_some() { ("200 OK", LOOPBACK_PAGE) } else { ("400 Bad Request", "") };
                    let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                    if let Some(tokens) = tokens {
                        deliver_tokens(&handle, tokens);
                        return;
                    }
                }
                Err(_) => std::thread::sleep(std::time::Duration::from_millis(200)),
            }
        }
    });
    Ok(port)
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

/// Draws the counter on the app icon; null clears it. macOS and Linux only:
/// other systems keep the in-app bell.
#[tauri::command]
fn set_badge(count: Option<i64>, app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_badge_count(count);
    }
}

/// Resizes the main window: the sign-in window is small, the app window large.
#[tauri::command]
fn set_window_size(width: f64, height: f64, min_width: f64, min_height: f64, app: tauri::AppHandle) {
    use tauri::LogicalSize;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_min_size(Some(LogicalSize::new(min_width, min_height)));
        let _ = window.set_size(LogicalSize::new(width, height));
        let _ = window.center();
        // The system applies the new size a moment later: center again with the final one.
        tauri::async_runtime::spawn(async move {
            std::thread::sleep(std::time::Duration::from_millis(80));
            let _ = window.center();
        });
    }
}

/// Sets the smallest size the window can take, without resizing it.
#[tauri::command]
fn set_min_window_size(min_width: f64, min_height: f64, app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_min_size(Some(tauri::LogicalSize::new(min_width, min_height)));
    }
}

/// Replaces the native menu bar with the groups the dashboard sends as JSON.
#[tauri::command]
fn set_menu(groups: String, app: tauri::AppHandle) {
    match menu::build_menu(&app, &groups) {
        Ok(built) => {
            if let Err(err) = app.set_menu(built) {
                eprintln!("set_menu failed: {err}");
            }
        }
        Err(err) => eprintln!("invalid menu: {err}"),
    }
}

/// Runs before the dashboard bundle so `createPlatform()` in client-core can
/// pick the desktop ports instead of the browser ones.
fn init_script() -> String {
    format!(
        "Object.defineProperty(window,'__KAIRO_DESKTOP__',{{value:{{os:'{os}',openExternal:function(url){{return window.__TAURI_INTERNALS__.invoke('open_external',{{url:url}});}},takeHandoffTokens:function(){{return window.__TAURI_INTERNALS__.invoke('take_handoff_tokens');}},notify:function(title,body){{return window.__TAURI_INTERNALS__.invoke('notify',{{title:title,body:body}});}},setBadge:function(count){{return window.__TAURI_INTERNALS__.invoke('set_badge',{{count:count}});}},startSignInListener:function(){{return window.__TAURI_INTERNALS__.invoke('start_sign_in_listener');}},setMinWindowSize:function(minWidth,minHeight){{return window.__TAURI_INTERNALS__.invoke('set_min_window_size',{{minWidth:minWidth,minHeight:minHeight}});}},setWindowSize:function(width,height,minWidth,minHeight){{return window.__TAURI_INTERNALS__.invoke('set_window_size',{{width:width,height:height,minWidth:minWidth,minHeight:minHeight}});}},setMenu:function(groups){{return window.__TAURI_INTERNALS__.invoke('set_menu',{{groups:groups}});}},onMenuAction:function(listener){{var handler=function(event){{listener(event.detail);}};window.addEventListener('kairo-menu',handler);return function(){{window.removeEventListener('kairo-menu',handler);}};}}}},configurable:false}});",
        os = match std::env::consts::OS {
            "macos" => "macos",
            "windows" => "windows",
            _ => "linux",
        }
    )
}

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
        .on_menu_event(|app, event| {
            // The webview runs the action: the menu only reports which item was picked.
            if let Some(window) = app.get_webview_window("main") {
                let id = serde_json::to_string(event.id().as_ref()).unwrap_or_default();
                let _ = window.eval(format!("window.dispatchEvent(new CustomEvent('kairo-menu',{{detail:{id}}}))"));
            }
        })
        .setup(|app| {
            use tauri_plugin_deep_link::DeepLinkExt;
            let handle = app.handle().clone();

            let window = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("Kairo")
                .inner_size(1500.0, 860.0)
                .min_inner_size(1296.0, 700.0)
                .center()
                .initialization_script(init_script());
            // The hidden-inset title bar exists on macOS only; Windows and Linux keep the native frame.
            #[cfg(target_os = "macos")]
            let window = window.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
            window.build()?;

            app.deep_link().on_open_url(move |request| {
                for url in request.urls() {
                    if url.scheme() != "kairo" {
                        continue;
                    }
                    if let Some(tokens) = parse_handoff(&url) {
                        deliver_tokens(&handle, tokens);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![take_handoff_tokens, open_external, notify, set_badge, set_menu, set_window_size, set_min_window_size, start_sign_in_listener])
        .run(tauri::generate_context!())
        .expect("error while running the Kairo desktop app");
}
