# Spaces, Layouts & Terminal Architecture

TauCode provides advanced workspace orchestration designed for complex, multi-repository, and parallel development workflows.

---

## 1. Spaces (Independent Workspaces)

Unlike traditional editors where opening multiple projects requires multiple heavy OS windows, TauCode introduces **Spaces**:
- **Isolated Contexts**: Each Space represents an independent project directory or workflow with its own set of open tabs, split layouts, and terminal sessions.
- **Instant Switching**: Switching between Spaces is instantaneous, without reloading the WebView or re-initializing Monaco Editor models.
- **Persistence**: Tab states, active files, and layouts per Space are persisted across restarts via `tauri-plugin-store`.

---

## 2. Terminal Multiplexing with `portable-pty`

TauCode avoids the overhead of node-pty by running native Rust PTY sessions powered by `portable-pty`:
- **OS Native**: Uses ConPTY on Windows, POSIX PTY on Linux and macOS.
- **Frontend Emulation**: Rendered via `xterm.js` with WebGL acceleration (`@xterm/addon-webgl`).
- **Concurrent & Isolated**: Supports unlimited parallel terminal tabs, persistent shell sessions, and background build tasks.
- **Shell Support**: Automatically detects and launches PowerShell, bash, zsh, fish, cmd.exe, and WSL.

---

## 3. Essential Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+P` (or `Cmd+P`) | Open Command Palette (fuzzy file & command finder) |
| `Ctrl+\`` (or `Cmd+\``) | Toggle Terminal panel |
| `Ctrl+B` (or `Cmd+B`) | Toggle Sidebar (Explorer / Git / Extensions) |
| `Ctrl+S` (or `Cmd+S`) | Save active file |
| `Ctrl+Shift+F` | Global Search & Grep across workspace |
| `Ctrl+=` / `Ctrl+-` | Zoom in / Zoom out UI |

