use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{sync_channel, RecvTimeoutError, SyncSender};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use serde::{Deserialize, Serialize};
use base64::prelude::*;
use futures_util::StreamExt;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Default)]
pub struct BackendState {
    pub child: Option<std::process::Child>,
    pub current_workspace: Option<String>,
}

pub struct BackendProcess(pub Mutex<BackendState>);

#[derive(Debug, Serialize, Deserialize)]
pub struct AntigravityStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub executable_path: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct AntigravityDownloadProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub percentage: f32,
    pub phase: String,
}

#[derive(Debug, Deserialize)]
struct ReleaseManifest {
    pub version: String,
    pub url: String,
}

/// Directory locale privata dell'IDE per memorizzare il binario e i dati di Antigravity
fn get_antigravity_private_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Impossibile ottenere cartella app data: {e}"))?;
    let target = app_dir.join("antigravity");
    std::fs::create_dir_all(&target)
        .map_err(|e| format!("Impossibile creare cartella privata antigravity: {e}"))?;
    Ok(target)
}

fn get_private_agy_path(app: &AppHandle) -> Option<PathBuf> {
    let base = get_antigravity_private_dir(app).ok()?;
    #[cfg(target_os = "windows")]
    let exe = base.join("bin").join("taucode-antigravity.exe");
    #[cfg(not(target_os = "windows"))]
    let exe = base.join("bin").join("taucode-antigravity");
    Some(exe)
}

fn get_version_file_path(app: &AppHandle) -> Option<PathBuf> {
    let base = get_antigravity_private_dir(app).ok()?;
    Some(base.join("version.json"))
}

async fn fetch_latest_manifest() -> Result<ReleaseManifest, String> {
    #[cfg(target_os = "windows")]
    let platform = "windows_amd64";
    #[cfg(target_os = "macos")]
    let platform = if cfg!(target_arch = "aarch64") { "darwin_arm64" } else { "darwin_amd64" };
    #[cfg(target_os = "linux")]
    let platform = if cfg!(target_arch = "aarch64") { "linux_arm64" } else { "linux_amd64" };

    let url = format!(
        "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/{}.json",
        platform
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Errore connessione manifest release: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Server manifest ha risposto con {}", res.status()));
    }

    let manifest: ReleaseManifest = res
        .json()
        .await
        .map_err(|e| format!("Errore decodifica manifest: {e}"))?;

    Ok(manifest)
}

