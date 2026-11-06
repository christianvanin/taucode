---
version: 1.2.0
name: taucode-tabs
folder: Built-in
description: >-
  Dynamically manages, lists, opens, closes, focuses, and visually inspects tabs in TauCode IDE.
  Captures PNG screenshots of active tabs to examine UI layouts, 3D models, or SVGs, inspects
  terminal buffers, and monitors long-running commands and downloads.
  Use when the user asks to "open tab", "open preview", "open terminal", "close tab",
  "take a screenshot of the tab", "read terminal output", or asks to monitor builds,
  downloads, or inspect open workspace tabs in TauCode. Also triggers for Italian requests
  like "apri tab", "apri preview", "chiudi tab", "fai uno screenshot".
  Do NOT use for skill scaffolding (use skill-builder instead).
---

# TauCode Tabs & Terminal Management

Operational runbook for AI agents to **catalog, open, close, focus, visually capture, and inspect tabs** in TauCode IDE, as well as **read integrated terminal output** and monitor asynchronous commands and downloads to completion.

---

## 1. Single-Tab Architecture in TauCode

TauCode operates with a focused single-active-surface layout:
- The active tab occupies 100% of the central workspace surface (`WorkspaceSurface`).
- The upper `TabBar` displays all open tabs and highlights the currently focused tab.
- Opening or focusing a tab immediately brings it to the active viewport.

---

## 2. Supported Tab Kinds in TauCode

The available tab types can be listed by running `node scripts/tabs.cjs types` or referencing the following table:

| Kind (`kind`) | Description & Purpose | Supported Parameters | Usage Example |
|---|---|---|---|
| `preview` | Embedded Web View for local dev servers (Vite/Next/React) or HTML files | `url` (default: `http://localhost:5173`), `title` | `open preview "http://localhost:5173" --title "App Preview"` |
| `editor` | Monaco Code Editor with syntax highlighting and LSP | `path` (required), `line` (optional) | `open editor "src/app/App.tsx" --line 42` |
| `terminal` | Interactive system shell (PowerShell/Bash/WSL) | `command` / `cmd`, `cwd`, `title`, `interactive` | `open terminal --cmd "pnpm dev" --title "Dev Server"` |
| `markdown` | Live GitHub Flavored Markdown viewer with KaTeX support | `path` (required), `title` | `open markdown "README.md" --title "Docs"` |
| `svg` | Vector graphics inspector with zoom, pan, and real bounding boxes | `path` (required) | `open svg "public/logo.svg"` |
| `blockbench` | 3D model viewer for `.bbmodel`, `.gltf`, `.glb`, `.obj` with 3D orbit | `path` (required), `title` | `open blockbench "models/windmill.bbmodel"` |
| `settings` | TauCode Preferences panel | `section` (`general`, `ai`, `editor`, `lsp`, `extensions`) | `open settings general` |
| `extension` | Custom extension or plugin tab | `extensionId`, `tabContributionId`, `params` | `open extension --id "custom-tool"` |

---

## 3. Tab CLI Quick Commands (`scripts/tabs.cjs`)

The deterministic helper script `scripts/tabs.cjs` runs directly under Node.js with zero external dependencies:

### A. List Open Tabs (`list`)
```bash
node scripts/tabs.cjs list
```
*Sample output*:
```
Open tabs (3) [Active: ID 2]:
ID      KIND            ACTIVE  TITLE / DETAILS
------------------------------------------------------------
1       terminal          no    Build Server (c:\project)
2       preview         ★ YES   Web Preview (http://localhost:5173)
3       editor            no    App.tsx (src/app/App.tsx)
```

### B. Open a Tab (`open`)
```bash
# Open web preview
node scripts/tabs.cjs open preview "http://localhost:5173" --title "Dashboard"

# Open 3D model viewer
node scripts/tabs.cjs open blockbench "models/model.glb" --title "3D Model"

# Open file in Monaco Editor at specific line
node scripts/tabs.cjs open editor "src/main.tsx" --line 15

# Open terminal and execute command
node scripts/tabs.cjs open terminal --cmd "cargo check" --cwd "src-tauri" --title "Cargo Check"

# Open settings
node scripts/tabs.cjs open settings general
```

### C. Focus a Tab (`focus`)
```bash
# Bring tab to the foreground by ID
node scripts/tabs.cjs focus 2
```

