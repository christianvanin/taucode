// Side-effect: configures Monaco workers, loader, and themes before any
// Editor component is instantiated.
import "./lib/monacoSetup";

import {
  acquireMonacoLspSession,
  type MonacoLspHandle,
} from "@/modules/lsp";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { serverForLanguage } from "@/modules/lsp/lib/presets";
import { useLspRuntimeStore } from "@/modules/lsp/lib/runtimeStore";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Editor, type OnMount } from "@monaco-editor/react";
import type * as MonacoNS from "monaco-editor";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  Suspense,
  lazy,
} from "react";
import { toast } from "sonner";
import { attachMonacoLsp, type MonacoLspAttachment } from "./lib/monacoLspAdapter";
import {
  applyFormattedContent as _applyFormatted,
  readFileText,
  resolveFormatter,
  runExternalFormatter,
} from "./lib/externalFormat";
import { FORCE_READ_LIMIT, useDocument } from "./lib/useDocument";
import { useMonacoThemeId } from "./lib/useMonacoTheme";
import { resolveMonacoLanguage } from "./lib/monacoLanguages";
import { registerMonacoThemes } from "./lib/monacoThemes";
import { formatJson, formatXml } from "./lib/normalizers";
import { PdfViewerPane } from "./components/PdfViewerPane";
import { isDefaultGeminiSkill } from "@/modules/antigravity/skillUtils";
import { TauWatermark } from "@/components/icons/TerminalTauIcon";
import { useExtensionsStore } from "@/modules/extensions/store";
import { ExtensionTabHost } from "@/modules/extensions/components/ExtensionTabHost";

import { Model3dViewToggle } from "@/modules/model3d";

const Model3dPane = lazy(() =>
  import("@/modules/model3d").then((m) => ({ default: m.Model3dPane }))
);
// ---------------------------------------------------------------------------
// Handle type (same public contract as before)
// ---------------------------------------------------------------------------

export type EditorPaneHandle = {
  setQuery: (q: string) => void;
  findNext: () => void;
  findPrevious: () => void;
  clearQuery: () => void;
  /** Open Monaco's built-in find widget. */
  openSearch: () => void;
  focus: () => void;
  getSelection: () => string | null;
  getPath: () => string;
  /** Re-read the file from disk. Skips silently if the buffer is dirty. */
  reload: () => boolean;
  /** Move the cursor to a 1-based line and centre it. */
  gotoLine: (line: number) => void;
  undo: () => void;
  redo: () => void;
  /** Open Monaco's suggestion widget. */
  triggerCodeComplete: () => void;
  /** Format / normalize document contents. */
  format: () => void;
  /** Save file contents to disk (blocked if read-only). */
  save?: () => Promise<void>;
};