#[tauri::command]
pub async fn get_antigravity_status(app: AppHandle) -> Result<AntigravityStatus, String> {
    let exe_path = get_private_agy_path(&app);
    let mut installed = exe_path.as_ref().map(|p| p.exists()).unwrap_or(false);

    if !installed {
        if let Some(ref target_path) = exe_path {
            if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
                let exe_name = if cfg!(target_os = "windows") { "agy.exe" } else { "agy" };
                let global_agy = PathBuf::from(home).join(".gemini").join("bin").join(exe_name);
                if global_agy.exists() {
                    if let Some(parent) = target_path.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    if std::fs::copy(&global_agy, target_path).is_ok() {
                        #[cfg(not(target_os = "windows"))]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            let _ = std::fs::set_permissions(target_path, std::fs::Permissions::from_mode(0o755));
                        }
                        installed = true;
                    }
                }
            }
        }
    }

    let mut current_version = None;
    if installed {
        if let Some(v_path) = get_version_file_path(&app) {
            if let Ok(content) = std::fs::read_to_string(v_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    current_version = val.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
                }
            }
        }
        if current_version.is_none() {
            if let Some(ref path) = exe_path {
                let mut cmd = Command::new(path);
                cmd.arg("--version");
                #[cfg(target_os = "windows")]
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                if let Ok(output) = cmd.output() {
                    if output.status.success() {
                        let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        if !out_str.is_empty() {
                            let ver = out_str.strip_prefix('v').unwrap_or(&out_str).trim().to_string();
                            current_version = Some(ver.clone());
                            if let Some(v_path) = get_version_file_path(&app) {
                                let _ = std::fs::write(v_path, serde_json::json!({ "version": ver }).to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    let manifest = fetch_latest_manifest().await.ok();
    let latest_version = manifest.map(|m| m.version);

    let update_available = match (&current_version, &latest_version) {
        (Some(curr), Some(latest)) => curr != latest,
        (None, Some(_)) if installed => false,
        _ => false,
    };

    Ok(AntigravityStatus {
        installed,
        version: current_version,
        latest_version,
        update_available,
        executable_path: exe_path.map(|p| p.to_string_lossy().to_string()),
    })
}

#[tauri::command]
pub async fn install_or_update_antigravity(
    app: AppHandle,
    state: State<'_, BackendProcess>,
) -> Result<String, String> {
    // 1. Recupera le informazioni della release
    let manifest = fetch_latest_manifest().await?;
    let download_url = manifest.url;
    let target_version = manifest.version;

    // 2. Calcola i percorsi del file
    let exe_path = get_private_agy_path(&app)
        .ok_or_else(|| "Impossibile calcolare percorso binario privato".to_string())?;

    if let Some(parent) = exe_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let temp_download_path = exe_path.with_extension(format!(
        "download.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    ));

    // 3. Avvia la richiesta HTTP in streaming senza timeout globale rigido
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Errore nel download del binario: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Download fallito con stato {}", res.status()));
    }

    let total_bytes = res.content_length();
    let mut downloaded: u64 = 0;

    let _ = app.emit("antigravity-download-progress", AntigravityDownloadProgress {
        downloaded: 0,
        total: total_bytes,
        percentage: 0.0,
        phase: "downloading".to_string(),
    });

    let mut stream = res.bytes_stream();
    let mut file = std::fs::File::create(&temp_download_path)
        .map_err(|e| format!("Impossibile creare file temporaneo: {e}"))?;

    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| {
            let _ = std::fs::remove_file(&temp_download_path);
            format!("Errore ricezione pacchetto: {e}")
        })?;

        std::io::Write::write_all(&mut file, &chunk).map_err(|e| {
            let _ = std::fs::remove_file(&temp_download_path);
            format!("Errore scrittura file: {e}")
        })?;

        downloaded += chunk.len() as u64;

        if last_emit.elapsed() >= std::time::Duration::from_millis(150)
            || (total_bytes.is_some() && downloaded >= total_bytes.unwrap())
        {
            let percentage = if let Some(tot) = total_bytes {
                if tot > 0 {
                    ((downloaded as f32 / tot as f32) * 100.0).min(100.0)
                } else {
                    0.0
                }
            } else {
                0.0
            };

            let _ = app.emit("antigravity-download-progress", AntigravityDownloadProgress {
                downloaded,
                total: total_bytes,
                percentage,
                phase: "downloading".to_string(),
            });
            last_emit = std::time::Instant::now();
        }
    }

    std::io::Write::flush(&mut file).map_err(|e| e.to_string())?;
    drop(file);

    let _ = app.emit("antigravity-download-progress", AntigravityDownloadProgress {
        downloaded,
        total: total_bytes,
        percentage: 100.0,
        phase: "installing".to_string(),
    });

    // 4. Termina eventuale processo backend in esecuzione prima di sostituire il binario
    {
        if let Ok(mut lock) = state.0.lock() {
            if let Some(mut child) = lock.child.take() {
                let _ = child.kill();
            }
            lock.current_workspace = None;
        }

        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("cmd");
            cmd.args(["/c", "taskkill /f /im taucode-antigravity.exe /im terax-antigravity.exe >nul 2>&1"]);
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            let _ = cmd.output();
        }

        kill_process_on_port(BACKEND_PORT);
        kill_process_on_port(PROXY_PORT);
        let _ = wait_for_port_free(BACKEND_PORT, std::time::Duration::from_millis(1500));
        let _ = wait_for_port_free(PROXY_PORT, std::time::Duration::from_millis(1000));
    }

    // 5. Sostituisci il vecchio eseguibile con il file appena scaricato
    let mut replaced = false;
    let mut last_err = String::new();

    for _attempt in 0..6 {
        if exe_path.exists() {
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            let old_path = exe_path.with_extension(format!("exe.old.{}", ts));
            if let Ok(_) = std::fs::rename(&exe_path, &old_path) {
                let _ = std::fs::remove_file(&old_path);
            } else if let Err(e) = std::fs::remove_file(&exe_path) {
                last_err = e.to_string();
                std::thread::sleep(std::time::Duration::from_millis(300));
                continue;
            }
        }

        if let Ok(_) = std::fs::rename(&temp_download_path, &exe_path) {
            replaced = true;
            break;
        } else if let Ok(_) = std::fs::copy(&temp_download_path, &exe_path) {
            let _ = std::fs::remove_file(&temp_download_path);
            replaced = true;
            break;
        } else {
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
    }

    if !replaced {
        let _ = std::fs::remove_file(&temp_download_path);
        return Err(format!("Errore salvataggio eseguibile: {last_err}"));
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&exe_path, std::fs::Permissions::from_mode(0o755));
    }

    // 6. Salva metadati versione
    if let Some(v_path) = get_version_file_path(&app) {
        let info = serde_json::json!({
            "version": target_version
        });
        let _ = std::fs::write(v_path, info.to_string());
    }

    let _ = app.emit("antigravity-download-progress", AntigravityDownloadProgress {
        downloaded,
        total: total_bytes,
        percentage: 100.0,
        phase: "completed".to_string(),
    });

    let _ = app.emit("terax:antigravity-updated", serde_json::json!({
        "version": target_version
    }));

    Ok(target_version)
}
pub const PROXY_PORT: u16 = 8085;
pub const BACKEND_PORT: u16 = 8086;

static CACHED_MAIN_JS: Mutex<Option<Arc<Vec<u8>>>> = Mutex::new(None);
static PROXY_RUNNING: AtomicBool = AtomicBool::new(false);
static PROXY_APP_HANDLE: Mutex<Option<AppHandle>> = Mutex::new(None);

pub fn set_proxy_app_handle(app: AppHandle) {
    if let Ok(mut handle_guard) = PROXY_APP_HANDLE.lock() {
        *handle_guard = Some(app);
    }
}

static PENDING_EVAL_REQUESTS: LazyLock<Mutex<HashMap<String, SyncSender<serde_json::Value>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub fn terax_eval_response(req_id: String, result: serde_json::Value) -> Result<(), String> {
    if let Ok(mut map) = PENDING_EVAL_REQUESTS.lock() {
        if let Some(tx) = map.remove(&req_id) {
            let _ = tx.send(result);
            return Ok(());
        }
    }
    Err("Richiesta eval non trovata o scaduta".to_string())
}

pub fn request_frontend_eval(
    app: &AppHandle,
    action: &str,
    params: serde_json::Value,
    timeout: Duration,
) -> Result<serde_json::Value, String> {
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let num = COUNTER.fetch_add(1, Ordering::Relaxed);
    let req_id = format!("eval_{}_{}", now, num);

    let (tx, rx) = sync_channel(1);
    if let Ok(mut map) = PENDING_EVAL_REQUESTS.lock() {
        map.insert(req_id.clone(), tx);
    } else {
        return Err("Impossibile acquisire lock su PENDING_EVAL_REQUESTS".to_string());
    }

    let payload = serde_json::json!({
        "reqId": req_id,
        "action": action,
        "params": params,
    });

    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("terax:eval-request", &payload);
    } else {
        let _ = app.emit("terax:eval-request", &payload);
    }

    match rx.recv_timeout(timeout) {
        Ok(res) => Ok(res),
        Err(RecvTimeoutError::Timeout) => {
            if let Ok(mut map) = PENDING_EVAL_REQUESTS.lock() {
                map.remove(&req_id);
            }
            Err(format!("Timeout in attesa di risposta frontend per l'azione: {}", action))
        }
        Err(RecvTimeoutError::Disconnected) => {
            if let Ok(mut map) = PENDING_EVAL_REQUESTS.lock() {
                map.remove(&req_id);
            }
            Err("Canale risposta frontend chiuso anticipatamente".to_string())
        }
    }
}

fn send_json_http(
    stream: &mut TcpStream,
    status_code: u16,
    status_text: &str,
    body: &serde_json::Value,
) -> std::io::Result<()> {
    let body_str = serde_json::to_string(body).unwrap_or_default();
    let resp = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n{}",
        status_code, status_text, body_str.len(), body_str
    );
    stream.write_all(resp.as_bytes())?;
    stream.flush()?;
    Ok(())
}

fn extract_json_or_query(initial_buf: &[u8]) -> serde_json::Value {
    let (header_part, body_part) = match initial_buf.windows(4).position(|w| w == b"\r\n\r\n") {
        Some(pos) => (&initial_buf[..pos + 4], &initial_buf[pos + 4..]),
        None => (initial_buf, &[][..]),
    };

    if !body_part.is_empty() {
        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(body_part) {
            return val;
        }
    }

    let header_str = String::from_utf8_lossy(header_part);
    let mut map = serde_json::Map::new();
    if let Some(first_line) = header_str.lines().next() {
        if let Some(query_start) = first_line.find('?') {
            let end_pos = first_line.find(" HTTP/").unwrap_or(first_line.len());
            let query_str = &first_line[query_start + 1..end_pos];
            for pair in query_str.split('&') {
                let mut parts = pair.splitn(2, '=');
                let k = parts.next().unwrap_or("");
                let v = parts.next().unwrap_or("");
                if !k.is_empty() {
                    let decoded_v = percent_decode_simple(v);
                    if let Ok(n) = decoded_v.parse::<i64>() {
                        map.insert(k.to_string(), serde_json::Value::Number(n.into()));
                    } else if decoded_v == "true" {
                        map.insert(k.to_string(), serde_json::Value::Bool(true));
                    } else if decoded_v == "false" {
                        map.insert(k.to_string(), serde_json::Value::Bool(false));
                    } else {
                        map.insert(k.to_string(), serde_json::Value::String(decoded_v));
                    }
                }
            }
        }
    }
    serde_json::Value::Object(map)
}

pub fn kill_process_on_port(port: u16) {
    let current_pid = std::process::id();
    #[cfg(target_os = "windows")]
    {
        let cmd_str = format!(
            "for /f \"tokens=5\" %a in ('netstat -aon -p tcp ^| findstr \":{}\" ^| findstr \"LISTENING\"') do @if not \"%a\"==\"{}\" taskkill /f /pid %a >nul 2>&1",
            port, current_pid
        );
        let mut cmd = Command::new("cmd");
        cmd.args(["/c", &cmd_str]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let _ = cmd.output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let cmd_str = format!("lsof -ti :{} | grep -v '^{}$' | xargs kill -9", port, current_pid);
        let _ = Command::new("sh").args(["-c", &cmd_str]).output();
    }
}

pub fn wait_for_port_free(port: u16, max_duration: std::time::Duration) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed() < max_duration {
        if std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_err() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    false
}

fn patch_ipc_identifiers(body: &str) -> String {
    let bytes = body.as_bytes();
    let len = bytes.len();
    let mut out_bytes = Vec::with_capacity(len + 128);
    let mut i = 0;

    fn is_ident_char(b: u8) -> bool {
        b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
    }

    while i < len {
        if i + 3 <= len && &bytes[i..i + 3] == b"ipc" {
            let prev = if i > 0 { Some(bytes[i - 1]) } else { None };
            let next = if i + 3 < len { Some(bytes[i + 3]) } else { None };

            let prev_is_ident = prev.map_or(false, is_ident_char);
            let prev_is_dot = prev == Some(b'.');
            let prev_is_quote = prev == Some(b'"') || prev == Some(b'\'') || prev == Some(b'`');
            let next_is_ident = next.map_or(false, is_ident_char);
            let next_is_quote = next == Some(b'"') || next == Some(b'\'') || next == Some(b'`');

            // Standalone identifier `ipc`
            if !prev_is_ident && !prev_is_dot && !prev_is_quote && !next_is_ident && !next_is_quote {
                out_bytes.extend_from_slice(b"_ipc");
                i += 3;
                continue;
            }
        }
        out_bytes.push(bytes[i]);
        i += 1;
    }

    String::from_utf8(out_bytes).unwrap_or_else(|_| body.to_string())
}

fn fetch_and_patch_main_js() -> std::io::Result<Arc<Vec<u8>>> {
    if let Ok(guard) = CACHED_MAIN_JS.lock() {
        if let Some(ref cached) = *guard {
            return Ok(cached.clone());
        }
    }

    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", BACKEND_PORT))?;
    let req = format!(
        "GET /main.js HTTP/1.1\r\n\
         Host: 127.0.0.1:{}\r\n\
         Accept-Encoding: identity\r\n\
         Connection: close\r\n\r\n",
        BACKEND_PORT
    );
    stream.write_all(req.as_bytes())?;
    stream.flush()?;

    let mut raw_resp = Vec::new();
    stream.read_to_end(&mut raw_resp)?;

    let pos = raw_resp
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid HTTP response from backend"))?;

    let body_bytes = &raw_resp[pos + 4..];
    let mut body_str = String::from_utf8_lossy(body_bytes).into_owned();

    // Universal fix for collision with Tauri / Wry injected read-only window.ipc:
    // Standalone identifier `ipc` generated by Google's bundler is renamed to `_ipc`
    // across ANY present or future version of Antigravity CLI.
    body_str = patch_ipc_identifiers(&body_str);

    // Fix settings scroll lag and boundary freeze: disable forced synchronous onScroll reflows, remove maskImage reflow oscillation, add overscroll-contain
    body_str = body_str.replace(
        "ref:q,onScroll:m,className:\"flex w-full h-full overflow-auto min-h-0\",style:{maskImage:l.top&&l.bottom?\"linear-gradient(to bottom, transparent, black 8px, black calc(100% - 8px), transparent)\":l.top?\"linear-gradient(to bottom, transparent, black 8px)\":l.bottom?\"linear-gradient(to bottom, black calc(100% - 8px), transparent)\":void 0}",
        "ref:q,onScroll:void 0,className:\"flex w-full h-full overflow-auto min-h-0 overscroll-contain\",style:{maskImage:void 0}"
    );

    // Fix trackpad and mouse wheel lag: disable artificial non-passive wheel interceptor that blocks GPU compositor thread and overrides native scrolling with synchronous JS reflows
    body_str = body_str.replace(
        "sa?.addEventListener(\"wheel\",wa,{passive:!1});",
        "/* wheel handled natively by GPU compositor */",
    );
    body_str = body_str.replace(
        "sa?.removeEventListener(\"wheel\",wa);",
        "/* cleanup */",
    );
    body_str = body_str.replace(
        "ca?.addEventListener(\"wheel\",Ia,{passive:!1});",
        "/* wheel handled natively by GPU compositor */",
    );
    body_str = body_str.replace(
        "ca?.removeEventListener(\"wheel\",Ia);",
        "/* cleanup */",
    );

    // Fix 1-2s freeze at top and bottom: eliminate mB state updates that cause full re-renders of the entire 12-section settings tree
    body_str = body_str.replace(
        "k(x=>x.top===v&&x.bottom===\nw?x:{top:v,bottom:w})",
        "void 0",
    );
    body_str = body_str.replace(
        "k(x=>x.left===v&&x.right===w?x:{left:v,right:w})",
        "void 0",
    );

    // Disable duplicate OverlayScrollbar in Settings which causes layout thrashing and pointer capture locks
    body_str = body_str.replace(
        "A.createElement(dR,{viewportRef:n})",
        "null",
    );

    let patched_body = body_str.into_bytes();
    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: application/javascript; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Cache-Control: no-cache\r\n\
         Connection: close\r\n\r\n",
        patched_body.len()
    );

    let mut response_bytes = header.into_bytes();
    response_bytes.extend_from_slice(&patched_body);
    let arc_resp = Arc::new(response_bytes);

    if let Ok(mut guard) = CACHED_MAIN_JS.lock() {
        *guard = Some(arc_resp.clone());
    }

    Ok(arc_resp)
}

fn handle_proxy_client(mut client_stream: TcpStream) -> std::io::Result<()> {
    let mut initial_buf = Vec::with_capacity(4096);
    let mut temp = [0u8; 4096];
    loop {
        let n = client_stream.read(&mut temp)?;
        if n == 0 {
            return Ok(());
        }
        initial_buf.extend_from_slice(&temp[..n]);
        if initial_buf.windows(4).any(|w| w == b"\r\n\r\n") || initial_buf.len() >= 65536 {
            break;
        }
    }

    // Gestione CORS Preflight OPTIONS per tutte le API (/api/terminal, /api/tabs, /api/git, ecc.)
    if initial_buf.starts_with(b"OPTIONS /api/") {
        let resp = b"HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n";
        let _ = client_stream.write_all(resp);
        let _ = client_stream.flush();
        return Ok(());
    }

    // API: Elenco di tutte le tab aperte
    if initial_buf.starts_with(b"GET /api/tabs ") || initial_buf.starts_with(b"GET /api/tabs?") || initial_buf.starts_with(b"POST /api/tabs/list") {
        let app_opt = PROXY_APP_HANDLE.lock().ok().and_then(|g| g.clone());
        let app = match app_opt {
            Some(a) => a,
            None => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": "TauCode app handle non disponibile" }));
                return Ok(());
            }
        };
        match request_frontend_eval(&app, "list_tabs", serde_json::json!({}), Duration::from_secs(4)) {
            Ok(res) => {
                let _ = send_json_http(&mut client_stream, 200, "OK", &res);
            }
            Err(e) => {
                let _ = send_json_http(&mut client_stream, 504, "Gateway Timeout", &serde_json::json!({ "ok": false, "error": e }));
            }
        }
        return Ok(());
    }

    // API: Apertura universale tab (preview, editor, extension, terminal, markdown, svg, settings, etc.)
    if initial_buf.starts_with(b"POST /api/tabs/open") || initial_buf.starts_with(b"GET /api/tabs/open") {
        let app_opt = PROXY_APP_HANDLE.lock().ok().and_then(|g| g.clone());
        let app = match app_opt {
            Some(a) => a,
            None => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": "TauCode app handle non disponibile" }));
                return Ok(());
            }
        };
        let params = extract_json_or_query(&initial_buf);
        match request_frontend_eval(&app, "open_tab", params, Duration::from_secs(6)) {
            Ok(res) => {
                let _ = send_json_http(&mut client_stream, 200, "OK", &res);
            }
            Err(e) => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": e }));
            }
        }
        return Ok(());
    }

    // API: Chiusura universale tab (per tabId, kind, title, last, all)
    if initial_buf.starts_with(b"POST /api/tabs/close") || initial_buf.starts_with(b"GET /api/tabs/close") {
        let app_opt = PROXY_APP_HANDLE.lock().ok().and_then(|g| g.clone());
        let app = match app_opt {
            Some(a) => a,
            None => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": "TauCode app handle non disponibile" }));
                return Ok(());
            }
        };
        let params = extract_json_or_query(&initial_buf);
        match request_frontend_eval(&app, "close_tab", params, Duration::from_secs(5)) {
            Ok(res) => {
                let _ = send_json_http(&mut client_stream, 200, "OK", &res);
            }
            Err(e) => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": e }));
            }
        }
        return Ok(());
    }

    // API: Focus / Attivazione tab
    if initial_buf.starts_with(b"POST /api/tabs/focus") || initial_buf.starts_with(b"GET /api/tabs/focus") {
        let app_opt = PROXY_APP_HANDLE.lock().ok().and_then(|g| g.clone());
        let app = match app_opt {
            Some(a) => a,
            None => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": "TauCode app handle non disponibile" }));
                return Ok(());
            }
        };
        let params = extract_json_or_query(&initial_buf);
        match request_frontend_eval(&app, "focus_tab", params, Duration::from_secs(3)) {
            Ok(res) => {
                let _ = send_json_http(&mut client_stream, 200, "OK", &res);
            }
            Err(e) => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": e }));
            }
        }
        return Ok(());
    }

    // API: Layout tab (single tab standard)
    if initial_buf.starts_with(b"POST /api/tabs/layout") || initial_buf.starts_with(b"GET /api/tabs/layout") {
        let _ = send_json_http(&mut client_stream, 200, "OK", &serde_json::json!({
            "ok": true,
            "layout": "1",
            "message": "TauCode opera in modalità single-tab (scheda singola attiva)"
        }));
        return Ok(());
    }

    // API: Screenshot del tab specificato o attivo (con salvataggio automatico file PNG)
    if initial_buf.starts_with(b"POST /api/tabs/screenshot") || initial_buf.starts_with(b"GET /api/tabs/screenshot") || initial_buf.starts_with(b"POST /api/screenshot") {
        let app_opt = PROXY_APP_HANDLE.lock().ok().and_then(|g| g.clone());
        let app = match app_opt {
            Some(a) => a,
            None => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": "TauCode app handle non disponibile" }));
                return Ok(());
            }
        };
        let params = extract_json_or_query(&initial_buf);
        match request_frontend_eval(&app, "tab_screenshot", params, Duration::from_secs(12)) {
            Ok(res) => {
                let mut final_res = res.clone();
                if let Some(data_url) = res.get("dataUrl").and_then(|v| v.as_str()) {
                    if let Some(comma_pos) = data_url.find(',') {
                        let base64_str = &data_url[comma_pos + 1..];
                        if let Ok(bytes) = BASE64_STANDARD.decode(base64_str) {
                            let mut target_path: Option<PathBuf> = None;
                            if let Some(sp) = res.get("savePath").and_then(|v| v.as_str()) {
                                if !sp.trim().is_empty() {
                                    target_path = Some(PathBuf::from(sp.trim()));
                                }
                            }
                            if target_path.is_none() {
                                let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
                                let tab_id = res.get("tabId").and_then(|v| v.as_i64()).unwrap_or(0);
                                let file_name = format!("tab_{}_{}.png", tab_id, now);
                                let base_dir = crate::modules::workspace::resolve_launch_dir()
                                    .join(".taucode")
                                    .join("screenshots");
                                target_path = Some(base_dir.join(file_name));
                            }
                            if let Some(ref p) = target_path {
                                if let Some(parent) = p.parent() {
                                    let _ = std::fs::create_dir_all(parent);
                                }
                                if std::fs::write(p, bytes).is_ok() {
                                    if let Some(obj) = final_res.as_object_mut() {
                                        obj.insert("imagePath".to_string(), serde_json::Value::String(p.to_string_lossy().to_string()));
                                    }
                                }
                            }
                        }
                    }
                }
                let _ = send_json_http(&mut client_stream, 200, "OK", &final_res);
            }
            Err(e) => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": e }));
            }
        }
        return Ok(());
    }

    // API: Lettura output / buffer dal terminale integrato
    if initial_buf.starts_with(b"GET /api/terminal/output") || initial_buf.starts_with(b"POST /api/terminal/output") {
        let app_opt = PROXY_APP_HANDLE.lock().ok().and_then(|g| g.clone());
        let app = match app_opt {
            Some(a) => a,
            None => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": "TauCode app handle non disponibile" }));
                return Ok(());
            }
        };
        let params = extract_json_or_query(&initial_buf);
        match request_frontend_eval(&app, "terminal_output", params, Duration::from_secs(4)) {
            Ok(res) => {
                let _ = send_json_http(&mut client_stream, 200, "OK", &res);
            }
            Err(e) => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": e }));
            }
        }
        return Ok(());
    }

    // API: Invio input / keystroke al terminale integrato
    if initial_buf.starts_with(b"POST /api/terminal/input") {
        let app_opt = PROXY_APP_HANDLE.lock().ok().and_then(|g| g.clone());
        let app = match app_opt {
            Some(a) => a,
            None => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": "TauCode app handle non disponibile" }));
                return Ok(());
            }
        };
        let params = extract_json_or_query(&initial_buf);
        match request_frontend_eval(&app, "terminal_input", params, Duration::from_secs(4)) {
            Ok(res) => {
                let _ = send_json_http(&mut client_stream, 200, "OK", &res);
            }
            Err(e) => {
                let _ = send_json_http(&mut client_stream, 500, "Internal Server Error", &serde_json::json!({ "ok": false, "error": e }));
            }
        }
        return Ok(());
    }

    // Intercetta chiamate dirette per aprire il tab Blockbench
    if initial_buf.starts_with(b"POST /api/blockbench/open") || initial_buf.starts_with(b"GET /api/blockbench/open")
        || initial_buf.starts_with(b"POST /api/model3d/open") || initial_buf.starts_with(b"GET /api/model3d/open") {
        let (header_part, body_part) = match initial_buf.windows(4).position(|w| w == b"\r\n\r\n") {
            Some(pos) => (&initial_buf[..pos + 4], &initial_buf[pos + 4..]),
            None => (initial_buf.as_slice(), &[][..]),
        };

        let mut path: Option<String> = None;
        let mut title: Option<String> = None;
        let mut slot: Option<i64> = None;

        if !body_part.is_empty() {
            if let Ok(val) = serde_json::from_slice::<serde_json::Value>(body_part) {
                if let Some(p) = val.get("path").or_else(|| val.get("file")).or_else(|| val.get("model")).and_then(|v| v.as_str()) {
                    path = Some(p.to_string());
                }
                if let Some(t) = val.get("title").and_then(|v| v.as_str()) {
                    title = Some(t.to_string());
                }
                if let Some(s) = val.get("slot").and_then(|v| v.as_i64()) {
                    slot = Some(s);
                }
            }
        }

        if path.is_none() && title.is_none() {
            let header_str = String::from_utf8_lossy(header_part);
            if let Some(first_line) = header_str.lines().next() {
                if let Some(query_start) = first_line.find('?') {
                    let end_pos = first_line.find(" HTTP/").unwrap_or(first_line.len());
                    let query_str = &first_line[query_start + 1..end_pos];
                    for pair in query_str.split('&') {
                        let mut parts = pair.splitn(2, '=');
                        let k = parts.next().unwrap_or("");
                        let v = parts.next().unwrap_or("");
                        let decoded_v = percent_decode_simple(v);
                        if k == "path" || k == "file" || k == "model" {
                            path = Some(decoded_v);
                        } else if k == "title" {
                            title = Some(decoded_v);
                        } else if k == "slot" {
                            slot = decoded_v.parse::<i64>().ok();
                        }
                    }
                }
            }
        }

        if let Ok(guard) = PROXY_APP_HANDLE.lock() {
            if let Some(app) = guard.as_ref() {
                let payload = serde_json::json!({
                    "path": path,
                    "title": title,
                    "slot": slot,
                });
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.emit("terax:open-blockbench", &payload);
                    let _ = w.emit("terax:open-model3d", &payload);
                } else {
                    let _ = app.emit("terax:open-blockbench", &payload);
                    let _ = app.emit("terax:open-model3d", &payload);
                }
            }
        }

        let body = serde_json::json!({
            "ok": true,
            "opened": true,
            "message": "Tab Blockbench aperto nell'IDE"
        });
        let body_str = serde_json::to_string(&body).unwrap_or_default();
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
            body_str.len(),
            body_str
        );
        let _ = client_stream.write_all(resp.as_bytes());
        let _ = client_stream.flush();
        return Ok(());
    }

    // Intercetta chiamate per chiudere tab del terminale
    if initial_buf.starts_with(b"POST /api/terminal/close") || initial_buf.starts_with(b"GET /api/terminal/close") {
        let (header_part, body_part) = match initial_buf.windows(4).position(|w| w == b"\r\n\r\n") {
            Some(pos) => (&initial_buf[..pos + 4], &initial_buf[pos + 4..]),
            None => (initial_buf.as_slice(), &[][..]),
        };

        let mut tab_id: Option<i64> = None;
        let mut title: Option<String> = None;
        let mut last: Option<bool> = None;
        let mut all: Option<bool> = None;

        if !body_part.is_empty() {
            if let Ok(val) = serde_json::from_slice::<serde_json::Value>(body_part) {
                if let Some(id) = val.get("tabId").and_then(|v| v.as_i64()) {
                    tab_id = Some(id);
                }
                if let Some(t) = val.get("title").and_then(|v| v.as_str()) {
                    title = Some(t.to_string());
                }
                if let Some(l) = val.get("last").and_then(|v| v.as_bool()) {
                    last = Some(l);
                }
                if let Some(a) = val.get("all").and_then(|v| v.as_bool()) {
                    all = Some(a);
                }
            }
        }

        if tab_id.is_none() && title.is_none() && last.is_none() && all.is_none() {
            let header_str = String::from_utf8_lossy(header_part);
            if let Some(first_line) = header_str.lines().next() {
                if let Some(query_start) = first_line.find('?') {
                    let end_pos = first_line.find(" HTTP/").unwrap_or(first_line.len());
                    let query_str = &first_line[query_start + 1..end_pos];
                    for pair in query_str.split('&') {
                        let mut parts = pair.splitn(2, '=');
                        let k = parts.next().unwrap_or("");
                        let v = parts.next().unwrap_or("");
                        let decoded_v = percent_decode_simple(v);
                        if k == "tabId" || k == "id" {
                            tab_id = decoded_v.parse::<i64>().ok();
                        } else if k == "title" {
                            title = Some(decoded_v);
                        } else if k == "last" {
                            last = Some(decoded_v == "true" || decoded_v == "1");
                        } else if k == "all" {
                            all = Some(decoded_v == "true" || decoded_v == "1");
                        }
                    }
                }
            }
        }

        if tab_id.is_none() && title.is_none() && all.is_none() && last.is_none() {
            last = Some(true);
        }

        if let Ok(guard) = PROXY_APP_HANDLE.lock() {
            if let Some(app) = guard.as_ref() {
                let payload = serde_json::json!({
                    "tabId": tab_id,
                    "title": title,
                    "last": last.unwrap_or(false),
                    "all": all.unwrap_or(false),
                });
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.emit("terax:close-terminal-command", payload);
                } else {
                    let _ = app.emit("terax:close-terminal-command", payload);
                }
            }
        }

        let resp = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 12\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"ok\":true}\n";
        let _ = client_stream.write_all(resp);
        let _ = client_stream.flush();
        return Ok(());
    }

    // Intercetta chiamate API dirette per aprire ed eseguire comandi nel terminale visibile
    if initial_buf.starts_with(b"POST /api/terminal/run") || initial_buf.starts_with(b"GET /api/terminal/run") {
        let (header_part, body_part) = match initial_buf.windows(4).position(|w| w == b"\r\n\r\n") {
            Some(pos) => (&initial_buf[..pos + 4], &initial_buf[pos + 4..]),
            None => (initial_buf.as_slice(), &[][..]),
        };

        let mut command_to_run = String::new();
        let mut cwd: Option<String> = None;
        let mut title: Option<String> = None;
        let mut auto_close = false;
        let mut interactive = false;

        if !body_part.is_empty() {
            if let Ok(val) = serde_json::from_slice::<serde_json::Value>(body_part) {
                if let Some(cmd) = val.get("command").and_then(|v| v.as_str()) {
                    command_to_run = cmd.to_string();
                }
                if let Some(c) = val.get("cwd").and_then(|v| v.as_str()) {
                    cwd = Some(c.to_string());
                }
                if let Some(t) = val.get("title").and_then(|v| v.as_str()) {
                    title = Some(t.to_string());
                }
                if let Some(ac) = val.get("autoClose").and_then(|v| v.as_bool()) {
                    auto_close = ac;
                }
                if let Some(it) = val.get("interactive").and_then(|v| v.as_bool()) {
                    interactive = it;
                }
            }
        }

        if command_to_run.is_empty() {
            let header_str = String::from_utf8_lossy(header_part);
            if let Some(first_line) = header_str.lines().next() {
                if let Some(query_start) = first_line.find('?') {
                    let end_pos = first_line.find(" HTTP/").unwrap_or(first_line.len());
                    let query_str = &first_line[query_start + 1..end_pos];
                    for pair in query_str.split('&') {
                        let mut parts = pair.splitn(2, '=');
                        let k = parts.next().unwrap_or("");
                        let v = parts.next().unwrap_or("");
                        let decoded_v = percent_decode_simple(v);
                        if k == "cmd" || k == "command" {
                            command_to_run = decoded_v;
                        } else if k == "cwd" {
                            cwd = Some(decoded_v);
                        } else if k == "title" {
                            title = Some(decoded_v);
                        } else if k == "autoClose" || k == "close" {
                            auto_close = decoded_v == "true" || decoded_v == "1";
                        } else if k == "interactive" {
                            interactive = decoded_v == "true" || decoded_v == "1";
                        }
                    }
                }
            }
        }

        if !command_to_run.is_empty() {
            let req_id = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();

            if let Ok(guard) = PROXY_APP_HANDLE.lock() {
                if let Some(app) = guard.as_ref() {
                    let payload = serde_json::json!({
                        "command": command_to_run,
                        "cwd": cwd,
                        "title": title,
                        "autoClose": auto_close,
                        "interactive": interactive,
                        "reqId": req_id
                    });
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("terax:open-terminal-command", payload);
                    } else {
                        let _ = app.emit("terax:open-terminal-command", payload);
                    }
                }
            }
            let resp = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 12\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"ok\":true}\n";
            let _ = client_stream.write_all(resp);
            let _ = client_stream.flush();
            return Ok(());
        } else {
            let resp = b"HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 43\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"error\":\"Parametro command mancante\"}\n";
            let _ = client_stream.write_all(resp);
            let _ = client_stream.flush();
            return Ok(());
        }
    }

    // Intercetta chiamate API dirette per Git Push da Antigravity
    if initial_buf.starts_with(b"POST /api/git/push") || initial_buf.starts_with(b"GET /api/git/push") {
        let (header_part, body_part) = match initial_buf.windows(4).position(|w| w == b"\r\n\r\n") {
            Some(pos) => (&initial_buf[..pos + 4], &initial_buf[pos + 4..]),
            None => (initial_buf.as_slice(), &[][..]),
        };

        let mut repo_root: Option<String> = None;
        let mut set_upstream = true;
        let mut force = false;
        let mut commit_message: Option<String> = None;

        if !body_part.is_empty() {
            if let Ok(val) = serde_json::from_slice::<serde_json::Value>(body_part) {
                if let Some(r) = val.get("repoRoot").or_else(|| val.get("repo_root")).or_else(|| val.get("cwd")).and_then(|v| v.as_str()) {
                    repo_root = Some(r.to_string());
                }
                if let Some(su) = val.get("setUpstream").or_else(|| val.get("set_upstream")).and_then(|v| v.as_bool()) {
                    set_upstream = su;
                }
                if let Some(f) = val.get("force").and_then(|v| v.as_bool()) {
                    force = f;
                }
                if let Some(msg) = val.get("commitMessage").or_else(|| val.get("message")).and_then(|v| v.as_str()) {
                    commit_message = Some(msg.to_string());
                }
            }
        }

        if repo_root.is_none() {
            let header_str = String::from_utf8_lossy(header_part);
            if let Some(first_line) = header_str.lines().next() {
                if let Some(query_start) = first_line.find('?') {
                    let end_pos = first_line.find(" HTTP/").unwrap_or(first_line.len());
                    let query_str = &first_line[query_start + 1..end_pos];
                    for pair in query_str.split('&') {
                        let mut parts = pair.splitn(2, '=');
                        let k = parts.next().unwrap_or("");
                        let v = parts.next().unwrap_or("");
                        let decoded_v = percent_decode_simple(v);
                        if k == "repoRoot" || k == "repo_root" || k == "cwd" {
                            repo_root = Some(decoded_v);
                        } else if k == "setUpstream" || k == "set_upstream" {
                            set_upstream = decoded_v == "true" || decoded_v == "1";
                        } else if k == "force" {
                            force = decoded_v == "true" || decoded_v == "1";
                        } else if k == "commitMessage" || k == "message" {
                            commit_message = Some(decoded_v);
                        }
                    }
                }
            }
        }

        let app_opt = PROXY_APP_HANDLE.lock().ok().and_then(|g| g.clone());
        let app = match app_opt {
            Some(a) => a,
            None => {
                let err_resp = b"HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"ok\":false,\"error\":\"TauCode IDE application handle non disponibile\"}\n";
                let _ = client_stream.write_all(err_resp);
                let _ = client_stream.flush();
                return Ok(());
            }
        };

        let registry = app.state::<crate::modules::workspace::WorkspaceRegistry>();
        let target_repo = repo_root
            .map(std::path::PathBuf::from)
            .unwrap_or_else(crate::modules::workspace::resolve_launch_dir);

        let target_repo_str = target_repo.to_string_lossy().into_owned();
        let _ = registry.authorize(&target_repo);
        let workspace = crate::modules::workspace::WorkspaceEnv::Local;

        // Se è presente un commitMessage, verifichiamo lo status ed eseguiamo stage + commit
        if let Some(ref msg) = commit_message {
            let trimmed = msg.trim();
            if !trimmed.is_empty() {
                let _ = crate::modules::git::process::run_git(
                    &workspace,
                    Some(&target_repo_str),
                    ["add", "-A"],
                    crate::modules::git::types::DEFAULT_TIMEOUT_SECS,
                );
                let _ = crate::modules::git::operations::commit(
                    &registry,
                    &target_repo_str,
                    trimmed,
                    &workspace,
                );
            }
        }

        match crate::modules::git::operations::push_with_options(
            &registry,
            &target_repo_str,
            set_upstream,
            force,
            &workspace,
        ) {
            Ok(result) => {
                let payload = serde_json::json!({
                    "repoRoot": target_repo_str,
                    "remote": result.remote,
                    "branch": result.branch,
                    "pushed": true,
                });
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.emit("terax:git-pushed", &payload);
                } else {
                    let _ = app.emit("terax:git-pushed", &payload);
                }

                let body = serde_json::json!({
                    "ok": true,
                    "pushed": true,
                    "remote": result.remote,
                    "branch": result.branch,
                    "repoRoot": target_repo_str,
                    "message": format!(
                        "Pushed with success to {}/{}",
                        result.remote.as_deref().unwrap_or("origin"),
                        result.branch.as_deref().unwrap_or("HEAD")
                    )
                });
                let body_str = serde_json::to_string(&body).unwrap_or_default();
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                    body_str.len(),
                    body_str
                );
                let _ = client_stream.write_all(resp.as_bytes());
                let _ = client_stream.flush();
                return Ok(());
            }
            Err(e) => {
                let body = serde_json::json!({
                    "ok": false,
                    "error": e.to_string(),
                    "repoRoot": target_repo_str,
                });
                let body_str = serde_json::to_string(&body).unwrap_or_default();
                let resp = format!(
                    "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                    body_str.len(),
                    body_str
                );
                let _ = client_stream.write_all(resp.as_bytes());
                let _ = client_stream.flush();
                return Ok(());
            }
        }
    }

    // Intercetta chiamate API dirette per Git Status da Antigravity
    if initial_buf.starts_with(b"GET /api/git/status") || initial_buf.starts_with(b"POST /api/git/status") {
        let (header_part, body_part) = match initial_buf.windows(4).position(|w| w == b"\r\n\r\n") {
            Some(pos) => (&initial_buf[..pos + 4], &initial_buf[pos + 4..]),
            None => (initial_buf.as_slice(), &[][..]),
        };

        let mut repo_root: Option<String> = None;
        if !body_part.is_empty() {
            if let Ok(val) = serde_json::from_slice::<serde_json::Value>(body_part) {
                if let Some(r) = val.get("repoRoot").or_else(|| val.get("repo_root")).or_else(|| val.get("cwd")).and_then(|v| v.as_str()) {
                    repo_root = Some(r.to_string());
                }
            }
        }
        if repo_root.is_none() {
            let header_str = String::from_utf8_lossy(header_part);
            if let Some(first_line) = header_str.lines().next() {
                if let Some(query_start) = first_line.find('?') {
                    let end_pos = first_line.find(" HTTP/").unwrap_or(first_line.len());
                    let query_str = &first_line[query_start + 1..end_pos];
                    for pair in query_str.split('&') {
                        let mut parts = pair.splitn(2, '=');
                        let k = parts.next().unwrap_or("");
                        let v = parts.next().unwrap_or("");
                        let decoded_v = percent_decode_simple(v);
                        if k == "repoRoot" || k == "repo_root" || k == "cwd" {
                            repo_root = Some(decoded_v);
                        }
                    }
                }
            }
        }

        let app_opt = PROXY_APP_HANDLE.lock().ok().and_then(|g| g.clone());
        let app = match app_opt {
            Some(a) => a,
            None => {
                let err_resp = b"HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"ok\":false,\"error\":\"TauCode IDE application handle non disponibile\"}\n";
                let _ = client_stream.write_all(err_resp);
                let _ = client_stream.flush();
                return Ok(());
            }
        };

        let registry = app.state::<crate::modules::workspace::WorkspaceRegistry>();
        let target_repo = repo_root
            .map(std::path::PathBuf::from)
            .unwrap_or_else(crate::modules::workspace::resolve_launch_dir);
        let target_repo_str = target_repo.to_string_lossy().into_owned();
        let _ = registry.authorize(&target_repo);
        let workspace = crate::modules::workspace::WorkspaceEnv::Local;

        match crate::modules::git::operations::status(&registry, &target_repo_str, &workspace) {
            Ok(snap) => {
                let body = serde_json::json!({
                    "ok": true,
                    "repoRoot": snap.repo_root,
                    "branch": snap.branch,
                    "upstream": snap.upstream,
                    "ahead": snap.ahead,
                    "behind": snap.behind,
                    "isDetached": snap.is_detached,
                    "changedFilesCount": snap.changed_files.len(),
                    "changedFiles": snap.changed_files,
                });
                let body_str = serde_json::to_string(&body).unwrap_or_default();
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                    body_str.len(),
                    body_str
                );
                let _ = client_stream.write_all(resp.as_bytes());
                let _ = client_stream.flush();
                return Ok(());
            }
            Err(e) => {
                let body = serde_json::json!({
                    "ok": false,
                    "error": e.to_string(),
                    "repoRoot": target_repo_str,
                });
                let body_str = serde_json::to_string(&body).unwrap_or_default();
                let resp = format!(
                    "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                    body_str.len(),
                    body_str
                );
                let _ = client_stream.write_all(resp.as_bytes());
                let _ = client_stream.flush();
                return Ok(());
            }
        }
    }

    if initial_buf.starts_with(b"GET /main.js") {
        match fetch_and_patch_main_js() {
            Ok(resp_bytes) => {
                client_stream.write_all(&resp_bytes)?;
                client_stream.flush()?;
                return Ok(());
            }
            Err(e) => {
                log::error!("[AntigravityProxy] Failed to patch main.js: {}", e);
                let err_resp = b"HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\nFailed to patch main.js";
                let _ = client_stream.write_all(err_resp);
                return Ok(());
            }
        }
    }

    let header_str_lossy = String::from_utf8_lossy(&initial_buf);
    let is_ws = header_str_lossy
        .lines()
        .any(|l| {
            let lower = l.to_ascii_lowercase();
            lower.starts_with("upgrade:") && lower.contains("websocket")
        });

    if is_ws {
        let (header_part, rest) = match initial_buf.windows(4).position(|w| w == b"\r\n\r\n") {
            Some(pos) => (&initial_buf[..pos + 4], &initial_buf[pos + 4..]),
            None => (initial_buf.as_slice(), &[][..]),
        };
        let header_str = String::from_utf8_lossy(header_part);
        let mut new_headers = Vec::new();
        for line in header_str.split("\r\n") {
            if line.is_empty() {
                break;
            }
            let lower = line.to_ascii_lowercase();
            if lower.starts_with("host:") {
                new_headers.push(format!("Host: 127.0.0.1:{}", BACKEND_PORT));
            } else if lower.starts_with("origin:") {
                new_headers.push(format!("Origin: http://127.0.0.1:{}", BACKEND_PORT));
            } else {
                new_headers.push(line.to_string());
            }
        }
        new_headers.push(String::new());
        new_headers.push(String::new());
        let mut send_buf = new_headers.join("\r\n").into_bytes();
        send_buf.extend_from_slice(rest);

        let mut backend = TcpStream::connect(format!("127.0.0.1:{}", BACKEND_PORT))?;
        backend.write_all(&send_buf)?;
        backend.flush()?;

        let mut client_read = client_stream.try_clone()?;
        let mut client_write = client_stream;
        let mut backend_read = backend.try_clone()?;
        let mut backend_write = backend;

        let t1 = std::thread::spawn(move || {
            let _ = std::io::copy(&mut client_read, &mut backend_write);
            let _ = backend_write.shutdown(std::net::Shutdown::Both);
        });
        let t2 = std::thread::spawn(move || {
            let _ = std::io::copy(&mut backend_read, &mut client_write);
            let _ = client_write.shutdown(std::net::Shutdown::Both);
        });
        let _ = t1.join();
        let _ = t2.join();
        return Ok(());
    }

    // Other HTTP requests: rewrite Connection: close so socket is not reused for /main.js
    let (header_part, body_part) = match initial_buf.windows(4).position(|w| w == b"\r\n\r\n") {
        Some(pos) => (&initial_buf[..pos + 4], &initial_buf[pos + 4..]),
        None => (initial_buf.as_slice(), &[][..]),
    };

    let header_str = String::from_utf8_lossy(header_part);
    let mut content_length: usize = 0;
    let mut new_headers = Vec::new();
    let mut has_conn = false;

    for line in header_str.split("\r\n") {
        if line.is_empty() {
            break;
        }
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("content-length:") {
            if let Some(val) = line.split(':').nth(1) {
                content_length = val.trim().parse().unwrap_or(0);
            }
            new_headers.push(line.to_string());
        } else if lower.starts_with("connection:") {
            new_headers.push("Connection: close".to_string());
            has_conn = true;
        } else if lower.starts_with("proxy-connection:") {
            // omit
        } else if lower.starts_with("host:") {
            new_headers.push(format!("Host: 127.0.0.1:{}", BACKEND_PORT));
        } else if lower.starts_with("origin:") {
            new_headers.push(format!("Origin: http://127.0.0.1:{}", BACKEND_PORT));
        } else {
            new_headers.push(line.to_string());
        }
    }
    if !has_conn {
        new_headers.push("Connection: close".to_string());
    }
    new_headers.push(String::new());
    new_headers.push(String::new());

    let mut send_buf = new_headers.join("\r\n").into_bytes();
    send_buf.extend_from_slice(body_part);

    let mut backend = TcpStream::connect(format!("127.0.0.1:{}", BACKEND_PORT))?;
    backend.write_all(&send_buf)?;

    let body_read_so_far = body_part.len();
    if content_length > body_read_so_far {
        let mut remaining = content_length - body_read_so_far;
        let mut chunk = [0u8; 8192];
        while remaining > 0 {
            let to_read = remaining.min(chunk.len());
            let n = client_stream.read(&mut chunk[..to_read])?;
            if n == 0 {
                break;
            }
            backend.write_all(&chunk[..n])?;
            remaining -= n;
        }
    }
    backend.flush()?;

    let mut client_write = client_stream;
    let _ = std::io::copy(&mut backend, &mut client_write);
    let _ = client_write.flush();
    let _ = client_write.shutdown(std::net::Shutdown::Both);

    Ok(())
}

