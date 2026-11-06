import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useExtensionsStore } from "../store";
import type { ExtensionTab } from "@/modules/tabs/lib/useTabs";
import { Button } from "@/components/ui/button";
import { Loading03Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface ExtensionTabHostProps {
  tab: ExtensionTab;
  workspaceRoot: string | null;
  onClose?: () => void;
  onOpenFile?: (path: string, pin?: boolean, line?: number, customTitle?: string) => void;
  onRunInTerminal?: (command: string, cwd?: string, title?: string, autoClose?: boolean) => void;
}

export function ExtensionTabHost({
  tab,
  workspaceRoot,
  onClose,
  onOpenFile,
  onRunInTerminal,
}: ExtensionTabHostProps) {
  const extensions = useExtensionsStore((state) => state.extensions);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Trova estensione e contributo tab
  const extension = extensions.find((e) => e.id === tab.extensionId);
  const isEnabled = extension?.enabled ?? false;
  const tabContrib = extension?.contributes?.tabs?.find(
    (t) => t.id === tab.tabContributionId,
  );

  useEffect(() => {
    if (!extension) {
      setError(`Estensione "${tab.extensionId}" non trovata o disinstallata.`);
      setLoading(false);
      return;
    }
    if (!isEnabled) {
      setError(`L'estensione "${extension.display_name || extension.name}" è attualmente disattivata.`);
      setLoading(false);
      return;
    }
    if (!tabContrib) {
      setError(`Scheda "${tab.tabContributionId}" non dichiarata nei contributi dell'estensione.`);
      setLoading(false);
      return;
    }
    setError(null);
  }, [extension, isEnabled, tabContrib, tab.extensionId, tab.tabContributionId]);

  // Gestione messaggi bidirezionali con l'iframe dell'estensione
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      const { type, payload } = event.data;

      switch (type) {
        case "taucode:openFile":
          if (payload?.path && onOpenFile) {
            onOpenFile(payload.path, payload.pin, payload.line, payload.customTitle);
          }
          break;
        case "taucode:runTerminal":
          if (payload?.command && onRunInTerminal) {
            onRunInTerminal(payload.command, payload.cwd || workspaceRoot || undefined, payload.title);
          }
          break;
        case "taucode:closeCurrentTab":
          if (onClose) {
            onClose();
          }
          break;
        case "taucode:ready":
          sendInitPayload();
          break;
        default:
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onOpenFile, onRunInTerminal, onClose, workspaceRoot]);

  const sendInitPayload = () => {
    if (!iframeRef.current?.contentWindow) return;
    const isDark = document.documentElement.classList.contains("dark");
    iframeRef.current.contentWindow.postMessage(
      {
        type: "taucode:init",
        payload: {
          extensionId: tab.extensionId,
          tabId: tab.tabContributionId,
          filePath: tab.path,
          params: tab.params,
          workspaceRoot,
          theme: isDark ? "dark" : "light",
        },
      },
      "*",
    );
  };

  const handleIframeLoad = () => {
    setLoading(false);
    sendInitPayload();
  };

  if (error || !extension || !tabContrib) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none bg-background">
        <div className="size-12 rounded-xl bg-muted/40 border border-border/40 flex items-center justify-center text-muted-foreground mb-3">
          <HugeiconsIcon icon={PackageIcon} size={24} />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Scheda Estensione non disponibile</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          {error || "Impossibile caricare il contenuto della scheda."}
        </p>
        <div className="flex items-center gap-2 mt-4">
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-xs">
              Chiudi Scheda
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Costruisci URL generico della pagina dell'estensione
  const cleanEntry = (tabContrib.entry || "index.html").replace(/^[\\/]/, "");
  let baseIframeSrc: string;
  if (cleanEntry.startsWith("http://") || cleanEntry.startsWith("https://")) {
    baseIframeSrc = cleanEntry;
  } else {
    const rawAsset = convertFileSrc(`${extension.dir_path}/${cleanEntry}`.replace(/\\/g, "/"));
    baseIframeSrc = rawAsset.replace(/%2F/gi, "/").replace(/%5C/gi, "/");
  }

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const queryParts: string[] = [];
  queryParts.push(`theme=${isDark ? "dark" : "light"}`);
  if (tab.path) {
    queryParts.push(`file=${encodeURIComponent(tab.path)}`);
    queryParts.push(`model=${encodeURIComponent(tab.path)}`);
  }
  if (tab.id) {
    queryParts.push(`tabId=${tab.id}`);
  }
  if (tab.params) {
    for (const [k, v] of Object.entries(tab.params)) {
      queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }

  const sep = baseIframeSrc.includes("?") ? "&" : "?";
  const iframeSrc = `${baseIframeSrc}${sep}${queryParts.join("&")}`;

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-background">
      <div className="relative flex-1 w-full min-h-0 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-xs text-xs text-muted-foreground gap-2">
            <HugeiconsIcon icon={Loading03Icon} size={18} className="animate-spin text-primary" />
            <span>Caricamento scheda estensione...</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title={tabContrib.title || tab.title}
          onLoad={handleIframeLoad}
          className="w-full h-full border-0 bg-background"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
        />
      </div>
    </div>
  );
}
