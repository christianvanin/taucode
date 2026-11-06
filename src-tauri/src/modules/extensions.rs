use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

pub const EXTENSION_MANIFEST_FILENAME: &str = "taucode-extension.json";
pub const EXTENSIONS_STATE_FILENAME: &str = "extensions.state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionTabContribution {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(rename = "renderType")]
    pub render_type: String, // "webview" | "esm" | "custom-editor"
    #[serde(default)]
    pub entry: Option<String>,
    #[serde(rename = "fileExtensions", default)]
    pub file_extensions: Vec<String>,
    #[serde(default)]
    pub singleton: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionSettingsContribution {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(rename = "renderType", default = "default_render_type_declarative")]
    pub render_type: String, // "declarative" | "custom"
    #[serde(default)]
    pub schema: Option<serde_json::Value>,
    #[serde(default)]
    pub entry: Option<String>,
}

fn default_render_type_declarative() -> String {
    "declarative".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionSkillContribution {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionMcpServerContribution {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionCommandContribution {
    pub id: String,
    pub title: String,
    pub action: String,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExtensionContributes {
    #[serde(default)]
    pub tabs: Vec<ExtensionTabContribution>,
    #[serde(default)]
    pub settings: Vec<ExtensionSettingsContribution>,
    #[serde(default)]
    pub skills: Vec<ExtensionSkillContribution>,
    #[serde(default, rename = "mcpServers")]
    pub mcp_servers: HashMap<String, ExtensionMcpServerContribution>,
    #[serde(default)]
    pub commands: Vec<ExtensionCommandContribution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(rename = "displayName", default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(rename = "minTaucodeVersion", default)]
    pub min_taucode_version: Option<String>,
    #[serde(default)]
    pub contributes: ExtensionContributes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub display_name: String,
    pub description: String,
    pub author: String,
    pub icon_path: Option<String>,
    pub homepage: Option<String>,
    pub dir_path: String,
    pub enabled: bool,
    pub contributes: ExtensionContributes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerInfo {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: Option<HashMap<String, String>>,
    pub url: Option<String>,
    pub transport: String,
    pub enabled: bool,
    pub extension_id: Option<String>,
    pub extension_name: Option<String>,
    pub is_extension_provided: bool,
}

/// Cartella globale delle estensioni TauCode: ~/.taucode/extensions/
pub fn get_taucode_extensions_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Impossibile determinare la home directory utente".to_string())?;
    let dir = home.join(".taucode").join("extensions");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Errore creazione cartella estensioni {}: {}", dir.display(), e))?;
    }
    Ok(dir)
}

/// Cartella globale delle skill di Antigravity: ~/.gemini/config/skills/
pub fn get_global_antigravity_skills_dir() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let dir = home.join(".gemini").join("config").join("skills");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Some(dir)
}

/// File globale di configurazione MCP di Antigravity: ~/.gemini/config/mcp_config.json
pub fn get_global_antigravity_mcp_config_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let config_dir = home.join(".gemini").join("config");
    if !config_dir.exists() {
        let _ = std::fs::create_dir_all(&config_dir);
    }
    Some(config_dir.join("mcp_config.json"))
}

/// Legge lo stato di abilitazione delle estensioni (default: tutte abilitate se non disabilitate)
fn load_disabled_extensions() -> Vec<String> {
    if let Ok(dir) = get_taucode_extensions_dir() {
        let state_file = dir.join(EXTENSIONS_STATE_FILENAME);
        if state_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&state_file) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(arr) = val.get("disabled").and_then(|v| v.as_array()) {
                        return arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect();
                    }
                }
            }
        }
    }
    Vec::new()
}