fn start_proxy_listener() {
    if PROXY_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(|| {
        let addr = format!("127.0.0.1:{}", PROXY_PORT);
        let mut bound_listener = None;

        for _ in 0..15 {
            match TcpListener::bind(&addr) {
                Ok(l) => {
                    bound_listener = Some(l);
                    break;
                }
                Err(e) => {
                    log::warn!("[AntigravityProxy] Retry bind {}: {}", addr, e);
                    std::thread::sleep(Duration::from_millis(200));
                }
            }
        }

        let listener = match bound_listener {
            Some(l) => l,
            None => {
                log::error!("[AntigravityProxy] Failed to bind {} after retries", addr);
                PROXY_RUNNING.store(false, Ordering::SeqCst);
                return;
            }
        };

        log::info!("[AntigravityProxy] Listening on http://{}", addr);

        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    std::thread::spawn(move || {
                        let _ = handle_proxy_client(stream);
                    });
                }
                Err(e) => {
                    log::warn!("[AntigravityProxy] Accept warning: {}", e);
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
        }

        PROXY_RUNNING.store(false, Ordering::SeqCst);
    });
}

#[tauri::command]
pub async fn start_antigravity_backend(
    app: AppHandle,
    state: State<'_, BackendProcess>,
    workspace_root: Option<String>,
) -> Result<(), String> {
    let norm_workspace = workspace_root
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.replace('/', "\\"));

    if let Ok(mut handle_guard) = PROXY_APP_HANDLE.lock() {
        *handle_guard = Some(app.clone());
    }

    let mut lock = state.0.lock().map_err(|_| "Mutex poisoned")?;

    let backend_listening = std::net::TcpStream::connect(format!("127.0.0.1:{}", BACKEND_PORT)).is_ok();
    let proxy_listening = std::net::TcpStream::connect(format!("127.0.0.1:{}", PROXY_PORT)).is_ok();

    // Se sia il backend (8086) sia il proxy (8085) stanno già girando:
    if backend_listening && proxy_listening && lock.child.is_some() {
        lock.current_workspace = norm_workspace;
        return Ok(());
    }

    // Se c'è un processo child registrato, ripuliamo
    if let Some(mut child) = lock.child.take() {
        let _ = child.kill();
    }
    lock.current_workspace = None;

    // Se la porta 8086 è occupata da un vecchio processo orfano, liberala
    if backend_listening {
        kill_process_on_port(BACKEND_PORT);
        let _ = wait_for_port_free(BACKEND_PORT, std::time::Duration::from_millis(500));
    }

    // Se la porta 8085 è occupata ma il proxy non è attivo nel processo corrente, liberala
    if proxy_listening && !PROXY_RUNNING.load(Ordering::SeqCst) {
        kill_process_on_port(PROXY_PORT);
        let _ = wait_for_port_free(PROXY_PORT, std::time::Duration::from_millis(500));
    }

    let agy_path = get_private_agy_path(&app)
        .ok_or_else(|| "Cartella app non trovata".to_string())?;

    if !agy_path.exists() {
        return Err("Il motore Antigravity dedicato non è ancora installato nell'IDE.".to_string());
    }

    // Invalida la cache di main.js per il nuovo avvio
    if let Ok(mut guard) = CACHED_MAIN_JS.lock() {
        *guard = None;
    }

    let mut cmd = Command::new(agy_path);
    cmd.arg("--hub")
       .arg(format!("--hub-port={}", BACKEND_PORT))
       .arg("--app_data_dir=antigravity")
       .env("AGY_ENABLE_HUB", "1")
       .env("ANTIGRAVITY_VSCODE_HOST", "1")
       .stdin(std::process::Stdio::null())
       .stdout(std::process::Stdio::null())
       .stderr(std::process::Stdio::null());

    if let Some(ref root) = norm_workspace {
        cmd.arg(format!("--add-dir={}", root));
    }

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let child = cmd.spawn().map_err(|e| e.to_string())?;
    lock.child = Some(child);
    lock.current_workspace = norm_workspace;

    // Avvia il proxy HTTP su 8085 se non è già attivo
    start_proxy_listener();

    Ok(())
}

