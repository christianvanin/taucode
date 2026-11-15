#!/usr/bin/env python3
"""
TauCode Extension Packager (.tauext)
Packages a TauCode extension into a .tauext archive for installation and distribution.

Usage:
    python scripts/package_extension.py <extension_path> [--output <dest_dir>] [--install]
Example:
    python scripts/package_extension.py estensions/ipabuilder
    python scripts/package_extension.py estensions/ipabuilder --install
"""

import os
import sys
import json
import zipfile
import shutil
import argparse
from pathlib import Path

EXCLUDE_DIRS = {
    "target",
    ".git",
    ".github",
    "node_modules",
    "__pycache__",
    ".vscode",
    ".idea",
}

EXCLUDE_EXTS = {
    ".pdb",
    ".tmp",
    ".log",
    ".DS_Store",
    "Thumbs.db",
}

def validate_manifest(manifest_path: Path) -> dict:
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest 'taucode-extension.json' non trovato in: {manifest_path}")
    
    with open(manifest_path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Errore sintassi JSON in {manifest_path}: {e}")
    
    for req in ["id", "name", "version"]:
        if not data.get(req):
            raise ValueError(f"Campo obbligatorio mancante nel manifest: '{req}'")
            
    return data

def package_extension(ext_dir: Path, out_dir: Path = None, auto_install: bool = False) -> Path:
    ext_dir = ext_dir.resolve()
    if not ext_dir.is_dir():
        raise NotADirectoryError(f"La cartella specificata non esiste: {ext_dir}")
        
    manifest_path = ext_dir / "taucode-extension.json"
    manifest = validate_manifest(manifest_path)
    
    ext_id = manifest["id"]
    ext_name = manifest["name"]
    ext_version = manifest["version"]
    display_name = manifest.get("displayName", ext_name)
    
    print(f"\n📦 Packaging Estensione TauCode: {display_name} ({ext_id} v{ext_version})")
    print(f"   Cartella sorgente: {ext_dir}")
    
    # Verifica icona
    if "icon" in manifest:
        icon_path = ext_dir / manifest["icon"]
        if not icon_path.exists():
            print(f"⚠️  Attenzione: Icona dichiarata '{manifest['icon']}' non trovata.")
        else:
            print(f"   ✓ Icona trovata: {manifest['icon']}")
            
    # Verifica skills
    contributes = manifest.get("contributes", {})
    skills = contributes.get("skills", [])
    for skill in skills:
        s_name = skill.get("name")
        s_rel = skill.get("path")
        s_dir = ext_dir / s_rel
        s_file = s_dir / "SKILL.md"
        if not s_file.exists():
            print(f"⚠️  Attenzione: Skill '{s_name}' non contiene 'SKILL.md' in {s_dir}")
        else:
            print(f"   ✓ Skill verificata: {s_name} ({s_rel})")
            
    # Determina cartella di output
    if out_dir is None:
        out_dir = ext_dir.parent
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    
    package_filename = f"{ext_name}.tauext"
    package_path = out_dir / package_filename
    
    # Rimuovi file precedente se esiste
    if package_path.exists():
        package_path.unlink()
        
    added_files = 0
    total_uncompressed_bytes = 0
    
    with zipfile.ZipFile(package_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for root, dirs, files in os.walk(ext_dir):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for file in sorted(files):
                if any(file.endswith(ext) for ext in EXCLUDE_EXTS):
                    continue
                file_full = Path(root) / file
                rel_path = file_full.relative_to(ext_dir).as_posix()
                zf.write(file_full, rel_path)
                added_files += 1
                total_uncompressed_bytes += file_full.stat().st_size
                
    pkg_size = package_path.stat().st_size
    print(f"\n✅ Pacchetto creato con successo:")
    print(f"   File: {package_path}")
    print(f"   Dimensione: {pkg_size / (1024 * 1024):.2f} MB ({pkg_size:,} bytes)")
    print(f"   File inclusi: {added_files}")
    
    # Opzione: Installazione diretta in ~/.taucode/extensions/
    if auto_install:
        home = Path.home()
        global_ext_dir = home / ".taucode" / "extensions" / ext_id
        print(f"\n🚀 Installazione diretta in TauCode...")
        if global_ext_dir.exists():
            shutil.rmtree(global_ext_dir)
        global_ext_dir.mkdir(parents=True, exist_ok=True)
        
        # Estrai pacchetto nella cartella di installazione
        with zipfile.ZipFile(package_path, "r") as zf:
            zf.extractall(global_ext_dir)
        print(f"   ✓ Installata in: {global_ext_dir}")
        print(f"   ✓ L'estensione sarà attiva al prossimo riavvio o ricaricamento di TauCode!")
        
    return package_path

def main():
    parser = argparse.ArgumentParser(description="Pacchettizzatore di estensioni per TauCode (.tauext)")
    parser.add_argument("path", nargs="?", default="estensions/ipabuilder", help="Percorso della cartella dell'estensione")
    parser.add_argument("--output", "-o", default=None, help="Cartella in cui salvare il file .tauext")
    parser.add_argument("--install", "-i", action="store_true", help="Installa l'estensione direttamente in ~/.taucode/extensions/")
    
    args = parser.parse_args()
    target_path = Path(args.path)
    out_path = Path(args.output) if args.output else None
    
    try:
        package_extension(target_path, out_path, auto_install=args.install)
    except Exception as e:
        print(f"\n❌ Errore durante il packaging: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