/// Salva lo stato delle estensioni disabilitate
fn save_disabled_extensions(disabled: &[String]) -> Result<(), String> {
    let dir = get_taucode_extensions_dir()?;
    let state_file = dir.join(EXTENSIONS_STATE_FILENAME);
    let json = serde_json::json!({
        "disabled": disabled
    });
    std::fs::write(&state_file, serde_json::to_string_pretty(&json).unwrap_or_default())
        .map_err(|e| format!("Errore salvataggio {}: {}", state_file.display(), e))?;
    Ok(())
}

/// Copia ricorsiva sicura di una cartella
pub fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), dest_path)?;
        }
    }
    Ok(())
}

/// Scansiona tutte le estensioni installate in ~/.taucode/extensions/
pub fn scan_installed_extensions() -> Result<Vec<ExtensionInfo>, String> {
    let dir = get_taucode_extensions_dir()?;
    let disabled_ids = load_disabled_extensions();
    let mut extensions = Vec::new();

    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(err) => return Err(format!("Errore lettura cartella estensioni {}: {}", dir.display(), err)),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let manifest_path = path.join(EXTENSION_MANIFEST_FILENAME);
            if manifest_path.exists() {
                if let Ok(raw) = std::fs::read_to_string(&manifest_path) {
                    if let Ok(manifest) = serde_json::from_str::<ExtensionManifest>(&raw) {
                        let is_enabled = !disabled_ids.contains(&manifest.id);
                        let icon_path = manifest.icon.as_ref().map(|rel| {
                            let p = path.join(rel);
                            p.to_string_lossy().to_string()
                        });

                        extensions.push(ExtensionInfo {
                            id: manifest.id,
                            name: manifest.name,
                            version: manifest.version,
                            display_name: manifest.display_name.unwrap_or_else(|| "".to_string()),
                            description: manifest.description.unwrap_or_default(),
                            author: manifest.author.unwrap_or_default(),
                            icon_path,
                            homepage: manifest.homepage,
                            dir_path: path.to_string_lossy().to_string(),
                            enabled: is_enabled,
                            contributes: manifest.contributes,
                        });
                    }
                }
            }
        }
    }

    // Ordina per display_name / name
    extensions.sort_by(|a, b| {
        let name_a = if !a.display_name.is_empty() { &a.display_name } else { &a.name };
        let name_b = if !b.display_name.is_empty() { &b.display_name } else { &b.name };
        name_a.to_lowercase().cmp(&name_b.to_lowercase())
    });

    Ok(extensions)
}