#[tauri::command]
pub fn stop_antigravity_backend(state: State<'_, BackendProcess>) -> Result<(), String> {
    let mut lock = state.0.lock().map_err(|_| "Mutex poisoned")?;
    if let Some(mut child) = lock.child.take() {
        let _ = child.kill();
    }
    lock.current_workspace = None;
    kill_process_on_port(BACKEND_PORT);
    kill_process_on_port(PROXY_PORT);
    if let Ok(mut guard) = CACHED_MAIN_JS.lock() {
        *guard = None;
    }
    Ok(())
}

// ============================================================================
// GESTIONE SKILL GLOBALI DI TERAX
// ============================================================================

pub const DEFAULT_GEMINI_SKILLS: &[&str] = &[
    "agy-customizations",
    "antigravity_guide",
    "antigravity-guide",
    "automation",
    "generative_ui",
    "migrate-workflows",
    "permissioned-github",
    "plugin",
    "run-workflow",
    "ui-plugin-navigation",
    "taucode-tabs",
    "skill-builder",
];

pub fn is_default_gemini_skill(name: &str) -> bool {
    let clean = name.trim().to_lowercase().replace(' ', "-").replace('_', "-");
    DEFAULT_GEMINI_SKILLS.iter().any(|s| {
        let s_norm = s.replace('_', "-");
        s_norm == clean
    })
}

