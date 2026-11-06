import { useState, useEffect, useMemo, useRef } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionHeader } from "../components/SectionHeader";
import { useExtensionsStore } from "@/modules/extensions/store";
import { ExtensionCard } from "@/modules/extensions/components/ExtensionCard";
import {
  Add01Icon,
  PackageIcon,
  Search01Icon,
  Folder01Icon,
  SourceCodeIcon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

export function ExtensionsSection() {
  const {
    extensions,
    isLoading,
    error,
    searchQuery,
    filter,
    setSearchQuery,
    setFilter,
    loadExtensions,
    initWatcher,
    installZip,
    installGit,
  } = useExtensionsStore();

  const [isEnteringLink, setIsEnteringLink] = useState(false);
  const [gitUrl, setGitUrl] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cleanup = initWatcher();
    return cleanup;
  }, [initWatcher]);

  useEffect(() => {
    if (isEnteringLink) {
      setTimeout(() => {
        linkInputRef.current?.focus();
      }, 50);
    }
  }, [isEnteringLink]);

  const handleDirectImport = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "TauCode Extension (*.tauext, *.zip)",
            extensions: ["tauext", "zip"],
          },
        ],
      });
      if (selected && typeof selected === "string") {
        await installZip(selected);
        toast.success("Estensione installata con successo!");
      }
    } catch (err) {
      toast.error(`Errore installazione estensione: ${err}`);
    }
  };

  const handleInstallGit = async () => {
    const trimmed = gitUrl.trim();
    if (!trimmed || isCloning) return;
    setIsCloning(true);
    try {
      await installGit(trimmed);
      toast.success("Estensione clonata e installata con successo!");
      setIsEnteringLink(false);
      setGitUrl("");
    } catch (err) {
      toast.error(`Errore installazione: ${err}`);
    } finally {
      setIsCloning(false);
    }
  };

  const filteredExtensions = useMemo(() => {
    return extensions.filter((ext) => {
      // 1. Status Filter
      if (filter === "enabled" && !ext.enabled) return false;
      if (filter === "disabled" && ext.enabled) return false;

      // 2. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (ext.display_name || ext.name).toLowerCase().includes(q);
        const matchesDesc = (ext.description || "").toLowerCase().includes(q);
        const matchesAuthor = (ext.author || "").toLowerCase().includes(q);
        const matchesId = ext.id.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesAuthor && !matchesId) {
          return false;
        }
      }

      return true;
    });
  }, [extensions, filter, searchQuery]);

  const enabledCount = useMemo(() => extensions.filter((e) => e.enabled).length, [extensions]);
  const disabledCount = useMemo(() => extensions.filter((e) => !e.enabled).length, [extensions]);

  return (
    <div className="flex flex-col gap-6 select-none">
      {/* Intestazione Sezione */}
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          title="Estensioni"
          description="Gestisci e potenzia TauCode con estensioni dedicate: schede personalizzate, sezioni impostazioni, skill AI e server MCP."
        />

        {/* Spazio inserimento link inline oppure pulsante con menu */}
        {isEnteringLink ? (
          <div className="flex items-center gap-1.5 shrink-0 animate-in fade-in duration-200">
            <div className="relative">
              <Input
                ref={linkInputRef}
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleInstallGit();
                  } else if (e.key === "Escape") {
                    setIsEnteringLink(false);
                    setGitUrl("");
                  }
                }}
                placeholder="Incolla link repository (es. https://github.com/...)"
                className="h-7 w-80 text-xs bg-card border-border font-mono pr-7 pl-2.5 shadow-xs"
                disabled={isCloning}
              />
              {gitUrl && !isCloning && (
                <button
                  type="button"
                  onClick={() => setGitUrl("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleInstallGit}
              disabled={isCloning || !gitUrl.trim()}
              className="h-7 px-3 text-xs gap-1.5 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
            >
              {isCloning ? <Spinner className="size-3" /> : null}
              <span>{isCloning ? "Clonazione..." : "Installa"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsEnteringLink(false);
                setGitUrl("");
              }}
              disabled={isCloning}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              title="Annulla (Esc)"
            >
              ✕
            </Button>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs cursor-pointer"
              >
                <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={2} />
                <span>Installa Estensione</span>
                <HugeiconsIcon icon={ArrowDown01Icon} size={11} className="opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border-border shadow-md">
              <DropdownMenuItem
                onClick={handleDirectImport}
                className="text-xs gap-2 cursor-pointer py-2 focus:bg-accent"
              >
                <HugeiconsIcon icon={Folder01Icon} size={15} className="text-muted-foreground shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">Importa da file</span>
                  <span className="text-[10px] text-muted-foreground">Apri Esplora Risorse (.tauext, .zip)</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setIsEnteringLink(true);
                }}
                className="text-xs gap-2 cursor-pointer py-2 focus:bg-accent"
              >
                <HugeiconsIcon icon={SourceCodeIcon} size={15} className="text-muted-foreground shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">Inserisci link</span>
                  <span className="text-[10px] text-muted-foreground">Incolla URL repository</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Barra di ricerca e filtri */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <HugeiconsIcon
            icon={Search01Icon}
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca estensioni per nome, id, autore..."
            className="h-8 text-xs bg-card border-border pl-8"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              filter === "all"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tutte ({extensions.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("enabled")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              filter === "enabled"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Abilitate ({enabledCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("disabled")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              filter === "disabled"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Disabilitate ({disabledCount})
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={loadExtensions} className="h-6 text-xs">
            Riprova
          </Button>
        </div>
      )}

      {/* Extension List / Empty State */}
      {isLoading && extensions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Spinner className="size-6" />
          <span className="text-xs">Caricamento estensioni in corso...</span>
        </div>
      ) : filteredExtensions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg border border-border bg-card text-center p-6 shadow-xs">
          <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
            <HugeiconsIcon icon={PackageIcon} size={20} />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            {searchQuery ? "Nessuna estensione corrispondente" : "Nessuna estensione installata"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            {searchQuery
              ? "Prova a modificare i filtri o il termine di ricerca inserito."
              : "Puoi installare un'estensione locale in formato .tauext/.zip oppure clonarla direttamente da GitHub."}
          </p>
          {!searchQuery && (
            <div className="mt-4">
              {isEnteringLink ? (
                <div className="flex items-center gap-1.5 justify-center">
                  <Input
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void handleInstallGit();
                      } else if (e.key === "Escape") {
                        setIsEnteringLink(false);
                        setGitUrl("");
                      }
                    }}
                    placeholder="https://github.com/autore/estensione..."
                    className="h-7 w-72 text-xs bg-background border-border font-mono pl-2.5"
                    disabled={isCloning}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={handleInstallGit}
                    disabled={isCloning || !gitUrl.trim()}
                    className="h-7 px-3 text-xs gap-1.5 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {isCloning ? <Spinner className="size-3" /> : null}
                    <span>{isCloning ? "Clonazione..." : "Installa"}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEnteringLink(false);
                      setGitUrl("");
                    }}
                    disabled={isCloning}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1.5 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                    >
                      <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={2} />
                      <span>Installa Estensione</span>
                      <HugeiconsIcon icon={ArrowDown01Icon} size={11} className="opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-56 bg-card border-border shadow-md">
                    <DropdownMenuItem
                      onClick={handleDirectImport}
                      className="text-xs gap-2 cursor-pointer py-2 focus:bg-accent"
                    >
                      <HugeiconsIcon icon={Folder01Icon} size={15} className="text-muted-foreground shrink-0" />
                      <div className="flex flex-col text-left">
                        <span className="font-medium text-foreground">Importa da file</span>
                        <span className="text-[10px] text-muted-foreground">Apri Esplora Risorse (.tauext, .zip)</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setIsEnteringLink(true);
                      }}
                      className="text-xs gap-2 cursor-pointer py-2 focus:bg-accent"
                    >
                      <HugeiconsIcon icon={SourceCodeIcon} size={15} className="text-muted-foreground shrink-0" />
                      <div className="flex flex-col text-left">
                        <span className="font-medium text-foreground">Inserisci link</span>
                        <span className="text-[10px] text-muted-foreground">Incolla URL repository</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredExtensions.map((ext) => (
            <ExtensionCard key={ext.id} extension={ext} />
          ))}
        </div>
      )}
    </div>
  );
}
