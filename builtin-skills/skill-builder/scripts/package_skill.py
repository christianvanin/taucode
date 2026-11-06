#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
package_skill.py - Validates and exports a skill as a compressed distributable archive (.skill or .zip).
Zero external dependencies (Python standard library only).
"""

import argparse
import os
import shutil
import sys
import zipfile
from pathlib import Path

# Import local validator
from validate_skill import SkillValidator

EXCLUDE_DIRS = {
    "__pycache__",
    ".git",
    ".svn",
    ".hg",
    ".venv",
    "venv",
    "env",
    ".idea",
    ".vscode",
    "scratch",
}

EXCLUDE_FILES = {
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
}

EXCLUDE_EXTENSIONS = {
    ".pyc",
    ".pyo",
    ".pyd",
    ".tmp",
    ".bak",
    ".skill",
}


def should_exclude(path: Path, root: Path) -> bool:
    """Checks whether a file or directory should be excluded from package archive."""
    rel = path.relative_to(root)
    for part in rel.parts:
        if part in EXCLUDE_DIRS:
            return True

    if path.is_file():
        if path.name in EXCLUDE_FILES:
            return True
        if path.suffix in EXCLUDE_EXTENSIONS:
            return True

    return False


def package_skill(skill_dir: Path, output_file: Path = None, no_validate: bool = False, force: bool = False) -> Path:
    """Packages a skill directory into a compressed .skill archive."""
    skill_dir = skill_dir.resolve()
    skill_file = skill_dir / "SKILL.md"

    if not skill_file.exists():
        raise FileNotFoundError(f"SKILL.md not found in {skill_dir}")

    # Validate before packaging unless explicitly bypassed
    if not no_validate:
        print(f"[INFO] Running pre-packaging validation on: {skill_dir}")
        validator = SkillValidator(skill_dir, strict=False, fix=True)
        if not validator.run():
            raise ValueError("Pre-packaging validation failed. Fix blocking errors or pass --no-validate.")

    skill_name = skill_dir.name
    if not output_file:
        output_file = skill_dir.parent / f"{skill_name}.skill"
    else:
        output_file = output_file.resolve()

    if output_file.exists() and not force:
        raise FileExistsError(f"Output archive already exists: {output_file}. Use --force to overwrite.")

    print(f"\n[INFO] Packaging skill '{skill_name}' into:\n  {output_file}")

    file_count = 0
    total_bytes = 0

    with zipfile.ZipFile(output_file, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(skill_dir):
            root_path = Path(root)
            dirs[:] = [d for d in dirs if not should_exclude(root_path / d, skill_dir)]

            for f in files:
                file_path = root_path / f
                if not should_exclude(file_path, skill_dir):
                    arcname = file_path.relative_to(skill_dir)
                    zf.write(file_path, arcname)
                    file_count += 1
                    total_bytes += file_path.stat().st_size

    archive_size = output_file.stat().st_size
    print(f"[SUCCESS] Packaged {file_count} files ({total_bytes} bytes uncompressed -> {archive_size} bytes compressed).")
    return output_file


def main():
    parser = argparse.ArgumentParser(description="Packages an Antigravity / TauCode IDE skill into a distributable archive.")
    parser.add_argument("path", nargs="?", default=".", help="Path to skill directory (default: current directory)")
    parser.add_argument("--output", "-o", default=None, help="Destination archive path (default: <skill-name>.skill)")
    parser.add_argument("--no-validate", action="store_true", help="Bypass pre-packaging validation")
    parser.add_argument("--force", "-f", action="store_true", help="Overwrite existing archive")

    args = parser.parse_args()

    skill_dir = Path(args.path)
    output_path = Path(args.output) if args.output else None

    try:
        package_skill(skill_dir, output_file=output_path, no_validate=args.no_validate, force=args.force)
        return 0
    except Exception as exc:
        print(f"[ERROR] Packaging failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