fn get_deleted_skills_file() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".gemini").join("antigravity").join("deleted_skills.json"))
}

pub fn get_deleted_skills() -> std::collections::HashSet<String> {
    let mut set = std::collections::HashSet::new();
    if let Some(file) = get_deleted_skills_file() {
        if let Ok(content) = std::fs::read_to_string(file) {
            if let Ok(list) = serde_json::from_str::<Vec<String>>(&content) {
                for s in list {
                    let clean = s.trim().to_lowercase();
                    set.insert(clean.clone());
                    set.insert(clean.replace(' ', "-").replace('_', "-"));
                }
            }
        }
    }
    set
}

pub fn record_deleted_skill(name: &str) {
    let clean = name.trim().to_lowercase();
    if clean.is_empty() { return; }
    let mut set = get_deleted_skills();
    set.insert(clean.clone());
    set.insert(clean.replace(' ', "-").replace('_', "-"));
    if let Some(file) = get_deleted_skills_file() {
        if let Some(parent) = file.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let list: Vec<String> = set.into_iter().collect();
        let _ = std::fs::write(file, serde_json::to_string(&list).unwrap_or_default());
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub folder: String,
    pub enabled: bool,
    pub path: String,
    pub dir: String,
    pub content: String,
    pub is_default: bool,
    #[serde(default)]
    pub extension_id: Option<String>,
    #[serde(default)]
    pub extension_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillProjectInfo {
    pub name: String,
    pub folder: String,
    pub path: String,
    pub entry_file: String,
    pub enabled: bool,
    pub is_default: bool,
}

fn get_antigravity_skills_dir(_app: &AppHandle) -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Impossibile risolvere home directory".to_string())?;
    let skills_dir = home.join(".gemini").join("antigravity").join("builtin").join("skills");
    if !skills_dir.exists() {
        std::fs::create_dir_all(&skills_dir)
            .map_err(|e| format!("Impossibile creare cartella skills: {e}"))?;
    }
    Ok(skills_dir)
}

fn get_global_antigravity_skills_dir() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let dir = home.join(".gemini").join("config").join("skills");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Some(dir)
}

fn parse_skill_markdown(raw: &str, fallback_name: &str) -> (String, String, String, String) {
    let trimmed = raw.trim_start();
    if !trimmed.starts_with("---") {
        return (fallback_name.to_string(), String::new(), "Generali".to_string(), raw.to_string());
    }

    let rest = &trimmed[3..];
    if let Some(end_idx) = rest.find("\n---") {
        let frontmatter = &rest[..end_idx];
        let body = rest[end_idx + 4..].trim().to_string();

        let mut name = fallback_name.to_string();
        let mut folder = "Generali".to_string();
        let mut desc_lines = Vec::new();
        let mut in_desc = false;

        for line in frontmatter.lines() {
            let l = line.trim();
            if let Some(n) = l.strip_prefix("name:") {
                name = n.trim().trim_matches('\'').trim_matches('"').to_string();
                in_desc = false;
            } else if let Some(f) = l.strip_prefix("folder:").or_else(|| l.strip_prefix("group:")) {
                let clean_f = f.trim().trim_matches('\'').trim_matches('"').to_string();
                if !clean_f.is_empty() {
                    folder = clean_f;
                }
                in_desc = false;
            } else if let Some(d) = l.strip_prefix("description:") {
                let rest_d = d.trim();
                in_desc = true;
                if rest_d != ">-" && rest_d != "|" && !rest_d.is_empty() {
                    desc_lines.push(rest_d.trim_matches('\'').trim_matches('"').to_string());
                }
            } else if in_desc {
                if l.contains(':') && !line.starts_with("  ") && !line.starts_with('\t') {
                    in_desc = false;
                } else if !l.is_empty() {
                    desc_lines.push(l.to_string());
                }
            }
        }

        let description = desc_lines.join(" ");
        (name, description, folder, body)
    } else {
        (fallback_name.to_string(), String::new(), "Generali".to_string(), raw.to_string())
    }
}

#[tauri::command]
pub fn list_antigravity_skills(app: AppHandle) -> Result<Vec<SkillInfo>, String> {
    let skills_dir = get_antigravity_skills_dir(&app)?;
    let global_dir = get_global_antigravity_skills_dir();
    let deleted_skills = get_deleted_skills();

    let mut skills = Vec::new();
    let mut seen_keys = std::collections::HashSet::new();

    let scan_dir = |dir_path: &std::path::Path, skills_vec: &mut Vec<SkillInfo>, seen: &mut std::collections::HashSet<String>| {
        if let Ok(entries) = std::fs::read_dir(dir_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    let folder_clean = folder_name.trim().to_lowercase();
                    let folder_norm = folder_clean.replace(' ', "-").replace('_', "-");

                    if deleted_skills.contains(&folder_clean) || deleted_skills.contains(&folder_norm) {
                        let _ = std::fs::remove_dir_all(&path);
                        continue;
                    }

                    let active_file = path.join("SKILL.md");
                    let disabled_file = path.join("SKILL.md.disabled");

                    let (file_to_read, enabled) = if active_file.exists() {
                        (active_file, true)
                    } else if disabled_file.exists() {
                        (disabled_file, false)
                    } else {
                        continue;
                    };

                    let raw = std::fs::read_to_string(&file_to_read).unwrap_or_default();
                    let (name, description, mut folder, body) = parse_skill_markdown(&raw, &folder_name);
                    let name_clean = name.trim().to_lowercase();
                    let name_norm = name_clean.replace(' ', "-").replace('_', "-");

                    if deleted_skills.contains(&name_clean) || deleted_skills.contains(&name_norm) {
                        let _ = std::fs::remove_dir_all(&path);
                        continue;
                    }

                    if seen.contains(&name_norm) {
                        continue;
                    }
                    seen.insert(name_norm);

                    let is_default = is_default_gemini_skill(&folder_name) || is_default_gemini_skill(&name);
                    if is_default || folder.to_lowercase() == "built-in" || folder.to_lowercase() == "builtin" {
                        folder = "Built-in".to_string();
                    }

                    let (ext_id, ext_name) = {
                        let tag_file = path.join(".taucode_extension");
                        if tag_file.exists() {
                            if let Ok(tag_raw) = std::fs::read_to_string(tag_file) {
                                if let Ok(tag_json) = serde_json::from_str::<serde_json::Value>(&tag_raw) {
                                    (
                                        tag_json.get("extension_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                                        tag_json.get("extension_name").and_then(|v| v.as_str()).map(|s| s.to_string()),
                                    )
                                } else { (None, None) }
                            } else { (None, None) }
                        } else { (None, None) }
                    };

                    skills_vec.push(SkillInfo {
                        name,
                        description,
                        folder,
                        enabled,
                        path: file_to_read.to_string_lossy().to_string(),
                        dir: path.to_string_lossy().to_string(),
                        content: body,
                        is_default,
                        extension_id: ext_id,
                        extension_name: ext_name,
                    });
                }
            }
        }
    };

    scan_dir(&skills_dir, &mut skills, &mut seen_keys);
    if let Some(ref g_dir) = global_dir {
        if g_dir.exists() {
            scan_dir(g_dir, &mut skills, &mut seen_keys);
        }
    }

    skills.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(skills)
}

#[tauri::command]
pub fn save_antigravity_skill(
    app: AppHandle,
    name: String,
    description: String,
    content: String,
    folder: Option<String>,
    enabled: bool,
) -> Result<SkillInfo, String> {
    let clean_name = name.trim().to_lowercase().replace(' ', "-");
    if clean_name.is_empty() {
        return Err("Il nome della skill non può essere vuoto".to_string());
    }

    if is_default_gemini_skill(&clean_name) {
        return Err("Le skill predefinite di Gemini sono protette e non possono essere modificate.".to_string());
    }

    let clean_folder = folder
        .map(|f| f.trim().to_string())
        .filter(|f| !f.is_empty())
        .unwrap_or_else(|| "Generali".to_string());

    let skills_dir = get_antigravity_skills_dir(&app)?;
    let target_dir = skills_dir.join(&clean_name);
    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| format!("Impossibile creare cartella skill: {e}"))?;
    }

    let clean_desc = description.trim();
    let body = content.trim();

    let full_content = format!(
        "---\nname: {}\nfolder: {}\ndescription: >-\n  {}\n---\n\n{}\n",
        clean_name,
        clean_folder,
        clean_desc.replace('\n', "\n  "),
        body
    );

    let active_file = target_dir.join("SKILL.md");
    let disabled_file = target_dir.join("SKILL.md.disabled");

    let (file_to_write, file_to_remove) = if enabled {
        (active_file, disabled_file)
    } else {
        (disabled_file, active_file)
    };

    if file_to_remove.exists() {
        let _ = std::fs::remove_file(file_to_remove);
    }

    std::fs::write(&file_to_write, full_content)
        .map_err(|e| format!("Errore scrittura SKILL.md: {e}"))?;

    // Copia persistente immediata nella directory globale di configurazione ~/.gemini/config/skills
    if let Some(global_dir) = get_global_antigravity_skills_dir() {
        let global_target = global_dir.join(&clean_name);
        let _ = copy_dir_filtered(&target_dir, &global_target);
    }

    Ok(SkillInfo {
        name: clean_name,
        description: clean_desc.to_string(),
        folder: clean_folder,
        enabled,
        path: file_to_write.to_string_lossy().to_string(),
        dir: target_dir.to_string_lossy().to_string(),
        content: body.to_string(),
        is_default: false,
        extension_id: None,
        extension_name: None,
    })
}

#[tauri::command]
pub fn toggle_antigravity_skill(
    app: AppHandle,
    name: String,
    enabled: bool,
) -> Result<bool, String> {
    let clean_name = name.trim().to_lowercase();
    let skills_dir = get_antigravity_skills_dir(&app)?;
    let target_dir = skills_dir.join(&clean_name);

    if !target_dir.exists() {
        return Err("Skill non trovata".to_string());
    }

    let active_file = target_dir.join("SKILL.md");
    let disabled_file = target_dir.join("SKILL.md.disabled");

    if enabled {
        if disabled_file.exists() {
            std::fs::rename(&disabled_file, &active_file)
                .map_err(|e| format!("Impossibile attivare skill: {e}"))?;
        }
    } else {
        if active_file.exists() {
            std::fs::rename(&active_file, &disabled_file)
                .map_err(|e| format!("Impossibile disattivare skill: {e}"))?;
        }
    }

    Ok(enabled)
}

#[tauri::command]
pub fn toggle_antigravity_skill_folder(
    app: AppHandle,
    folder: String,
    enabled: bool,
) -> Result<Vec<SkillInfo>, String> {
    let skills_dir = get_antigravity_skills_dir(&app)?;
    let target_folder_lower = folder.trim().to_lowercase();

    if let Ok(entries) = std::fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let folder_name = entry.file_name().to_string_lossy().to_string();
                let active_file = path.join("SKILL.md");
                let disabled_file = path.join("SKILL.md.disabled");

                let file_opt = if active_file.exists() {
                    Some((active_file, true, disabled_file))
                } else if disabled_file.exists() {
                    Some((disabled_file, false, active_file))
                } else {
                    None
                };

                if let Some((current_file, is_enabled, other_file)) = file_opt {
                    let raw = std::fs::read_to_string(&current_file).unwrap_or_default();
                    let (_, _, skill_folder, _) = parse_skill_markdown(&raw, &folder_name);

                    if skill_folder.to_lowercase() == target_folder_lower {
                        if enabled && !is_enabled {
                            let _ = std::fs::rename(&current_file, &other_file);
                        } else if !enabled && is_enabled {
                            let _ = std::fs::rename(&current_file, &other_file);
                        }
                    }
                }
            }
        }
    }

    list_antigravity_skills(app)
}

