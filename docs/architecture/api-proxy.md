# TauCode Local Automation & Proxy Bridge

TauCode embeds a high-performance, non-blocking HTTP proxy and API server written in Rust within the `antigravity` module (`src-tauri/src/modules/antigravity.rs`).

Running locally on `http://127.0.0.1:8085`, this bridge allows AI agents (such as Antigravity pair programmers), CLI utilities, and test scripts to inspect and programmatically manipulate the IDE in real time.

---

## Security Model

- **Localhost Only**: The proxy binds strictly to `127.0.0.1:8085`. It rejects or fails to bind to public or LAN interfaces.
- **CORS Handling**: Automatically answers `OPTIONS` preflight requests for `/api/tabs`, `/api/terminal`, `/api/git`, and `/api/screenshot`.
- **Port Conflict Safeguards**: If port 8085 is in use by another application, TauCode logs an error and avoids corrupting foreign traffic.

---

## REST Endpoints Reference

### 1. Tab Management

#### `GET /api/tabs` (or `POST /api/tabs/list`)
Returns all currently open tabs and the focused tab ID.

**Response**:
```json
{
  "ok": true,
  "activeId": 2,
  "tabs": [
    {
      "id": 1,
      "kind": "terminal",
      "active": false,
      "title": "Build Server",
      "cwd": "C:/projects/myapp"
    },
    {
      "id": 2,
      "kind": "editor",
      "active": true,
      "title": "App.tsx",
      "path": "src/app/App.tsx"
    }
  ]
}
```

---

#### `POST /api/tabs/open`
Opens a new tab of the specified kind.

**Request Payload**:
```json
{
  "kind": "preview",
  "url": "http://localhost:5173",
  "title": "Local Preview"
}
```
Supported `kind` values:
- `preview`: Embedded browser view (`url`, `title`).
- `editor`: Monaco Code Editor (`path`, `line`).
- `terminal`: Integrated PTY terminal (`command`, `cwd`, `title`).
- `markdown`: Rendered GitHub Flavored Markdown viewer (`path`, `title`).
- `svg`: Vector graphics inspector with zoom and pan (`path`).
- `blockbench`: 3D model viewer for `.bbmodel`, `.gltf`, `.glb`, `.obj` (`path`, `title`).
- `settings`: IDE Preferences panel (`section`).

---

#### `POST /api/tabs/focus`
Brings a specific tab to the foreground.

**Request Payload**:
```json
{
  "tabId": 2
}
```

---

#### `POST /api/tabs/close`
Closes a tab by ID, closes the last active tab, or closes all tabs of a given kind.

**Request Payload**:
```json
{ "tabId": 3 }
```
Or to close by kind:
```json
{ "kind": "preview" }
```

---

### 2. Tab Visual Inspection & Screenshots

#### `POST /api/tabs/screenshot`
Captures an image of the active tab's canvas or viewport, rendering it to a high-resolution PNG on disk. This enables AI agents to visually inspect UI layouts, SVG bounding boxes, and 3D models.

**Request Payload**:
```json
{
  "tabId": 2,
  "savePath": "C:/Users/<User>/.taucode/cache/screenshot.png"
}
```

---

### 3. Integrated Terminal Control & Buffer Inspection

#### `POST /api/terminal/output`
Reads the real scrollback buffer of an active or designated terminal tab.

**Request Payload**:
```json
{
  "tabId": 1,
  "lines": 200
}
```

**Response**:
```json
{
  "ok": true,
  "linesCount": 45,
  "buffer": "yarn run v1.22.19\n$ vite\n  VITE v5.4.2  ready in 240 ms\n  ➜  Local:   http://localhost:5173/"
}
```

---

#### `POST /api/terminal/input`
Sends raw keystrokes or string commands to a running PTY terminal session.

**Request Payload**:
```json
{
  "tabId": 1,
  "text": "cargo check\n"
}
```