type Props = {
  path: string;
  overrideLanguage?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
  onClose?: () => void;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const SYNTAX_MAX_BYTES = 4 * 1024 * 1024;

type FindController = {
  setSearchString?: (s: string) => void;
  getState?: () => { change: (v: unknown) => void };
  start?: (opts: { searchString?: string }) => void;
  openFindWidget?: () => void;
  closeFindWidget?: () => void;
  moveToNextMatch?: () => void;
  moveToPrevMatch?: () => void;
};

function getFindController(
  editor: MonacoNS.editor.IStandaloneCodeEditor,
): FindController | null {
  return editor.getContribution(
    "editor.contrib.findController",
  ) as FindController | null;
}

/** Apply external formatter output to a Monaco model, preserving cursor position. */
function applyFormattedToMonaco(
  editor: MonacoNS.editor.IStandaloneCodeEditor,
  next: string,
): void {
  const model = editor.getModel();
  if (!model) return;
  const current = model.getValue();
  if (current === next) return;
  const pos = editor.getPosition();
  // Use pushEditOperations to stay in undo stack
  const fullRange = model.getFullModelRange();
  model.pushEditOperations([], [{ range: fullRange, text: next }], () => null);
  if (pos) editor.setPosition(pos);
}

// ---------------------------------------------------------------------------
// LSP hook for Monaco
// ---------------------------------------------------------------------------

function useMonacoLspHandle(
  path: string,
  langId: string | null,
  ready: boolean,
): MonacoLspHandle | null {
  const [handle, setHandle] = useState<MonacoLspHandle | null>(null);
  const customServers = usePreferencesStore((s) => s.lspCustomServers);
  const lspActivation = usePreferencesStore((s) => s.lspActivation);
  const preset = serverForLanguage(langId, customServers, lspActivation);
  const activation = preset ? lspActivation[preset.id] : undefined;
  const presetId = preset?.id;
  const generation = useLspRuntimeStore((s) =>
    preset ? (s.generations[preset.id] ?? 0) : 0,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies(generation): re-acquire after crash
  // biome-ignore lint/correctness/useExhaustiveDependencies(presetId): swap server on lang change
  useEffect(() => {
    if (!ready || !langId || activation !== "enabled") {
      setHandle(null);
      return;
    }
    let cancelled = false;
    let h: MonacoLspHandle | null = null;
    acquireMonacoLspSession(path, langId)
      .then((result) => {
        if (!result) return;
        if (cancelled) {
          result.release();
          return;
        }
        h = result;
        setHandle(result);
      })
      .catch((e) => console.error("[lsp:monaco] acquire failed", e));
    return () => {
      cancelled = true;
      h?.release();
      setHandle(null);
    };
  }, [path, langId, ready, activation, generation, presetId]);

  return handle;
}

// ---------------------------------------------------------------------------
// EditorPane
// ---------------------------------------------------------------------------

export const EditorPane = memo(
  forwardRef<EditorPaneHandle, Props>(function EditorPane(props, ref) {
    const { path, overrideLanguage, onDirtyChange, onSaved, onClose } = props;

    const { doc, onChange, save, reload, adoptDiskText, openAnyway } =
      useDocument({ path, onDirtyChange });

    const isReadOnlySkill = isDefaultGeminiSkill(path);

    const reloadRef = useRef(reload);
    reloadRef.current = reload;

    const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(
      null,
    );
    const monacoRef = useRef<typeof MonacoNS | null>(null);

    const themeId = useMonacoThemeId();
    const editorFontSize = usePreferencesStore((s) => s.editorFontSize);
    const editorWordWrap = usePreferencesStore((s) => s.editorWordWrap);
    const extensions = useExtensionsStore((s) => s.extensions);

    const [langId, setLangId] = useState<string | null>(null);
    const languageRef = useRef<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    const saveRef = useRef(save);
    saveRef.current = save;
    const onSavedRef = useRef(onSaved);
    onSavedRef.current = onSaved;
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const pathRef = useRef(path);
    pathRef.current = path;
    const adoptDiskTextRef = useRef(adoptDiskText);
    adoptDiskTextRef.current = adoptDiskText;

    const lspActiveRef = useRef(false);
    const warnedNoLspRef = useRef(false);
    const warnedNoFormatRef = useRef(false);

    // LSP handle (session client + transport)
    const lspHandle = useMonacoLspHandle(path, langId, doc.status === "ready");
    const lspHandleRef = useRef(lspHandle);
    lspHandleRef.current = lspHandle;

    // Active LSP attachment (providers + doc sync)
    const lspAttachmentRef = useRef<MonacoLspAttachment | null>(null);
    const [text3dMode, setText3dMode] = useState<"3d" | "code">("3d");

    useEffect(() => {
      setText3dMode("3d");
    }, [path]);

    // Prevent feedback loops when we programmatically update the model
    const isExternalUpdateRef = useRef(false);

    // Pending goto line (queued before the model is ready)
    const pendingLineRef = useRef<number | null>(null);

    // ---------------------------------------------------------------------------
    // Resolve Monaco language from path/overrideLanguage
    // ---------------------------------------------------------------------------
    useEffect(() => {
      const ext =
        overrideLanguage || (path.split(".").pop()?.toLowerCase() ?? null);
      languageRef.current = ext;

      if (doc.status !== "ready") return;
      const docSize = doc.size;
      if (docSize > SYNTAX_MAX_BYTES) {
        setLangId(null);
        return;
      }
      const resolvePath = overrideLanguage ? `dummy.${overrideLanguage}` : path;
      const id = resolveMonacoLanguage(resolvePath);
      setLangId(id || ext);
      if (id) languageRef.current = id;
    }, [path, doc.status, (doc as { size?: number }).size, overrideLanguage]);

    // ---------------------------------------------------------------------------
    // Sync theme and word-wrap live
    // ---------------------------------------------------------------------------
    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const monaco = monacoRef.current;
      if (monaco) monaco.editor.setTheme(themeId);
    }, [themeId]);

    useEffect(() => {
      editorRef.current?.updateOptions({ wordWrap: editorWordWrap ? "on" : "off" });
    }, [editorWordWrap]);

    useEffect(() => {
      editorRef.current?.updateOptions({ fontSize: editorFontSize });
    }, [editorFontSize]);

    // ---------------------------------------------------------------------------
    // When doc.content changes externally (reload from disk), push to Monaco
    // ---------------------------------------------------------------------------
    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || doc.status !== "ready") return;
      const model = editor.getModel();
      if (!model) return;
      const currentValue = model.getValue();
      if (currentValue !== doc.content) {
        isExternalUpdateRef.current = true;
        const pos = editor.getPosition();
        model.setValue(doc.content);
        if (pos) editor.setPosition(pos);
        isExternalUpdateRef.current = false;
      }
      // Apply pending goto
      if (pendingLineRef.current !== null) {
        const line = Math.max(
          1,
          Math.min(pendingLineRef.current, model.getLineCount()),
        );
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: 1 });
        editor.focus();
        pendingLineRef.current = null;
      }
    }, [doc]);

    // ---------------------------------------------------------------------------
    // Attach / detach LSP when the handle changes
    // ---------------------------------------------------------------------------
    useEffect(() => {
      // Dispose previous attachment
      lspAttachmentRef.current?.dispose();
      lspAttachmentRef.current = null;

      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco || !lspHandle) {
        lspActiveRef.current = false;
        return;
      }

      lspActiveRef.current = true;
      const initialContent = editor.getModel()?.getValue() ?? "";
      lspAttachmentRef.current = attachMonacoLsp({
        monaco,
        editor,
        client: lspHandle.client,
        transport: lspHandle.transport,
        documentUri: lspHandle.documentUri,
        languageId: lspHandle.languageId,
        monacoLang: langId ?? "plaintext",
        initialContent,
        filePath: pathRef.current,
      });

      return () => {
        lspAttachmentRef.current?.dispose();
        lspAttachmentRef.current = null;
        lspActiveRef.current = false;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lspHandle, isMounted]);

    // ---------------------------------------------------------------------------
    // Save (Cmd/Ctrl+S) with format-on-save support
    // ---------------------------------------------------------------------------
    const performSave = useCallback(async () => {
      if (isReadOnlySkill) {
        toast.warning(
          "Questa skill è predefinita di Gemini ed è protetta in sola lettura. Non può essere modificata.",
        );
        return;
      }

      const prefs = usePreferencesStore.getState();
      const formatter = resolveFormatter(languageRef.current, prefs);

      if (prefs.editorFormatOnSave && formatter === "lsp") {
        if (lspActiveRef.current && lspAttachmentRef.current) {
          let res: "done" | "unsupported" = "done";
          try {
            res = await lspAttachmentRef.current.formatDocument();
          } catch (e) {
            toast.error("Language server format failed", {
              description: String(e),
            });
          }
          if (res === "unsupported" && !warnedNoFormatRef.current) {
            warnedNoFormatRef.current = true;
            toast.warning("Format on save skipped", {
              description:
                "The active language server has no formatter. Pick an external one in Settings (Ruff for Python, Prettier, rustfmt, …).",
            });
          }
        } else if (!warnedNoLspRef.current) {
          warnedNoLspRef.current = true;
          toast.warning("Format on save skipped", {
            description:
              "No active language server for this file. Enable one in the statusbar, or pick an external formatter in Settings.",
          });
        }
      }

      const saved = await saveRef.current();
      if (!saved) return;

      if (prefs.editorFormatOnSave && formatter !== "lsp") {
        const error = await runExternalFormatter(
          formatter,
          pathRef.current,
          prefs.editorCustomFormatCommand,
        );
        if (error) {
          toast.error(`${formatter} format failed`, { description: error });
        } else {
          const readBack = await readFileText(pathRef.current);
          const editor = editorRef.current;
          if (readBack !== null && editor) {
            const adopted = adoptDiskTextRef.current(readBack.text, readBack.mtime);
            applyFormattedToMonaco(editor, adopted);
          }
        }
      }

      onSavedRef.current?.();
    }, []);

    const performSaveRef = useRef(performSave);
    performSaveRef.current = performSave;

    // ---------------------------------------------------------------------------
    // Editor mount callback
    // ---------------------------------------------------------------------------
    const handleMount = useCallback<OnMount>((editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Register all themes into this Monaco instance and activate the current theme
      registerMonacoThemes(monaco);
      monaco.editor.setTheme(themeId);

      setIsMounted(true);

      // Ctrl/Cmd+S → save
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => { void performSaveRef.current(); },
      );

      // Apply pending goto line
      if (pendingLineRef.current !== null && doc.status === "ready") {
        const model = editor.getModel();
        if (model) {
          const line = Math.max(
            1,
            Math.min(pendingLineRef.current, model.getLineCount()),
          );
          editor.revealLineInCenter(line);
          editor.setPosition({ lineNumber: line, column: 1 });
          pendingLineRef.current = null;
        }
      }

      // If LSP handle is already available, attach immediately
      if (lspHandleRef.current) {
        const initialContent = editor.getModel()?.getValue() ?? "";
        lspAttachmentRef.current?.dispose();
        lspAttachmentRef.current = attachMonacoLsp({
          monaco,
          editor,
          client: lspHandleRef.current.client,
          transport: lspHandleRef.current.transport,
          documentUri: lspHandleRef.current.documentUri,
          languageId: lspHandleRef.current.languageId,
          monacoLang: langId ?? "plaintext",
          initialContent,
          filePath: pathRef.current,
        });
        lspActiveRef.current = true;
      }

      // Ensure find-widget hover tooltips stay single-line
      const editorDom = editor.getDomNode();
      if (editorDom) {
        const cleanHovers = () => {
          const els = editorDom.querySelectorAll(".find-widget [title]");
          for (const el of els) el.removeAttribute("title");

          const hovers = document.querySelectorAll(".monaco-hover, .monaco-editor-hover");
          for (const hover of hovers) {
            const text = hover.textContent || "";
            if (text.includes("Close")) {
              const target = (hover.querySelector(".monaco-hover-content") || hover) as HTMLElement;
              if (target && target.textContent !== "Close") {
                target.textContent = "Close";
              }
            }
          }
        };
        const observer = new MutationObserver(cleanHovers);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        return () => {
          observer.disconnect();
        };
      }
    }, [doc.status, langId, themeId]);

    // ---------------------------------------------------------------------------
    // Imperatively sync theme whenever it changes (e.g. after Settings is closed)
    // ---------------------------------------------------------------------------
    useEffect(() => {
      const monaco = monacoRef.current;
      if (!monaco) return;
      registerMonacoThemes(monaco);
      monaco.editor.setTheme(themeId);
    }, [themeId]);

    // ---------------------------------------------------------------------------
    // Monaco onChange → useDocument
    // ---------------------------------------------------------------------------
    const handleChange = useCallback(
      (value: string | undefined) => {
        if (isExternalUpdateRef.current) return;
        onChange(value ?? "");
      },
      [onChange],
    );

    // ---------------------------------------------------------------------------
    // Imperative handle
    // ---------------------------------------------------------------------------
    useImperativeHandle(
      ref,
      () => ({
        setQuery: (q: string) => {
          const editor = editorRef.current;
          if (!editor) return;
          const fc = getFindController(editor);
          if (fc) {
            if (!q) {
              fc.setSearchString?.("");
              fc.closeFindWidget?.();
              return;
            }
            fc.setSearchString?.(q) ??
              fc.start?.({ searchString: q }) ??
              fc.openFindWidget?.();
          } else {
            if (q) {
              editor.focus();
              editor.getAction("actions.find")?.run();
            }
          }
        },
        findNext: () => {
          const editor = editorRef.current;
          if (!editor) return;
          getFindController(editor)?.moveToNextMatch?.() ??
            editor.getAction("editor.action.nextMatchFindAction")?.run();
        },
        findPrevious: () => {
          const editor = editorRef.current;
          if (!editor) return;
          getFindController(editor)?.moveToPrevMatch?.() ??
            editor.getAction("editor.action.previousMatchFindAction")?.run();
        },
        clearQuery: () => {
          const editor = editorRef.current;
          if (!editor) return;
          const fc = getFindController(editor);
          if (fc) {
            fc.setSearchString?.("");
            fc.closeFindWidget?.();
          } else {
            editor.getAction("closeFindWidget")?.run();
          }
        },
        openSearch: () => {
          editorRef.current?.getAction("actions.find")?.run();
        },
        focus: () => {
          editorRef.current?.focus();
        },
        getSelection: () => {
          const editor = editorRef.current;
          if (!editor) return null;
          const sel = editor.getSelection();
          if (!sel || sel.isEmpty()) return null;
          return editor.getModel()?.getValueInRange(sel) ?? null;
        },
        getPath: () => path,
        reload: () => reloadRef.current(),
        gotoLine: (line: number) => {
          pendingLineRef.current = line;
          const editor = editorRef.current;
          const model = editor?.getModel();
          if (!editor || !model || doc.status !== "ready") return;
          const target = Math.max(1, Math.min(line, model.getLineCount()));
          editor.revealLineInCenter(target);
          editor.setPosition({ lineNumber: target, column: 1 });
          editor.focus();
          pendingLineRef.current = null;
        },
        undo: () => {
          editorRef.current?.trigger("keyboard", "undo", null);
        },
        redo: () => {
          editorRef.current?.trigger("keyboard", "redo", null);
        },
        triggerCodeComplete: () => {
          const editor = editorRef.current;
          if (!editor) return;
          editor.focus();
          editor.trigger("keyboard", "editor.action.triggerSuggest", {});
        },
        format: () => {
          const editor = editorRef.current;
          if (!editor) return;
          const model = editor.getModel();
          if (!model) return;
          const lang = model.getLanguageId();
          const text = model.getValue();
          let formatted: string | null = null;
          if (lang === "xml") {
            formatted = formatXml(text);
          } else if (lang === "json" || lang === "jsonc") {
            formatted = formatJson(text);
          }
          if (formatted !== null && formatted !== text) {
            editor.executeEdits("format", [
              {
                range: model.getFullModelRange(),
                text: formatted,
                forceMoveMarkers: true,
              },
            ]);
            editor.pushUndoStop();
          } else {
            void editor.getAction("editor.action.formatDocument")?.run();
          }
        },
        save: () => performSaveRef.current(),
      }),
      [path, doc.status],
    );

    // ---------------------------------------------------------------------------
    // Non-text file renderers (unchanged logic)
    // ---------------------------------------------------------------------------
    if (doc.status === "loading") {
      return (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      );
    }
    if (doc.status === "error") {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
          {doc.message}
        </div>
      );
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "";

    // Se un'estensione attiva dichiara supporto per questa estensione file, visualizzala con quell'estensione
    if (ext) {
      const customExt = extensions.find(
        (e) =>
          e.enabled &&
          e.contributes?.tabs?.some((t) =>
            (t.fileExtensions ?? (t as { file_extensions?: string[] }).file_extensions)?.some(
              (fe) => fe.toLowerCase().replace(/^\./, "") === ext,
            ),
          ),
      );
      const customTabContrib = customExt?.contributes?.tabs?.find((t) =>
        (t.fileExtensions ?? (t as { file_extensions?: string[] }).file_extensions)?.some(
          (fe) => fe.toLowerCase().replace(/^\./, "") === ext,
        ),
      );

      if (customExt && customTabContrib) {
        return (
          <ExtensionTabHost
            tab={{
              id: 0,
              kind: "extension",
              spaceId: "",
              title: path.split(/[\\/]/).pop() || customTabContrib.title || "Extension",
              extensionId: customExt.id,
              tabContributionId: customTabContrib.id,
              path,
            }}
            workspaceRoot={null}
          />
        );
      }
    }

    const is3dBinary = ["glb", "fbx", "stl"].includes(ext);
    if (is3dBinary) {
      return (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Caricamento visualizzatore 3D...</div>}>
          <Model3dPane path={path} />
        </Suspense>
      );
    }

    if (doc.status === "binary" || doc.status === "toolarge") {
      const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext);
      const isVideo = ["mp4", "webm", "ogg", "mov"].includes(ext);
      const isAudio = ["mp3", "wav", "flac", "aac", "m4a"].includes(ext);
      const isPdf = ext === "pdf";

      if (isImage) {
        const assetUrl = convertFileSrc(path);
        return (
          <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background p-4 overflow-auto">
            <img
              src={assetUrl}
              alt=""
              className="max-h-full max-w-full object-contain select-none shadow-sm rounded-sm"
            />
          </div>
        );
      }

      if (isPdf) {
        return <PdfViewerPane path={path} />;
      }

      if (isVideo || isAudio) {
        const assetUrl = convertFileSrc(path);
        return (
          <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background p-4 overflow-auto">
            {isVideo && (
              // biome-ignore lint/a11y/useMediaCaption: local media preview
              <video controls preload="metadata" className="max-w-full max-h-full" src={assetUrl} />
            )}
            {isAudio && (
              // biome-ignore lint/a11y/useMediaCaption: local media preview
              <audio controls preload="metadata" className="w-full max-w-md" src={assetUrl} />
            )}
          </div>
        );
      }

      const canForce = doc.status === "toolarge" && doc.size <= FORCE_READ_LIMIT;
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <div className="text-sm text-foreground">
            {doc.status === "binary" ? "Binary file" : "File too large"}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatBytes(doc.size)} ·{" "}
            {canForce ? "syntax features disabled" : "preview not supported"}
          </div>
          {canForce && (
            <button
              type="button"
              onClick={openAnyway}
              className="mt-2 rounded-md border border-border bg-muted/60 px-3 py-1 text-xs text-foreground hover:bg-accent"
            >
              Open anyway
            </button>
          )}
        </div>
      );
    }

    const isText3d = ["bbmodel", "gltf", "obj"].includes(ext);
    if (isText3d && text3dMode === "3d" && doc.status === "ready") {
      return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Caricamento visualizzatore 3D...</div>}>
            <Model3dPane
              path={path}
              content={doc.content}
              viewMode={text3dMode}
              onViewModeChange={setText3dMode}
            />
          </Suspense>
        </div>
      );
    }

    // ---------------------------------------------------------------------------
    // Monaco Editor
    // ---------------------------------------------------------------------------
    const monacoLang = langId ??
      resolveMonacoLanguage(overrideLanguage ? `dummy.${overrideLanguage}` : path);

    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden zoom-exempt">
        {isText3d && (
          <Model3dViewToggle
            mode={text3dMode}
            onChange={setText3dMode}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20"
          />
        )}
        <Editor
          height="100%"
          language={monacoLang}
          value={doc.content}
          theme={themeId}
          beforeMount={(monaco) => {
            registerMonacoThemes(monaco);
          }}
          onChange={handleChange}
          onMount={handleMount}
          loading={
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Loading editor…
            </div>
          }
          options={{
            readOnly: isReadOnlySkill,
            domReadOnly: isReadOnlySkill,
            fontSize: editorFontSize,
            mouseWheelZoom: true,
            fontFamily:
              '"JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, Monaco, "Courier New", monospace',
            fontLigatures: true,
            lineHeight: 1.6,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: editorWordWrap ? "on" : "off",
            automaticLayout: true,
            folding: true,
            showFoldingControls: "mouseover",
            lineNumbers: "on",
            lineDecorationsWidth: 4,
            renderLineHighlight: "line",
            hover: {
              enabled: "on",
              delay: 300,
              sticky: true,
            },
            parameterHints: {
              enabled: true,
              cycle: true,
            },
            occurrencesHighlight: "singleFile",
            colorDecorators: true,
            lightbulb: {
              enabled: "on" as unknown as import("monaco-editor").editor.ShowLightbulbIconMode,
            },
            links: true,
            matchBrackets: "always",
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
              useShadows: false,
            },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            overviewRulerLanes: 0,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: false, indentation: true },
            padding: { top: 8, bottom: 8 },
            fixedOverflowWidgets: true,
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: "on",
            tabCompletion: "on",
            wordBasedSuggestions: "currentDocument",
            snippetSuggestions: "inline",
            suggest: {
              showIcons: true,
              showStatusBar: true,
              preview: true,
              showMethods: true,
              showFunctions: true,
              showConstructors: true,
              showFields: true,
              showVariables: true,
              showClasses: true,
              showStructs: true,
              showInterfaces: true,
              showModules: true,
              showProperties: true,
              showEvents: true,
              showOperators: true,
              showUnits: true,
              showValues: true,
              showConstants: true,
              showEnums: true,
              showEnumMembers: true,
              showKeywords: true,
              showWords: true,
              showColors: true,
              showFiles: true,
              showReferences: true,
              showFolders: true,
              showTypeParameters: true,
              showSnippets: true,
              insertMode: "insert",
            },
            quickSuggestions: { other: "on", comments: "off", strings: "off" },
            "semanticHighlighting.enabled": true,
          }}
        />
        {/* Greek Tau (τ) character watermark in the center of the editor */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex select-none items-center justify-center overflow-hidden"
        >
          <TauWatermark />
        </div>
      </div>
    );
  }),
);
