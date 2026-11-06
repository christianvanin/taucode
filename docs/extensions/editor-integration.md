# TauCode Editor Integration Guide

This guide explains how to build a TauCode extension that **interacts directly with the Monaco Code Editor**, opens files at specific line numbers, executes commands inside the integrated terminal, and handles custom file extensions.

---

## 1. Editor Interaction Models

Extensions can interact with the editor environment through two primary patterns:

```
┌─────────────────────────────────────────────────────────────┐
│                          TAUCODE                            │
│                                                             │
│   ┌──────────────────────────┐   ┌───────────────────────┐  │
│   │    Monaco Code Editor    │   │     Extension Tab     │  │
│   │    (Standard editor)     │◄──┤   (Sandboxed Iframe)  │  │
│   │                          │   │                       │  │
│   │  Line 42: function() {}  │   │  [ Open at Line 42 ]  │  │
│   └──────────────────────────┘   └───────────────────────┘  │
│                 ▲                            │              │
│                 └─────── postMessage ────────┘              │
└─────────────────────────────────────────────────────────────┘
```

1. **Companion Extension (Auxiliary Panel / Tool)**:  
   The extension runs in a standalone tab or panel and commands the primary Monaco editor: for example, an AST visualizer, code generator, TODO navigator, or interactive documentation browser that **opens files and positions the cursor at designated line numbers** upon user interaction.
2. **Custom File Editor (File Type Replacement)**:  
   The extension registers specific file extensions (`fileExtensions: [".bbmodel", ".csv", ".hex", ...]`). When the user clicks a matching file in the File Explorer or fuzzy finder, TauCode opens the extension's tab directly, passing the file path.

---

## 2. Communication Channel: `postMessage` Protocol

The host component (`ExtensionTabHost`) and the extension's web application communicate via a typed, asynchronous `window.postMessage` protocol.

### 2.1 Initialization (`taucode:ready` and `taucode:init`)

When your extension web page finishes loading its DOM, send `taucode:ready` to the parent window (`window.parent`):

```javascript
window.parent.postMessage({ type: "taucode:ready" }, "*");
```

TauCode will reply with `taucode:init` containing the runtime environment context:

```javascript
window.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") return;
  const { type, payload } = event.data;

  if (type === "taucode:init") {
    console.log("Extension ID:", payload.extensionId);
    console.log("Tab ID:", payload.tabId);
    console.log("Target File Path:", payload.filePath); // Defined if opened for a specific file
    console.log("Workspace Root:", payload.workspaceRoot); // Current workspace directory
    console.log("Current Theme:", payload.theme); // "dark" | "light"
  }
});
```

Key environment properties are also passed as **URL query parameters** in the iframe's `src`:
- `?file=/path/to/target/file`
- `?theme=dark`
- `?workspaceRoot=/path/to/workspace`
- `?tabId=123`

---

### 2.2 Opening a File in Monaco Editor (`taucode:openFile`)

To instruct TauCode to open any project file in the Monaco Editor:

```javascript
window.parent.postMessage({
  type: "taucode:openFile",
  payload: {
    path: "src/main.rs",              // Absolute path or relative to workspace
    line: 42,                         // Optional: jump to line and highlight
    pin: true,                        // Optional: pin the tab to prevent preview replacement
    customTitle: "main.rs (Focus)"    // Optional: override tab title
  }
}, "*");
```

> [!TIP]
> Specifying `line: 42` automatically scrolls the Monaco view to line 42, centers it in the viewport, and places the cursor and focus directly on that line.

---

### 2.3 Running Commands in the Integrated Terminal (`taucode:runTerminal`)

Extensions can trigger build tasks, test runners, linters, or CLI tools inside the integrated PTY terminal:

```javascript
window.parent.postMessage({
  type: "taucode:runTerminal",
  payload: {
    command: "pnpm test -- --run",     // Shell command to execute
    cwd: "/path/to/workspace",         // Optional: working directory
    title: "Test Runner"              // Optional: terminal tab title
  }
}, "*");
```

---

### 2.4 Closing the Current Tab (`taucode:closeCurrentTab`)

When the user finishes a task or clicks a "Close" button inside the extension:

```javascript
window.parent.postMessage({
  type: "taucode:closeCurrentTab"
}, "*");
```

---

## 3. Step-by-Step Tutorial: Building "Code Compass"

We will build a complete extension called **"Code Compass"** (`taucode.code-compass`) that:
- Catalogs key checkpoints in the project codebase.
- Displays an interactive list of files and line markers.
- Opens files in Monaco Editor at specific lines with a single click.
- Runs a build command in the integrated terminal.

### Step 1: Create the Extension Directory

