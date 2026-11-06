# Comprehensive Skill Authoring Guide for TauCode IDE & Antigravity

A **Skill** is a modular operational runbook that teaches an AI agent how to perform complex, multi-step domain workflows and tasks consistently.

---

## 1. Directory Architecture

Every skill follows an autonomous, modular layout aligned with Antigravity and TauCode IDE standards:

```text
skill-name/
├── SKILL.md            # REQUIRED: Entry point with YAML frontmatter and operational runbook
├── skill.json          # REQUIRED: TauCode IDE manifest with folder category and script definitions
├── scripts/            # OPTIONAL: Reusable, deterministic Python scripts
│   └── run.py          # Primary entry point registered in skill.json
├── references/         # OPTIONAL: Specialized reference manuals (Progressive Disclosure)
│   └── guide.md
├── examples/           # OPTIONAL: Example prompts and command usage scenarios
│   └── example-usage.md
└── resources/          # OPTIONAL: Static configurations, JSON schemas, templates
    └── config-template.json
```

---

## 2. TauCode IDE Native Integration

TauCode IDE natively manages and discovers skills:
- **Location**: Installed skills live in `~/.gemini/antigravity/builtin/skills/<skill-name>/` (recommended for built-in tools) or `.agents/skills/<skill-name>/` (for project workspaces).
- **Category Folders**: Every skill must specify a `folder` category in both `SKILL.md` frontmatter and `skill.json`. Available common categories include:
  - `General`: Default general-purpose utilities.
  - `Tools`: Tooling, compilers, generators, and scaffolding utilities.
  - `Development`: Coding, testing, refactoring, and code review helpers.
  - `DevOps`: CI/CD, Docker, Kubernetes, deployments, and cloud infrastructure.
  - `Automation`: Repetitive scripts, file conversions, and cron jobs.
  - `AI`: LLM prompts, model fine-tuning, embeddings, and prompt engineering.
- **Dedicated Workspaces**: Clicking **Open Space** in TauCode IDE launches `openSkillAsWorkspace`, providing an isolated Monaco editor, terminal, and file explorer for that skill.
- **Unified Script Execution**: The IDE executes deterministic scripts registered under `"scripts"` in `skill.json`:
  ```json
  "scripts": {
    "run": "python scripts/run.py"
  }
  ```
- **Non-blocking Execution**: AI agents execute in non-interactive terminal contexts. Avoid blocking terminal `input()` calls; always accept parameters via CLI arguments and flags.

---

## 3. The `SKILL.md` Frontmatter (Activation Key)

The agent catalogs available skills by loading **only** the `name` and `description` from the YAML frontmatter. The full body of `SKILL.md` is loaded only when the agent decides the skill is relevant to the user request.

### Required Format

```yaml
---
name: skill-name
folder: CategoryName
description: >-
  Action verb + core objective.
  Use when the user asks to "real user phrase 1", "real user phrase 2",
  for requests like "...", even without explicitly naming this skill.
---
```

### The 9-point Trigger Quality Score

1. **`name`**: Valid `kebab-case` (lowercase letters, numbers, hyphens). Must match directory name.
2. **`folder`**: Matches the category in `skill.json`.
3. **Action Verb**: Description starts with an operational verb (`Runs`, `Analyzes`, `Manages`, `Creates`, `Validates`, `Reviews`, `Automates`, `Builds`, `Deploys`).
4. **Trigger Indicator**: Includes trigger formula (`Use when...`, `Use whenever...`, `Use for...`).
5. **Quoted User Prompts**: Includes at least 2 realistic user requests enclosed in quotes (`"..."`).
6. **No Conflict Characters**: No unescaped angle brackets (`<` or `>`) that could conflict with prompt delimiters.
7. **Optimal Length**: Description length between 90 and 1024 characters.
8. **Negative Scope**: States what the skill should NOT be used for (prevents false activations).
9. **Bilingual / Keyword Coverage**: Covers key terminology in English and relevant domain terms.

---

## 4. Progressive Disclosure (Zero-Token Waste)

To optimize the agent's context window:

1. **Level 1 (Zero Token Cost)**: `name` and `description` in frontmatter. Always present in catalog.
2. **Level 2 (On Activation)**: Body of `SKILL.md`. Loaded only when triggered. Keep under 500 lines.
3. **Level 3 (On Demand)**: Files in `references/`, `examples/`, `resources/`, and `scripts/`. Read or executed only when needed.

---

## 5. Operational Runbook Best Practices

### 5.1 Explain the "Why" Behind Critical Checks
LLMs make better decisions when they understand the technical rationale:
- **Weak**: `"Check that port 8080 is free."`
- **Strong**: `"Check that port 8080 is free using 'netstat': if the port is bound, the server will fail to start silently without generating error logs."`

### 5.2 Deterministic Code Belongs in `scripts/`
If a task involves regex parsing, file transformations, or API calls:
- Do not make the LLM write ad-hoc Python code in chat.
- Create a reusable script in `scripts/run.py` and instruct the agent to run: `python scripts/run.py --target . --dry-run`.

### 5.3 Provide Exact Markdown Output Templates
Include concrete markdown block structures in `SKILL.md` showing the agent exactly how to format its response to the user.

---

## 6. Skill Scopes in Antigravity

- **Builtin (`~/.gemini/antigravity/builtin/skills/<name>/`)**: Default for TauCode IDE. Automatically discovered in the IDE AI Settings panel.
- **Workspace (`.agents/skills/<name>/`)**: Project-specific, versioned in Git alongside codebase.
- **Global (`~/.gemini/config/skills/<name>/`)**: User-wide tools available across all projects on the machine.
