---
version: 1.1.0
name: skill-builder
folder: Built-in
description: >-
  Creates, designs, scaffolds, structures, optimizes, and validates new modular skills for Antigravity and TauCode IDE.
  Use this skill WHENEVER the user wants to create, edit, or improve a skill,
  for requests like "create a skill", "build a skill for...", "make a new skill",
  "turn this workflow into a skill", "write a SKILL.md", "scaffold a skill",
  "optimize this skill", "validate skill", even if not naming this skill explicitly.
  Do NOT use for one-off throwaway scripts or generic coding syntax questions.
---

# Skill Builder

Comprehensive operational runbook to transform workflows and specialized domain tasks into production-ready, modular skills deeply integrated with TauCode IDE and Antigravity. Built around the principles of Progressive Disclosure, high-probability trigger engineering, and zero-token waste.

---

## TauCode IDE Native Skill Architecture

In TauCode IDE, skills are first-class, natively managed developer extensions:
- **Location**: Installed skills reside in `~/.gemini/antigravity/builtin/skills/<skill-name>/` (recommended default for TauCode IDE) or project-local `.agents/skills/<skill-name>/`.
- **Category Folders**: Every skill specifies a `folder` category (e.g., `Tools`, `Development`, `DevOps`, `Automation`, `AI`, `General`) in its `SKILL.md` frontmatter and `skill.json`. TauCode IDE groups skills by folder in the AI Settings interface and allows batch enabling/disabling.
- **Dedicated Workspaces**: Skills can be opened as dedicated spaces in the IDE (`openSkillAsWorkspace`), providing Monaco code editing, file navigation, and an integrated terminal.
- **Unified Execution**: Deterministic CLI scripts registered under `"scripts"` in `skill.json` (such as `"scripts": { "run": "python scripts/run.py" }`) are directly invokable.
- **Non-blocking Execution**: AI agents run tools asynchronously in non-interactive terminals. Scripts must accept command-line arguments and flags rather than prompting for interactive standard input (`input()`).

---

## Step-by-Step Workflow

Follow these sequential phases when creating or modifying a skill:

### Phase 1: Intent Analysis & Archetype Selection
1. Analyze the user request to determine:
   - **Goal & domain**: What specific task or tool the skill orchestrates.
   - **Architectural archetype**:
     - `workflow`: Step-by-step procedural runbook with preflight checks, sequential commands, verification, and rollback.
     - `tool-wrapper`: Deterministic wrapper delegating complex calculations, regex parsing, or API calls to Python scripts in `scripts/`.
     - `reviewer`: Code inspection, quality audit, checklist verification, and structured actionable feedback.
     - `minimal`: Lightweight, concise operational guide for targeted actions.
   - **Target Category (`folder`)**: `Tools`, `Development`, `DevOps`, `Automation`, `AI`, or `General`.
   - **Target Scope**:
     - `builtin` (`~/.gemini/antigravity/builtin/skills/<name>/`): **Default for TauCode IDE**. Immediately visible in the IDE AI Settings panel.
     - `workspace` (`.agents/skills/<name>/`): Project-specific and tracked in Git.
     - `global` (`~/.gemini/config/skills/<name>/`): Machine-wide utility.

### Phase 2: Scaffolding the Skill
Run the generator script to create the standardized directory structure, `SKILL.md`, and `skill.json`:

```bash
# Workflow (Comprehensive procedural runbook with all modular folders)
python scripts/init_skill.py <skill-name> --folder Tools --archetype workflow --scope builtin --with-all

# Tool Wrapper (With deterministic Python runner in scripts/run.py)
python scripts/init_skill.py <skill-name> --folder Development --archetype tool-wrapper --scope builtin

# Code / Architecture Reviewer
python scripts/init_skill.py <skill-name> --folder Tools --archetype reviewer --scope builtin --with-references
```

The scaffolding script:
1. Validates `kebab-case` naming.
2. Creates `SKILL.md` with appropriate frontmatter (`name`, `folder`, `description`).
3. Generates `skill.json` synchronized with the IDE manifest schema.
4. Generates a starter `scripts/run.py` script ready for execution.
5. Populates optional modular directories (`references/`, `examples/`, `resources/`).

### Phase 3: Authoring `SKILL.md`
Customize `SKILL.md` using the templates in [templates.md](references/templates.md) and rules in [writing-guide.md](references/writing-guide.md):

1. **Frontmatter Trigger Quality**:
   - The AI agent decides whether to activate a skill reading **only** `name` and `description`.
   - Formula: `[Action Verb + Goal] + [Exact Trigger Condition] + [At least 2 realistic quoted trigger phrases]`.
   - Example:
     ```yaml
     ---
     name: docker-manager
     folder: DevOps
     description: >-
       Manages, builds, audits, and troubleshoots Docker containers and compose stacks.
       Use when the user asks to "build docker containers", "check docker compose",
       "troubleshoot docker networking", or debug failing container logs.
       Do NOT use for Kubernetes Helm charts.
     ---
     ```
2. **Procedural Body**:
   - Use an imperative, direct tone. Always explain the **technical reason ("why")** behind critical checks.
   - Include preflight prerequisite checklists (`- [ ]`).
   - Provide an **exact markdown output template** for agent responses.
   - Document edge cases, error recovery, and rollback procedures.
   - Keep `SKILL.md` under 500 lines to preserve context window tokens.

### Phase 4: Progressive Disclosure & Helper Scripts
- **Deterministic logic**: If a step involves regex parsing, file formatting, JSON transformations, or complex CLI queries, place code in `scripts/run.py` rather than asking the LLM to write code on the fly.
- **Deep technical references**: If reference manuals, schemas, or large tables exceed 100 lines, extract them into standalone files in `references/` and link them relatively from `SKILL.md`.

### Phase 5: Automated Validation & Auto-Fix
Run the built-in validator to inspect frontmatter, trigger quality, link integrity, and script syntax:

```bash
python scripts/validate_skill.py <skill-path> --fix
```

The validator:
- Evaluates trigger effectiveness (**Trigger Quality Score: 1 to 9**).
- Verifies frontmatter `name`, `folder`, and `description`.
- Checks consistency between `SKILL.md` and `skill.json`.
- Automatically fixes Windows backslashes in Markdown links (`\\` -> `/`) and missing H1 titles.
- Validates syntax of Python scripts in `scripts/`.
- If blocking errors are reported, fix them immediately and re-validate until all checks pass.

### Phase 6: Hand-Off & Verification
1. Present 2 typical prompt examples the user can invoke to trigger the skill.
2. Summarize the created directory structure and operational scope in 2-3 concise sentences.

---

## Optimizing an Existing Skill

When asked to review, refine, or update an existing skill:
1. **Initial Assessment**: Run `python scripts/validate_skill.py <skill-path> --fix`.
2. **Trigger Enhancement**: Optimize `description` to reach a 9/9 Trigger Quality Score.
3. **TauCode Metadata Synchronization**: Ensure `folder` is declared in both `SKILL.md` and `skill.json`.
4. **Progressive Disclosure Refactoring**: Move large reference tables into `references/` and complex tasks into `scripts/`.
5. **Final Validation**: Confirm passing status with `validate_skill.py --strict`.
