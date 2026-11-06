use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{self, Cursor, Read, Write};
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LspInstalledInfo {
    pub id: String,
    pub installed: bool,
    pub path: Option<String>,
    pub size_bytes: Option<u64>,
}

pub fn lsp_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to get app data dir: {e}"))?;
    let dir = app_dir.join("lsp");
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create lsp dir: {e}"))?;
    Ok(dir)
}

pub fn find_downloaded_executable(app: &AppHandle, server_id: &str) -> Option<PathBuf> {
    // The caller may pass a command name (e.g. "pyright-langserver") instead of
    // the preset id (e.g. "pyright"). Normalise to the directory name used by
    // the downloader.
    let resolved_id = match server_id {
        "pyright-langserver" => "pyright",
        "typescript-language-server" => "typescript",
        "lua-language-server" => "lua-ls",
        "vscode-json-language-server" => "json-ls",
        "vscode-css-language-server" => "css-ls",
        "vscode-html-language-server" => "html-ls",
        "yaml-language-server" => "yaml-ls",
        "bash-language-server" => "bash-ls",
        "vue-language-server" => "vue-ls",
        other => other,
    };
    let base = lsp_storage_dir(app).ok()?.join(resolved_id);
    if !base.exists() {
        return None;
    }

    // Direct check for common binary names
    let exes = match server_id {
        "rust-analyzer" => vec!["rust-analyzer.exe", "rust-analyzer"],
        "ruff" => vec!["ruff.exe", "ruff"],
        "zls" => vec!["zls.exe", "zls"],
        "lua-ls" => vec!["lua-language-server.exe", "lua-language-server"],
        "clangd" => vec!["clangd.exe", "clangd"],
        "typescript" => vec![
            "node_modules/.bin/typescript-language-server.cmd",
            "node_modules/.bin/typescript-language-server",
            "node_modules/typescript-language-server/lib/cli.mjs",
        ],
        "pyright" => vec![
            "node_modules/.bin/pyright-langserver.cmd",
            "node_modules/.bin/pyright-langserver",
            "node_modules/pyright/langserver.index.js",
        ],
        "json-ls" | "css-ls" | "html-ls" => vec![
            "node_modules/.bin/vscode-json-language-server.cmd",
            "node_modules/.bin/vscode-json-language-server",
            "node_modules/.bin/vscode-css-language-server.cmd",
            "node_modules/.bin/vscode-css-language-server",
            "node_modules/.bin/vscode-html-language-server.cmd",
            "node_modules/.bin/vscode-html-language-server",
        ],
        "yaml-ls" => vec![
            "node_modules/.bin/yaml-language-server.cmd",
            "node_modules/.bin/yaml-language-server",
        ],
        "bash-ls" => vec![
            "node_modules/.bin/bash-language-server.cmd",
            "node_modules/.bin/bash-language-server",
        ],
        "intelephense" => vec![
            "node_modules/.bin/intelephense.cmd",
            "node_modules/.bin/intelephense",
        ],
        "svelte-ls" => vec![
            "node_modules/.bin/svelteserver.cmd",
            "node_modules/.bin/svelteserver",
        ],
        "vue-ls" => vec![
            "node_modules/.bin/vue-language-server.cmd",
            "node_modules/.bin/vue-language-server",
        ],
        _ => vec![],
    };

    for exe in exes {
        let p = base.join(exe);
        if p.exists() && p.is_file() {
            return Some(p);
        }
    }

    // Recursive search in base directory for any executable
    let mut found = None;
    walk_find_exe(&base, &mut found);
    found
}

fn walk_find_exe(dir: &Path, result: &mut Option<PathBuf>) {
    if result.is_some() || !dir.is_dir() {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                walk_find_exe(&p, result);
            } else if p.is_file() {
                let fname = p.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                if fname.ends_with(".exe") || fname.ends_with(".cmd") || (!cfg!(windows) && !fname.contains('.')) {
                    *result = Some(p);
                    return;
                }
            }
        }
    }
}

fn dir_size(path: &Path) -> u64 {
    let mut size = 0;
    if path.is_file() {
        return fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    }
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                size += dir_size(&p);
            } else {
                size += fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    size
}

