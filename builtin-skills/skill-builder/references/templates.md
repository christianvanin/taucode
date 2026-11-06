# Skill Templates and Archetypes for TauCode IDE

Use these production-grade templates as starting blueprints when scaffolding or optimizing skills. Each template aligns with an archetype supported by `init_skill.py`.

---

## Archetype 1: `workflow` (Procedural Runbook)
Best for multi-step operational tasks that require preflight checks, sequential commands, validation, and rollback procedures.

```markdown
---
name: db-migration-helper
folder: Development
description: >-
  Executes, coordinates, and verifies database migrations safely across development and staging environments.
  Use whenever the user asks to "run migrations", "update the database schema",
  "create a new migration", "rollback database migration", or debug migration schema mismatches.
  Do NOT use for generic SQL query authoring.
---

# Database Migration Helper

Operational runbook for running, verifying, and rolling back database migrations with zero downtime.

## Prerequisites & Preflight
- [ ] Database is reachable (`docker compose ps db` or `pg_isready -h localhost`).
- [ ] No uncommitted migrations or conflicting lock transactions.
- [ ] Environment variables (`DATABASE_URL`) are exported.

## Operational Instructions

### Step 1: Pre-Execution Snapshot
Always create a quick dump or schema snapshot before applying destructive DDL changes:
```bash
python scripts/run.py --task backup --env dev
```

### Step 2: Dry-Run Inspection
Inspect pending migrations without executing them:
```bash
npx prisma migrate status # or alembic current
```

### Step 3: Migration Execution
Apply migrations sequentially:
```bash
npx prisma migrate deploy
```

### Step 4: Post-Migration Verification
Query migration history to confirm applied state:
```bash
python scripts/run.py --task verify
```

## Rollback Procedure
If any migration fails midway:
1. Identify the failing migration ID from logs.
2. Rollback to the previous migration timestamp:
   ```bash
   npx prisma migrate resolve --rolled-back <migration_id>
   ```
3. Restore pre-execution snapshot if schema is corrupted.

## Output Format
Present migration results using this format:

```markdown
### Database Migration Summary
- **Target Database**: `db_name` (`host:port`)
- **Status**: SUCCESS / FAILED
- **Migrations Applied**: `001_initial_schema`, `002_add_users`
- **Verification**: All health checks passed.
```
```

---

## Archetype 2: `tool-wrapper` (Deterministic CLI Wrapper)
Best for tasks where determinism, regex parsing, data transformations, or API integrations are delegated to Python scripts in `scripts/`.

```markdown
---
name: api-schema-validator
folder: Tools
description: >-
  Validates, lints, and checks OpenAPI and GraphQL schema definitions against production rules.
  Use when the user asks to "validate api schema", "lint openapi spec",
  "check graphql schema", "test api contract", or verify API backward compatibility.
  Do NOT use for generating API frontend client code.
---

# API Schema Validator

Deterministic tool wrapper to validate API schemas against breaking changes and style standards.

## Operational Instructions

### Step 1: Schema Linting
Run the deterministic validator script on the target specification:
```bash
python scripts/run.py --target ./specs/openapi.yaml --strict
```

### Step 2: Breaking Change Detection
Compare against current main branch schema:
```bash
python scripts/run.py --target ./specs/openapi.yaml --diff-against origin/main
```

### Step 3: Format Output Report
Summarize detected validation warnings or breaking changes.
```

---

## Archetype 3: `reviewer` (Code & Architecture Audit)
Best for auditing code quality, architecture compliance, security vulnerabilities, and adherence to team guidelines.

```markdown
---
name: security-audit-reviewer
folder: Development
description: >-
  Audits, inspects, and reviews source code for security vulnerabilities, secret leaks, and insecure dependencies.
  Use when the user asks to "review security", "audit code for vulnerabilities",
  "check for leaked secrets", "review pull request for security", or inspect OWASP compliance.
  Do NOT use for general code formatting or style linting.
---

# Security Audit Reviewer

Structured reviewer runbook to audit codebases for security risks and common vulnerability patterns.

## Audit Checklist
- [ ] **Hardcoded Secrets**: Inspect for API keys, private keys, or passwords.
- [ ] **Injection Flaws**: Check SQL queries, shell commands, and regex parsing.
- [ ] **Authentication & Authorization**: Verify role guards and token validation.
- [ ] **Input Sanitization**: Check user-supplied input boundaries.

## Audit Workflow

### Step 1: Automated Secret Scan
Run secret detection check:
```bash
python scripts/run.py --scan-secrets --target .
```

### Step 2: Code Review & Vulnerability Triage
Inspect flagged findings and examine context.

### Step 3: Structured Report Template
Format review output:

```markdown
### Security Review Report
- **Scan Target**: `src/`
- **Severity Overview**: Critical: 0 | High: 1 | Medium: 2 | Low: 0

#### Findings
1. **[HIGH] Potential SQL Injection in `src/db/users.py:42`**
   - **Issue**: Unsanitized user string interpolated directly into SQL query.
   - **Recommendation**: Use parameterized queries (`cursor.execute(sql, (user_id,))`).
```
```

---

## Archetype 4: `minimal` (Laser-Focused Runbook)
Best for targeted, concise actions with minimal steps.

```markdown
---
name: release-tagger
folder: DevOps
description: >-
  Creates, validates, and pushes semantic version tags and release changelogs for the repository.
  Use when the user asks to "tag a release", "create release tag",
  "bump version tag", or "generate release notes".
  Do NOT use for generic git commit or branch creation.
---

# Release Tagger

Concise operational runbook to publish semantic version release tags.

## Instructions
1. Ensure working directory is clean: `git status --porcelain`.
2. Inspect latest tag: `git describe --tags --abbrev=0`.
3. Tag the release: `git tag -a v1.2.3 -m "Release v1.2.3"`.
4. Push tag to remote: `git push origin v1.2.3`.
```
