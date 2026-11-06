#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run.py - Unified non-blocking CLI runner for skill-builder.
Enables scaffolding (init), validation (validate), trigger testing (test-trigger),
and exporting (package) of Antigravity & TauCode IDE skills.
Zero external dependencies (Python standard library only).
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent


def run_script(script_name: str, args: list) -> int:
    """Executes a helper script passing forwarded CLI arguments."""
    script_path = CURRENT_DIR / script_name
    cmd = [sys.executable, str(script_path)] + args
    return subprocess.call(cmd)


def test_trigger_match(skill_path: str, user_prompt: str) -> bool:
    """Simulates whether a user prompt would activate the skill based on its description."""
    from validate_skill import SkillValidator
    target = Path(skill_path)
    validator = SkillValidator(target)
    skill_file = validator.skill_file

    if not skill_file.exists():
        print(f"[ERROR] SKILL.md not found in {target}")
        return False

    try:
        content = skill_file.read_text(encoding="utf-8-sig")
        fm, _ = validator.parse_frontmatter(content)
        if not fm or "description" not in fm:
            print("[ERROR] Description missing in frontmatter.")
            return False

        desc = fm["description"].lower()
        prompt_lower = user_prompt.lower()

        # Extract words and quoted phrases
        quotes = [q.lower() for q in re.findall(r'["']([^"']{4,})["']', desc)]
        prompt_words = set(re.findall(r'\b\w{3,}\b', prompt_lower))
        desc_words = set(re.findall(r'\b\w{3,}\b', desc))

        matched_quotes = [q for q in quotes if q in prompt_lower or any(qw in prompt_lower for qw in q.split() if len(qw) > 3)]
        common_words = prompt_words.intersection(desc_words)

        print("\n" + "=" * 60)
        print("TRIGGER ACTIVATION TEST")
        print("=" * 60)
        print(f"Skill: {fm.get('name', 'unknown')}")
        print(f"Test Prompt: \"{user_prompt}\"")
        print("-" * 60)

        confidence = 0
        if matched_quotes:
            confidence += 60
            print(f"[+] Direct trigger phrase match: {matched_quotes}")
        if len(common_words) >= 4:
            confidence += 30
            print(f"[+] High keyword overlap: {list(common_words)[:6]}")
        elif len(common_words) >= 2:
            confidence += 15
            print(f"[+] Moderate keyword overlap: {list(common_words)}")

        confidence = min(100, confidence)
        status = "HIGH PROBABILITY" if confidence >= 60 else "MODERATE PROBABILITY" if confidence >= 30 else "UNLIKELY TO ACTIVATE"
        print(f"Activation Confidence: {confidence}% -> {status}")
        print("=" * 60)
        return confidence >= 50

    except Exception as exc:
        print(f"[ERROR] Failed trigger test: {exc}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Skill Builder CLI - Unified tooling for Antigravity & TauCode IDE skills.",
        epilog="Examples:\n"
               "  python scripts/run.py init my-skill --folder Tools --archetype workflow\n"
               "  python scripts/run.py validate my-skill --fix\n"
               "  python scripts/run.py test-trigger \"create docker containers\" --path my-skill\n"
               "  python scripts/run.py package my-skill",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # Subcommand: init
    init_parser = subparsers.add_parser("init", help="Initialize a new skill")
    init_parser.add_argument("name", help="Skill name in kebab-case")
    init_parser.add_argument("--folder", default="General", help="TauCode IDE folder category (default: General)")
    init_parser.add_argument("--archetype", "--template", "-t", choices=["workflow", "tool-wrapper", "reviewer", "minimal"], default="workflow")
    init_parser.add_argument("--description", "-d", default="")
    init_parser.add_argument("--scope", choices=["builtin", "workspace", "global", "local"], default="builtin")
    init_parser.add_argument("--path", "-p", default=None)
    init_parser.add_argument("--with-scripts", action="store_true")
    init_parser.add_argument("--with-references", action="store_true")
    init_parser.add_argument("--with-examples", action="store_true")
    init_parser.add_argument("--with-resources", action="store_true")
    init_parser.add_argument("--with-all", action="store_true")
    init_parser.add_argument("--force", "-f", action="store_true")

    # Subcommand: validate
    val_parser = subparsers.add_parser("validate", help="Validate a skill")
    val_parser.add_argument("path", nargs="?", default=".", help="Path to skill directory")
    val_parser.add_argument("--strict", action="store_true", help="Treat warnings as errors")
    val_parser.add_argument("--fix", action="store_true", help="Apply automatic formatting and link fixes")

    # Subcommand: test-trigger
    test_parser = subparsers.add_parser("test-trigger", help="Simulate whether a prompt triggers the skill")
    test_parser.add_argument("prompt", help="Test prompt phrase")
    test_parser.add_argument("--path", "-p", default=".", help="Path to skill directory")

    # Subcommand: package
    pkg_parser = subparsers.add_parser("package", help="Package skill into .skill archive")
    pkg_parser.add_argument("path", nargs="?", default=".", help="Path to skill directory")
    pkg_parser.add_argument("--output", "-o", default=None, help="Output file path")
    pkg_parser.add_argument("--no-validate", action="store_true")
    pkg_parser.add_argument("--force", "-f", action="store_true")

    if len(sys.argv) == 1:
        parser.print_help()
        return 0

    args, unknown = parser.parse_known_args()

    if args.command == "init":
        forward_args = [args.name, "--folder", args.folder, "--archetype", args.archetype, "--scope", args.scope]
        if args.description:
            forward_args.extend(["--description", args.description])
        if args.path:
            forward_args.extend(["--path", args.path])
        if args.with_scripts:
            forward_args.append("--with-scripts")
        if args.with_references:
            forward_args.append("--with-references")
        if args.with_examples:
            forward_args.append("--with-examples")
        if args.with_resources:
            forward_args.append("--with-resources")
        if args.with_all:
            forward_args.append("--with-all")
        if args.force:
            forward_args.append("--force")
        return run_script("init_skill.py", forward_args + unknown)

    elif args.command == "validate":
        forward_args = [args.path]
        if args.strict:
            forward_args.append("--strict")
        if args.fix:
            forward_args.append("--fix")
        return run_script("validate_skill.py", forward_args + unknown)

    elif args.command == "test-trigger":
        return 0 if test_trigger_match(args.path, args.prompt) else 1

    elif args.command == "package":
        forward_args = [args.path]
        if args.output:
            forward_args.extend(["--output", args.output])
        if args.no_validate:
            forward_args.append("--no-validate")
        if args.force:
            forward_args.append("--force")
        return run_script("package_skill.py", forward_args + unknown)

    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