/// Sincronizza le skill e i server MCP delle estensioni attive con Antigravity senza emettere eventi
pub fn sync_extensions_ai_assets_silent() -> Result<(), String> {
    let extensions = scan_installed_extensions()?;
    let active_extensions: Vec<&ExtensionInfo> = extensions.iter().filter(|e| e.enabled).collect();

    // 1. Sincronizzazione Skills in ~/.gemini/config/skills/ e ~/.gemini/antigravity/builtin/skills/
    if let Some(global_skills_dir) = get_global_antigravity_skills_dir() {
        let active_ext_ids: Vec<&str> = active_extensions.iter().map(|e| e.id.as_str()).collect();
        let builtin_skills_dir = dirs::home_dir().map(|h| h.join(".gemini").join("antigravity").join("builtin").join("skills"));
        let all_target_dirs: Vec<PathBuf> = vec![Some(global_skills_dir), builtin_skills_dir].into_iter().flatten().collect();

        for skills_dir in all_target_dirs {
            // Pulisci skill orfane (estensioni disinstallate o disabilitate)
            if let Ok(entries) = std::fs::read_dir(&skills_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        let tag_file = p.join(".taucode_extension");
                        if tag_file.exists() {
                            let should_remove = match std::fs::read_to_string(&tag_file) {
                                Ok(c) => match serde_json::from_str::<serde_json::Value>(&c) {
                                    Ok(v) => v.get("extension_id")
                                        .and_then(|x| x.as_str())
                                        .map(|id| !active_ext_ids.contains(&id))
                                        .unwrap_or(true),
                                    Err(_) => true,
                                },
                                Err(_) => true,
                            };
                            if should_remove {
                                let _ = std::fs::remove_dir_all(&p);
                            }
                        }
                    }
                }
            }

            // Copia e aggiorna le skill per le estensioni abilitate
            for ext in &active_extensions {
                let ext_dir = PathBuf::from(&ext.dir_path);
                for skill_contrib in &ext.contributes.skills {
                    let target = skills_dir.join(&skill_contrib.name);
                    let source = ext_dir.join(&skill_contrib.path);
                    if source.exists() && source.is_dir() {
                        let _ = copy_dir_all(&source, &target);
                        // Salva metadati dell'estensione sorgente nella skill
                        let tag_content = serde_json::json!({
                            "extension_id": ext.id,
                            "extension_name": if !ext.display_name.is_empty() { &ext.display_name } else { &ext.name },
                            "version": ext.version
                        });
                        let _ = std::fs::write(target.join(".taucode_extension"), tag_content.to_string());
                    }
                }
            }
        }
    }

    // 2. Sincronizzazione MCP Servers in ~/.gemini/config/mcp_config.json
    if let Some(mcp_config_path) = get_global_antigravity_mcp_config_path() {
        let mut root_val: serde_json::Value = if mcp_config_path.exists() {
            std::fs::read_to_string(&mcp_config_path)
                .ok()
                .and_then(|raw| serde_json::from_str(&raw).ok())
                .unwrap_or_else(|| serde_json::json!({ "mcpServers": {} }))
        } else {
            serde_json::json!({ "mcpServers": {} })
        };

        if !root_val.is_object() {
            root_val = serde_json::json!({ "mcpServers": {} });
        }

        let mcp_map = root_val
            .as_object_mut()
            .and_then(|obj| obj.entry("mcpServers").or_insert_with(|| serde_json::json!({})).as_object_mut());

        if let Some(servers) = mcp_map {
            // Rimuovi server MCP appartenenti a estensioni ora disabilitate o disinstallate
            let active_ext_ids: Vec<&str> = active_extensions.iter().map(|e| e.id.as_str()).collect();
            servers.retain(|_k, v| {
                if let Some(ext_id) = v.get("_taucode_extension_id").and_then(|x| x.as_str()) {
                    active_ext_ids.contains(&ext_id)
                } else {
                    true // Mantieni server MCP configurati manualmente dall'utente
                }
            });

            // Aggiungi o aggiorna i server MCP delle estensioni abilitate
            for ext in &active_extensions {
                let ext_dir_str = &ext.dir_path;
                let ext_name = if !ext.display_name.is_empty() { &ext.display_name } else { &ext.name };

                for (server_name, mcp_def) in &ext.contributes.mcp_servers {
                    let cmd = mcp_def.command.replace("${extensionPath}", ext_dir_str);
                    let args: Vec<String> = mcp_def.args.iter()
                        .map(|a| a.replace("${extensionPath}", ext_dir_str))
                        .collect();

                    let mut env_map = serde_json::Map::new();
                    if let Some(envs) = &mcp_def.env {
                        for (k, v) in envs {
                            env_map.insert(k.clone(), serde_json::Value::String(v.replace("${extensionPath}", ext_dir_str)));
                        }
                    }

                    let mut s_val = serde_json::json!({
                        "command": cmd,
                        "args": args,
                        "_taucode_extension_id": ext.id,
                        "_taucode_extension_name": ext_name,
                    });

                    if !env_map.is_empty() {
                        s_val["env"] = serde_json::Value::Object(env_map);
                    }
                    if let Some(url) = &mcp_def.url {
                        s_val["url"] = serde_json::Value::String(url.clone());
                    }

                    servers.insert(server_name.clone(), s_val);
                }
            }
        }

        let _ = std::fs::write(&mcp_config_path, serde_json::to_string_pretty(&root_val).unwrap_or_default());
    }

    Ok(())
}

