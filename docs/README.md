# TauCode Official Documentation Hub

Welcome to the technical and architectural documentation hub for **TauCode**, the high-performance, AI-native development environment built on Tauri 2, Rust, and Monaco Editor.

---

## Documentation Index

| Section | Document | Description |
| :--- | :--- | :--- |
| **Extensions Overview** | [`extensions/README.md`](extensions/README.md) | Comprehensive architecture of the TauCode extension ecosystem, lifecycle, sandboxed iframes, and capabilities. |
| **Editor Integration** | [`extensions/editor-integration.md`](extensions/editor-integration.md) | Step-by-step practical guide: how extensions communicate with Monaco Editor, open files, run commands, and register custom editors. |
| **Manifest Reference** | [`extensions/manifest-reference.md`](extensions/manifest-reference.md) | Full specification of fields, types, and schemas supported in `taucode-extension.json`. |
| **Local API Bridge** | [`architecture/api-proxy.md`](architecture/api-proxy.md) | The built-in Rust HTTP bridge (`127.0.0.1:8085`) enabling programmatic control of tabs, terminals, and screenshots for AI agents. |
| **LSP & Editor System** | [`architecture/lsp-and-editor.md`](architecture/lsp-and-editor.md) | Monaco Editor configuration, Language Server Protocol (LSP) discovery, formatters, and diagnostics. |
| **Spaces & Terminal Engine** | [`architecture/spaces-and-terminal.md`](architecture/spaces-and-terminal.md) | Multi-workspace ("Spaces") management, flexible layout panels, and high-performance `portable-pty` terminals. |

---

## Architectural Principles

TauCode is designed around a modular, secure two-tier architecture:

### 1. Core Backend (Rust / Tauri 2)
- **Window Management & Native Controls**: Frameless custom chrome on Windows (Win32), macOS (WebKit), and Linux (GTK).
- **PTY Engine**: High-performance terminal multiplexing powered by `portable-pty` and non-blocking I/O.
- **Filesystem & Search Engine**: Fast vector search with `grep-regex` and `grep-searcher`, file watching, and native drag-and-drop (`CF_HDROP`).
- **Extension Manager**: Automated scanning, ZIP extraction, and Git cloning for extensions in `~/.taucode/extensions/`.
- **Integrated AI Isolation**: Local orchestration of the Antigravity AI runtime (`taucode-antigravity.exe` or `agy`), isolated in application data without modifying system paths.
- **Local HTTP Bridge**: Built-in localhost proxy on port `8085` allowing AI agents and external scripts to query and manipulate editor state safely.

### 2. Frontend Application (React 19 + TypeScript + Tailwind CSS v4 + Monaco Editor)
- **Spaces (Independent Workspaces)**: Instant workspace switching where each space retains its own tab stack and layout.
- **Flexible Panel System**: Infinite horizontal/vertical splitting, sidebar docking, and draggable tabs.
- **Advanced Code Editor**: Monaco Editor (v0.56+) with Language Server Protocol client, syntax highlighting, and external formatters (Prettier, Biome, rustfmt).
- **Extension Host (`ExtensionTabHost`)**: Sandboxed iframe execution environment communicating through a strictly typed `postMessage` protocol.
