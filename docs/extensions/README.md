# TauCode Extension System

TauCode includes a powerful, modular extension architecture designed to enable developers to extend the IDE with:

1. **Custom Tabs and Panels**: Interactive views, dashboards, or specialized tools (e.g., 3D model viewers, data grids, visual UI designers, network inspectors).
2. **Custom File Editors**: Automatic file extension interception (e.g., `.bbmodel`, `.csv`, `.drawio`, `.hex`) so opening these files automatically opens the extension tab instead of the default text editor.
3. **Global Commands in the Command Palette (`Ctrl+P`)**: Actions registered and searchable via fuzzy matching or keyboard shortcuts.
4. **Integrated Settings Sections**: Declarative schemas or custom HTML pages rendered inside the IDE's *Settings* window.
5. **Bundled AI Skills**: Antigravity procedural runbooks bundled with the extension, automatically synchronized to `~/.gemini/config/skills/`.
6. **Bundled MCP Servers**: Local or remote Model Context Protocol servers automatically configured and exposed to the IDE's AI agents.

---

## Directory Layout & File System Location

Every extension lives in its own directory inside the user's global TauCode extensions folder:

```text
~/.taucode/extensions/
├── extensions.state.json           # Extension state database (active/disabled)
├── publisher.sample-extension/
│   ├── taucode-extension.json     # REQUIRED MANIFEST
│   ├── icon.svg                   # Extension icon
│   ├── index.html                 # Extension UI entrypoint
│   ├── app.js
│   └── styles.css
└── publisher.data-visualizer/
    ├── taucode-extension.json
    └── dist/
        └── index.html
```

> [!NOTE]
> On Windows, the default path is:  
> `C:\Users\<Username>\.taucode\extensions\`  
> On Linux and macOS:  
> `~/.taucode/extensions/`

---

## The Manifest File: `taucode-extension.json`

Every extension must include a `taucode-extension.json` file in its root directory. Here is an example manifest:

```json
{
  "id": "taucode.csv-visualizer",
  "name": "csv-visualizer",
  "displayName": "CSV Data Visualizer & Editor",
  "version": "1.0.0",
  "description": "Interactive data grid and chart visualizer for CSV and TSV files",
  "author": "Crynta",
  "icon": "icon.svg",
  "homepage": "https://taucode.dev",
  "minTaucodeVersion": "1.0.0",
  "contributes": {
    "tabs": [
      {
        "id": "csv-grid-view",
        "title": "CSV Grid",
        "icon": "table",
        "renderType": "webview",
        "entry": "dist/index.html",
        "fileExtensions": [".csv", ".tsv"],
        "singleton": false
      }
    ],
    "commands": [
      {
        "id": "export-csv-json",
        "title": "CSV: Export to JSON",
        "action": "export-json",
        "icon": "file-export"
      }
    ],
    "settings": [
      {
        "id": "csv-settings",
        "title": "CSV Visualizer Settings",
        "renderType": "declarative",
        "schema": {
          "fields": [
            {
              "key": "delimiter",
              "label": "Default Delimiter",
              "type": "select",
              "options": [",", ";", "\\t"],
              "default": ",",
              "description": "Character used to delimit fields in CSV files."
            },
            {
              "key": "showLineNumbers",
              "label": "Show Line Numbers",
              "type": "boolean",
              "default": true
            }
          ]
        }
      }
    ],
    "skills": [
      {
        "name": "csv-data-analyst",
        "path": "skills/csv-data-analyst"
      }
    ],
    "mcpServers": {
      "sqlite-mcp": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-sqlite"],
        "env": {
          "DATABASE_PATH": "workspace.db"
        }
      }
    }
  }
}
```

---

## Lifecycle and Runtime

1. **Startup Discovery**:  
   When TauCode starts, the Rust backend invokes `list_extensions`, scanning `~/.taucode/extensions/`, validating all `taucode-extension.json` manifests, and populating the runtime registry.
2. **Enabling & Disabling**:  
   Users can toggle extensions on and off in *Settings -> Extensions*. State is persisted in `extensions.state.json`. When an extension is disabled:
   - Its tabs cannot be opened.
   - Its file extension associations are unhooked.
   - Its commands are hidden from the Command Palette (`Ctrl+P`).
   - Its bundled skills and MCP servers are removed from the active AI agent environment.
3. **Sandbox Isolation & Security**:  
   Extension tabs run inside a hardened `<iframe>` using the host component `ExtensionTabHost`:  
   `sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"`.  
   Local assets are served safely via Tauri's asset protocol (`asset://` / `convertFileSrc`), preventing direct unmediated access to arbitrary local files.

---

## Installation Methods

TauCode provides three installation channels:

1. **ZIP Archive (`install_extension_zip`)**:  
   In *Settings -> Extensions*, drag-and-drop or click *Install from ZIP* to install an extension packaged as a `.zip` file containing `taucode-extension.json` in its root.
2. **Git Repository (`install_extension_git`)**:  
   Provide a public Git repository URL (e.g., `https://github.com/user/taucode-extension.git`). TauCode clones and unpacks it into `~/.taucode/extensions/<id>`.
3. **Local Development (Directory Drop)**:  
   During development, simply create or symlink a directory inside `~/.taucode/extensions/<id>` containing your manifest and source/build files. TauCode will detect it immediately.

---

## Further Reading

- [Editor Integration Guide](editor-integration.md) — How extensions communicate with Monaco, open files, run terminal commands, and handle theme changes.
- [Manifest Reference](manifest-reference.md) — Comprehensive schema definition for `taucode-extension.json`.