/// Sincronizza le skill e i server MCP delle estensioni attive ed emette l'evento reattivo terax:extensions-updated
pub fn sync_extensions_ai_assets(app: &AppHandle) -> Result<(), String> {
    sync_extensions_ai_assets_silent()?;
    let _ = app.emit("terax:extensions-updated", ());
    Ok(())
}

/// Trova la cartella radice dell'estensione all'interno di una cartella estratta
fn locate_extension_root(dir: &Path) -> Option<PathBuf> {
    let direct_manifest = dir.join(EXTENSION_MANIFEST_FILENAME);
    if direct_manifest.exists() {
        return Some(dir.to_path_buf());
    }
    // Cerca nelle sottodirectory immediate (es. repository ZIP con cartella master)
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && p.join(EXTENSION_MANIFEST_FILENAME).exists() {
                return Some(p);
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// TAURI COMMANDS
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_extensions() -> Result<Vec<ExtensionInfo>, String> {
    let _ = sync_extensions_ai_assets_silent();
    scan_installed_extensions()
}

#[tauri::command]
pub fn toggle_extension(app: AppHandle, ext_id: String, enabled: bool) -> Result<Vec<ExtensionInfo>, String> {
    let mut disabled = load_disabled_extensions();
    if enabled {
        disabled.retain(|id| id != &ext_id);
    } else if !disabled.contains(&ext_id) {
        disabled.push(ext_id);
    }
    save_disabled_extensions(&disabled)?;
    sync_extensions_ai_assets(&app)?;
    scan_installed_extensions()
}

#[tauri::command]
pub fn uninstall_extension(app: AppHandle, ext_id: String) -> Result<(), String> {
    let dir = get_taucode_extensions_dir()?;
    let mut target_dir = None;

    if let Ok(installed) = scan_installed_extensions() {
        if let Some(found) = installed.iter().find(|e| e.id == ext_id) {
            target_dir = Some(PathBuf::from(&found.dir_path));
        }
    }

    if target_dir.is_none() {
        let fallback = dir.join(&ext_id);
        if fallback.exists() {
            target_dir = Some(fallback);
        }
    }

    if let Some(ext_dir) = target_dir {
        if ext_dir.exists() {
            std::fs::remove_dir_all(&ext_dir).map_err(|e| format!("Errore eliminazione cartella estensione: {}", e))?;
        }
    }

    // Pulisci id dallo stato dei disabilitati
    let mut disabled = load_disabled_extensions();
    disabled.retain(|id| id != &ext_id);
    let _ = save_disabled_extensions(&disabled);

    // Risincronizza asset IA
    sync_extensions_ai_assets(&app)?;
    Ok(())
}

#[tauri::command]
pub fn install_extension_zip(app: AppHandle, zip_path: String) -> Result<ExtensionInfo, String> {
    let path = PathBuf::from(&zip_path);
    if !path.exists() {
        return Err(format!("File archivio non trovato: {}", zip_path));
    }

    let temp_dir = tempfile::tempdir().map_err(|e| format!("Errore creazione cartella temporanea: {}", e))?;
    let file = std::fs::File::open(&path).map_err(|e| format!("Errore apertura file {}: {}", zip_path, e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Errore lettura archivio (.tauext / .zip): {}", e))?;

    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match f.enclosed_name() {
            Some(p) => temp_dir.path().join(p),
            None => continue,
        };

        if f.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    let ext_root = locate_extension_root(temp_dir.path())
        .ok_or_else(|| format!("Manifest '{}' mancante nell'archivio ZIP.", EXTENSION_MANIFEST_FILENAME))?;

    let manifest_raw = std::fs::read_to_string(ext_root.join(EXTENSION_MANIFEST_FILENAME))
        .map_err(|e| format!("Impossibile leggere manifest: {}", e))?;
    let manifest: ExtensionManifest = serde_json::from_str(&manifest_raw)
        .map_err(|e| format!("Errore parsing '{}': {}", EXTENSION_MANIFEST_FILENAME, e))?;

    let dest_dir = get_taucode_extensions_dir()?.join(&manifest.id);
    if dest_dir.exists() {
        let _ = std::fs::remove_dir_all(&dest_dir);
    }

    copy_dir_all(&ext_root, &dest_dir)
        .map_err(|e| format!("Errore copia estensione nella cartella globale: {}", e))?;

    // Assicura che la nuova estensione sia abilitata
    let mut disabled = load_disabled_extensions();
    disabled.retain(|id| id != &manifest.id);
    let _ = save_disabled_extensions(&disabled);

    // Sincronizza subito Skill e MCP
    sync_extensions_ai_assets(&app)?;

    let icon_path = manifest.icon.as_ref().map(|rel| dest_dir.join(rel).to_string_lossy().to_string());

    Ok(ExtensionInfo {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        display_name: manifest.display_name.unwrap_or_default(),
        description: manifest.description.unwrap_or_default(),
        author: manifest.author.unwrap_or_default(),
        icon_path,
        homepage: manifest.homepage,
        dir_path: dest_dir.to_string_lossy().to_string(),
        enabled: true,
        contributes: manifest.contributes,
    })
}

#[tauri::command]
pub fn install_extension_git(app: AppHandle, repo_url: String) -> Result<ExtensionInfo, String> {
    let trimmed_url = repo_url.trim();
    if !trimmed_url.starts_with("http://") && !trimmed_url.starts_with("https://") && !trimmed_url.starts_with("git@") {
        return Err("URL del repository GitHub non valido.".to_string());
    }

    let temp_dir = tempfile::tempdir().map_err(|e| format!("Errore creazione cartella temporanea: {}", e))?;
    
    // Esegui git clone
    let output = std::process::Command::new("git")
        .args(&["clone", "--depth", "1", trimmed_url, temp_dir.path().to_str().unwrap()])
        .output()
        .map_err(|e| format!("Impossibile avviare 'git clone': {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Errore durante 'git clone': {}", err.trim()));
    }

    let ext_root = locate_extension_root(temp_dir.path())
        .ok_or_else(|| format!("Il repository clonato non contiene '{}'.", EXTENSION_MANIFEST_FILENAME))?;

    let manifest_raw = std::fs::read_to_string(ext_root.join(EXTENSION_MANIFEST_FILENAME))
        .map_err(|e| format!("Impossibile leggere manifest: {}", e))?;
    let manifest: ExtensionManifest = serde_json::from_str(&manifest_raw)
        .map_err(|e| format!("Errore formato '{}': {}", EXTENSION_MANIFEST_FILENAME, e))?;

    let dest_dir = get_taucode_extensions_dir()?.join(&manifest.id);
    if dest_dir.exists() {
        let _ = std::fs::remove_dir_all(&dest_dir);
    }

    copy_dir_all(&ext_root, &dest_dir)
        .map_err(|e| format!("Errore copia estensione nella cartella globale: {}", e))?;

    let mut disabled = load_disabled_extensions();
    disabled.retain(|id| id != &manifest.id);
    let _ = save_disabled_extensions(&disabled);

    sync_extensions_ai_assets(&app)?;

    let icon_path = manifest.icon.as_ref().map(|rel| dest_dir.join(rel).to_string_lossy().to_string());

    Ok(ExtensionInfo {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        display_name: manifest.display_name.unwrap_or_default(),
        description: manifest.description.unwrap_or_default(),
        author: manifest.author.unwrap_or_default(),
        icon_path,
        homepage: manifest.homepage,
        dir_path: dest_dir.to_string_lossy().to_string(),
        enabled: true,
        contributes: manifest.contributes,
    })
}

#[tauri::command]
pub fn list_mcp_servers() -> Result<Vec<McpServerInfo>, String> {
    let mut result = Vec::new();

    if let Some(config_path) = get_global_antigravity_mcp_config_path() {
        if config_path.exists() {
            if let Ok(raw) = std::fs::read_to_string(&config_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if let Some(servers) = val.get("mcpServers").and_then(|v| v.as_object()) {
                        for (name, s) in servers {
                            let command = s.get("command").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                            let args: Vec<String> = s.get("args")
                                .and_then(|v| v.as_array())
                                .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                                .unwrap_or_default();

                            let env = s.get("env").and_then(|v| v.as_object()).map(|obj| {
                                obj.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect()
                            });

                            let url = s.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
                            let transport = if url.is_some() { "sse".to_string() } else { "stdio".to_string() };
                            let is_disabled = s.get("disabled").and_then(|v| v.as_bool()).unwrap_or(false);

                            let ext_id = s.get("_taucode_extension_id").and_then(|v| v.as_str()).map(|s| s.to_string());
                            let ext_name = s.get("_taucode_extension_name").and_then(|v| v.as_str()).map(|s| s.to_string());
                            let is_ext = ext_id.is_some();

                            result.push(McpServerInfo {
                                name: name.clone(),
                                command,
                                args,
                                env,
                                url,
                                transport,
                                enabled: !is_disabled,
                                extension_id: ext_id,
                                extension_name: ext_name,
                                is_extension_provided: is_ext,
                            });
                        }
                    }
                }
            }
        }
    }

    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

#[tauri::command]
pub fn toggle_mcp_server(name: String, enabled: bool) -> Result<(), String> {
    if let Some(config_path) = get_global_antigravity_mcp_config_path() {
        if config_path.exists() {
            let mut val: serde_json::Value = std::fs::read_to_string(&config_path)
                .ok()
                .and_then(|raw| serde_json::from_str(&raw).ok())
                .unwrap_or_else(|| serde_json::json!({ "mcpServers": {} }));

            if let Some(servers) = val.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
                if let Some(s) = servers.get_mut(&name) {
                    s["disabled"] = serde_json::json!(!enabled);
                    let _ = std::fs::write(&config_path, serde_json::to_string_pretty(&val).unwrap_or_default());
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn delete_mcp_server(name: String) -> Result<(), String> {
    if let Some(config_path) = get_global_antigravity_mcp_config_path() {
        if config_path.exists() {
            let mut val: serde_json::Value = std::fs::read_to_string(&config_path)
                .ok()
                .and_then(|raw| serde_json::from_str(&raw).ok())
                .unwrap_or_else(|| serde_json::json!({ "mcpServers": {} }));

            if let Some(servers) = val.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
                servers.remove(&name);
                let _ = std::fs::write(&config_path, serde_json::to_string_pretty(&val).unwrap_or_default());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_and_sync() {
        let manifest_json = r#"{
            "id": "taucode.test-extension",
            "name": "test-extension",
            "displayName": "Test Extension",
            "version": "1.0.0",
            "description": "Test extension description",
            "contributes": {
                "skills": [
                    { "name": "test-skill", "path": "skills/test-skill" }
                ],
                "mcpServers": {
                    "test-server": {
                        "command": "node",
                        "args": ["test.js"]
                    }
                }
            }
        }"#;

        let manifest: Result<ExtensionManifest, _> = serde_json::from_str(manifest_json);
        assert!(manifest.is_ok(), "Manifest should parse correctly");
        let manifest = manifest.unwrap();
        assert_eq!(manifest.id, "taucode.test-extension");
        assert_eq!(manifest.contributes.skills.len(), 1);
        assert_eq!(manifest.contributes.mcp_servers.len(), 1);

        let temp_dir = tempfile::tempdir().expect("Failed to create tempdir");
        let manifest_path = temp_dir.path().join(EXTENSION_MANIFEST_FILENAME);
        std::fs::write(&manifest_path, manifest_json).expect("Failed to write manifest");
        assert!(locate_extension_root(temp_dir.path()).is_some());

        // Verifiche sui path di default
        assert!(get_taucode_extensions_dir().is_ok());
    }
}

