import { useEffect, useRef, useState, useCallback, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import {
  Download01Icon,
  Loading03Icon,
  AlertCircleIcon,
  Refresh01Icon,
  CheckmarkCircle01Icon,
  Globe02Icon,
  Copy01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "@/modules/theme";

interface Props {
  workspaceRoot?: string | null;
  onClose?: () => void;
  onMoveToTab?: () => void;
  variant?: "tab" | "panel";
  targetRoute?: string;
  targetScreen?: string;
  onOpenSettings?: (targetScreen?: string) => void;
  onOpenFile?: (
    path: string,
    pin?: boolean,
    line?: number,
    customTitle?: string,
  ) => void;
  onRunInTerminal?: (command: string, cwd?: string, title?: string, autoClose?: boolean) => void;
  onCloseTerminal?: (filter?: { tabId?: number; title?: string; last?: boolean; all?: boolean }) => void;
}

interface AntigravityResolvedPath {
  path: string;
  title: string | null;
  line: number | null;
  exists: boolean;
  is_markdown: boolean;
}

interface AntigravityStatus {
  installed: boolean;
  version: string | null;
  latest_version: string | null;
  update_available: boolean;
  executable_path: string | null;
}

interface AntigravityDownloadProgress {
  downloaded: number;
  total: number | null;
  percentage: number;
  phase: "downloading" | "installing" | "completed";
}

interface ProbeResult {
  ok: boolean;
  status?: number;
  statusText?: string;
  durationMs?: number;
  headers?: Record<string, string>;
  csp?: string | null;
  bodySnippet?: string;
  error?: string;
  timestamp: string;
}

interface LogEntry {
  id: number;
  timestamp: string;
  type: "info" | "warn" | "error" | "message";
  text: string;
}

const ANTIGRAVITY_STORAGE_KEY = "terax_antigravity_storage";
let cachedStorageData: Record<string, string> | null = null;
let saveStorageTimeout: ReturnType<typeof setTimeout> | null = null;

function getStoredAntigravityData(): Record<string, string> {
  if (cachedStorageData) {
    return cachedStorageData;
  }
  let data: Record<string, string> = {};
  try {
    const saved = localStorage.getItem(ANTIGRAVITY_STORAGE_KEY);
    if (saved) {
      data = JSON.parse(saved);
    }
  } catch {
    data = {};
  }
  // Assicura flag onboarding di base se non ancora definiti
  if (!data["jetski.onboarding.welcomeModalSeen"]) data["jetski.onboarding.welcomeModalSeen"] = "true";
  if (!data["jetski.onboarding.hasCompletedOnboarding"]) data["jetski.onboarding.hasCompletedOnboarding"] = "true";
  if (!data["jetski.onboarding.completed"]) data["jetski.onboarding.completed"] = "true";
  if (!data["jetski.acceptedTermsVersion"]) data["jetski.acceptedTermsVersion"] = "1";
  if (!data["jetski.telemetry.enabled"]) data["jetski.telemetry.enabled"] = "true";
  if (!data["jetski.onboarding.lastLoginIsGcpTos"]) data["jetski.onboarding.lastLoginIsGcpTos"] = "false";

  cachedStorageData = data;
  return data;
}

export function flushStoredAntigravityData(): void {
  if (saveStorageTimeout) {
    clearTimeout(saveStorageTimeout);
    saveStorageTimeout = null;
  }
  if (cachedStorageData) {
    try {
      localStorage.setItem(ANTIGRAVITY_STORAGE_KEY, JSON.stringify(cachedStorageData));
    } catch (err) {
      console.warn("Impossibile salvare memoria persistente Antigravity in localStorage:", err);
    }
  }
}

function saveStoredAntigravityData(data: Record<string, string>, immediate = false): void {
  cachedStorageData = data;
  if (immediate) {
    flushStoredAntigravityData();
    return;
  }
  if (saveStorageTimeout) {
    clearTimeout(saveStorageTimeout);
  }
  // Debounce a 1000ms per evitare scritture su disco a ogni interazione/scroll
  saveStorageTimeout = setTimeout(() => {
    saveStorageTimeout = null;
    if (cachedStorageData) {
      const copy = { ...cachedStorageData };
      setTimeout(() => {
        try {
          localStorage.setItem(ANTIGRAVITY_STORAGE_KEY, JSON.stringify(copy));
        } catch (err) {
          console.warn("Impossibile salvare memoria persistente Antigravity in localStorage:", err);
        }
      }, 0);
    }
  }, 1000);
}

// Salva immediatamente quando la finestra viene chiusa o ricaricata
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    flushStoredAntigravityData();
  });
}