#[tauri::command]
pub fn rename_antigravity_skill_folder(
    app: AppHandle,
    old_folder: String,
    new_folder: String,
) -> Result<Vec<SkillInfo>, String> {
    let clean_new = new_folder.trim().to_string();
    if clean_new.is_empty() {
        return Err("Il nome della cartella non può essere vuoto".to_string());
    }

    let skills_dir = get_antigravity_skills_dir(&app)?;
    let old_folder_lower = old_folder.trim().to_lowercase();

    if let Ok(entries) = std::fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let folder_name = entry.file_name().to_string_lossy().to_string();
                let active_file = path.join("SKILL.md");
                let disabled_file = path.join("SKILL.md.disabled");

                let file_to_update = if active_file.exists() {
                    Some(active_file)
                } else if disabled_file.exists() {
                    Some(disabled_file)
                } else {
                    None
                };

                if let Some(target_file) = file_to_update {
                    if is_default_gemini_skill(&folder_name) {
                        continue;
                    }
                    let raw = std::fs::read_to_string(&target_file).unwrap_or_default();
                    let (name, desc, current_folder, body) = parse_skill_markdown(&raw, &folder_name);
                    if is_default_gemini_skill(&name) {
                        continue;
                    }

                    if current_folder.to_lowercase() == old_folder_lower {
                        let updated_content = format!(
                            "---\nname: {}\nfolder: {}\ndescription: >-\n  {}\n---\n\n{}\n",
                            name,
                            clean_new,
                            desc.replace('\n', "\n  "),
                            body
                        );
                        let _ = std::fs::write(&target_file, updated_content);
                    }
                }
            }
        }
    }

    list_antigravity_skills(app)
}

#[tauri::command]
pub fn delete_antigravity_skill(app: AppHandle, name: String, dir: Option<String>) -> Result<(), String> {
    let clean_name = name.trim().to_lowercase();
    let kebab_name = clean_name.replace(' ', "-").replace('_', "-");
    let snake_name = clean_name.replace(' ', "_").replace('-', "_");

    record_deleted_skill(&clean_name);
    record_deleted_skill(&kebab_name);

    let skills_dir = get_antigravity_skills_dir(&app)?;
    let global_dir = get_global_antigravity_skills_dir();

    if let Some(ref d) = dir {
        let p = std::path::PathBuf::from(d);
        if p.exists() && p.is_dir() {
            let _ = std::fs::remove_dir_all(&p);
        }
        if let Some(f_name) = std::path::PathBuf::from(d).file_name().and_then(|n| n.to_str()) {
            record_deleted_skill(f_name);
            let _ = std::fs::remove_dir_all(skills_dir.join(f_name));
            if let Some(ref g_dir) = global_dir {
                let _ = std::fs::remove_dir_all(g_dir.join(f_name));
            }
        }
    }

    for candidate in [&clean_name, &kebab_name, &snake_name] {
        let target = skills_dir.join(candidate);
        if target.exists() && target.is_dir() {
            let _ = std::fs::remove_dir_all(&target);
        }
        if let Some(ref g_dir) = global_dir {
            let g_target = g_dir.join(candidate);
            if g_target.exists() && g_target.is_dir() {
                let _ = std::fs::remove_dir_all(&g_target);
            }
        }
    }

    if let Some(launch_state) = app.try_state::<crate::LaunchDir>() {
        if let Ok(lock) = launch_state.0.lock() {
            if let Some(ref ws_dir) = *lock {
                let ws_skills = std::path::Path::new(ws_dir).join(".agents").join("skills");
                for candidate in [&clean_name, &kebab_name, &snake_name] {
                    let ws_target = ws_skills.join(candidate);
                    if ws_target.exists() && ws_target.is_dir() {
                        let _ = std::fs::remove_dir_all(&ws_target);
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn scaffold_antigravity_skill_project(
    app: AppHandle,
    name: String,
    folder: Option<String>,
    description: Option<String>,
) -> Result<SkillProjectInfo, String> {
    let skills_dir = get_antigravity_skills_dir(&app)?;
    let input_trimmed = name.trim().to_lowercase().replace(' ', "-");
    let clean_name = if input_trimmed.is_empty()
        || input_trimmed == "untitled"
        || input_trimmed == "untitled-skill"
    {
        let mut i = 1;
        loop {
            let candidate = format!("untitled-skill-{}", i);
            if !skills_dir.join(&candidate).exists() {
                break candidate;
            }
            i += 1;
        }
    } else {
        input_trimmed
    };

    let is_default = is_default_gemini_skill(&clean_name);

    let clean_folder = folder
        .map(|f| f.trim().to_string())
        .filter(|f| !f.is_empty())
        .unwrap_or_else(|| "Generali".to_string());

    let skill_dir = skills_dir.join(&clean_name);

    if !skill_dir.exists() {
        std::fs::create_dir_all(&skill_dir)
            .map_err(|e| format!("Impossibile creare cartella skill: {e}"))?;
    }

    // Crea sottocartelle scripts/ e references/ se mancanti (solo per custom skills)
    if !is_default {
        let scripts_dir = skill_dir.join("scripts");
        if !scripts_dir.exists() {
            let _ = std::fs::create_dir_all(&scripts_dir);
        }
        let sample_script = scripts_dir.join("run.py");
        if !sample_script.exists() {
            let script_content = format!(
                "#!/usr/bin/env python3\n\"\"\"\nScript operativo per la skill: {}\nPuò essere invocato dal terminale o dall'agente Antigravity.\n\"\"\"\n\ndef main():\n    print(\"Esecuzione script per la skill: {}\")\n\nif __name__ == \"__main__\":\n    main()\n",
                clean_name, clean_name
            );
            let _ = std::fs::write(&sample_script, script_content);
        }

        let refs_dir = skill_dir.join("references");
        if !refs_dir.exists() {
            let _ = std::fs::create_dir_all(&refs_dir);
        }
        let refs_readme = refs_dir.join("README.md");
        if !refs_readme.exists() {
            let readme_content = format!(
                "# Riferimenti e Risorse: {}\n\nInserisci qui documentazione, schemi JSON, template o snippet di riferimento che l'agente Antigravity può consultare quando esegue questa skill.\n",
                clean_name
            );
            let _ = std::fs::write(&refs_readme, readme_content);
        }
    }

    let active_file = skill_dir.join("SKILL.md");
    let disabled_file = skill_dir.join("SKILL.md.disabled");
    let (entry_file, is_enabled) = if disabled_file.exists() && !active_file.exists() {
        (disabled_file, false)
    } else {
        (active_file, true)
    };

    let desc = description
        .map(|d| d.trim().to_string())
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| format!("Istruzioni operative per la skill {}.", clean_name));

    // Se SKILL.md (o .disabled) non esiste ancora, crealo con il template iniziale (se non è default)
    if !entry_file.exists() && !is_default {
        let full_content = format!(
            "---\nname: {}\nfolder: {}\ndescription: >-\n  {}\n---\n\n# Skill: {}\n\nDescrivi qui i passaggi dettagliati che l'agente deve seguire:\n\n1. **Verifica iniziale**: Controlla i prerequisiti o i file di configurazione\n2. **Esecuzione comandi**: Esegui le operazioni necessarie o gli script in `scripts/`\n3. **Validazione finale**: Verifica i risultati e comunica l'esito finale\n",
            clean_name,
            clean_folder,
            desc.replace('\n', "\n  "),
            clean_name
        );
        std::fs::write(&entry_file, full_content)
            .map_err(|e| format!("Errore creazione SKILL.md: {e}"))?;
    }

    // Se skill.json non esiste, crealo
    let skill_json_file = skill_dir.join("skill.json");
    if !skill_json_file.exists() {
        let json_content = serde_json::json!({
            "name": clean_name,
            "folder": clean_folder,
            "description": desc,
            "enabled": is_enabled,
            "is_default": is_default,
            "version": "1.0.0",
            "entry": if is_enabled { "SKILL.md" } else { "SKILL.md.disabled" },
            "scripts": {
                "run": "python scripts/run.py"
            }
        });
        if let Ok(json_str) = serde_json::to_string_pretty(&json_content) {
            let _ = std::fs::write(&skill_json_file, json_str);
        }
    }

    // skill.json è il file di configurazione primario da aprire nello space
    let initial_file_to_open = skill_json_file.to_string_lossy().to_string();

    Ok(SkillProjectInfo {
        name: clean_name,
        folder: clean_folder,
        path: skill_dir.to_string_lossy().to_string(),
        entry_file: initial_file_to_open,
        enabled: is_enabled,
        is_default,
    })
}

#[tauri::command]
pub fn sync_antigravity_skill_metadata(
    app: AppHandle,
    name: String,
) -> Result<SkillProjectInfo, String> {
    let clean_name = name.trim().to_lowercase().replace(' ', "-");
    let is_default = is_default_gemini_skill(&clean_name);
    if is_default {
        return Err("Le skill predefinite di Gemini sono protette e non possono essere modificate.".to_string());
    }

    let skills_dir = get_antigravity_skills_dir(&app)?;
    let skill_dir = skills_dir.join(&clean_name);

    if !skill_dir.exists() {
        return Err("Cartella skill non trovata".to_string());
    }

    let skill_json_file = skill_dir.join("skill.json");
    let active_file = skill_dir.join("SKILL.md");
    let disabled_file = skill_dir.join("SKILL.md.disabled");

    let (mut entry_file, mut is_enabled) = if active_file.exists() {
        (active_file.clone(), true)
    } else if disabled_file.exists() {
        (disabled_file.clone(), false)
    } else {
        (active_file.clone(), true)
    };

    // Se esiste skill.json, leggilo e sincronizza con il frontmatter di SKILL.md
    if skill_json_file.exists() {
        if let Ok(raw_json) = std::fs::read_to_string(&skill_json_file) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw_json) {
                let json_folder = val.get("folder").and_then(|v| v.as_str()).unwrap_or("Generali").to_string();
                let json_desc = val.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let json_enabled = val.get("enabled").and_then(|v| v.as_bool()).unwrap_or(is_enabled);

                // Aggiorna stato enabled se diverso
                if json_enabled != is_enabled {
                    if json_enabled && disabled_file.exists() {
                        let _ = std::fs::rename(&disabled_file, &active_file);
                        entry_file = active_file.clone();
                        is_enabled = true;
                    } else if !json_enabled && active_file.exists() {
                        let _ = std::fs::rename(&active_file, &disabled_file);
                        entry_file = disabled_file.clone();
                        is_enabled = false;
                    }
                }

                // Leggi body attuale di SKILL.md e aggiorna frontmatter
                if entry_file.exists() {
                    let raw_md = std::fs::read_to_string(&entry_file).unwrap_or_default();
                    let (_, _, _, body) = parse_skill_markdown(&raw_md, &clean_name);
                    let updated_md = format!(
                        "---\nname: {}\nfolder: {}\ndescription: >-\n  {}\n---\n\n{}\n",
                        clean_name,
                        json_folder,
                        json_desc.replace('\n', "\n  "),
                        body
                    );
                    let _ = std::fs::write(&entry_file, updated_md);
                }

                return Ok(SkillProjectInfo {
                    name: clean_name,
                    folder: json_folder,
                    path: skill_dir.to_string_lossy().to_string(),
                    entry_file: entry_file.to_string_lossy().to_string(),
                    enabled: is_enabled,
                    is_default: false,
                });
            }
        }
    }

    // Se skill.json non esiste ma SKILL.md esiste, rigenera skill.json dal Markdown
    if entry_file.exists() {
        let raw_md = std::fs::read_to_string(&entry_file).unwrap_or_default();
        let (name, desc, folder, _) = parse_skill_markdown(&raw_md, &clean_name);
        let json_content = serde_json::json!({
            "name": name,
            "folder": folder,
            "description": desc,
            "enabled": is_enabled,
            "is_default": false,
            "version": "1.0.0",
            "entry": if is_enabled { "SKILL.md" } else { "SKILL.md.disabled" }
        });
        if let Ok(json_str) = serde_json::to_string_pretty(&json_content) {
            let _ = std::fs::write(&skill_json_file, json_str);
        }

        return Ok(SkillProjectInfo {
            name,
            folder,
            path: skill_dir.to_string_lossy().to_string(),
            entry_file: entry_file.to_string_lossy().to_string(),
            enabled: is_enabled,
            is_default: false,
        });
    }

    Err("Nessun file di skill trovato da sincronizzare".to_string())
}

#[tauri::command]
pub fn compile_antigravity_skill_project(
    app: AppHandle,
    name: String,
    path: Option<String>,
) -> Result<SkillProjectInfo, String> {
    let clean_name = name.trim().to_lowercase().replace(' ', "-");
    if is_default_gemini_skill(&clean_name) {
        return Err("Le skill predefinite di Gemini sono protette e non possono essere modificate.".to_string());
    }

    let skills_dir = get_antigravity_skills_dir(&app)?;
    let mut skill_dir = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
        _ => skills_dir.join(&clean_name),
    };

    if !skill_dir.exists() {
        return Err("Cartella del progetto skill non trovata.".to_string());
    }

    let mut skill_json_file = skill_dir.join("skill.json");
    let mut active_file = skill_dir.join("SKILL.md");
    let mut disabled_file = skill_dir.join("SKILL.md.disabled");

    let (mut entry_file, mut is_enabled) = if active_file.exists() {
        (active_file.clone(), true)
    } else if disabled_file.exists() {
        (disabled_file.clone(), false)
    } else {
        (active_file.clone(), true)
    };

    let mut final_name = clean_name.clone();
    let mut final_folder = "Generali".to_string();
    let mut final_desc = String::new();
    let mut body = String::new();

    // 1. Leggi metadati da SKILL.md se presente
    if entry_file.exists() {
        if let Ok(raw_md) = std::fs::read_to_string(&entry_file) {
            let (md_name, md_desc, md_folder, md_body) = parse_skill_markdown(&raw_md, &clean_name);
            final_name = md_name;
            final_folder = md_folder;
            final_desc = md_desc;
            body = md_body;
        }
    }

    // 2. Se presente skill.json, unisci/aggiorna con priorità
    if skill_json_file.exists() {
        if let Ok(raw_json) = std::fs::read_to_string(&skill_json_file) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw_json) {
                if let Some(n) = val.get("name").and_then(|v| v.as_str()) {
                    let clean_n = n.trim().to_lowercase().replace(' ', "-");
                    if !clean_n.is_empty() {
                        final_name = clean_n;
                    }
                }
                if let Some(f) = val.get("folder").and_then(|v| v.as_str()) {
                    if !f.trim().is_empty() {
                        final_folder = f.trim().to_string();
                    }
                }
                if let Some(d) = val.get("description").and_then(|v| v.as_str()) {
                    if !d.trim().is_empty() {
                        final_desc = d.trim().to_string();
                    }
                }
                if let Some(en) = val.get("enabled").and_then(|v| v.as_bool()) {
                    if en != is_enabled {
                        if en && disabled_file.exists() {
                            let _ = std::fs::rename(&disabled_file, &active_file);
                            entry_file = active_file.clone();
                            is_enabled = true;
                        } else if !en && active_file.exists() {
                            let _ = std::fs::rename(&active_file, &disabled_file);
                            entry_file = disabled_file.clone();
                            is_enabled = false;
                        }
                    }
                }
            }
        }
    }

    if is_default_gemini_skill(&final_name) {
        return Err("Impossibile rinominare una skill con un nome predefinito di Gemini.".to_string());
    }

    // Rinomina fisica della cartella su disco se il nome in skill.json è cambiato
    let current_dir_name = skill_dir
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    if !final_name.is_empty() && final_name.to_lowercase() != current_dir_name.to_lowercase() {
        let new_target_dir = skills_dir.join(&final_name);
        if new_target_dir.exists() && new_target_dir != skill_dir {
            return Err(format!(
                "Impossibile rinominare: esiste già una skill con nome '{}'.",
                final_name
            ));
        }

        std::fs::rename(&skill_dir, &new_target_dir).map_err(|e| {
            format!(
                "Impossibile rinominare la cartella da '{}' a '{}': {e}",
                current_dir_name, final_name
            )
        })?;

        skill_dir = new_target_dir;
        skill_json_file = skill_dir.join("skill.json");
        active_file = skill_dir.join("SKILL.md");
        disabled_file = skill_dir.join("SKILL.md.disabled");
        entry_file = if is_enabled {
            active_file.clone()
        } else {
            disabled_file.clone()
        };
    }

    // 3. Compila e aggiorna SKILL.md con frontmatter corretto
    let updated_md = format!(
        "---\nname: {}\nfolder: {}\ndescription: >-\n  {}\n---\n\n{}\n",
        final_name,
        final_folder,
        final_desc.replace('\n', "\n  "),
        body.trim()
    );
    std::fs::write(&entry_file, updated_md)
        .map_err(|e| format!("Errore salvataggio SKILL.md: {e}"))?;

    // 4. Compila e aggiorna skill.json sincronizzato
    let json_content = serde_json::json!({
        "name": final_name,
        "folder": final_folder,
        "description": final_desc,
        "enabled": is_enabled,
        "is_default": false,
        "version": "1.0.0",
        "entry": if is_enabled { "SKILL.md" } else { "SKILL.md.disabled" },
        "scripts": {
            "run": "python scripts/run.py"
        }
    });
    if let Ok(json_str) = serde_json::to_string_pretty(&json_content) {
        let _ = std::fs::write(&skill_json_file, json_str);
    }

    Ok(SkillProjectInfo {
        name: final_name,
        folder: final_folder,
        path: skill_dir.to_string_lossy().to_string(),
        entry_file: entry_file.to_string_lossy().to_string(),
        enabled: is_enabled,
        is_default: false,
    })
}

