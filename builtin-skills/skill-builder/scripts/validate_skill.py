#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate_skill.py - Validates skill structure, frontmatter, triggers, relative links, Python scripts, and skill.json.
Supports automated repairs with the --fix flag.
Zero external dependencies (Python standard library only).
"""

import argparse
import json
import os
import py_compile
import re
import sys
from pathlib import Path

ACTION_VERBS = [
    # English
    "runs", "executes", "analyzes", "manages", "creates", "validates", "checks",
    "scans", "automates", "optimizes", "reviews", "converts", "generates",
    "monitors", "exports", "integrates", "resolves", "configures", "guides",
    "builds", "deploys", "audits", "scaffolds", "tests", "formats", "inspects",
    # Italian (for backwards compatibility)
    "esegue", "analizza", "gestisce", "crea", "valida", "controlla", "scansiona",
    "automatizza", "interfaccia", "ottimizza", "revisiona", "converte", "genera",
    "monitora", "esporta", "integra", "risolve", "configura", "guida"
]

TRIGGER_INDICATORS = [
    "use when", "use whenever", "use for", "when user asks", "for requests like",
    "even if not naming", "even without", "whenever the user",
    # Italian
    "usa quando", "usa ogni volta", "usa per", "attivabile quando",
    "per richieste come", "quando l'utente", "anche senza nominare"
]


class SkillValidator:
    def __init__(self, target_path: Path, strict: bool = False, fix: bool = False):
        self.target_path = target_path.resolve()
        self.strict = strict
        self.fix = fix
        self.errors = []
        self.warnings = []
        self.fixes = []
        self.trigger_score = 0
        self.skill_dir = self.target_path if self.target_path.is_dir() else self.target_path.parent
        self.skill_file = self.skill_dir / "SKILL.md"
        self.skill_json_file = self.skill_dir / "skill.json"

    def log_error(self, message: str):
        self.errors.append(message)

    def log_warning(self, message: str):
        self.warnings.append(message)

    def log_fix(self, message: str):
        self.fixes.append(message)

    def parse_frontmatter(self, content: str):
        """Parses YAML frontmatter block without external yaml library."""
        content_clean = content.lstrip("﻿")
        match = re.match(r"^---\s*\r?\n(.*?)\r?\n---\s*\r?\n(.*)$", content_clean, re.DOTALL)
        if not match:
            return None, content_clean

        raw_fm, body = match.group(1), match.group(2)
        data = {}
        lines = raw_fm.splitlines()
        i = 0
        while i < len(lines):
            line = lines[i]
            if not line.strip() or line.strip().startswith("#"):
                i += 1
                continue

            kv_match = re.match(r"^([a-zA-Z0-9_-]+):\s*(.*)$", line)
            if kv_match:
                key, val = kv_match.group(1).strip(), kv_match.group(2).strip()

                if val in (">-", ">", "|", "|-"):
                    multiline = []
                    i += 1
                    while i < len(lines):
                        subline = lines[i]
                        if subline.startswith("  ") or subline.startswith("	"):
                            multiline.append(subline.strip())
                            i += 1
                        elif not subline.strip():
                            multiline.append("")
                            i += 1
                        else:
                            break
                    data[key] = " ".join([m for m in multiline if m]).strip()
                    continue
                else:
                    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                        val = val[1:-1]
                    data[key] = val
            i += 1

        return data, body

    def validate_frontmatter(self, fm: dict):
        if fm is None:
            self.log_error("YAML frontmatter missing or malformed in SKILL.md. Must start and end with '---'.")
            return

        name = fm.get("name")
        if not name:
            self.log_error("Mandatory field 'name' missing in SKILL.md frontmatter.")
        else:
            if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", name):
                self.log_error(f"Skill name '{name}' is not valid kebab-case (e.g. 'docker-manager').")
            if len(name) > 64:
                self.log_warning(f"Skill name exceeds recommended 64 characters ({len(name)} chars).")

            if self.skill_dir.name != name and self.skill_dir.name not in ("skills", "builtin", "scratch"):
                self.log_warning(
                    f"Folder name ('{self.skill_dir.name}') does not match frontmatter 'name' ('{name}'). "
                    f"In Antigravity, keeping them identical is strongly recommended for discovery."
                )

        folder = fm.get("folder")
        if not folder:
            self.log_warning("Frontmatter missing 'folder' category (e.g. 'Tools', 'Development', 'General'). TauCode IDE uses this to organize skills.")

        description = fm.get("description")
        if not description:
            self.log_error("Mandatory field 'description' missing in SKILL.md frontmatter.")
        else:
            self.evaluate_description(description)

    def evaluate_description(self, desc: str):
        """Evaluates description trigger effectiveness for agent activation (0 to 9 score)."""
        length = len(desc)
        score = 0

        # Length check (max 2 points)
        if length < 50:
            self.log_warning(f"Description too short ({length} chars). High risk of missed activations.")
        elif length < 90:
            self.log_warning(f"Description is terse ({length} chars). Enrich with more concrete triggers.")
            score += 1
        elif length <= 1024:
            score += 2
        else:
            self.log_warning(f"Description exceeds recommended 1024 characters ({length} chars).")
            score += 1

        desc_lower = desc.lower()

        # Operational Action Verb check (max 2 points)
        first_word = desc_lower.split()[0] if desc_lower.split() else ""
        first_word_clean = re.sub(r"[^\w]", "", first_word)
        if any(first_word_clean.startswith(v) for v in ACTION_VERBS):
            score += 2
        else:
            self.log_warning(f"Description does not start with a clear action verb (starts with '{first_word}').")

        # Explicit Trigger Phrases check (max 2 points)
        if any(trig in desc_lower for trig in TRIGGER_INDICATORS):
            score += 2
        else:
            self.log_warning("Description missing explicit trigger formulas (e.g. 'Use when...', 'Use whenever...').")

        # Quoted Example User Requests check (max 2 points)
        quotes = re.findall(r'["\']([^"\'{4,}]+)["\']', desc)
        if len(quotes) >= 2:
            score += 2
        elif len(quotes) == 1:
            score += 1
            self.log_warning("Description contains only 1 quoted trigger phrase. At least 2 are recommended.")
        else:
            self.log_warning('Description contains no quoted trigger phrases ("..."). These help agents recognize intent.')

        # Conflicting Angle Brackets check (max 1 point)
        if "<" in desc or ">" in desc:
            self.log_warning("Description contains angle brackets (< or >). Remove them to prevent LLM prompt delimiter conflicts.")
        else:
            score += 1

        self.trigger_score = score

    def validate_and_fix_body(self, content: str, fm: dict) -> str:
        """Validates body of SKILL.md and applies safe auto-fixes if fix=True."""
        _, body = self.parse_frontmatter(content)
        modified = False
        new_content = content

        # 1. Line count check (Progressive Disclosure)
        lines = body.splitlines()
        line_count = len(lines)
        if line_count > 500:
            self.log_warning(
                f"SKILL.md has {line_count} lines (>500). "
                "To prevent context window bloat, extract reference manuals to 'references/' and logic to 'scripts/'."
            )

        # 2. Balanced code blocks
        code_block_count = len(re.findall(r"^```", body, re.MULTILINE))
        if code_block_count % 2 != 0:
            self.log_error(f"Unbalanced Markdown code blocks detected ({code_block_count} '```' fences found).")

        # 3. Main H1 Title check and auto-fix
        has_h1 = bool(re.search(r"^#\s+.+", body, re.MULTILINE))
        if not has_h1:
            self.log_warning("SKILL.md is missing a top-level H1 title (# Title).")
            if self.fix and fm and fm.get("name"):
                skill_title = fm["name"].replace("-", " ").title()
                fm_end = content.find("---", 3)
                if fm_end != -1:
                    insert_pos = content.find("\n", fm_end) + 1
                    new_content = content[:insert_pos] + f"\n# {skill_title}\n" + content[insert_pos:]
                    self.log_fix(f"Added top-level title: '# {skill_title}'")
                    modified = True
                    content = new_content
                    _, body = self.parse_frontmatter(content)

        # 4. Markdown Links check and auto-fix
        link_pattern = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
        for match in link_pattern.finditer(body):
            target = match.group(2).strip()
            if target.startswith(("http://", "https://", "mailto:", "#", "file://", "customization://", "conversation://")):
                continue

            clean_target = target.split("#")[0].strip()
            if not clean_target:
                continue

            # Check for Windows backslashes in relative links
            if '\\' in clean_target:
                self.log_warning(f"Link contains Windows backslash: '{target}'")
                if self.fix:
                    fixed_target = target.replace('\\', '/')
                    old_link = f"({target})"
                    new_link = f"({fixed_target})"
                    new_content = new_content.replace(old_link, new_link)
                    self.log_fix(f"Normalized link path separator: '{target}' -> '{fixed_target}'")
                    modified = True
                    clean_target = clean_target.replace('\\', '/')

            target_file = (self.skill_dir / clean_target).resolve()
            if not target_file.exists():
                self.log_error(f"Broken link in SKILL.md: '{target}' points to nonexistent file ({target_file}).")

        if modified and self.fix:
            try:
                self.skill_file.write_text(new_content, encoding="utf-8")
                self.log_fix("Saved automated fixes to SKILL.md")
            except Exception as e:
                self.log_error(f"Failed to save fixes to SKILL.md: {e}")

        return new_content

    def validate_scripts(self):
        scripts_dir = self.skill_dir / "scripts"
        if not scripts_dir.exists() or not scripts_dir.is_dir():
            return

        for f in scripts_dir.iterdir():
            if f.is_file() and f.suffix == ".py":
                try:
                    py_compile.compile(str(f), doraise=True)
                except py_compile.PyCompileError as e:
                    self.log_error(f"Python syntax error in script '{f.name}': {e.msg}")

    def validate_references(self):
        ref_dir = self.skill_dir / "references"
        if ref_dir.exists() and ref_dir.is_dir():
            files = [f for f in ref_dir.iterdir() if f.is_file()]
            if not files:
                self.log_warning("Directory 'references/' exists but is empty.")

    def validate_examples(self):
        ex_dir = self.skill_dir / "examples"
        if ex_dir.exists() and ex_dir.is_dir():
            files = [f for f in ex_dir.iterdir() if f.is_file()]
            if not files:
                self.log_warning("Directory 'examples/' exists but is empty.")

    def validate_resources(self):
        res_dir = self.skill_dir / "resources"
        if res_dir.exists() and res_dir.is_dir():
            files = [f for f in res_dir.iterdir() if f.is_file()]
            if not files:
                self.log_warning("Directory 'resources/' exists but is empty.")

    def validate_skill_json(self, fm: dict):
        if not self.skill_json_file.exists():
            self.log_warning("skill.json not found. TauCode IDE uses skill.json to configure category and run scripts.")
            if self.fix and fm:
                name = fm.get("name", self.skill_dir.name)
                folder = fm.get("folder", "General")
                desc = fm.get("description", "")[:120]
                manifest = {
                    "name": name,
                    "folder": folder,
                    "version": "1.0.0",
                    "description": desc,
                    "enabled": True,
                    "is_default": False,
                    "entry": "SKILL.md",
                    "scripts": {
                        "run": "python scripts/run.py"
                    }
                }
                self.skill_json_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
                self.log_fix("Generated missing skill.json for TauCode IDE integration")
            return

        try:
            data = json.loads(self.skill_json_file.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                self.log_error("skill.json is not a valid JSON object.")
                return

            if "name" in data and not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", str(data["name"])):
                self.log_warning(f"skill.json: 'name' field ('{data['name']}') should be kebab-case.")

            if fm and "folder" in fm and "folder" in data:
                if fm["folder"] != data["folder"]:
                    self.log_warning(
                        f"Category mismatch: SKILL.md folder ('{fm['folder']}') does not match skill.json folder ('{data['folder']}')."
                    )
                    if self.fix:
                        data["folder"] = fm["folder"]
                        self.skill_json_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
                        self.log_fix(f"Synchronized skill.json folder to '{fm['folder']}'")

            if "entry" in data:
                entry_file = self.skill_dir / data["entry"]
                if not entry_file.exists():
                    self.log_error(f"skill.json: entry point file '{data['entry']}' does not exist.")

        except json.JSONDecodeError as e:
            self.log_error(f"JSON syntax error in skill.json: {e}")

    def run(self) -> bool:
        print(f"\n[INFO] Validating skill in: {self.skill_dir}")

        if not self.skill_file.exists():
            self.log_error(f"Mandatory file SKILL.md not found in {self.skill_dir}")
            self.print_report()
            return False

        try:
            content = self.skill_file.read_text(encoding="utf-8-sig")
        except Exception as e:
            self.log_error(f"Failed to read SKILL.md: {e}")
            self.print_report()
            return False

        fm, body = self.parse_frontmatter(content)
        self.validate_frontmatter(fm)
        self.validate_and_fix_body(content, fm)
        self.validate_scripts()
        self.validate_references()
        self.validate_examples()
        self.validate_resources()
        self.validate_skill_json(fm)

        return self.print_report()

    def print_report(self) -> bool:
        print("\n" + "=" * 60)
        print("SKILL VALIDATION REPORT")
        print("=" * 60)

        # Trigger Quality Score
        if self.trigger_score > 0:
            stars = "★" * min(5, (self.trigger_score + 1) // 2)
            print(f"Trigger Quality Score: {self.trigger_score}/9 {stars}")

        if self.fixes:
            print(f"\n[+] AUTOMATIC FIXES APPLIED ({len(self.fixes)}):")
            for fix in self.fixes:
                print(f"  v {fix}")

        if not self.errors and not self.warnings:
            print("[SUCCESS] Skill is 100% compliant with Antigravity & TauCode IDE standards!")
            print("=" * 60)
            return True

        if self.errors:
            print(f"\n[!] BLOCKING ERRORS ({len(self.errors)}):")
            for err in self.errors:
                print(f"  x {err}")

        if self.warnings:
            print(f"\n[*] WARNINGS & RECOMMENDATIONS ({len(self.warnings)}):")
            for warn in self.warnings:
                print(f"  - {warn}")

        print("=" * 60)

        if self.errors:
            return False
        if self.warnings and self.strict:
            print("[FAILED] Validation failed due to warnings under --strict mode.")
            return False

        print("[OK] No blocking errors found. Skill is ready for production use.")
        return True


def main():
    parser = argparse.ArgumentParser(description="Validates an Antigravity / TauCode IDE skill with Auto-Fix support.")
    parser.add_argument("path", nargs="?", default=".", help="Path to skill directory or SKILL.md (default: current directory)")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as blocking errors")
    parser.add_argument("--fix", action="store_true", help="Automatically apply fixable formatting and link repairs")

    args = parser.parse_args()
    target_path = Path(args.path)

    validator = SkillValidator(target_path, strict=args.strict, fix=args.fix)
    success = validator.run()
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
