use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

// Embedding della directory builtin-skills direttamente nel binario di TauCode
static BUILTIN_SKILLS_DIR: Dir = include_dir!("$CARGO_MANIFEST_DIR/../builtin-skills");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuiltinSkillManifestItem {
    pub name: String,
    pub version: String,
    pub description: String,
    pub folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncReport {
    pub installed: Vec<String>,
    pub updated: Vec<String>,
    pub up_to_date: Vec<String>,
}

fn parse_version(raw: &str) -> Option<String> {
    let trimmed = raw.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let rest = &trimmed[3..];
    if let Some(end_idx) = rest.find("\n---") {
        let frontmatter = &rest[..end_idx];
        for line in frontmatter.lines() {
            let l = line.trim();
            if let Some(v) = l.strip_prefix("version:") {
                let clean = v.trim().trim_matches('\'').trim_matches('"').to_string();
                if !clean.is_empty() {
                    return Some(clean);
                }
            }
        }
    }
    None
}

/// Confronta due versioni semantiche (es. "1.1.0" > "1.0.0").
/// Restituisce true se `v1` è strettamente più recente di `v2`.
fn is_newer_version(v1: &str, v2: &str) -> bool {
    let parse_parts = |s: &str| -> Vec<u32> {
        s.split('.')
            .filter_map(|p| {
                p.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse::<u32>()
                    .ok()
            })
            .collect()
    };
    let p1 = parse_parts(v1);
    let p2 = parse_parts(v2);

    for (a, b) in p1.iter().zip(p2.iter()) {
        if a > b {
            return true;
        }
        if a < b {
            return false;
        }
    }
    p1.len() > p2.len()
}

pub fn get_target_skills_directories() -> Vec<PathBuf> {
    let mut dirs_list = Vec::new();
    if let Some(home) = dirs::home_dir() {
        // 1. Directory builtin di Antigravity
        dirs_list.push(home.join(".gemini").join("antigravity").join("builtin").join("skills"));
        // 2. Directory globale di config per persistenza e compatibilità
        dirs_list.push(home.join(".gemini").join("config").join("skills"));
    }
    dirs_list
}

/// Sincronizza le skill built-in incorporate nel binario verso le cartelle dell'utente.
/// Se una skill non esiste, viene installata.
/// Se una skill esiste ma la versione embedded è più recente, viene aggiornata e sovrascritta.
pub fn sync_builtin_skills(app: Option<&AppHandle>) -> Result<SyncReport, String> {
    let target_dirs = get_target_skills_directories();
    let mut report = SyncReport {
        installed: Vec::new(),
        updated: Vec::new(),
        up_to_date: Vec::new(),
    };

    for target_dir in &target_dirs {
        if !target_dir.exists() {
            let _ = std::fs::create_dir_all(target_dir);
        }
    }

    // Scansiona tutte le cartelle di skill embedded in BUILTIN_SKILLS_DIR
    let deleted_skills = crate::modules::antigravity::get_deleted_skills();

    for skill_dir in BUILTIN_SKILLS_DIR.dirs() {
        let skill_folder_name = skill_dir.path().file_name().and_then(|n| n.to_str()).unwrap_or("");
        if skill_folder_name.is_empty() {
            continue;
        }

        let s_clean = skill_folder_name.to_lowercase();
        let s_kebab = s_clean.replace('_', "-");
        if deleted_skills.contains(&s_clean) || deleted_skills.contains(&s_kebab) {
            continue;
        }

        // Estrai la versione embedded da SKILL.md
        let embedded_version = skill_dir
            .get_file(skill_dir.path().join("SKILL.md"))
            .and_then(|f| f.contents_utf8())
            .and_then(parse_version)
            .unwrap_or_else(|| "1.0.0".to_string());

        let mut was_installed = false;
        let mut was_updated = false;

        for target_base in &target_dirs {
            let dest_skill_dir = target_base.join(skill_folder_name);
            let dest_skill_md = dest_skill_dir.join("SKILL.md");

            let should_write = if !dest_skill_dir.exists() || !dest_skill_md.exists() {
                was_installed = true;
                true
            } else {
                // Esiste: confrontiamo la versione presente con quella embedded
                let existing_content = std::fs::read_to_string(&dest_skill_md).unwrap_or_default();
                let existing_version = parse_version(&existing_content).unwrap_or_else(|| "0.0.0".to_string());
                if is_newer_version(&embedded_version, &existing_version) {
                    was_updated = true;
                    true
                } else {
                    false
                }
            };

            if should_write {
                if let Err(e) = extract_embedded_dir(skill_dir, &dest_skill_dir) {
                    log::warn!(
                        "Impossibile estrarre skill {} in {:?}: {}",
                        skill_folder_name,
                        dest_skill_dir,
                        e
                    );
                }
            }
        }

        if was_installed {
            report.installed.push(skill_folder_name.to_string());
        } else if was_updated {
            report.updated.push(skill_folder_name.to_string());
        } else {
            report.up_to_date.push(skill_folder_name.to_string());
        }
    }

    log::info!(
        "Skill Built-in sincronizzate: {} installate, {} aggiornate, {} all'ultima versione",
        report.installed.len(),
        report.updated.len(),
        report.up_to_date.len()
    );

    if let Some(app) = app {
        let _ = app.emit("terax:skills-updated", &report);
    }

    Ok(report)
}

fn extract_embedded_dir(dir: &Dir, target: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(target)?;
    for file in dir.files() {
        let rel_path = file.path().strip_prefix(dir.path()).unwrap_or_else(|_| file.path());
        let file_dest = target.join(rel_path);
        if let Some(parent) = file_dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&file_dest, file.contents())?;
    }
    for sub_dir in dir.dirs() {
        let rel_path = sub_dir.path().strip_prefix(dir.path()).unwrap_or_else(|_| sub_dir.path());
        let sub_dest = target.join(rel_path);
        extract_embedded_dir(sub_dir, &sub_dest)?;
    }
    Ok(())
}

#[tauri::command]
pub fn sync_builtin_skills_command(app: AppHandle) -> Result<SyncReport, String> {
    sync_builtin_skills(Some(&app))
}