function AntigravityPaneComponent({
  workspaceRoot,
  onClose: _onClose,
  onMoveToTab: _onMoveToTab,
  variant: _variant = "tab",
  targetRoute,
  targetScreen,
  onOpenSettings,
  onOpenFile,
  onRunInTerminal,
  onCloseTerminal,
}: Props) {
  const [status, setStatus] = useState<AntigravityStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<AntigravityDownloadProgress | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<AntigravityDownloadProgress>("antigravity-download-progress", (ev) => {
      setDownloadProgress(ev.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Debug Panel States (default false così l'interfaccia principale è pulita)
  const [showDebug, setShowDebug] = useState(false);
  const showDebugRef = useRef(false);
  useEffect(() => {
    showDebugRef.current = showDebug;
  }, [showDebug]);

  const [reloadKey, setReloadKey] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsRef = useRef<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedMode } = useTheme();


  // Assicura il flush dei dati di storage quando il componente si smonta
  useEffect(() => {
    return () => {
      flushStoredAntigravityData();
    };
  }, []);

  // addLog aggiorna logsRef e aggiorna lo stato React SOLO se il pannello di debug è visibile
  // Questo elimina completamente overhead e re-render durante lo scrolling e l'uso normale
  const addLog = useCallback((type: LogEntry["type"], text: string) => {
    if (!showDebugRef.current) {
      return;
    }
    const entry: LogEntry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      text,
    };
    logsRef.current = [entry, ...logsRef.current.slice(0, 49)];
    setLogs([...logsRef.current]);
  }, []);

  // Health-check loop: attende che il server risponda su http://127.0.0.1:8085/api/health
  const waitForBackend = useCallback(async (maxRetries = 80): Promise<boolean> => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetch("http://127.0.0.1:8085/api/health", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as { ok?: boolean; backend?: boolean } | null;
          if (data?.backend) {
            return true;
          }
        }
      } catch {
        // Attende che sia il proxy sia il backend completino il binding
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }, []);

  const runProbe = useCallback(async () => {
    setProbing(true);
    const start = performance.now();
    try {
      const res = await fetch("http://127.0.0.1:8085/", {
        method: "GET",
        cache: "no-store",
      });
      const durationMs = Math.round(performance.now() - start);
      const headersObj: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headersObj[k] = v;
      });
      const csp = res.headers.get("Content-Security-Policy");
      const text = await res.text();
      const snippet = text.slice(0, 300).replace(/\s+/g, " ");

      const result: ProbeResult = {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        durationMs,
        headers: headersObj,
        csp,
        bodySnippet: snippet,
        timestamp: new Date().toLocaleTimeString(),
      };
      setProbeResult(result);
      addLog("info", `Probe HTTP completato: ${res.status} ${res.statusText} (${durationMs}ms)`);
    } catch (err) {
      const result: ProbeResult = {
        ok: false,
        error: String(err),
        timestamp: new Date().toLocaleTimeString(),
      };
      setProbeResult(result);
      addLog("error", `Probe HTTP fallito: ${String(err)}`);
    } finally {
      setProbing(false);
    }
  }, [addLog]);

  const workspaceRootRef = useRef(workspaceRoot);
  useEffect(() => {
    workspaceRootRef.current = workspaceRoot;
  }, [workspaceRoot]);

  const targetRouteRef = useRef(targetRoute);
  useEffect(() => {
    targetRouteRef.current = targetRoute;
  }, [targetRoute]);

  const onOpenSettingsRef = useRef(onOpenSettings);
  useEffect(() => {
    onOpenSettingsRef.current = onOpenSettings;
  }, [onOpenSettings]);

  const onOpenFileRef = useRef(onOpenFile);
  useEffect(() => {
    onOpenFileRef.current = onOpenFile;
  }, [onOpenFile]);

  const onRunInTerminalRef = useRef(onRunInTerminal);
  useEffect(() => {
    onRunInTerminalRef.current = onRunInTerminal;
  }, [onRunInTerminal]);

  const onCloseTerminalRef = useRef(onCloseTerminal);
  useEffect(() => {
    onCloseTerminalRef.current = onCloseTerminal;
  }, [onCloseTerminal]);

  const initialTargetScreenRef = useRef(targetScreen);

  const isStartingRef = useRef(false);
  const startBackend = useCallback(async (customWorkspace?: string | null) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setError(null);
    addLog("info", "Verifica ed avvio backend Antigravity...");
    const targetWs = customWorkspace !== undefined ? customWorkspace : workspaceRootRef.current;
    try {
      await invoke("start_antigravity_backend", { workspaceRoot: targetWs });
      addLog("info", "Backend dedicato avviato. Attesa risposta su porta 8085...");
      const ready = await waitForBackend();
      if (ready) {
        setIsReady(true);
        addLog("info", "Backend pronto e operativo su http://127.0.0.1:8085/");
        void runProbe();
      } else {
        const msg = "Il backend dedicato di Antigravity ha impiegato troppo tempo ad avviarsi.";
        setError(msg);
        addLog("error", msg);
      }
    } catch (e) {
      const msg = String(e);
      setError(msg);
      addLog("error", `Errore startBackend: ${msg}`);
    } finally {
      isStartingRef.current = false;
    }
  }, [waitForBackend, addLog, runProbe]);

  const handleInstallOrUpdate = useCallback(async () => {
    setInstalling(true);
    setError(null);
    addLog("info", "Avvio install_or_update_antigravity...");
    try {
      await invoke("install_or_update_antigravity");
      const res = await invoke<AntigravityStatus>("get_antigravity_status");
      setStatus(res);
      await startBackend();
    } catch (e) {
      const msg = String(e);
      setError(msg);
      addLog("error", `Errore aggiornamento: ${msg}`);
    } finally {
      setInstalling(false);
      setDownloadProgress(null);
    }
  }, [addLog, startBackend]);

  const loadStatus = useCallback(async () => {
    setChecking(true);
    setError(null);
    addLog("info", "Caricamento stato get_antigravity_status...");
    try {
      const res = await invoke<AntigravityStatus>("get_antigravity_status");
      setStatus(res);
      addLog("info", `Stato: installed=${res.installed}, version=${res.version}, update=${res.update_available}`);
      // Se installato, avviamo SEMPRE il backend (la presenza di un update non blocca l'esecuzione)
      if (res.installed) {
        void startBackend();
      } else {
        // Se primo avvio su installazione pulita, scarica e configura automaticamente il motore
        void handleInstallOrUpdate();
      }
    } catch (e) {
      const msg = String(e);
      setError(msg);
      addLog("error", `Errore loadStatus: ${msg}`);
    } finally {
      setChecking(false);
    }
  }, [startBackend, handleInstallOrUpdate, addLog]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Aggiornamento automatico in tempo reale del pannello al termine di un update di Antigravity
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let mounted = true;
    listen("terax:antigravity-updated", () => {
      addLog("info", "Rilevato aggiornamento Antigravity: ricarico stato e riavvio backend...");
      void loadStatus();
      setReloadKey((k) => k + 1);
    })
      .then((fn) => {
        if (mounted) unlisten = fn;
        else fn();
      })
      .catch((err) => {
        console.warn("Impossibile registrare ascoltatore terax:antigravity-updated:", err);
      });

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, [loadStatus, addLog]);

  // Se il workspace cambia, aggiorna in background senza disattivare l'interfaccia
  const prevWorkspaceRef = useRef(workspaceRoot);
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    if (prevWorkspaceRef.current !== workspaceRoot) {
      prevWorkspaceRef.current = workspaceRoot;
      if (status?.installed) {
        void invoke("start_antigravity_backend", { workspaceRoot }).catch((err) => {
          console.warn("Aggiornamento workspace Antigravity:", err);
        });
      }
    }
  }, [workspaceRoot, status?.installed]);

  // Ascolta messaggi postMessage, gestisce il bridge JSON-RPC ed errori globali
  useEffect(() => {
    const handleMessage = (ev: MessageEvent) => {
      // Ignora messaggi inviati dalla finestra principale a se stessa
      if (ev.source === window) {
        return;
      }

      // Isola i messaggi: se questo pannello ha un iframe attivo, ignora messaggi da altri iframe
      if (iframeRef.current?.contentWindow && ev.source !== iframeRef.current.contentWindow) {
        return;
      }

      const data = ev.data;
      if (data && typeof data === "object") {
        // Gestione RPC per Antigravity Extension API
        if (
          data.type === "postmessage-rpc" &&
          data.channel === "agy-ext-extension-api" &&
          typeof data.requestId === "number"
        ) {
          const rpcPath = String(data.rpcPath || "");
          const lowerRpc = rpcPath.toLowerCase();
          let replyPayload: unknown = {};

          if (lowerRpc.includes("storagegetitems")) {
            const requestedKeys = (data.payload as { keys?: string[] })?.keys;
            const currentData = getStoredAntigravityData();
            if (requestedKeys && requestedKeys.length > 0) {
              const filtered: Record<string, string> = {};
              for (const k of requestedKeys) {
                if (k in currentData) {
                  filtered[k] = String(currentData[k] ?? "");
                } else if (
                  k === "jetski.onboarding.welcomeModalSeen" ||
                  k === "jetski.onboarding.completed" ||
                  k === "jetski.onboarding.hasCompletedOnboarding"
                ) {
                  filtered[k] = "true";
                } else if (k === "jetski.onboarding.lastLoginIsGcpTos") {
                  filtered[k] = "false";
                } else if (k === "jetski.acceptedTermsVersion") {
                  filtered[k] = "1";
                } else if (k === "jetski.telemetry.enabled") {
                  filtered[k] = "true";
                }
              }
              replyPayload = { items: filtered };
            } else {
              const sanitized: Record<string, string> = {};
              for (const [k, v] of Object.entries(currentData)) {
                sanitized[k] = String(v ?? "");
              }
              replyPayload = { items: sanitized };
            }
          } else if (lowerRpc.includes("storageupdateitems")) {
            const payload = data.payload as {
              items?: Record<string, unknown>;
              keysToDelete?: string[];
              keys_to_delete?: string[];
            };
            const updates = payload?.items || {};
            const keysToDelete = payload?.keysToDelete || payload?.keys_to_delete || [];
            const currentData = getStoredAntigravityData();

            for (const [k, v] of Object.entries(updates)) {
              currentData[k] = typeof v === "string" ? v : String(v ?? "");
            }
            for (const key of keysToDelete) {
              delete currentData[key];
            }

            saveStoredAntigravityData(currentData);
            replyPayload = {};
          } else if (lowerRpc.includes("geteditorstate")) {
            replyPayload = { activeDocument: null, otherDocuments: [] };
          } else if (lowerRpc.includes("opensettings")) {
            const screen =
              (data.payload as { targetScreen?: string; target_screen?: string })?.targetScreen ||
              (data.payload as { targetScreen?: string; target_screen?: string })?.target_screen ||
              "General";
            // Se siamo già nella vista standalone delle impostazioni, l'interfaccia interna gestisce già
            // navigazione e scroll delle sezioni: non notifichiamo il genitore per evitare cicli di re-render
            if (!targetRouteRef.current?.includes("settings-standalone")) {
              onOpenSettingsRef.current?.(screen);
            }
            replyPayload = {};
          } else if (lowerRpc.includes("reportfeedbackmetadata")) {
            // Chiamata interna di telemetria/metadata di Antigravity: non aprire la schermata feedback
            replyPayload = {};
          } else if (lowerRpc.includes("providefeedback")) {
            // Richiesta esplicita dell'utente di aprire il feedback
            if (!targetRouteRef.current?.includes("settings-standalone")) {
              onOpenSettingsRef.current?.("Provide Feedback");
            }
            replyPayload = {};
          } else if (lowerRpc.includes("openurl")) {
            const rawUrl =
              (data.payload as { url?: string; uri?: string })?.url ||
              (data.payload as { url?: string; uri?: string })?.uri;
            if (rawUrl) {
              const lowerUrl = rawUrl.toLowerCase();
              // Se è un file locale, un artifact o un documento markdown/testo, aprilo come tab in TauCode
              if (
                lowerUrl.startsWith("file:") ||
                lowerUrl.endsWith(".md") ||
                lowerUrl.endsWith(".markdown") ||
                lowerUrl.includes("/brain/") ||
                lowerUrl.includes("\\brain\\") ||
                (!lowerUrl.startsWith("http:") &&
                  !lowerUrl.startsWith("https:") &&
                  !lowerUrl.startsWith("mailto:"))
              ) {
                void (async () => {
                  try {
                    const resolved = await invoke<AntigravityResolvedPath>(
                      "resolve_antigravity_path",
                      {
                        rawPath: rawUrl,
                        cascadeId: null,
                        workspaceRoot: workspaceRootRef.current || null,
                      },
                    );
                    if (resolved?.path) {
                      onOpenFileRef.current?.(
                        resolved.path,
                        true,
                        resolved.line ?? undefined,
                        resolved.title || undefined,
                      );
                    }
                  } catch (err) {
                    console.warn("[Antigravity RPC] Errore risoluzione openUrl:", err);
                    const fallbackClean = rawUrl
                      .replace(/^file:\/\/(localhost)?/i, "")
                      .replace(/^\/([a-zA-Z]:)/i, "$1");
                    onOpenFileRef.current?.(fallbackClean, true);
                  }
                })();
              } else {
                void openUrl(rawUrl);
              }
            }
            replyPayload = { success: true };
          } else if (
            lowerRpc.includes("openfile") ||
            lowerRpc.includes("openartifact")
          ) {
            const payload = data.payload as {
              fileUri?: string;
              file_uri?: string;
              filePath?: string;
              file_path?: string;
              path?: string;
              uri?: string;
              url?: string;
              cascadeId?: string;
              cascade_id?: string;
              line?: number;
              startLine?: number;
              title?: string;
              displayName?: string;
            };

            const rawPath =
              payload?.fileUri ||
              payload?.file_uri ||
              payload?.filePath ||
              payload?.file_path ||
              payload?.path ||
              payload?.uri ||
              payload?.url;

            const cascadeId = payload?.cascadeId || payload?.cascade_id;
            const line = payload?.line ?? payload?.startLine;
            const customTitle = payload?.title || payload?.displayName;

            if (rawPath) {
              void (async () => {
                try {
                  const resolved = await invoke<AntigravityResolvedPath>(
                    "resolve_antigravity_path",
                    {
                      rawPath,
                      cascadeId: cascadeId || null,
                      workspaceRoot: workspaceRootRef.current || null,
                    },
                  );
                  if (resolved?.path) {
                    onOpenFileRef.current?.(
                      resolved.path,
                      true,
                      resolved.line ?? line,
                      customTitle || resolved.title || undefined,
                    );
                  }
                } catch (err) {
                  console.warn("[Antigravity RPC] Errore risoluzione percorso:", err);
                  const fallbackClean = rawPath
                    .replace(/^file:\/\/(localhost)?/i, "")
                    .replace(/^\/([a-zA-Z]:)/i, "$1");
                  onOpenFileRef.current?.(
                    fallbackClean,
                    true,
                    line,
                    customTitle || undefined,
                  );
                }
              })();
            }

            replyPayload = { success: true };
          } else if (lowerRpc.includes("openterminal")) {
            const payload = data.payload as {
              conversationId?: string;
              cascadeId?: string;
              stepIndex?: number;
              command?: string;
              cwd?: string;
              title?: string;
            };

            const conversationId = payload?.conversationId || payload?.cascadeId;
            const stepIndex = payload?.stepIndex;

            if (payload?.command) {
              onRunInTerminalRef.current?.(
                payload.command,
                payload.cwd,
                payload.title || "AI Terminal",
              );
            } else if (conversationId && stepIndex != null) {
              void (async () => {
                try {
                  const logPath = await invoke<string | null>(
                    "resolve_antigravity_task_log",
                    {
                      conversationId,
                      stepIndex,
                    },
                  );
                  if (logPath) {
                    const tailCmd = navigator.userAgent.includes("Windows")
                      ? `powershell -NoExit -Command "Write-Host '--- [Live Output] Task #${stepIndex} ---' -ForegroundColor Cyan; Get-Content -Wait -Tail 30 '${logPath.replace(/'/g, "''")}'"`
                      : `tail -f '${logPath}'`;
                    onRunInTerminalRef.current?.(
                      tailCmd,
                      workspaceRootRef.current || undefined,
                      `Task #${stepIndex} Log`,
                    );
                  } else {
                    onRunInTerminalRef.current?.(
                      "",
                      workspaceRootRef.current || undefined,
                      `Task #${stepIndex}`,
                    );
                  }
                } catch {
                  onRunInTerminalRef.current?.(
                    "",
                    workspaceRootRef.current || undefined,
                    `Task #${stepIndex}`,
                  );
                }
              })();
            } else {
              onRunInTerminalRef.current?.(
                "",
                workspaceRootRef.current || undefined,
                "Terminale",
              );
            }
            replyPayload = { success: true };
          } else if (lowerRpc.includes("closeterminal")) {
            const payload = data.payload as {
              tabId?: number;
              title?: string;
              last?: boolean;
              all?: boolean;
            };
            onCloseTerminalRef.current?.(payload);
            replyPayload = { success: true };
          } else if (lowerRpc.includes("opendiff")) {
            const payload = data.payload as {
              fileUri?: string;
              file_uri?: string;
            };
            const rawPath = payload?.fileUri || payload?.file_uri;
            if (rawPath) {
              void (async () => {
                try {
                  const resolved = await invoke<AntigravityResolvedPath>(
                    "resolve_antigravity_path",
                    {
                      rawPath,
                      cascadeId: null,
                      workspaceRoot: workspaceRootRef.current || null,
                    },
                  );
                  if (resolved?.path) {
                    onOpenFileRef.current?.(resolved.path, true);
                  }
                } catch {}
              })();
            }
            replyPayload = { success: true };
          }

          const replyMessage = {
            type: "postmessage-rpc",
            channel: data.channel,
            requestId: data.requestId,
            error: false,
            payload: replyPayload,
          };

          try {
            if (ev.source && "postMessage" in ev.source) {
              (ev.source as WindowProxy).postMessage(replyMessage, "*");
            } else if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(replyMessage, "*");
            }
            if (showDebugRef.current) {
              addLog("info", `[RPC Bridge] Risposto con successo a ${rpcPath.split("/").pop()} (req #${data.requestId})`);
            }
          } catch (replyErr) {
            if (showDebugRef.current) {
              addLog("error", `[RPC Bridge] Errore invio risposta RPC: ${String(replyErr)}`);
            }
          }
          return;
        }

        if (showDebugRef.current) {
          let dataSummary = "";
          try {
            dataSummary = JSON.stringify(data).slice(0, 150);
          } catch {
            dataSummary = "[Dati non serializzabili]";
          }
          addLog("message", `postMessage da [${ev.origin || "unknown"}]: ${dataSummary}`);
        }
      }
    };

    const handleError = (ev: ErrorEvent) => {
      if (showDebugRef.current) {
        addLog("error", `Window Error: ${ev.message} (${ev.filename}:${ev.lineno})`);
      }
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("error", handleError);
    };
  }, [addLog]);



  const handleOpenExternal = async () => {
    try {
      addLog("info", `Apertura nel browser di sistema: ${iframeUrl}`);
      await openUrl(iframeUrl);
    } catch (e) {
      addLog("error", `Impossibile aprire browser esterno: ${String(e)}`);
    }
  };

  const handleCopyReport = async () => {
    const report = {
      timestamp: new Date().toISOString(),
      origin: window.location.origin,
      href: window.location.href,
      userAgent: navigator.userAgent,
      status,
      isReady,
      iframeLoaded,
      iframeError,
      iframeUrl,
      probeResult,
      recentLogs: logs,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addLog("info", "Report diagnostico copiato negli appunti.");
    } catch {
      addLog("error", "Errore nella copia del report negli appunti.");
    }
  };

  const workspaceUri = workspaceRoot
    ? `file:///${workspaceRoot.replace(/\\/g, "/")}`
    : "";

  const route = targetRoute ? `/${targetRoute.replace(/^\//, "")}` : "";
  const effectiveScreen = initialTargetScreenRef.current || (targetRoute?.includes("settings-standalone") ? "General" : undefined);
  const extraScreenParam = effectiveScreen ? `&targetScreen=${encodeURIComponent(effectiveScreen)}` : "";

  const iframeUrl = `http://127.0.0.1:8085${route}?useWebSocket=true&enableMicrophone=false&extensionView=true&extensionVariant=vs-code&hostTheme=${resolvedMode}${extraScreenParam}${
    workspaceUri ? `&workspaceUri=${encodeURIComponent(workspaceUri)}` : ""
  }`;

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const cspFrameAncestors = probeResult?.csp || "";
  const isCspSuspicious =
    cspFrameAncestors.length > 0 &&
    !cspFrameAncestors.includes(currentOrigin) &&
    !cspFrameAncestors.includes("localhost") &&
    !cspFrameAncestors.includes("127.0.0.1");


  return (
    <div ref={containerRef} className="flex h-full w-full flex-col bg-card">
      {/* Pane Body */}
      <div className="relative flex-1 min-h-0 bg-background overflow-hidden flex flex-col">
        {/* Schermata di caricamento / verifica iniziale */}
        {checking && (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <HugeiconsIcon icon={Loading03Icon} size={28} className="animate-spin text-primary mb-3" />
            <p className="text-xs text-muted-foreground">Verifica ambiente locale Antigravity...</p>
          </div>
        )}

        {/* Schermata Errore critico */}
        {!checking && error && (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive shadow-sm">
              <HugeiconsIcon icon={AlertCircleIcon} size={24} strokeWidth={2} />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">
              Errore di connessione / installazione
            </h3>
            <p className="mb-4 max-w-[340px] text-xs text-muted-foreground leading-relaxed break-words">
              {error}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadStatus()}
                className="gap-1.5 text-xs shadow-sm hover:bg-accent"
              >
                <HugeiconsIcon icon={Refresh01Icon} size={13} />
                Riprova
              </Button>
              <Button
                size="sm"
                onClick={() => void handleInstallOrUpdate()}
                className="gap-1.5 text-xs shadow-sm"
              >
                <HugeiconsIcon icon={Download01Icon} size={13} />
                Scarica / Reinstalla
              </Button>
            </div>
          </div>
        )}

        {/* Not Installed / Downloading State: Primo avvio */}
        {!checking && !error && (!status?.installed || installing) && (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="mb-5 flex items-center justify-center">
              <img
                src="/antigravity/antigravity.svg"
                alt="Antigravity Logo"
                className={`size-16 object-contain drop-shadow-md select-none pointer-events-none ${installing ? "animate-pulse" : ""}`}
              />
            </div>
            <h3 className="mb-1.5 text-base font-semibold text-foreground">
              {installing ? "Configurazione motore AI Antigravity" : "Installa Antigravity nell'IDE"}
            </h3>
            <p className="mb-4 max-w-[340px] text-xs leading-relaxed text-muted-foreground">
              {installing
                ? "Download e configurazione del runtime locale isolato in corso..."
                : "Questo IDE utilizza una copia dedicata e isolata di Antigravity nei propri dati locali."}
            </p>

            {installing && (
              <div className="w-full max-w-[280px] flex flex-col gap-2">
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border/40">
                  <div
                    className="bg-primary h-full transition-all duration-200 ease-out"
                    style={{ width: `${Math.max(5, Math.min(100, downloadProgress?.percentage ?? 10))}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] text-muted-foreground font-mono">
                  <span>{downloadProgress?.phase === "installing" ? "Installazione in corso..." : `${(downloadProgress?.percentage ?? 0).toFixed(0)}%`}</span>
                  <span>
                    {downloadProgress
                      ? `${(downloadProgress.downloaded / (1024 * 1024)).toFixed(1)} MB` +
                        (downloadProgress.total ? ` / ${(downloadProgress.total / (1024 * 1024)).toFixed(1)} MB` : "")
                      : "Preparazione..."}
                  </span>
                </div>
              </div>
            )}

            {!installing && (
              <div className="flex flex-col items-center gap-2 mt-2">
                <Button
                  onClick={handleInstallOrUpdate}
                  size="default"
                  className="gap-2 px-6 text-xs font-medium shadow-sm transition-all"
                >
                  <HugeiconsIcon icon={Download01Icon} size={15} strokeWidth={2} />
                  Installa ora
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Loading / Starting State */}
        {!checking && !error && status?.installed && !isReady && !installing && (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="mb-5 flex size-14 items-center justify-center">
              <img
                src="/antigravity/antigravity.svg"
                alt="Antigravity Logo"
                className="size-14 object-contain animate-pulse select-none pointer-events-none"
              />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">
              Avvio del motore Antigravity dedicato
            </h3>
            <p className="max-w-[280px] text-xs text-muted-foreground leading-relaxed">
              Inizializzazione del processo locale isolato...
            </p>
          </div>
        )}

        {/* Active Iframe */}
        {!checking && !error && isReady && (
          <div className="relative flex-1 w-full h-full min-h-0 bg-background overflow-hidden overscroll-contain">
            {!iframeLoaded && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none transition-opacity duration-300">
                <HugeiconsIcon icon={Loading03Icon} size={22} className="animate-spin text-primary mb-2" />
                <span className="text-xs text-muted-foreground font-medium">Caricamento workspace...</span>
              </div>
            )}
            {iframeError && (
              <div className="absolute top-0 inset-x-0 z-20 p-3 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs">
                <strong>Errore Iframe:</strong> {iframeError}
              </div>
            )}
            <iframe
              key={`${reloadKey}-${targetRoute || "main"}`}
              ref={iframeRef}
              src={iframeUrl}
              className="absolute inset-0 h-full w-full border-0 bg-background overscroll-contain"
              allow="clipboard-read; clipboard-write;"
              title="Antigravity AI"
              onLoad={() => {
                setIframeLoaded(true);
                setIframeError(null);
                if (showDebugRef.current) {
                  addLog("info", "Evento iframe.onLoad scattato con successo.");
                }
              }}
              onError={(e) => {
                const msg = `iframe.onError scattato: ${String(e)}`;
                setIframeError(msg);
                if (showDebugRef.current) {
                  addLog("error", msg);
                }
              }}
            />
          </div>
        )}

        {/* PANNELLO DI DEBUG PESANTE (OVERLAY / DOCK IN BASSO) */}
        {showDebug && (
          <div className="border-t border-border bg-card/95 backdrop-blur shadow-2xl flex flex-col max-h-[45%] min-h-[220px] overflow-hidden select-text z-50">
            {/* Header barra debug */}
            <div className="flex h-7 items-center justify-between border-b border-border/60 bg-muted/40 px-3 text-[11px] font-mono">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-primary">DEBUG PANNELLO ANTIGRAVITY</span>
                <span className="text-muted-foreground">|</span>
                <span>Host Origin: <strong className="text-foreground">{currentOrigin}</strong></span>
                <span className="text-muted-foreground">|</span>
                <span>
                  Iframe:{" "}
                  <strong className={iframeLoaded ? "text-emerald-500" : "text-amber-500"}>
                    {iframeLoaded ? "Caricato (onLoad)" : "In attesa onLoad..."}
                  </strong>
                </span>
                {iframeError && <span className="text-destructive font-semibold">[{iframeError}]</span>}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setReloadKey((k) => k + 1);
                    setIframeLoaded(false);
                    addLog("info", "Ricarica forzata dell'Iframe...");
                  }}
                  className="rounded px-2 py-0.5 text-[10px] bg-muted hover:bg-accent text-foreground transition-colors"
                >
                  Ricarica Iframe
                </button>

                <button
                  type="button"
                  onClick={() => void runProbe()}
                  disabled={probing}
                  className="rounded px-2 py-0.5 text-[10px] bg-muted hover:bg-accent text-foreground transition-colors"
                >
                  {probing ? "Test in corso..." : "Test HTTP"}
                </button>

                <button
                  type="button"
                  onClick={handleCopyReport}
                  className="rounded px-2 py-0.5 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary font-medium transition-colors flex items-center gap-1"
                >
                  <HugeiconsIcon icon={copied ? CheckmarkCircle01Icon : Copy01Icon} size={11} />
                  {copied ? "Copiato!" : "Copia Report"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowDebug(false)}
                  className="ml-2 text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} />
                </button>
              </div>
            </div>

            {/* Contenuto debug a 3 colonne */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2 p-2 overflow-y-auto text-[10px] font-mono">
              {/* Colonna 1: Dettagli Connessione & CSP */}
              <div className="rounded border border-border/60 bg-background/50 p-2 flex flex-col gap-1.5 overflow-hidden">
                <div className="font-semibold text-foreground text-[11px] pb-1 border-b border-border/40">
                  1. Parametri & CSP
                </div>
                <div className="truncate">
                  <span className="text-muted-foreground">URL Iframe: </span>
                  <span className="text-foreground font-mono select-all break-all">{iframeUrl}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tema Host: </span>
                  <span className="text-foreground">{resolvedMode}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Workspace: </span>
                  <span className="text-foreground">{workspaceRoot || "Nessun workspace aperto"}</span>
                </div>

                {/* CSP Alert */}
                {isCspSuspicious ? (
                  <div className="rounded bg-destructive/10 border border-destructive/30 p-1.5 text-destructive text-[10px] leading-tight">
                    <strong>ATTENZIONE CSP:</strong> Il backend impone <code>frame-ancestors</code> che potrebbe non includere l'origin dell'app ({currentOrigin}). Se la finestra resta bianca, il browser WebView2 ha bloccato il frame per sicurezza.
                  </div>
                ) : (
                  <div className="rounded bg-muted/40 p-1 text-muted-foreground text-[9px]">
                    CSP Ricevuto: {probeResult?.csp ? probeResult.csp.slice(0, 80) + "..." : "Non ancora verificato"}
                  </div>
                )}

                <div className="mt-auto pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenExternal}
                    className="w-full h-6 text-[10px] gap-1"
                  >
                    <HugeiconsIcon icon={Globe02Icon} size={11} />
                    Apri subito in Chrome / Edge
                  </Button>
                </div>
              </div>

              {/* Colonna 2: Test HTTP Backend */}
              <div className="rounded border border-border/60 bg-background/50 p-2 flex flex-col gap-1 overflow-hidden">
                <div className="font-semibold text-foreground text-[11px] pb-1 border-b border-border/40 flex items-center justify-between">
                  <span>2. Probe HTTP :8085</span>
                  {probeResult && (
                    <span className={probeResult.ok ? "text-emerald-500 font-bold" : "text-destructive font-bold"}>
                      {probeResult.ok ? `HTTP ${probeResult.status}` : "ERRORE"}
                    </span>
                  )}
                </div>

                {probeResult ? (
                  <div className="flex flex-col gap-1 overflow-y-auto">
                    <div>
                      <span className="text-muted-foreground">Stato: </span>
                      <span className="font-semibold">{probeResult.status} {probeResult.statusText}</span> ({probeResult.durationMs}ms)
                    </div>
                    {probeResult.headers?.["content-type"] && (
                      <div>
                        <span className="text-muted-foreground">Content-Type: </span>
                        <span>{probeResult.headers["content-type"]}</span>
                      </div>
                    )}
                    {probeResult.bodySnippet && (
                      <div className="mt-1">
                        <span className="text-muted-foreground">Anteprima HTML:</span>
                        <pre className="rounded bg-muted/50 p-1 text-[9px] text-muted-foreground overflow-hidden whitespace-pre-wrap">
                          {probeResult.bodySnippet}
                        </pre>
                      </div>
                    )}
                    {probeResult.error && (
                      <div className="text-destructive font-bold">{probeResult.error}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-muted-foreground py-4 text-center">
                    Nessun probe eseguito. Clicca &quot;Test HTTP&quot; in alto.
                  </div>
                )}
              </div>

              {/* Colonna 3: Log in tempo reale */}
              <div className="rounded border border-border/60 bg-background/50 p-2 flex flex-col gap-1 overflow-hidden">
                <div className="font-semibold text-foreground text-[11px] pb-1 border-b border-border/40 flex items-center justify-between">
                  <span>3. Log Eventi ({logs.length})</span>
                  <button
                    type="button"
                    onClick={() => setLogs([])}
                    className="text-[9px] text-muted-foreground hover:text-foreground"
                  >
                    Svuota
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
                  {logs.length === 0 ? (
                    <span className="text-muted-foreground text-center py-4">In ascolto eventi...</span>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="leading-tight break-all border-b border-border/20 pb-0.5">
                        <span className="text-muted-foreground text-[9px] mr-1">[{log.timestamp}]</span>
                        <span
                          className={
                            log.type === "error"
                              ? "text-destructive font-semibold"
                              : log.type === "warn"
                              ? "text-amber-500"
                              : log.type === "message"
                              ? "text-sky-500"
                              : "text-foreground"
                          }
                        >
                          {log.text}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const AntigravityPane = memo(AntigravityPaneComponent);
