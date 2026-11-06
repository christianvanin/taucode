# TauCode LSP & Code Editor Architecture

TauCode provides a desktop-grade code editing experience powered by **Monaco Editor 0.56+** with native **Language Server Protocol (LSP)** support.

---

## Editor Engine Overview

- **Core Engine**: Monaco Editor (the engine powering Visual Studio Code).
- **Theme Engine**: Synchronized with TauCode's dark/light design system with support for custom syntax themes.
- **Performance Optimizations**: Monaco workers and text models are initialized lazily, keeping memory consumption low.
- **External Formatters**: Auto-detected from PATH or workspace binaries:
  - `Prettier` (JavaScript, TypeScript, CSS, HTML, Markdown, JSON)
  - `Biome` (Fast Rust-based formatting for JS/TS)
  - `rustfmt` (Rust)
  - Built-in deterministic formatters for JSON and XML

---

## Language Server Protocol (LSP) Bridge

TauCode connects Monaco Editor to backend Language Servers using an asynchronous JSON-RPC bridge (`monacoLspAdapter.ts`):

```
┌─────────────────────────────────┐
│       Monaco Code Editor        │
│  (Diagnostics, Autocomplete)    │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│      monacoLspAdapter.ts        │
│  (Converts LSP types to Monaco) │
└────────────────┬────────────────┘
                 │ Tauri IPC
                 ▼
┌─────────────────────────────────┐
│     Rust LSP Bridge Process     │
│  (Spawns and manages binaries)  │
└────────────────┬────────────────┘
                 │ Stdio pipes
                 ▼
┌─────────────────────────────────┐
│  Target Language Server (STDIO) │
│  (rust-analyzer, tsserver, ...) │
└─────────────────────────────────┘
```

### Supported Language Servers Out of the Box

TauCode detects installed language servers available on your system `PATH`:
- **Rust**: `rust-analyzer`
- **TypeScript / JavaScript**: `typescript-language-server` or `vtsls`
- **Python**: `pyright` or `pylsp`
- **Go**: `gopls`
- **HTML / CSS / JSON**: Built-in Monaco language services

