/**
 * Monaco Editor setup — must be executed (imported) before any
 * <Editor> component from @monaco-editor/react is rendered.
 *
 * Responsibilities:
 *  1. Tell @monaco-editor/react to use the locally-bundled Monaco instead
 *     of loading from CDN (critical for Tauri's strict CSP).
 *  2. Configure web-worker environment so Monaco operates seamlessly.
 *  3. Register all 22 custom colour themes.
 */
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { registerMonacoThemes } from "./monacoThemes";

// ---------------------------------------------------------------------------
// 1. Use the local Monaco bundle instead of unpkg / CDN
// ---------------------------------------------------------------------------
loader.config({ monaco });

import editorWorker from "../../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker";
import jsonWorker from "../../../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker";
import cssWorker from "../../../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker";
import htmlWorker from "../../../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker";
import tsWorker from "../../../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker";

// ---------------------------------------------------------------------------
// 2. Web-worker environment (Vite worker imports)
// ---------------------------------------------------------------------------
window.MonacoEnvironment = {
  getWorker(_: unknown, label: string): Worker {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

// ---------------------------------------------------------------------------
// 3. Register all custom themes (must happen before any editor is created)
// ---------------------------------------------------------------------------
registerMonacoThemes(monaco);

// ---------------------------------------------------------------------------
// 4. Register document formatting providers for XML/SVG and JSON
// ---------------------------------------------------------------------------
import { formatJson, formatXml } from "./normalizers";

monaco.languages.registerDocumentFormattingEditProvider("xml", {
  provideDocumentFormattingEdits(model) {
    const text = model.getValue();
    const formatted = formatXml(text);
    return [
      {
        range: model.getFullModelRange(),
        text: formatted,
      },
    ];
  },
});

monaco.languages.registerDocumentFormattingEditProvider("json", {
  provideDocumentFormattingEdits(model) {
    const text = model.getValue();
    const formatted = formatJson(text);
    return [
      {
        range: model.getFullModelRange(),
        text: formatted,
      },
    ];
  },
});

monaco.languages.registerDocumentFormattingEditProvider("jsonc", {
  provideDocumentFormattingEdits(model) {
    const text = model.getValue();
    const formatted = formatJson(text);
    return [
      {
        range: model.getFullModelRange(),
        text: formatted,
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// 5. Custom Translation Widget is initialized per editor instance in EditorPane.tsx
// ---------------------------------------------------------------------------