Create a directory inside your TauCode extensions folder:
- Windows: `%USERPROFILE%\.taucode\extensions\taucode.code-compass\`
- Linux/macOS: `~/.taucode/extensions/taucode.code-compass/`

---

### Step 2: Define `taucode-extension.json`

Create `taucode-extension.json` in the extension root:

```json
{
  "id": "taucode.code-compass",
  "name": "code-compass",
  "displayName": "Code Compass & Navigator",
  "version": "1.0.0",
  "description": "Quick code navigation and checkpoints with bidirectional Monaco Editor integration",
  "author": "TauCode Community",
  "icon": "icon.svg",
  "minTaucodeVersion": "1.0.0",
  "contributes": {
    "tabs": [
      {
        "id": "compass-view",
        "title": "Code Compass",
        "icon": "compass",
        "renderType": "webview",
        "entry": "index.html",
        "singleton": true
      }
    ],
    "commands": [
      {
        "id": "open-compass",
        "title": "Code Compass: Open Navigator",
        "action": "open-compass-view",
        "icon": "compass"
      }
    ]
  }
}
```

---

### Step 3: Author the User Interface (`index.html`)

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Code Compass</title>
  <style>
    :root {
      --bg: #1e1e2e;
      --card-bg: #252538;
      --text: #cdd6f4;
      --accent: #89b4fa;
      --border: rgba(255, 255, 255, 0.1);
    }
    body.light {
      --bg: #eff1f5;
      --card-bg: #e6e9ef;
      --text: #4c4f69;
      --accent: #1e66f5;
      --border: rgba(0, 0, 0, 0.1);
    }
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      user-select: none;
    }
    h2 {
      font-size: 16px;
      margin-top: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge {
      font-size: 11px;
      background: var(--accent);
      color: #000;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: bold;
    }
    .item-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 14px;
    }
    .nav-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.15s ease;
    }
    .nav-card:hover {
      border-color: var(--accent);
      transform: translateY(-1px);
    }
    .file-path {
      font-size: 12px;
      font-weight: 500;
    }
    .line-tag {
      font-size: 11px;
      color: var(--accent);
      font-family: monospace;
    }
    .btn-action {
      margin-top: 16px;
      padding: 8px 14px;
      background: var(--accent);
      color: #111;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      display: inline-block;
    }
    .btn-action:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <h2>
    <span>🧭 Code Compass</span>
    <span class="badge" id="workspaceBadge">Workspace</span>
  </h2>
  <p style="font-size: 12px; opacity: 0.75;">
    Click an item to open it directly in Monaco Editor at the target line:
  </p>

  <div class="item-list" id="itemsContainer"></div>

  <button class="btn-action" id="btnRunBuild">⚡ Run Build in Terminal</button>

  <script src="app.js"></script>
</body>
</html>
```

---

### Step 4: Implement Communication Logic (`app.js`)

Create `app.js`:

```javascript
let currentWorkspace = null;

const bookmarkedLocations = [
  { file: "src/app/App.tsx", line: 1, label: "Main UI Entry Point" },
  { file: "src/modules/editor/EditorPane.tsx", line: 54, label: "Monaco Editor Setup" },
  { file: "src-tauri/src/modules/extensions.rs", line: 84, label: "Extension Host Backend" }
];

// 1. Notify TauCode host that the extension is ready
window.parent.postMessage({ type: "taucode:ready" }, "*");

// 2. Handle environment initialization and theme updates
window.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") return;
  const { type, payload } = event.data;

  if (type === "taucode:init") {
    currentWorkspace = payload.workspaceRoot;
    
    // Theme sync
    if (payload.theme === "light") {
      document.body.classList.add("light");
    } else {
      document.body.classList.remove("light");
    }

    if (currentWorkspace) {
      document.getElementById("workspaceBadge").textContent = 
        currentWorkspace.split(/[\\/]/).pop() || "Active";
    }

    renderItems();
  }
});

// 3. Render items and handle click navigation
function renderItems() {
  const container = document.getElementById("itemsContainer");
  container.innerHTML = "";

  bookmarkedLocations.forEach((loc) => {
    const card = document.createElement("div");
    card.className = "nav-card";
    card.innerHTML = `
      <div>
        <div class="file-path">${loc.file}</div>
        <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">${loc.label}</div>
      </div>
      <div class="line-tag">Line :${loc.line}</div>
    `;

    card.addEventListener("click", () => {
      const fullPath = currentWorkspace 
        ? `${currentWorkspace.replace(/\\/g, "/")}/${loc.file}`
        : loc.file;

      // DISPATCH OPEN FILE COMMAND TO MONACO
      window.parent.postMessage({
        type: "taucode:openFile",
        payload: {
          path: fullPath,
          line: loc.line,
          pin: true,
          customTitle: loc.file.split("/").pop()
        }
      }, "*");
    });

    container.appendChild(card);
  });
}

// 4. Trigger terminal commands
document.getElementById("btnRunBuild").addEventListener("click", () => {
  window.parent.postMessage({
    type: "taucode:runTerminal",
    payload: {
      command: "cargo check",
      cwd: currentWorkspace || undefined,
      title: "Cargo Check Compass"
    }
  }, "*");
});
```

---

## 4. Testing and Verification

1. Place the files above into `~/.taucode/extensions/taucode.code-compass/`.
2. Open **TauCode** and go to *Settings -> Extensions*. You should see **"Code Compass & Navigator"** listed as active.
3. Open the Command Palette (`Ctrl+P`) and type *"Code Compass"*: execute *"Code Compass: Open Navigator"*.
4. The custom tab opens: clicking any item opens the target file in Monaco Editor focused at that exact line number.
