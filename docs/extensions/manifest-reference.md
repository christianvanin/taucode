# `taucode-extension.json` Manifest Reference

The `taucode-extension.json` file is the required descriptor located in the root of every TauCode extension. It declares the extension's metadata, identity, and contribution points.

---

## Schema Overview

```json
{
  "id": "publisher.extension-name",
  "name": "extension-name",
  "version": "1.0.0",
  "displayName": "Formatted Extension Name",
  "description": "Short summary of capabilities provided by the extension",
  "author": "Author or Organization Name",
  "icon": "icon.svg",
  "homepage": "https://example.com",
  "minTaucodeVersion": "1.0.0",
  "contributes": {
    "tabs": [ /* ... */ ],
    "commands": [ /* ... */ ],
    "settings": [ /* ... */ ],
    "skills": [ /* ... */ ],
    "mcpServers": { /* ... */ }
  }
}
```

---

## 1. Top-Level Properties

| Property | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | **Yes** | Globally unique identifier (recommended convention: `publisher.extension-name`). |
| `name` | `string` | **Yes** | System name (used internally for file directories and process tagging). |
| `version` | `string` | **Yes** | Semantic versioning format (`MAJOR.MINOR.PATCH`, e.g., `1.0.0`). |
| `displayName` | `string` | No | User-friendly title displayed in Settings and UI headers. |
| `description` | `string` | No | Clear summary of extension features. |
| `author` | `string` | No | Publisher or organization name. |
| `icon` | `string` | No | Relative path to SVG or PNG icon (e.g., `icon.svg`). |
| `homepage` | `string` | No | URL to documentation or repository. |
| `minTaucodeVersion` | `string` | No | Minimum compatible TauCode version (e.g., `1.0.0`). |
| `contributes` | `object` | No | Container object defining all contribution points. |

---

## 2. Tabs Contribution: `contributes.tabs`

Registers custom tabs, dashboards, or dedicated file visualizers:

```json
{
  "id": "model-viewer",
  "title": "3D Model Viewer",
  "icon": "cube",
  "renderType": "webview",
  "entry": "dist/index.html",
  "fileExtensions": [".gltf", ".glb", ".obj"],
  "singleton": false
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique contribution ID within this extension. |
| `title` | `string` | Label displayed on the tab header. |
| `icon` | `string` | Hugeicons icon identifier or custom name. |
| `renderType` | `string` | Render engine: `"webview"` (sandboxed iframe), `"esm"`, or `"custom-editor"`. |
| `entry` | `string` | Entry HTML file relative to extension root (defaults to `index.html`). Can also be a `http://localhost:...` URL during development. |
| `fileExtensions` | `string[]` | Associated file extensions (e.g., `[".csv", ".tsv"]`). Opening these files from the explorer automatically routes to this tab. |
| `singleton` | `boolean` | If `true`, only one instance of this tab can be opened simultaneously. |

---

## 3. Commands Contribution: `contributes.commands`

Registers global actions executable via the Command Palette (`Ctrl+P` or `Cmd+P`):

```json
{
  "id": "generate-docs",
  "title": "Docs: Generate API Documentation",
  "action": "trigger-docgen",
  "icon": "book-open"
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique command identifier. |
| `title` | `string` | Display label in Command Palette. |
| `action` | `string` | Action name dispatched via the `taucode:extension-command` custom event. |
| `icon` | `string` | Icon displayed beside the command title. |

---

## 4. Settings Contribution: `contributes.settings`

Exposes configurable user settings rendered inside the IDE Preferences panel:

```json
{
  "id": "linter-prefs",
  "title": "Linter Rules",
  "renderType": "declarative",
  "schema": {
    "fields": [
      {
        "key": "strictMode",
        "label": "Enable Strict Checking",
        "type": "boolean",
        "default": true,
        "description": "Report warnings for implicit any types."
      },
      {
        "key": "maxWarnings",
        "label": "Maximum Warning Threshold",
        "type": "number",
        "default": 50
      },
      {
        "key": "reportFormat",
        "label": "Report Format",
        "type": "select",
        "options": ["json", "stylish", "compact"],
        "default": "stylish"
      }
    ]
  }
}
```

| Schema Field | Allowed Values | Description |
| :--- | :--- | :--- |
| `key` | `string` | Key saved into user preferences database. |
| `label` | `string` | Human-readable setting label. |
| `type` | `"string" \| "boolean" \| "number" \| "select"` | UI control generated automatically. |
| `options` | `string[]` | Required for `type: "select"`. List of selectable strings. |
| `default` | Any | Default initial value. |
| `description` | `string` | Explanatory helper text displayed below the field. |

---

## 5. Skills Contribution: `contributes.skills`

Bundles Antigravity AI skill playbooks with the extension:

```json
[
  {
    "name": "docker-builder",
    "path": "skills/docker-builder"
  }
]
```

The directory specified in `path` must contain a valid `SKILL.md`. TauCode automatically synchronizes these skills into `~/.gemini/config/skills/` on extension activation.

---

## 6. MCP Servers Contribution: `contributes.mcpServers`

Registers Model Context Protocol servers automatically merged into `~/.gemini/config/mcp_config.json`:

```json
{
  "postgres-mcp": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": {
      "POSTGRES_URL": "postgresql://localhost:5432/mydb"
    }
  }
}
```
