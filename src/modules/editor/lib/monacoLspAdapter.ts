/**
 * Monaco ↔ LSP bridge.
 *
 * This module provides:
 *  1. A global provider registry — Monaco language providers:
 *     - Completion
 *     - Rich Hover (structure/type info, JSDoc/Rustdoc markdown cards)
 *     - Signature Help (parameter hints while typing functions)
 *     - Document Highlight (occurrence highlighting)
 *     - Document Symbols (outline / file structure)
 *     - Rename Symbol (F2 refactoring)
 *     - Code Actions (quick fixes)
 *     - Document Colors (CSS/HTML color swatches)
 *     - Go to Definition / References / Formatting
 *  2. Per-model lifecycle — when a Monaco model is opened/changed/closed,
 *     LSP notifications are sent through the transport.
 *  3. Diagnostics — publishDiagnostics is converted into Monaco model markers.
 */

import type { TeraxLspClient } from "@/modules/lsp/lib/client";
import type { TauriLspTransport } from "@/modules/lsp/lib/transport";
import { useDiagnosticsStore } from "./diagnosticsStore";

// ---------------------------------------------------------------------------
// LSP type stubs (standard JSON-RPC shapes, no external dep needed)
// ---------------------------------------------------------------------------
type LspPos = { line: number; character: number };
type LspRange = { start: LspPos; end: LspPos };
type LspLocation = { uri: string; range: LspRange };
type LspLocationLink = { targetUri: string; targetRange: LspRange; targetSelectionRange?: LspRange };
type LspDiag = {
  range: LspRange;
  severity?: 1 | 2 | 3 | 4;
  message: string;
  source?: string;
  code?: number | string;
};
type PublishDiagnosticsParams = { uri: string; diagnostics: LspDiag[] };

// ---------------------------------------------------------------------------
// Global provider registration state
// ---------------------------------------------------------------------------

const registeredLanguages = new Set<string>();
const activeClients = new Map<string, TeraxLspClient>();
/** Maps Monaco model URI → LSP document URI (they differ because Monaco auto-generates model URIs). */
const modelUriToDocUri = new Map<string, string>();
let _monaco: typeof import("monaco-editor") | null = null;

/**
 * Resolves the LSP client and the correct document URI for a given Monaco model.
 * Monaco model URIs are auto-generated (e.g. inmemory://model/1) while LSP
 * expects file:// URIs. This helper bridges the two.
 */