#[tauri::command]
pub fn get_antigravity_skill_project_path(app: AppHandle, name: String) -> Result<String, String> {
    let clean_name = name.trim().to_lowercase().replace(' ', "-");
    let skills_dir = get_antigravity_skills_dir(&app)?;
    let skill_dir = skills_dir.join(&clean_name);
    Ok(skill_dir.to_string_lossy().to_string())
}

// ============================================================================
// CARICAMENTO & COMPILAZIONE AUTOMATICA SKILL (SINGOLE, GREZZE O PACK MULTIPLI)
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportSkillResult {
    pub count: usize,
    pub skills: Vec<SkillInfo>,
    pub imported_skills: Vec<SkillInfo>,
    pub errors: Vec<String>,
}

/// Normalizza l'identificatore di una skill in kebab-case e pulisce suffissi frequenti da archivi
pub fn clean_skill_identifier(raw: &str) -> String {
    let mut clean = raw.trim().to_lowercase().replace(' ', "-").replace('_', "-");
    for suffix in &[
        "-main", "-master", "-latest", "-dev", "-release", "-v1.0", "-v1", "-v2", "-head",
    ] {
        if clean.ends_with(suffix) && clean.len() > suffix.len() {
            clean = clean[..clean.len() - suffix.len()].to_string();
            break;
        }
    }
    clean = clean
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect();
    while clean.contains("--") {
        clean = clean.replace("--", "-");
    }
    let res = clean.trim_matches('-').to_string();
    if res.is_empty() {
        "imported-skill".to_string()
    } else {
        res
    }
}

/// Cerca in modo case-insensitive il file SKILL.md o SKILL.md.disabled all'interno di una cartella
fn find_skill_entry_file(dir: &std::path::Path) -> Option<(PathBuf, bool)> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if entry.path().is_file() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name == "skill.md" {
                    return Some((entry.path(), true));
                } else if name == "skill.md.disabled" {
                    return Some((entry.path(), false));
                }
            }
        }
    }
    None
}

/// Cerca documentazione markdown alternativa in caso di skill non ancora buildata (es. README.md o instructions.md)
fn find_fallback_doc_file(dir: &std::path::Path) -> Option<PathBuf> {
    let mut any_md = None;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name == "readme.md" {
                    return Some(p);
                } else if name == "instructions.md" || name == "instruction.md" {
                    return Some(p);
                } else if name == "prompt.md" || name == "system.md" || name == "agent.md" {
                    return Some(p);
                } else if name.ends_with(".md") && any_md.is_none() {
                    any_md = Some(p);
                }
            }
        }
    }
    any_md
}

/// Estrae metadati e corpo da un testo markdown, anche se privo di frontmatter YAML (es. README.md grezzo)
fn extract_meta_from_markdown(raw: &str, fallback_name: &str) -> (String, String, String, String) {
    let trimmed = raw.trim();
    if trimmed.starts_with("---") {
        return parse_skill_markdown(raw, fallback_name);
    }

    let mut skill_name = clean_skill_identifier(fallback_name);
    let mut desc = String::new();
    let mut body_lines = Vec::new();
    let mut found_title = false;
    let mut found_desc = false;

    for line in raw.lines() {
        let l = line.trim();
        if !found_title && l.starts_with('#') {
            let title = l.trim_start_matches('#').trim();
            if !title.is_empty() {
                skill_name = clean_skill_identifier(title);
                found_title = true;
                continue;
            }
        }

        if !found_desc
            && found_title
            && !l.is_empty()
            && !l.starts_with('#')
            && !l.starts_with("```")
        {
            desc = l.replace('\n', " ").trim_matches('>').trim().to_string();
            found_desc = true;
        }

        body_lines.push(line);
    }

    if skill_name.is_empty() {
        skill_name = clean_skill_identifier(fallback_name);
    }
    if desc.is_empty() {
        desc = format!(
            "Skill {} compilata automaticamente in Terax IDE.",
            skill_name
        );
    }

    (
        skill_name,
        desc,
        "Generali".to_string(),
        body_lines.join("\n").trim().to_string(),
    )
}

/// Scompatta cartelle radice singole create da strumenti di compressione o GitHub (es. repo-main/)
fn unwrap_single_root_dir(dir: &std::path::Path) -> PathBuf {
    let mut current = dir.to_path_buf();
    loop {
        let mut subdirs = Vec::new();
        let mut has_files = false;
        if let Ok(entries) = std::fs::read_dir(&current) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') || name == "__MACOSX" {
                    continue;
                }
                if p.is_dir() {
                    subdirs.push(p);
                } else if p.is_file() {
                    has_files = true;
                }
            }
        }
        if !has_files && subdirs.len() == 1 {
            current = subdirs.remove(0);
        } else {
            break;
        }
    }
    current
}

/// Trova ricorsivamente tutte le directory candidate a skill
fn find_all_skill_dirs(root: &std::path::Path, max_depth: usize) -> Vec<PathBuf> {
    let mut results = Vec::new();
    find_skills_recursive(root, 0, max_depth, &mut results);
    results
}

fn find_skills_recursive(
    dir: &std::path::Path,
    depth: usize,
    max_depth: usize,
    results: &mut Vec<PathBuf>,
) {
    if depth > max_depth {
        return;
    }

    let dir_name = dir
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    if dir_name.starts_with('.')
        || dir_name == "node_modules"
        || dir_name == "__pycache__"
        || dir_name == "venv"
        || dir_name == ".venv"
        || dir_name == "target"
        || dir_name == "__MACOSX"
    {
        return;
    }

    let has_skill_entry = find_skill_entry_file(dir).is_some();
    let has_skill_json = dir.join("skill.json").exists();

    if has_skill_entry || has_skill_json {
        results.push(dir.to_path_buf());
        return;
    }

    let mut subdirs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                subdirs.push(p);
            }
        }
    }

    let initial_count = results.len();
    for sub in &subdirs {
        find_skills_recursive(sub, depth + 1, max_depth, results);
    }
    let found_in_sub = results.len() > initial_count;

    if !found_in_sub && find_fallback_doc_file(dir).is_some() {
        results.push(dir.to_path_buf());
    }
}

fn copy_dir_filtered(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if (file_name.starts_with('.') && file_name != ".taucode_extension")
            || file_name == "__pycache__"
            || file_name == "node_modules"
            || file_name == "target"
            || file_name == "venv"
            || file_name == ".venv"
            || file_name == "__MACOSX"
        {
            continue;
        }

        let dest_child = dst.join(&file_name);
        if path.is_dir() {
            copy_dir_filtered(&path, &dest_child)?;
        } else {
            std::fs::copy(&path, &dest_child)?;
        }
    }
    Ok(())
}

/// Compila e importa una directory sorgente trasformandola in una skill Antigravity completa
fn compile_and_import_single_skill_dir(
    app: &AppHandle,
    source_dir: &std::path::Path,
    target_folder_override: Option<&str>,
    suggested_name: Option<&str>,
    overwrite: bool,
) -> Result<SkillInfo, String> {
    let skills_dir = get_antigravity_skills_dir(app)?;

    let fallback_base = if let Some(sn) = suggested_name {
        clean_skill_identifier(sn)
    } else {
        source_dir
            .file_name()
            .map(|s| clean_skill_identifier(&s.to_string_lossy()))
            .unwrap_or_else(|| "imported-skill".to_string())
    };

    let (mut skill_name, mut skill_folder, mut skill_desc, skill_body) =
        if let Some((entry_file, _)) = find_skill_entry_file(source_dir) {
            let raw = std::fs::read_to_string(&entry_file).unwrap_or_default();
            extract_meta_from_markdown(&raw, &fallback_base)
        } else if let Some(doc_file) = find_fallback_doc_file(source_dir) {
            let raw = std::fs::read_to_string(&doc_file).unwrap_or_default();
            extract_meta_from_markdown(&raw, &fallback_base)
        } else {
            (
                fallback_base.clone(),
                "Generali".to_string(),
                format!("Skill {} compilata in TauCode IDE.", fallback_base),
                String::new(),
            )
        };

    let skill_json_file = source_dir.join("skill.json");
    let mut is_enabled = true;
    if skill_json_file.exists() {
        if let Ok(raw) = std::fs::read_to_string(&skill_json_file) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(n) = val.get("name").and_then(|v| v.as_str()) {
                    let clean_n = clean_skill_identifier(n);
                    if !clean_n.is_empty() {
                        skill_name = clean_n;
                    }
                }
                if let Some(f) = val.get("folder").and_then(|v| v.as_str()) {
                    if !f.trim().is_empty() {
                        skill_folder = f.trim().to_string();
                    }
                }
                if let Some(d) = val.get("description").and_then(|v| v.as_str()) {
                    if !d.trim().is_empty() {
                        skill_desc = d.trim().to_string();
                    }
                }
                if let Some(en) = val.get("enabled").and_then(|v| v.as_bool()) {
                    is_enabled = en;
                }
            }
        }
    }

    if let Some(tf) = target_folder_override {
        let clean_tf = tf.trim();
        if !clean_tf.is_empty() {
            skill_folder = clean_tf.to_string();
        }
    }

    let clean_name = clean_skill_identifier(&skill_name);
    if is_default_gemini_skill(&clean_name) {
        return Err(format!(
            "'{}' è una skill protetta di sistema e non può essere sovrascritta.",
            clean_name
        ));
    }

    let dest_dir = skills_dir.join(&clean_name);

    if dest_dir.exists() && dest_dir != source_dir && !overwrite {
        return Err(format!(
            "La skill '{}' esiste già. Abilita la sovrascrittura o rinomina la skill.",
            clean_name
        ));
    }

    if source_dir != dest_dir {
        copy_dir_filtered(source_dir, &dest_dir)
            .map_err(|e| format!("Errore copia file per '{}': {e}", clean_name))?;
    }

    // Compilazione del file SKILL.md con frontmatter standard
    let active_dest = dest_dir.join("SKILL.md");
    let disabled_dest = dest_dir.join("SKILL.md.disabled");
    let target_file = if !is_enabled {
        disabled_dest
    } else {
        active_dest
    };

    let body_trimmed = skill_body.trim();
    let body_to_write = if body_trimmed.starts_with('#') {
        body_trimmed.to_string()
    } else {
        format!(
            "# {}\n\n{}",
            clean_name.replace('-', " ").to_uppercase(),
            if body_trimmed.is_empty() {
                "Istruzioni e logiche operative della skill."
            } else {
                body_trimmed
            }
        )
    };

    let compiled_md = format!(
        "---\nname: {}\nfolder: {}\ndescription: >-\n  {}\n---\n\n{}\n",
        clean_name,
        skill_folder,
        skill_desc.replace('\n', "\n  "),
        body_to_write
    );
    std::fs::write(&target_file, compiled_md)
        .map_err(|e| format!("Errore compilazione SKILL.md: {e}"))?;

    // Compilazione e scrittura di skill.json sincronizzato (preservando scripts esistenti se presenti)
    let dest_json = dest_dir.join("skill.json");
    let mut scripts_map = serde_json::json!({
        "run": "python scripts/run.py"
    });
    if dest_json.exists() {
        if let Ok(raw_json) = std::fs::read_to_string(&dest_json) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw_json) {
                if let Some(sc) = val.get("scripts") {
                    scripts_map = sc.clone();
                }
            }
        }
    }

    let json_content = serde_json::json!({
        "name": clean_name,
        "folder": skill_folder,
        "description": skill_desc,
        "enabled": is_enabled,
        "is_default": false,
        "version": "1.0.0",
        "entry": if is_enabled { "SKILL.md" } else { "SKILL.md.disabled" },
        "scripts": scripts_map
    });
    if let Ok(json_str) = serde_json::to_string_pretty(&json_content) {
        let _ = std::fs::write(&dest_json, json_str);
    }

    // Copia persistente immediata nella cartella globale di configurazione ~/.gemini/config/skills/
    if let Some(global_dir) = get_global_antigravity_skills_dir() {
        let global_dest = global_dir.join(&clean_name);
        let _ = std::fs::create_dir_all(&global_dest);
        let _ = copy_dir_filtered(&dest_dir, &global_dest);
    }

    // Se un workspace è aperto in TauCode, replica anche nel workspace locale .agents/skills/
    if let Some(launch_state) = app.try_state::<crate::LaunchDir>() {
        if let Ok(lock) = launch_state.0.lock() {
            if let Some(ref ws_dir) = *lock {
                let ws_agents_skills = std::path::Path::new(ws_dir).join(".agents").join("skills").join(&clean_name);
                let _ = std::fs::create_dir_all(&ws_agents_skills);
                let _ = copy_dir_filtered(&dest_dir, &ws_agents_skills);
            }
        }
    }

    Ok(SkillInfo {
        name: clean_name,
        description: skill_desc,
        folder: skill_folder,
        enabled: is_enabled,
        path: target_file.to_string_lossy().to_string(),
        dir: dest_dir.to_string_lossy().to_string(),
        content: skill_body,
        is_default: false,
        extension_id: None,
        extension_name: None,
    })
}