pub async fn get_installed_info(app: &AppHandle, server_id: &str) -> LspInstalledInfo {
    if let Some(exe_path) = find_downloaded_executable(app, server_id) {
        let size = lsp_storage_dir(app)
            .ok()
            .map(|d| dir_size(&d.join(server_id)))
            .unwrap_or(0);
        LspInstalledInfo {
            id: server_id.to_string(),
            installed: true,
            path: Some(exe_path.to_string_lossy().into_owned()),
            size_bytes: Some(size),
        }
    } else {
        LspInstalledInfo {
            id: server_id.to_string(),
            installed: false,
            path: None,
            size_bytes: None,
        }
    }
}

pub async fn get_all_installed_statuses(app: &AppHandle) -> HashMap<String, LspInstalledInfo> {
    let server_ids = vec![
        "typescript",
        "rust-analyzer",
        "pyright",
        "ruff",
        "gopls",
        "clangd",
        "zls",
        "lua-ls",
        "ruby-lsp",
        "intelephense",
        "yaml-ls",
        "bash-ls",
        "json-ls",
        "css-ls",
        "html-ls",
        "svelte-ls",
        "vue-ls",
        "sourcekit",
    ];

    let mut map = HashMap::new();
    for id in server_ids {
        map.insert(id.to_string(), get_installed_info(app, id).await);
    }
    map
}

pub async fn download_lsp_server(app: AppHandle, server_id: String) -> Result<LspInstalledInfo, String> {
    let dest_dir = lsp_storage_dir(&app)?.join(&server_id);
    if dest_dir.exists() {
        let _ = fs::remove_dir_all(&dest_dir);
    }
    fs::create_dir_all(&dest_dir).map_err(|e| format!("failed to create dir: {e}"))?;

    match server_id.as_str() {
        "rust-analyzer" => {
            #[cfg(windows)]
            let url = "https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-x86_64-pc-windows-msvc.zip";
            #[cfg(target_os = "macos")]
            let url = "https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-aarch64-apple-darwin.gz";
            #[cfg(target_os = "linux")]
            let url = "https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-x86_64-unknown-linux-gnu.gz";

            download_and_extract_archive(url, &dest_dir).await?;
        }
        "ruff" => {
            #[cfg(windows)]
            let url = "https://github.com/astral-sh/ruff/releases/latest/download/ruff-x86_64-pc-windows-msvc.zip";
            #[cfg(target_os = "macos")]
            let url = "https://github.com/astral-sh/ruff/releases/latest/download/ruff-aarch64-apple-darwin.tar.gz";
            #[cfg(target_os = "linux")]
            let url = "https://github.com/astral-sh/ruff/releases/latest/download/ruff-x86_64-unknown-linux-gnu.tar.gz";

            download_and_extract_archive(url, &dest_dir).await?;
        }
        "zls" => {
            #[cfg(windows)]
            let url = "https://github.com/zigtools/zls/releases/latest/download/zls-x86_64-windows.zip";
            #[cfg(target_os = "macos")]
            let url = "https://github.com/zigtools/zls/releases/latest/download/zls-aarch64-macos.tar.xz";
            #[cfg(target_os = "linux")]
            let url = "https://github.com/zigtools/zls/releases/latest/download/zls-x86_64-linux.tar.xz";

            download_and_extract_archive(url, &dest_dir).await?;
        }
        "lua-ls" => {
            #[cfg(windows)]
            let url = "https://github.com/LuaLS/lua-language-server/releases/download/3.19.1/lua-language-server-3.19.1-win32-x64.zip";
            #[cfg(target_os = "macos")]
            let url = "https://github.com/LuaLS/lua-language-server/releases/download/3.19.1/lua-language-server-3.19.1-darwin-arm64.tar.gz";
            #[cfg(target_os = "linux")]
            let url = "https://github.com/LuaLS/lua-language-server/releases/download/3.19.1/lua-language-server-3.19.1-linux-x64.tar.gz";

            download_and_extract_archive(url, &dest_dir).await?;
        }
        "clangd" => {
            #[cfg(windows)]
            let url = "https://github.com/clangd/clangd/releases/download/22.1.6/clangd-windows-22.1.6.zip";
            #[cfg(target_os = "macos")]
            let url = "https://github.com/clangd/clangd/releases/download/22.1.6/clangd-mac-22.1.6.zip";
            #[cfg(target_os = "linux")]
            let url = "https://github.com/clangd/clangd/releases/download/22.1.6/clangd-linux-22.1.6.zip";

            download_and_extract_archive(url, &dest_dir).await?;
        }
        // NPM-based language servers
        "typescript" => {
            install_npm_package(&dest_dir, "typescript-language-server typescript").await?;
        }
        "pyright" => {
            install_npm_package(&dest_dir, "pyright").await?;
        }
        "json-ls" | "css-ls" | "html-ls" => {
            install_npm_package(&dest_dir, "vscode-langservers-extracted").await?;
        }
        "yaml-ls" => {
            install_npm_package(&dest_dir, "yaml-language-server").await?;
        }
        "bash-ls" => {
            install_npm_package(&dest_dir, "bash-language-server").await?;
        }
        "intelephense" => {
            install_npm_package(&dest_dir, "intelephense").await?;
        }
        "svelte-ls" => {
            install_npm_package(&dest_dir, "svelte-language-server").await?;
        }
        "vue-ls" => {
            install_npm_package(&dest_dir, "@vue/language-server").await?;
        }
        _ => return Err(format!("Direct download is not configured for {server_id}")),
    }

    Ok(get_installed_info(&app, &server_id).await)
}