### D. Close Tabs (`close`)
```bash
# Close specific tab by ID
node scripts/tabs.cjs close 3

# Close the most recently opened tab
node scripts/tabs.cjs close --last

# Close all tabs of a given kind
node scripts/tabs.cjs close --kind preview
node scripts/tabs.cjs close --kind terminal

# Close all tabs
node scripts/tabs.cjs close --all
```

---

## 4. Visual Inspection via Tab Screenshot

When the user asks to verify visual appearance, examine layout rendering, inspect 3D models, or check vector dimensions:

### Mandatory Visual Inspection Procedure:
1. **Ensure target tab is active**:
   - Focus it if necessary using `node scripts/tabs.cjs focus <tabId>`.
2. **Capture screenshot to workspace brain directory**:
   ```bash
   node scripts/tabs.cjs screenshot --out "<appDataDir>/tab_preview.png"
   ```
3. **INSPECT IMAGE IMMEDIATELY WITH `read_file`**:
   - **Crucial Rule**: Never stop at capturing the image! Immediately call the `read_file` tool on the resulting `.png` file path.
   - Visually inspect colors, alignment, fonts, bounding boxes, or rendering artifacts before replying to the user.

---

## 5. Terminal Output Reading & Long-Running Command Protocol

### A. Reading Terminal Output (`terminal-output`)
```bash
# Read the last 200 lines of the active terminal
node scripts/tabs.cjs terminal-output

# Read the last N lines of a specific terminal by ID
node scripts/tabs.cjs terminal-output 1 --lines 500
```
Returns the actual Xterm scrollback buffer with line count and text content.

---

### ⚠️ MANDATORY RULE: Handling Dynamic Commands and Long Downloads

When executing dynamic tasks that take time (e.g., `npm install`, `pnpm add`, `cargo build`, AI model downloads, large `git clone` operations, packaging):

> [!CAUTION]
> **NEVER INTERRUPT THE AGENT TURN OR DECLARE THE TASK COMPLETE WITHOUT VERIFYING FULL TERMINATION.**
> Declaring a task complete while the process is still running gives the user false information while the IDE is still working in the background.

#### Waiting Protocol:
1. **Adequate Wait Timeout**:
   - For shell commands, do not use small timeouts. Use `WaitMsBeforeAsync: 10000` (10 seconds).
2. **Active Buffer Monitoring**:
   - Query the terminal buffer using:
     ```bash
     node scripts/tabs.cjs terminal-output <tabId> --lines 50
     ```
3. **Check Termination Signals**:
   - ❌ **Still Running**: Progress bars (`[==>   ]`), incrementing percentages (`45%`), keywords like `Downloading...`, `Fetching...`, `Compiling...`, or missing shell prompt. **CONTINUE WAITING**.
   - ✅ **Finished**: Presence of shell prompt (`PS C:\...>` or `$`), explicit completion message (`Done in 8.2s`, `Finished dev profile`), or final exit code.
4. **Final Response**:
   - Only formulate your answer after reading the finished buffer and confirming the real outcome (success or error).

---

## 6. Direct REST API Reference (`http://127.0.0.1:8085`)

| Method | Endpoint | JSON Payload | Response |
|:---:|---|---|---|
| `GET` | `/api/tabs` | `-` | `{ ok: true, activeId: N, tabs: [...] }` |
| `POST` | `/api/tabs/open` | `{ "kind": "preview", "url": "..." }` | `{ ok: true, tabId: N, kind: "..." }` |
| `POST` | `/api/tabs/close` | `{ "tabId": N }` or `{ "kind": "..." }` | `{ ok: true, closedCount: N }` |
| `POST` | `/api/tabs/focus` | `{ "tabId": N }` | `{ ok: true, activeId: N }` |
| `POST` | `/api/tabs/screenshot`| `{ "tabId": N, "savePath": "..." }` | `{ ok: true, imagePath: "..." }` |
| `POST` | `/api/terminal/output`| `{ "tabId": N, "lines": 200 }` | `{ ok: true, buffer: "...", linesCount: N }` |
| `POST` | `/api/terminal/input` | `{ "tabId": N, "text": "...", "key": "enter" }` | `{ ok: true, bytesWritten: N }` |