function resolveClient(model: import("monaco-editor").editor.ITextModel): { client: TeraxLspClient; docUri: string } | null {
  const modelUri = model.uri.toString();
  // 1. Direct match (model URI is the LSP document URI itself)
  const direct = activeClients.get(modelUri);
  if (direct) return { client: direct, docUri: modelUri };
  // 2. Translate Monaco model URI → LSP document URI
  const docUri = modelUriToDocUri.get(modelUri);
  if (docUri) {
    const client = activeClients.get(docUri);
    if (client) return { client, docUri };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers: LSP ↔ Monaco conversions
// ---------------------------------------------------------------------------

function monacoToLspPos(
  pos: import("monaco-editor").IPosition,
): LspPos {
  return { line: pos.lineNumber - 1, character: pos.column - 1 };
}

function monacoRangeToLsp(
  range: import("monaco-editor").IRange,
): LspRange {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end:   { line: range.endLineNumber - 1,   character: range.endColumn - 1 },
  };
}

function lspRangeToMonaco(
  r: LspRange,
): import("monaco-editor").IRange {
  return {
    startLineNumber: r.start.line + 1,
    startColumn: r.start.character + 1,
    endLineNumber: r.end.line + 1,
    endColumn: r.end.character + 1,
  };
}

function lspSeverityToMonaco(
  s: 1 | 2 | 3 | 4 | undefined,
): import("monaco-editor").MarkerSeverity {
  const monaco = _monaco!;
  switch (s) {
    case 1: return monaco.MarkerSeverity.Error;
    case 2: return monaco.MarkerSeverity.Warning;
    case 3: return monaco.MarkerSeverity.Info;
    case 4: return monaco.MarkerSeverity.Hint;
    default: return monaco.MarkerSeverity.Error;
  }
}

/** Rich Markdown parsing for LSP hover responses (types, structs, functions, docstrings). */
function parseLspHoverContents(
  raw: unknown,
): import("monaco-editor").IMarkdownString[] {
  if (!raw) return [];
  const list: Array<{ value: string; language?: string }> = [];

  const extract = (item: unknown) => {
    if (typeof item === "string") {
      list.push({ value: item });
    } else if (typeof item === "object" && item !== null) {
      const obj = item as { kind?: string; value?: string; language?: string };
      if (typeof obj.value === "string") {
        list.push({ value: obj.value, language: obj.language });
      }
    }
  };

  if (Array.isArray(raw)) {
    for (const sub of raw) extract(sub);
  } else {
    extract(raw);
  }

  return list
    .filter((item) => item.value && item.value.trim().length > 0)
    .map(({ value, language }) => ({
      value: language ? `\`\`\`${language}\n${value}\n\`\`\`` : value,
      isTrusted: true,
      supportThemeIcons: true,
    }));
}

// ---------------------------------------------------------------------------
// Global Monaco provider registration (once per language)
// ---------------------------------------------------------------------------

function ensureProviders(
  monaco: typeof import("monaco-editor"),
  monacoLanguageId: string,
): void {
  if (registeredLanguages.has(monacoLanguageId)) return;
  registeredLanguages.add(monacoLanguageId);
  _monaco = monaco;

  const selector = { language: monacoLanguageId };

  // ---- Completion ----
  monaco.languages.registerCompletionItemProvider(selector, {
    triggerCharacters: [".", ":", "\"", "'", "/", "@", "<", ">", "$"],
    async provideCompletionItems(model, position) {
      const resolved = resolveClient(model);
      if (!resolved) return null;
      const { client, docUri } = resolved;
      try {
        const result = await client.textDocumentCompletion({
          textDocument: { uri: docUri },
          position: monacoToLspPos(position),
        });
        if (!result) return null;
        const list = Array.isArray(result) ? result : (result as { items?: unknown[] }).items ?? [];
        const items = (list as Array<{
          label: string;
          kind?: number;
          detail?: string;
          documentation?: string | { value: string };
          insertText?: string;
          insertTextFormat?: number;
          textEdit?: { newText: string; range?: LspRange };
          sortText?: string;
          filterText?: string;
        }>).map((item) => {
          const word = model.getWordUntilPosition(position);
          const range = item.textEdit?.range
            ? lspRangeToMonaco(item.textEdit.range)
            : {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
              };
          const insertText = item.textEdit?.newText ?? item.insertText ?? (typeof item.label === 'string' ? item.label : (item.label as any).label);
          const isSnippet = item.insertTextFormat === 2;
          return {
            label: item.label,
            kind: (item.kind ?? 1) - 1 as import("monaco-editor").languages.CompletionItemKind,
            detail: item.detail,
            documentation: typeof item.documentation === "object"
              ? { value: (item.documentation as any).value ?? String(item.documentation), isTrusted: true }
              : item.documentation
              ? { value: item.documentation, isTrusted: true }
              : undefined,
            insertText,
            insertTextRules: isSnippet
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : undefined,
            range,
            sortText: item.sortText,
            filterText: item.filterText,
          };
        });
        return { suggestions: items };
      } catch {
        return null;
      }
    },
  });

  // ---- Rich Hover (Type info, struct parameters, docstrings) ----
  monaco.languages.registerHoverProvider(selector, {
    async provideHover(model, position) {
      const resolved = resolveClient(model);
      if (!resolved) return null;
      const { client, docUri } = resolved;
      try {
        const result = await client.requestLsp<{
          contents: unknown;
          range?: LspRange;
        } | null>("textDocument/hover", {
          textDocument: { uri: docUri },
          position: monacoToLspPos(position),
        });
        if (!result || !result.contents) return null;
        const contents = parseLspHoverContents(result.contents);
        if (contents.length === 0) return null;
        return {
          contents,
          range: result.range ? lspRangeToMonaco(result.range) : undefined,
        };
      } catch {
        return null;
      }
    },
  });

  // ---- Signature Help (Parameter hints) ----
  monaco.languages.registerSignatureHelpProvider(selector, {
    signatureHelpTriggerCharacters: ["(", ",", "<"],
    signatureHelpRetriggerCharacters: [","],
    async provideSignatureHelp(model, position) {
      const resolved = resolveClient(model);
      if (!resolved) return null;
      const { client, docUri } = resolved;
      try {
        const res = await client.requestLsp<{
          signatures?: Array<{
            label: string;
            documentation?: string | { value: string };
            parameters?: Array<{
              label: string | [number, number];
              documentation?: string | { value: string };
            }>;
          }>;
          activeSignature?: number;
          activeParameter?: number;
        }>("textDocument/signatureHelp", {
          textDocument: { uri: docUri },
          position: monacoToLspPos(position),
        });

        if (!res || !res.signatures || res.signatures.length === 0) return null;

        const signatures = res.signatures.map((sig) => ({
          label: sig.label,
          documentation:
            typeof sig.documentation === "object"
              ? { value: sig.documentation.value, isTrusted: true }
              : sig.documentation
              ? { value: sig.documentation, isTrusted: true }
              : undefined,
          parameters: (sig.parameters ?? []).map((p) => ({
            label: p.label,
            documentation:
              typeof p.documentation === "object"
                ? { value: p.documentation.value, isTrusted: true }
                : p.documentation
                ? { value: p.documentation, isTrusted: true }
                : undefined,
          })),
        }));

        return {
          value: {
            signatures,
            activeSignature: res.activeSignature ?? 0,
            activeParameter: res.activeParameter ?? 0,
          },
          dispose: () => {},
        };
      } catch {
        return null;
      }
    },
  });

  // ---- Document Highlights (Occurrence Highlighting) ----
  monaco.languages.registerDocumentHighlightProvider(selector, {
    async provideDocumentHighlights(model, position) {
      const resolved = resolveClient(model);
      if (!resolved) return null;
      const { client, docUri } = resolved;
      try {
        const res = await client.requestLsp<
          Array<{ range: LspRange; kind?: number }> | null
        >("textDocument/documentHighlight", {
          textDocument: { uri: docUri },
          position: monacoToLspPos(position),
        });
        if (!res) return null;
        return res.map((dh) => ({
          range: lspRangeToMonaco(dh.range),
          kind: (dh.kind ?? 1) as import("monaco-editor").languages.DocumentHighlightKind,
        }));
      } catch {
        return null;
      }
    },
  });

  // ---- Document Symbols (File Structure / Outline / Ctrl+Shift+O) ----
  monaco.languages.registerDocumentSymbolProvider(selector, {
    async provideDocumentSymbols(model) {
      const resolved = resolveClient(model);
      if (!resolved) return null;
      const { client, docUri } = resolved;
      try {
        const res = await client.requestLsp<unknown>("textDocument/documentSymbol", {
          textDocument: { uri: docUri },
        });
        if (!res || !Array.isArray(res)) return null;

        const mapSymbol = (s: unknown): import("monaco-editor").languages.DocumentSymbol => {
          const item = s as {
            name: string;
            detail?: string;
            kind: number;
            range: LspRange;
            selectionRange?: LspRange;
            children?: unknown[];
          };
          return {
            name: item.name,
            detail: item.detail ?? "",
            kind: (item.kind - 1) as import("monaco-editor").languages.SymbolKind,
            tags: [],
            range: lspRangeToMonaco(item.range),
            selectionRange: lspRangeToMonaco(item.selectionRange ?? item.range),
            children: (item.children ?? []).map(mapSymbol),
          };
        };

        return res.map(mapSymbol);
      } catch {
        return null;
      }
    },
  });

  // ---- Go to Definition ----
  monaco.languages.registerDefinitionProvider(selector, {
    async provideDefinition(model, position) {
      const resolved = resolveClient(model);
      if (!resolved) return null;
      const { client, docUri } = resolved;
      try {
        const result = await client.textDocumentDefinition({
          textDocument: { uri: docUri },
          position: monacoToLspPos(position),
        });
        if (!result) return null;
        const locs: Array<LspLocation | LspLocationLink> = Array.isArray(result)
          ? result
          : [result as LspLocation | LspLocationLink];
        return locs.map((loc) => {
          if ("targetUri" in loc) {
            return {
              uri: monaco.Uri.parse(loc.targetUri),
              range: lspRangeToMonaco(loc.targetSelectionRange ?? loc.targetRange),
            };
          }
          return { uri: monaco.Uri.parse(loc.uri), range: lspRangeToMonaco(loc.range) };
        });
      } catch {
        return null;
      }
    },
  });

  // ---- Find References ----
  monaco.languages.registerReferenceProvider(selector, {
    async provideReferences(model, position) {
      const resolved = resolveClient(model);
      if (!resolved) return null;
      const { client, docUri } = resolved;
      try {
        const result = await (client as TeraxLspClient).textDocumentReferences({
          textDocument: { uri: docUri },
          position: monacoToLspPos(position),
          context: { includeDeclaration: true },
        });
        if (!result) return null;
        return result.map((loc) => ({
          uri: monaco.Uri.parse(loc.uri),
          range: lspRangeToMonaco(loc.range as unknown as LspRange),
        }));
      } catch {
        return null;
      }
    },
  });

  // ---- Rename Symbol (F2 Refactoring) ----
  monaco.languages.registerRenameProvider(selector, {
    async resolveRenameLocation(model, position) {
      const resolved = resolveClient(model);
      if (!resolved) return null;
      const { client, docUri } = resolved;
      try {
        const res = await client.requestLsp<{
          range: LspRange;
          placeholder?: string;
        } | null>("textDocument/prepareRename", {
          textDocument: { uri: docUri },
          position: monacoToLspPos(position),
        });
        if (!res) return null;
        return {
          range: lspRangeToMonaco(res.range),
          text: res.placeholder ?? model.getWordAtPosition(position)?.word ?? "",
        };
      } catch {
        return null;
      }
    },
    async provideRenameEdits(model, position, newName) {
      const resolved = resolveClient(model);
      if (!resolved) return null;
      const { client, docUri } = resolved;
      try {
        const res = await client.requestLsp<{
          changes?: Record<string, Array<{ range: LspRange; newText: string }>>;
          documentChanges?: Array<{
            textDocument: { uri: string };
            edits: Array<{ range: LspRange; newText: string }>;
          }>;
        }>("textDocument/rename", {
          textDocument: { uri: docUri },
          position: monacoToLspPos(position),
          newName,
        });

        if (!res) return null;

        const edits: import("monaco-editor").languages.IWorkspaceTextEdit[] = [];

        if (res.changes) {
          for (const [uri, changeList] of Object.entries(res.changes)) {
            for (const edit of changeList) {
              edits.push({
                resource: monaco.Uri.parse(uri),
                textEdit: {
                  range: lspRangeToMonaco(edit.range),
                  text: edit.newText,
                },
                versionId: undefined,
              });
            }
          }
        }

        if (res.documentChanges) {
          for (const dc of res.documentChanges) {
            for (const edit of dc.edits) {
              edits.push({
                resource: monaco.Uri.parse(dc.textDocument.uri),
                textEdit: {
                  range: lspRangeToMonaco(edit.range),
                  text: edit.newText,
                },
                versionId: undefined,
              });
            }
          }
        }

        return { edits };
      } catch {
        return null;
      }
    },
  });

  // ---- Code Actions (Quick Fixes / Refactorings) ----
  monaco.languages.registerCodeActionProvider(selector, {
    async provideCodeActions(model, range, context) {
      const resolved = resolveClient(model);
      if (!resolved) return null;
      const { client, docUri } = resolved;
      try {
        const res = await client.requestLsp<
          Array<{
            title: string;
            kind?: string;
            command?: { command: string; title: string; arguments?: unknown[] };
            edit?: {
              changes?: Record<string, Array<{ range: LspRange; newText: string }>>;
            };
          }> | null
        >("textDocument/codeAction", {
          textDocument: { uri: docUri },
          range: monacoRangeToLsp(range),
          context: {
            diagnostics: context.markers.map((m) => ({
              range: {
                start: { line: m.startLineNumber - 1, character: m.startColumn - 1 },
                end: { line: m.endLineNumber - 1, character: m.endColumn - 1 },
              },
              message: m.message,
              severity: m.severity === monaco.MarkerSeverity.Error ? 1 : 2,
            })),
            only: context.only ? [context.only] : undefined,
          },
        });

        if (!res || res.length === 0) return null;

        const actions = res.map((ca) => ({
          title: ca.title,
          kind: ca.kind,
          edit: ca.edit?.changes
            ? {
                edits: Object.entries(ca.edit.changes).flatMap(([uri, changeList]) =>
                  changeList.map((e) => ({
                    resource: monaco.Uri.parse(uri),
                    textEdit: {
                      range: lspRangeToMonaco(e.range),
                      text: e.newText,
                    },
                    versionId: undefined,
                  })),
                ),
              }
            : undefined,
        }));

        return { actions, dispose: () => {} };
      } catch {
        return null;
      }
    },
  });

  // ---- Document Formatting ----
  monaco.languages.registerDocumentFormattingEditProvider(selector, {
    async provideDocumentFormattingEdits(model, options) {
      const resolved = resolveClient(model);
      if (!resolved) return null;
      const { client, docUri } = resolved;
      try {
        const edits = await client.textDocumentFormatting({
          textDocument: { uri: docUri },
          options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces },
        });
        if (!edits || edits.length === 0) return [];
        return edits.map((e) => ({
          range: lspRangeToMonaco(e.range),
          text: e.newText,
        }));
      } catch {
        return null;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Per-model LSP lifecycle
// ---------------------------------------------------------------------------

export type MonacoLspAttachment = {
  /** Dispose the attachment, sending textDocument/didClose and removing diagnostics. */
  dispose: () => void;
  /** Trigger LSP-side format and apply edits to the model. Returns "done" | "unsupported". */
  formatDocument: () => Promise<"done" | "unsupported">;
};

export function attachMonacoLsp(opts: {
  monaco: typeof import("monaco-editor");
  editor: import("monaco-editor").editor.IStandaloneCodeEditor;
  client: TeraxLspClient;
  transport: TauriLspTransport;
  documentUri: string;
  languageId: string;
  monacoLang: string;
  initialContent: string;
  filePath: string;
  onNavigate?: (uri: string, line: number) => void;
}): MonacoLspAttachment {
  const {
    monaco, editor, client, transport,
    documentUri, languageId, monacoLang,
    initialContent, filePath,
  } = opts;

  const model = editor.getModel();
  if (!model) {
    return { dispose: () => {}, formatDocument: async () => "unsupported" };
  }
  const capturedModel = model;

  ensureProviders(monaco, monacoLang);
  activeClients.set(documentUri, client);
  // Map the Monaco model URI → LSP document URI so providers can find the client
  const modelUri = capturedModel.uri.toString();
  modelUriToDocUri.set(modelUri, documentUri);

  // ---- 1. Send textDocument/didOpen only after initialize handshake completes ----
  let isDisposed = false;
  let isOpen = false;
  let version = 1;

  const initPromise = client.initializePromise ?? Promise.resolve();
  
  void initPromise.then(() => {
    if (isDisposed) {
      console.warn("[LSP:Monaco] Adapter was disposed before initialization finished!");
      return;
    }
    isOpen = true;
    const text = capturedModel.getValue() || initialContent;
    transport.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: documentUri,
            languageId,
            version,
            text,
          },
        },
      }),
    );
  });

  // ---- 2. Listen for content changes → textDocument/didChange ----
  const changeDisposable = capturedModel.onDidChangeContent((event) => {
    if (isDisposed || !isOpen) return;
    version += 1;
    
    // Send incremental updates IMMEDIATELY so that synchronous requests like
    // signatureHelp (triggered on '(') or completion (triggered on '.') 
    // see the up-to-date document buffer.
    const contentChanges = event.changes.map((change) => ({
      range: {
        start: { line: change.range.startLineNumber - 1, character: change.range.startColumn - 1 },
        end: { line: change.range.endLineNumber - 1, character: change.range.endColumn - 1 },
      },
      rangeLength: change.rangeLength,
      text: change.text,
    }));

    transport.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "textDocument/didChange",
        params: {
          textDocument: { uri: documentUri, version },
          contentChanges,
        },
      }),
    );
  });

  // ---- 3. Listen for publishDiagnostics ----
  const unsubscribe = transport.subscribe((raw) => {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    
    if (
      typeof msg !== "object" ||
      msg === null ||
      (msg as { method?: string }).method !== "textDocument/publishDiagnostics"
    ) return;

    const params = (msg as { params?: PublishDiagnosticsParams }).params;
    if (!params || !params.uri) return;
    
    // Pyright and other LSPs often normalize drive letters (e.g. c: instead of C:)
    // or use different URL encodings. Decode both and compare case-insensitively.
    const normalizeUri = (u: string) => {
      try {
        return decodeURIComponent(u).toLowerCase().replace(/\\/g, "/");
      } catch {
        return u.toLowerCase();
      }
    };

    if (normalizeUri(params.uri) !== normalizeUri(documentUri)) {
      return;
    }

    const markers = params.diagnostics.map((d): import("monaco-editor").editor.IMarkerData => ({
      severity: lspSeverityToMonaco(d.severity),
      message: d.message,
      source: d.source,
      code: d.code !== undefined ? String(d.code) : undefined,
      startLineNumber: d.range.start.line + 1,
      startColumn: d.range.start.character + 1,
      endLineNumber: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
    }));

    monaco.editor.setModelMarkers(capturedModel, "lsp", markers);

    const errors   = markers.filter((m) => m.severity === monaco.MarkerSeverity.Error).length;
    const warnings = markers.filter((m) => m.severity === monaco.MarkerSeverity.Warning || m.severity === monaco.MarkerSeverity.Info || m.severity === monaco.MarkerSeverity.Hint).length;
    useDiagnosticsStore.getState().report(filePath, { errors, warnings });
  });

  // ---- Dispose ----
  function dispose(): void {
    isDisposed = true;
    changeDisposable.dispose();
    unsubscribe();
    activeClients.delete(documentUri);
    modelUriToDocUri.delete(modelUri);
    // Remove markers when closing the file so they don't persist or flicker
    monaco.editor.setModelMarkers(capturedModel, "lsp", []);
    useDiagnosticsStore.getState().report(filePath, null);

    if (isOpen) {
      isOpen = false;
      transport.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "textDocument/didClose",
          params: { textDocument: { uri: documentUri } },
        }),
      );
    }
  }

  // ---- formatDocument helper ----
  async function formatDocument(): Promise<"done" | "unsupported"> {
    try {
      const edits = await (client as unknown as {
        textDocumentFormatting: (p: unknown) => Promise<Array<{
          range: LspRange; newText: string;
        }> | null>;
      }).textDocumentFormatting({
        textDocument: { uri: documentUri },
        options: { tabSize: capturedModel.getOptions().tabSize, insertSpaces: true },
      });
      if (!edits || edits.length === 0) return "done";
      const monacoEdits = edits.map((e) => ({
        range: lspRangeToMonaco(e.range),
        text: e.newText,
        forceMoveMarkers: true,
      }));
      capturedModel.pushEditOperations([], monacoEdits, () => null);
      return "done";
    } catch {
      return "unsupported";
    }
  }

  return { dispose, formatDocument };
}