pub async fn delete_lsp_server(app: AppHandle, server_id: String) -> Result<(), String> {
    let dest_dir = lsp_storage_dir(&app)?.join(&server_id);
    if dest_dir.exists() {
        fs::remove_dir_all(&dest_dir).map_err(|e| format!("failed to remove dir: {e}"))?;
    }
    Ok(())
}

async fn download_and_extract_archive(url: &str, dest_dir: &Path) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("Terax-LSP-Downloader")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("failed to download from {url}: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("download failed with status {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("failed to read response bytes: {e}"))?;

    let url_lower = url.to_lowercase();
    if url_lower.ends_with(".zip") {
        let cursor = Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("zip read error: {e}"))?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| format!("zip file error: {e}"))?;
            let outpath = match file.enclosed_name() {
                Some(path) => dest_dir.join(path),
                None => continue,
            };
            if file.name().ends_with('/') {
                fs::create_dir_all(&outpath).map_err(|e| format!("mkdir error: {e}"))?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        fs::create_dir_all(p).map_err(|e| format!("mkdir parent error: {e}"))?;
                    }
                }
                let mut outfile = File::create(&outpath).map_err(|e| format!("file create error: {e}"))?;
                io::copy(&mut file, &mut outfile).map_err(|e| format!("file copy error: {e}"))?;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = file.unix_mode() {
                    let _ = fs::set_permissions(&outpath, fs::Permissions::from_mode(mode));
                }
            }
        }
    } else if url_lower.ends_with(".gz") && !url_lower.ends_with(".tar.gz") {
        use flate2::read::GzDecoder;
        let mut decoder = GzDecoder::new(&bytes[..]);
        let mut out_bytes = Vec::new();
        decoder.read_to_end(&mut out_bytes).map_err(|e| format!("gz decode error: {e}"))?;
        let exe_name = if cfg!(windows) { "rust-analyzer.exe" } else { "rust-analyzer" };
        let out_path = dest_dir.join(exe_name);
        let mut file = File::create(&out_path).map_err(|e| format!("create exe error: {e}"))?;
        file.write_all(&out_bytes).map_err(|e| format!("write exe error: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&out_path, fs::Permissions::from_mode(0o755));
        }
    } else if url_lower.ends_with(".tar.gz") || url_lower.ends_with(".tgz") {
        use flate2::read::GzDecoder;
        let decoder = GzDecoder::new(&bytes[..]);
        let mut archive = tar::Archive::new(decoder);
        archive.unpack(dest_dir).map_err(|e| format!("tar unpack error: {e}"))?;
    } else {
        return Err(format!("unsupported archive format for {url}"));
    }

    Ok(())
}

async fn install_npm_package(dest_dir: &Path, packages: &str) -> Result<(), String> {
    let dest_str = dest_dir.to_string_lossy().to_string();
    let packages_str = packages.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let npm_cmd = if cfg!(windows) { "npm.cmd" } else { "npm" };
        let mut cmd = std::process::Command::new(npm_cmd);
        cmd.args(["install", "--prefix", &dest_str, "--no-audit", "--no-fund"]);
        for p in packages_str.split_whitespace() {
            cmd.arg(p);
        }
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::piped());

        let output = cmd.output().map_err(|e| {
            format!("failed to execute npm (ensure Node.js and npm are installed): {e}")
        })?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("npm install failed: {err}"));
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