fn scan_and_import_dir(
    app: &AppHandle,
    dir: &std::path::Path,
    target_folder: Option<&str>,
    suggested_name: Option<&str>,
    overwrite: bool,
) -> Result<ImportSkillResult, String> {
    let unwrapped = unwrap_single_root_dir(dir);
    let candidates = find_all_skill_dirs(&unwrapped, 4);

    let mut imported = Vec::new();
    let mut errors = Vec::new();

    if candidates.is_empty() {
        // Nessun markdown trovato ma la cartella esiste: compilala comunque come skill singola
        match compile_and_import_single_skill_dir(
            app,
            &unwrapped,
            target_folder,
            suggested_name,
            overwrite,
        ) {
            Ok(s) => imported.push(s),
            Err(e) => return Err(format!("Impossibile compilare la cartella come skill: {e}")),
        }
    } else {
        for cand in candidates {
            let cand_sugg = if cand == unwrapped {
                suggested_name
            } else {
                None
            };
            match compile_and_import_single_skill_dir(
                app,
                &cand,
                target_folder,
                cand_sugg,
                overwrite,
            ) {
                Ok(s) => imported.push(s),
                Err(e) => errors.push(e),
            }
        }
    }

    let all_skills = list_antigravity_skills(app.clone())?;
    let count = imported.len();
    Ok(ImportSkillResult {
        count,
        skills: all_skills,
        imported_skills: imported,
        errors,
    })
}

#[tauri::command]
pub fn import_antigravity_skills(
    app: AppHandle,
    source_path: String,
    target_folder: Option<String>,
    overwrite: Option<bool>,
) -> Result<ImportSkillResult, String> {
    let src = PathBuf::from(source_path.trim());
    if !src.exists() {
        return Err(format!("Percorso non trovato: {}", src.display()));
    }

    let allow_overwrite = overwrite.unwrap_or(true);

    if src.is_file() {
        let ext = src
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        if ext == "zip" || ext == "skill" {
            let zip_stem = src
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string());
            let temp_dir = std::env::temp_dir().join(format!(
                "terax-import-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis()
            ));
            let _ = std::fs::create_dir_all(&temp_dir);

            let file = std::fs::File::open(&src)
                .map_err(|e| format!("Impossibile aprire file archivio: {e}"))?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| format!("Errore lettura archivio zip: {e}"))?;

            for i in 0..archive.len() {
                let mut f = archive
                    .by_index(i)
                    .map_err(|e| format!("Errore estrazione: {e}"))?;
                let outpath = match f.enclosed_name() {
                    Some(path) => temp_dir.join(path),
                    None => continue,
                };
                if f.name().ends_with('/') {
                    let _ = std::fs::create_dir_all(&outpath);
                } else {
                    if let Some(p) = outpath.parent() {
                        let _ = std::fs::create_dir_all(p);
                    }
                    if let Ok(mut outfile) = std::fs::File::create(&outpath) {
                        let _ = std::io::copy(&mut f, &mut outfile);
                    }
                }
            }

            let res = scan_and_import_dir(
                &app,
                &temp_dir,
                target_folder.as_deref(),
                zip_stem.as_deref(),
                allow_overwrite,
            );
            let _ = std::fs::remove_dir_all(&temp_dir);
            return res;
        } else if ext == "md" {
            let fname = src
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            if fname == "skill.md" || fname == "skill.md.disabled" {
                if let Some(parent) = src.parent() {
                    return scan_and_import_dir(
                        &app,
                        parent,
                        target_folder.as_deref(),
                        None,
                        allow_overwrite,
                    );
                }
            }
            // File markdown standalone: avvolgilo in una cartella temporanea e compilalo come skill
            let base_name = src
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("imported-skill");
            let temp_dir = std::env::temp_dir().join(format!(
                "terax-import-md-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis()
            ));
            let skill_sub = temp_dir.join(base_name);
            let _ = std::fs::create_dir_all(&skill_sub);
            let _ = std::fs::copy(&src, skill_sub.join("SKILL.md"));
            let res = scan_and_import_dir(
                &app,
                &skill_sub,
                target_folder.as_deref(),
                Some(base_name),
                allow_overwrite,
            );
            let _ = std::fs::remove_dir_all(&temp_dir);
            return res;
        } else {
            return Err(
                "Formato file non supportato. Seleziona una cartella, un file .skill o un file .zip."
                    .to_string(),
            );
        }
    } else if src.is_dir() {
        let folder_stem = src
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string());
        return scan_and_import_dir(
            &app,
            &src,
            target_folder.as_deref(),
            folder_stem.as_deref(),
            allow_overwrite,
        );
    }

    Err("Tipo di risorsa non valido.".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AntigravityResolvedPath {
    pub path: String,
    pub title: Option<String>,
    pub line: Option<usize>,
    pub exists: bool,
    pub is_markdown: bool,
}

fn percent_decode_simple(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(c1), Some(c2)) = (h1, h2) {
                let hex_str = [c1, c2];
                if let Ok(hex_slice) = std::str::from_utf8(&hex_str) {
                    if let Ok(val) = u8::from_str_radix(hex_slice, 16) {
                        bytes.push(val);
                        continue;
                    }
                }
            }
        }
        bytes.push(b);
    }
    String::from_utf8(bytes).unwrap_or_else(|_| input.to_string())
}

#[tauri::command]
pub async fn resolve_antigravity_path(
    raw_path: String,
    cascade_id: Option<String>,
    workspace_root: Option<String>,
) -> Result<AntigravityResolvedPath, String> {
    let mut decoded = percent_decode_simple(&raw_path);

    // Estrai eventuale riga (#L42, :42, etc.)
    let mut line: Option<usize> = None;
    if let Some(pos) = decoded.rfind("#L") {
        let line_part = &decoded[pos + 2..];
        let num_str: String = line_part.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(l) = num_str.parse::<usize>() {
            line = Some(l);
        }
        decoded = decoded[..pos].to_string();
    } else if let Some(pos) = decoded.rfind('#') {
        let line_part = &decoded[pos + 1..];
        let num_str: String = line_part.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(l) = num_str.parse::<usize>() {
            line = Some(l);
        }
        decoded = decoded[..pos].to_string();
    }

    let mut clean_str = decoded.trim().to_string();
    if clean_str.to_lowercase().starts_with("file://") {
        clean_str = clean_str[7..].to_string();
        if clean_str.to_lowercase().starts_with("localhost/") {
            clean_str = clean_str[10..].to_string();
        }
    }

    #[cfg(target_os = "windows")]
    {
        if clean_str.starts_with('/') || clean_str.starts_with('\\') {
            let bytes = clean_str.as_bytes();
            if bytes.len() >= 3 && bytes[1].is_ascii_alphabetic() && bytes[2] == b':' {
                clean_str = clean_str[1..].to_string();
            }
        }
        clean_str = clean_str.replace('/', "\\");
    }

    let mut found_path: Option<PathBuf> = None;

    // 1. Percorso diretto
    let p1 = PathBuf::from(&clean_str);
    if p1.is_file() {
        found_path = Some(p1);
    }

    // 2. Relativo al workspace corrente
    if found_path.is_none() {
        if let Some(ref ws) = workspace_root {
            let p2 = Path::new(ws).join(&clean_str);
            if p2.is_file() {
                found_path = Some(p2);
            }
        }
    }

    // 3. Directory brain di Antigravity
    if found_path.is_none() {
        let file_name = Path::new(&clean_str)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&clean_str);

        if let Some(home) = dirs::home_dir() {
            let gemini_dir = home.join(".gemini");
            let brain_candidates = vec![
                gemini_dir.join("antigravity").join("brain"),
                gemini_dir.join("antigravity-ide").join("brain"),
                gemini_dir.join("antigravity-backup").join("brain"),
            ];

            // 3a. Con cascade_id esatto
            if let Some(ref cid) = cascade_id {
                for base in &brain_candidates {
                    let candidate = base.join(cid).join(file_name);
                    if candidate.is_file() {
                        found_path = Some(candidate);
                        break;
                    }
                    let candidate_rel = base.join(cid).join(&clean_str);
                    if candidate_rel.is_file() {
                        found_path = Some(candidate_rel);
                        break;
                    }
                }
            }

            // 3b. Cerca nelle directory brain se non trovato con cascade_id
            if found_path.is_none() {
                for base in &brain_candidates {
                    if base.is_dir() {
                        if let Ok(entries) = std::fs::read_dir(base) {
                            for entry in entries.flatten() {
                                if entry.path().is_dir() {
                                    let candidate = entry.path().join(file_name);
                                    if candidate.is_file() {
                                        found_path = Some(candidate);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if found_path.is_some() {
                        break;
                    }
                }
            }
        }
    }

    let final_path_buf = found_path.unwrap_or_else(|| PathBuf::from(&clean_str));
    let exists = final_path_buf.is_file();
    let is_markdown = final_path_buf
        .extension()
        .and_then(|s| s.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false);

    let mut title: Option<String> = None;
    if exists && is_markdown {
        if let Ok(content) = std::fs::read_to_string(&final_path_buf) {
            for line_str in content.lines() {
                let trimmed = line_str.trim();
                if let Some(h1) = trimmed.strip_prefix("# ") {
                    let clean_title = h1.trim().to_string();
                    if !clean_title.is_empty() {
                        title = Some(clean_title);
                        break;
                    }
                }
            }
        }
    }

    let final_path_str = final_path_buf.to_string_lossy().to_string();

    Ok(AntigravityResolvedPath {
        path: final_path_str,
        title,
        line,
        exists,
        is_markdown,
    })
}

#[tauri::command]
pub async fn run_in_terminal_tab(
    app: AppHandle,
    command: String,
    cwd: Option<String>,
    title: Option<String>,
    auto_close: Option<bool>,
) -> Result<(), String> {
    let req_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let payload = serde_json::json!({
        "command": command,
        "cwd": cwd,
        "title": title,
        "autoClose": auto_close.unwrap_or(false),
        "reqId": req_id
    });

    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("terax:open-terminal-command", payload);
    } else {
        let _ = app.emit("terax:open-terminal-command", payload);
    }
    Ok(())
}

#[tauri::command]
pub async fn close_terminal_tab(
    app: AppHandle,
    tab_id: Option<i64>,
    title: Option<String>,
    last: Option<bool>,
    all: Option<bool>,
) -> Result<(), String> {
    let payload = serde_json::json!({
        "tabId": tab_id,
        "title": title,
        "last": last.unwrap_or(false),
        "all": all.unwrap_or(false),
    });

    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("terax:close-terminal-command", payload);
    } else {
        let _ = app.emit("terax:close-terminal-command", payload);
    }
    Ok(())
}

#[tauri::command]
pub async fn resolve_antigravity_task_log(
    conversation_id: String,
    step_index: i64,
) -> Result<Option<String>, String> {
    if let Some(home) = dirs::home_dir() {
        let gemini_dir = home.join(".gemini");
        let candidates = vec![
            gemini_dir.join("antigravity").join("brain").join(&conversation_id).join(".system_generated").join("tasks").join(format!("task-{}.log", step_index)),
            gemini_dir.join("antigravity-ide").join("brain").join(&conversation_id).join(".system_generated").join("tasks").join(format!("task-{}.log", step_index)),
            gemini_dir.join("antigravity-backup").join("brain").join(&conversation_id).join(".system_generated").join("tasks").join(format!("task-{}.log", step_index)),
        ];

        for c in candidates {
            if c.is_file() {
                return Ok(Some(c.to_string_lossy().to_string()));
            }
        }
    }
    Ok(None)
}



