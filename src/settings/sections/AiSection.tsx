import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";
import {
  Download01Icon,
  Refresh01Icon,
  Loading03Icon,
  Add01Icon,
  Edit02Icon,
  Delete02Icon,
  Folder01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  SourceCodeIcon,
  FolderUploadIcon,
  FileUploadIcon,
  ServerStack03Icon,
  PackageIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { listen } from "@tauri-apps/api/event";
import {
  type SkillInfo,
  type McpServerInfo,
  type SkillProjectInfo,
  openSkillAsWorkspace,
  isDefaultGeminiSkill,
} from "@/modules/antigravity/skillUtils";

interface ImportSkillResult {
  count: number;
  skills: SkillInfo[];
  imported_skills?: SkillInfo[];
  errors: string[];
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

export function AiSection() {
  const [status, setStatus] = useState<AntigravityStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<AntigravityDownloadProgress | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);

  // Stato espansione cartelle (default aperte)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const [creatingSkill, setCreatingSkill] = useState(false);
  const [importingSkill, setImportingSkill] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Modale Rinomina Cartella
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState(false);

  // Modale Nuova Cartella
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [createFolderName, setCreateFolderName] = useState("");

  // Modale conferma eliminazione skill
  const [skillToDelete, setSkillToDelete] = useState<SkillInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Stato Server MCP
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [expandedMcpFolders, setExpandedMcpFolders] = useState<Record<string, boolean>>({});
  const [serverToDelete, setServerToDelete] = useState<McpServerInfo | null>(null);
  const [deletingServer, setDeletingServer] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await invoke<AntigravityStatus>("get_antigravity_status");
      setStatus(res);
    } catch (e) {
      setStatusError(String(e));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const res = await invoke<SkillInfo[]>("list_antigravity_skills");
      setSkills(res);
    } catch (e) {
      console.error("Errore caricamento skill:", e);
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  const loadMcpServers = useCallback(async () => {
    setMcpLoading(true);
    try {
      const res = await invoke<McpServerInfo[]>("list_mcp_servers");
      setMcpServers(res);
    } catch (e) {
      console.error("Errore caricamento server MCP:", e);
    } finally {
      setMcpLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadSkills();
    void loadMcpServers();

    const unlistenPromise = listen("terax:extensions-updated", () => {
      void loadSkills();
      void loadMcpServers();
    });

    const unlistenStatusPromise = listen("terax:antigravity-updated", () => {
      void loadStatus();
    });

    return () => {
      unlistenPromise.then((fn) => fn());
      unlistenStatusPromise.then((fn) => fn());
    };
  }, [loadStatus, loadSkills, loadMcpServers]);

  // Raggruppamento delle skill per cartella (con cartelle dedicate per ciascuna estensione e Built-in)
  const groupedSkills = useMemo(() => {
    const map: Record<string, SkillInfo[]> = {};
    for (const skill of skills) {
      const isBuiltin =
        skill.is_default ||
        skill.folder?.toLowerCase() === "built-in" ||
        skill.folder?.toLowerCase() === "builtin" ||
        isDefaultGeminiSkill(skill.name);

      const folder =
        skill.extension_name || skill.extension_id
          ? (skill.extension_name || skill.extension_id)!
          : isBuiltin
            ? "Built-in"
            : skill.folder?.trim() || "Generali";
      if (!map[folder]) map[folder] = [];
      map[folder].push(skill);
    }
    return map;
  }, [skills]);

  const folders = useMemo(() => {
    const keys = Object.keys(groupedSkills);
    return keys.sort((a, b) => {
      if (a === "Built-in") return -1;
      if (b === "Built-in") return 1;
      const aIsExt = groupedSkills[a]?.some((s) => Boolean(s.extension_id || s.extension_name));
      const bIsExt = groupedSkills[b]?.some((s) => Boolean(s.extension_id || s.extension_name));
      if (!aIsExt && bIsExt) return -1;
      if (aIsExt && !bIsExt) return 1;
      if (a === "Generali") return -1;
      if (b === "Generali") return 1;
      return a.localeCompare(b);
    });
  }, [groupedSkills]);

  // Raggruppamento dei Server MCP per cartella (con cartelle dedicate per ciascuna estensione)
  const groupedMcp = useMemo(() => {
    const map: Record<string, McpServerInfo[]> = {};
    for (const server of mcpServers) {
      const folder =
        server.extension_name || server.extension_id
          ? (server.extension_name || server.extension_id)!
          : "Server MCP Globali";
      if (!map[folder]) map[folder] = [];
      map[folder].push(server);
    }
    return map;
  }, [mcpServers]);

  const mcpFolders = useMemo(() => {
    const keys = Object.keys(groupedMcp);
    return keys.sort((a, b) => {
      const aIsExt = groupedMcp[a]?.some((s) => Boolean(s.is_extension_provided || s.extension_id || s.extension_name));
      const bIsExt = groupedMcp[b]?.some((s) => Boolean(s.is_extension_provided || s.extension_id || s.extension_name));
      if (!aIsExt && bIsExt) return -1;
      if (aIsExt && !bIsExt) return 1;
      if (a === "Server MCP Globali") return -1;
      if (b === "Server MCP Globali") return 1;
      return a.localeCompare(b);
    });
  }, [groupedMcp]);

  const toggleFolderExpand = useCallback((folder: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folder]: prev[folder] === undefined ? false : !prev[folder],
    }));
  }, []);

  const toggleMcpFolderExpand = useCallback((folder: string) => {
    setExpandedMcpFolders((prev) => ({
      ...prev,
      [folder]: prev[folder] === undefined ? false : !prev[folder],
    }));
  }, []);

  const handleToggleMcpFolder = async (folder: string) => {
    const folderServers = groupedMcp[folder] || [];
    if (folderServers.length === 0) return;
    const allEnabled = folderServers.every((s) => s.enabled);
    const newEnabled = !allEnabled;

    try {
      await Promise.all(
        folderServers.map((s) =>
          invoke("toggle_mcp_server", {
            name: s.name,
            enabled: newEnabled,
          })
        )
      );
      toast.success(
        newEnabled
          ? `Tutti i server MCP in "${folder}" sono stati attivati`
          : `Tutti i server MCP in "${folder}" sono stati disattivati`
      );
      await loadMcpServers();
    } catch (e) {
      toast.error(`Errore aggiornamento server MCP in ${folder}: ${e}`);
    }
  };

  const handleInstallOrUpdate = async () => {
    setInstalling(true);
    setStatusError(null);
    setDownloadProgress(null);

    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listen<AntigravityDownloadProgress>(
        "antigravity-download-progress",
        (event) => {
          setDownloadProgress(event.payload);
        }
      );

      await invoke("install_or_update_antigravity");
      toast.success("Antigravity installato e aggiornato con successo!");
      await loadStatus();
      try {
        await invoke("start_antigravity_backend");
      } catch (err) {
        console.warn("[AiSection] Backend start warning:", err);
      }
    } catch (e) {
      setStatusError(String(e));
      toast.error(`Errore installazione: ${e}`);
    } finally {
      if (unlisten) unlisten();
      setInstalling(false);
      setDownloadProgress(null);
    }
  };

  const handleDirectCreateSkill = async (targetFolder?: string) => {
    if (creatingSkill) return;
    setCreatingSkill(true);
    try {
      const project = await invoke<SkillProjectInfo>("scaffold_antigravity_skill_project", {
        name: "",
        folder: targetFolder?.trim() || "Generali",
        description: undefined,
      });
      await loadSkills();
      openSkillAsWorkspace({
        name: project.name,
        path: project.path,
        entryFile: project.entry_file,
      });
    } catch (e) {
      console.error("Errore creazione skill:", e);
    } finally {
      setCreatingSkill(false);
    }
  };

  const handleOpenSkillWorkspace = useCallback((skill: SkillInfo) => {
    const dir = skill.dir || skill.path.replace(/[\\/][^\\/]+$/, "");
    openSkillAsWorkspace({
      name: skill.name,
      path: dir,
      entryFile: skill.path,
    });
  }, []);

  const handleImportPaths = useCallback(
    async (paths: string[], targetFolder?: string) => {
      if (paths.length === 0) return;
      setImportingSkill(true);
      let totalImported = 0;
      const allErrors: string[] = [];
      const newlyImported: SkillInfo[] = [];

      for (const p of paths) {
        try {
          const res = await invoke<ImportSkillResult>("import_antigravity_skills", {
            sourcePath: p,
            targetFolder: targetFolder?.trim() || undefined,
            overwrite: true,
          });
          totalImported += res.count;
          setSkills(res.skills);
          if (res.imported_skills && res.imported_skills.length > 0) {
            newlyImported.push(...res.imported_skills);
          }
          if (res.errors && res.errors.length > 0) {
            allErrors.push(...res.errors);
          }
        } catch (e) {
          allErrors.push(String(e));
        }
      }

      if (totalImported > 0) {
        if (newlyImported.length === 1) {
          const single = newlyImported[0];
          toast.success(`Skill "${single.name}" importata e compilata con successo!`, {
            action: {
              label: "Apri Workspace",
              onClick: () => handleOpenSkillWorkspace(single),
            },
          });
        } else {
          toast.success(
            `${totalImported} skill importate e compilate con successo!`
          );
        }
        await loadSkills();
      }

      if (allErrors.length > 0) {
        toast.error(allErrors.join("\n"));
      }

      setImportingSkill(false);
    },
    [loadSkills, handleOpenSkillWorkspace],
  );

  const handleImportFolder = useCallback(
    async (targetFolder?: string) => {
      if (importingSkill) return;
      try {
        const selected = await openDialog({
          directory: true,
          multiple: false,
          title: "Seleziona cartella skill o raccolta di skill",
        });
        if (typeof selected === "string") {
          await handleImportPaths([selected], targetFolder);
        }
      } catch (e) {
        console.error("Errore selezione cartella:", e);
      }
    },
    [importingSkill, handleImportPaths],
  );

  const handleImportArchive = useCallback(
    async (targetFolder?: string) => {
      if (importingSkill) return;
      try {
        const selected = await openDialog({
          directory: false,
          multiple: false,
          title: "Seleziona archivio skill (.skill, .zip, .md)",
          filters: [
            {
              name: "Skill o Archivio",
              extensions: ["skill", "zip", "md"],
            },
          ],
        });
        if (typeof selected === "string") {
          await handleImportPaths([selected], targetFolder);
        }
      } catch (e) {
        console.error("Errore selezione archivio:", e);
      }
    },
    [importingSkill, handleImportPaths],
  );

  // Drag & drop da Explorer / Finder su WebView
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWebview()
      .onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter" || p.type === "over") {
          let lx = p.position.x;
          let ly = p.position.y;
          if (lx > window.innerWidth || ly > window.innerHeight) {
            const dpr = window.devicePixelRatio || 1;
            lx = lx / dpr;
            ly = ly / dpr;
          }
          const el = document.elementFromPoint(lx, ly) as HTMLElement | null;
          const isOver = Boolean(el?.closest("[data-skill-drop-zone]"));
          setIsDraggingOver(isOver);
          return;
        }
        if (p.type === "leave") {
          setIsDraggingOver(false);
          return;
        }
        if (p.type === "drop") {
          setIsDraggingOver(false);
          let lx = p.position.x;
          let ly = p.position.y;
          if (lx > window.innerWidth || ly > window.innerHeight) {
            const dpr = window.devicePixelRatio || 1;
            lx = lx / dpr;
            ly = ly / dpr;
          }
          const el = document.elementFromPoint(lx, ly) as HTMLElement | null;
          const dropZone = el?.closest("[data-skill-drop-zone]");
          if (!dropZone || p.paths.length === 0) return;

          const folderEl = el?.closest<HTMLElement>("[data-skill-folder]");
          const targetFolder = folderEl?.getAttribute("data-skill-folder") || undefined;

          void handleImportPaths(p.paths, targetFolder);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((err) => console.error("[terax] skills drop listen failed:", err));

    return () => {
      disposed = true;
      setIsDraggingOver(false);
      unlisten?.();
    };
  }, [handleImportPaths]);

  const handleToggleSkill = async (skill: SkillInfo) => {
    const nextState = !skill.enabled;
    // Aggiornamento ottimistico
    setSkills((prev) =>
      prev.map((s) => (s.name === skill.name ? { ...s, enabled: nextState } : s))
    );
    try {
      await invoke("toggle_antigravity_skill", {
        name: skill.name,
        enabled: nextState,
      });
    } catch (e) {
      console.error("Errore toggle skill:", e);
      await loadSkills();
    }
  };

  // Master Switch per cartella: attiva o disattiva tutte le skill appartenenti alla cartella
  const handleToggleFolder = async (folder: string) => {
    const folderSkills = groupedSkills[folder] || [];
    const allEnabled = folderSkills.length > 0 && folderSkills.every((s) => s.enabled);
    const nextState = !allEnabled;

    // Aggiornamento ottimistico immediato
    setSkills((prev) =>
      prev.map((s) => {
        const sFolder = s.folder?.trim() || "Generali";
        return sFolder.toLowerCase() === folder.toLowerCase()
          ? { ...s, enabled: nextState }
          : s;
      })
    );

    try {
      const updated = await invoke<SkillInfo[]>("toggle_antigravity_skill_folder", {
        folder,
        enabled: nextState,
      });
      setSkills(updated);
    } catch (e) {
      console.error("Errore toggle folder:", e);
      await loadSkills();
    }
  };

  const handleOpenRenameFolder = (folder: string) => {
    setFolderToRename(folder);
    setNewFolderName(folder);
    setRenameDialogOpen(true);
  };

  const handleRenameFolder = async () => {
    const clean = newFolderName.trim();
    if (!clean || clean.toLowerCase() === folderToRename.toLowerCase()) {
      setRenameDialogOpen(false);
      return;
    }
    setRenamingFolder(true);
    try {
      const updated = await invoke<SkillInfo[]>("rename_antigravity_skill_folder", {
        oldFolder: folderToRename,
        newFolder: clean,
      });
      setSkills(updated);
      setRenameDialogOpen(false);
    } catch (e) {
      console.error("Errore rinomina cartella:", e);
    } finally {
      setRenamingFolder(false);
    }
  };

  const handleConfirmNewFolder = () => {
    const clean = createFolderName.trim();
    if (!clean) return;
    setNewFolderDialogOpen(false);
    setCreateFolderName("");
    void handleDirectCreateSkill(clean);
  };

  const handleDeleteConfirm = async () => {
    if (!skillToDelete) return;
    setDeleting(true);
    const target = skillToDelete;
    // Rimozione ottimistica immediata dall'interfaccia
    setSkills((prev) => prev.filter((s) => s.name !== target.name && s.dir !== target.dir));
    try {
      await invoke("delete_antigravity_skill", {
        name: target.name,
        dir: target.dir,
      });
      toast.success(`Skill "${target.name}" eliminata con successo.`);
      setSkillToDelete(null);
      await loadSkills();
    } catch (e) {
      console.error("Errore eliminazione skill:", e);
      toast.error(`Impossibile eliminare la skill: ${e}`);
      await loadSkills();
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleMcpServer = async (server: McpServerInfo) => {
    try {
      await invoke("toggle_mcp_server", {
        name: server.name,
        enabled: !server.enabled,
      });
      await loadMcpServers();
      toast.success(
        `Server MCP "${server.name}" ${!server.enabled ? "attivato" : "disattivato"}`
      );
    } catch (e) {
      toast.error(`Errore attivazione server MCP: ${e}`);
    }
  };

  const handleDeleteMcpServerConfirm = async () => {
    if (!serverToDelete) return;
    setDeletingServer(true);
    try {
      await invoke("delete_mcp_server", { name: serverToDelete.name });
      toast.success(`Server MCP "${serverToDelete.name}" rimosso con successo`);
      setServerToDelete(null);
      await loadMcpServers();
    } catch (e) {
      toast.error(`Errore rimozione server MCP: ${e}`);
    } finally {
      setDeletingServer(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 select-none">
      {/* SEZIONE 1: STATO MOTORE ANTIGRAVITY */}
      <div>
        <SectionHeader
          title="Motore Antigravity AI"
          description="Gestione del binario e della CLI di Antigravity integrata privatamente in TauCode."
        />

        <div className="flex flex-col gap-2">
          <SettingRow
            title="Stato e Versione CLI"
            description="Versione dell'eseguibile Antigravity dedicato e isolato nei dati locali di TauCode."
          >
            <div className="flex items-center gap-2.5">
              {statusLoading ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin text-primary" />
                  <span>Verifica...</span>
                </div>
              ) : status?.installed ? (
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-foreground font-mono">
                    v{status.version || "Sconosciuta"}
                  </span>

                  {status.update_available && (
                    <span className="text-xs text-muted-foreground">
                      (Aggiornamento v{status.latest_version})
                    </span>
                  )}

                  <Button
                    variant={status.update_available ? "default" : "outline"}
                    size="sm"
                    disabled={installing}
                    onClick={handleInstallOrUpdate}
                    className="h-7 text-xs gap-1.5 ml-1"
                  >
                    {installing ? (
                      <>
                        <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" />
                        {downloadProgress?.phase === "installing"
                          ? "Installazione..."
                          : downloadProgress?.percentage
                            ? `${Math.round(downloadProgress.percentage)}%`
                            : "Download..."}
                      </>
                    ) : status.update_available ? (
                      <>
                        <HugeiconsIcon icon={Download01Icon} size={12} />
                        Aggiorna
                      </>
                    ) : (
                      <>
                        <HugeiconsIcon icon={Refresh01Icon} size={12} />
                        Reinstalla
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-muted-foreground">Non installata</span>
                  <Button
                    size="sm"
                    disabled={installing}
                    onClick={handleInstallOrUpdate}
                    className="h-7 text-xs gap-1.5"
                  >
                    {installing ? (
                      <>
                        <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" />
                        {downloadProgress?.phase === "installing"
                          ? "Installazione..."
                          : downloadProgress?.percentage
                            ? `${Math.round(downloadProgress.percentage)}%`
                            : "Download..."}
                      </>
                    ) : (
                      <>
                        <HugeiconsIcon icon={Download01Icon} size={12} />
                        Scarica ora
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </SettingRow>

          {installing && (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin text-primary" />
                  {downloadProgress?.phase === "installing"
                    ? "Installazione ed estrazione in corso..."
                    : "Download del binario in corso..."}
                </span>
                <span className="font-mono text-muted-foreground text-[11px]">
                  {downloadProgress?.total
                    ? `${(downloadProgress.downloaded / (1024 * 1024)).toFixed(1)} MB / ${(downloadProgress.total / (1024 * 1024)).toFixed(1)} MB (${Math.round(downloadProgress.percentage)}%)`
                    : downloadProgress?.downloaded
                      ? `${(downloadProgress.downloaded / (1024 * 1024)).toFixed(1)} MB scaricati`
                      : "Avvio download..."}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all duration-150 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(downloadProgress?.phase === "installing" ? 100 : 0, downloadProgress?.percentage ?? 0))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {status?.executable_path && (
            <SettingRow
              title="Percorso Binario Dedicato"
              description="Posizione locale isolata del file eseguibile taucode-antigravity."
            >
              <span className="font-mono text-[10.5px] text-muted-foreground select-all break-all max-w-[280px] text-right">
                {status.executable_path}
              </span>
            </SettingRow>
          )}

          {statusError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <strong>Errore:</strong> {statusError}
            </div>
          )}
        </div>
      </div>

      {/* SEZIONE 2: SKILL GLOBALI DELL'IDE IN CARTELLE */}
      <div>
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-border/40">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <img
                src="/antigravity/antigravity.svg"
                alt="Antigravity"
                className="size-4 object-contain"
              />
              Skill Globali di TauCode
            </h3>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              Procedure e playbook organizzati in cartelle con master switch rapido (invisibili fuori dall'IDE).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={importingSkill}
                  className="h-7 gap-1.5 text-xs px-2.5 shadow-xs"
                >
                  {importingSkill ? (
                    <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={FolderUploadIcon} size={13} strokeWidth={2} />
                  )}
                  Carica Skill
                  <HugeiconsIcon icon={ArrowDown01Icon} size={12} className="opacity-60 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onClick={() => void handleImportFolder()}
                  className="gap-2 text-xs cursor-pointer"
                >
                  <HugeiconsIcon icon={FolderUploadIcon} size={14} className="text-primary" />
                  <span>Carica Cartella (anche grezza)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void handleImportArchive()}
                  className="gap-2 text-xs cursor-pointer"
                >
                  <HugeiconsIcon icon={FileUploadIcon} size={14} className="text-primary" />
                  <span>Carica Archivio ZIP / .skill</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setNewFolderDialogOpen(true)}
              className="h-7 gap-1.5 text-xs px-2.5 shadow-xs"
            >
              <HugeiconsIcon icon={Folder01Icon} size={13} strokeWidth={2} />
              Nuova Cartella
            </Button>

            <Button
              size="sm"
              disabled={creatingSkill}
              onClick={() => void handleDirectCreateSkill()}
              className="h-7 gap-1 text-xs px-2.5 shadow-sm"
            >
              {creatingSkill ? (
                <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin" />
              ) : (
                <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={2} />
              )}
              Nuova Skill
            </Button>
          </div>
        </div>

        <div
          data-skill-drop-zone="true"
          className={`relative rounded-xl transition-all duration-200 ${
            isDraggingOver ? "ring-2 ring-primary/60 bg-primary/5 p-1" : ""
          }`}
        >
          {isDraggingOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-background/85 backdrop-blur-xs border-2 border-dashed border-primary pointer-events-none min-h-[140px]">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-primary">
                <HugeiconsIcon icon={FolderUploadIcon} size={18} className="animate-bounce" />
                <span>Rilascia qui per importare la cartella o l'archivio</span>
              </div>
            </div>
          )}

          {skillsLoading ? (
            <div className="flex items-center justify-center p-8 text-xs text-muted-foreground gap-2">
              <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin text-primary" />
              Caricamento skill in corso...
            </div>
          ) : skills.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center bg-card flex flex-col items-center justify-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted border border-border">
                <img
                  src="/antigravity/antigravity.svg"
                  alt="Antigravity"
                  className="size-5 object-contain"
                />
              </div>
              <h4 className="text-xs font-semibold text-foreground">Nessuna skill globale presente</h4>
              <p className="text-[11px] text-muted-foreground max-w-[340px]">
                Crea una nuova skill oppure carica una cartella o archivio ZIP scaricato online: l'IDE si occuperà di compilarla e registrarla automaticamente.
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={creatingSkill}
                  onClick={() => void handleDirectCreateSkill()}
                  className="h-7 text-xs gap-1"
                >
                  {creatingSkill ? (
                    <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={Add01Icon} size={13} />
                  )}
                  Crea Nuova Skill
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={importingSkill}
                  onClick={() => void handleImportFolder()}
                  className="h-7 text-xs gap-1.5"
                >
                  <HugeiconsIcon icon={FolderUploadIcon} size={13} />
                  Carica e Compila
                </Button>
              </div>
            </div>
          ) : (
          <div className="flex flex-col gap-3">
            {folders.map((folder) => {
              const folderSkills = groupedSkills[folder] || [];
              const allEnabled = folderSkills.length > 0 && folderSkills.every((s) => s.enabled);
              const someEnabled = folderSkills.some((s) => s.enabled);
              const isExpanded = expandedFolders[folder] !== false; // Aperte di default
              const isExt = folderSkills.some((s) => Boolean(s.extension_id || s.extension_name));

              return (
                <div
                  key={folder}
                  data-skill-folder={folder}
                  className="rounded-lg border border-border bg-muted/30 dark:bg-card overflow-hidden shadow-xs"
                >
                  {/* INTESTAZIONE CARTELLA CON MASTER SWITCH */}
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-muted border-b border-border">
                    <div
                      onClick={() => toggleFolderExpand(folder)}
                      className="flex items-center gap-2 cursor-pointer select-none flex-1 min-w-0"
                    >
                      <HugeiconsIcon
                        icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon}
                        size={14}
                        className="text-muted-foreground/80 shrink-0"
                      />
                      <div className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        <HugeiconsIcon icon={isExt ? PackageIcon : Folder01Icon} size={14} strokeWidth={2} />
                      </div>
                      <span className="text-xs font-semibold text-foreground truncate">
                        {folder}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0 font-normal">
                        {folderSkills.length} {folderSkills.length === 1 ? "skill" : "skill"}
                      </span>
                    </div>

                    {/* AZIONI E MASTER SWITCH */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isExt && (
                        <>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={importingSkill}
                                className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                                title={`Carica e compila skill in ${folder}`}
                              >
                                <HugeiconsIcon icon={FolderUploadIcon} size={12} />
                                Carica
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem
                                onClick={() => void handleImportFolder(folder)}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <HugeiconsIcon icon={FolderUploadIcon} size={13} className="text-primary" />
                                <span>Carica Cartella in {folder}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => void handleImportArchive(folder)}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <HugeiconsIcon icon={FileUploadIcon} size={13} className="text-primary" />
                                <span>Carica Archivio ZIP in {folder}</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={creatingSkill}
                            onClick={() => void handleDirectCreateSkill(folder)}
                            className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                            title={`Aggiungi skill a ${folder}`}
                          >
                            <HugeiconsIcon icon={Add01Icon} size={12} />
                            Aggiungi
                          </Button>

                          {folder !== "Generali" && folder !== "Built-in" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenRenameFolder(folder)}
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              title="Rinomina cartella"
                            >
                              <HugeiconsIcon icon={Edit02Icon} size={12} />
                            </Button>
                          )}
                        </>
                      )}

                      {/* MASTER SWITCH DELLA CARTELLA */}
                      <div className={`flex items-center gap-2 ${!isExt ? "pl-2 border-l border-border/60" : ""}`}>
                        <span className="text-[10.5px] font-medium text-muted-foreground">
                          {allEnabled ? "Tutte attive" : someEnabled ? "Parziali" : "Disattivate"}
                        </span>
                        <Switch
                          checked={allEnabled}
                          onCheckedChange={() => void handleToggleFolder(folder)}
                          title={
                            allEnabled
                              ? `Disattiva tutte le skill in ${folder}`
                              : `Attiva tutte le skill in ${folder}`
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* ELENCO DELLE SKILL DELLA CARTELLA */}
                  {isExpanded && (
                    <div className="p-2.5 flex flex-col gap-2 bg-muted/30 dark:bg-card/40">
                      {folderSkills.map((skill) => (
                        <div
                          key={skill.name}
                          className={`flex items-start justify-between gap-4 rounded-lg border px-3 py-2.5 transition-colors shadow-xs hover:border-foreground/30 ${
                            skill.enabled
                              ? "border-border bg-white dark:bg-card"
                              : "border-border bg-white/70 dark:bg-card/70 opacity-75"
                          }`}
                        >
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {skill.name}
                              </span>
                              {skill.is_default && (
                                <span className="text-[11px] text-muted-foreground font-normal">
                                  Sistema
                                </span>
                              )}
                              {!skill.enabled && (
                                <span className="text-[11px] text-muted-foreground font-normal">
                                  Disattivata
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                              {skill.description || "Nessuna descrizione specificata."}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 pt-0.5">
                            <Switch
                              checked={skill.enabled}
                              onCheckedChange={() => void handleToggleSkill(skill)}
                              title={skill.enabled ? "Disattiva skill" : "Attiva skill"}
                            />

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenSkillWorkspace(skill)}
                              className="h-7 px-2.5 text-xs gap-1.5 text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors shadow-2xs"
                              title="Apri e modifica la skill come Workspace nell'editor con Antigravity"
                            >
                              <HugeiconsIcon icon={SourceCodeIcon} size={13} strokeWidth={2} />
                              <span>{skill.is_default ? "Esplora" : "Modifica"}</span>
                            </Button>

                            {!skill.extension_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSkillToDelete(skill)}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                title="Elimina skill"
                              >
                                <HugeiconsIcon icon={Delete02Icon} size={13} />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {/* SEZIONE 3: SERVER MCP (MODEL CONTEXT PROTOCOL) */}
      <div className="flex flex-col gap-3 pt-4 border-t border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <HugeiconsIcon icon={ServerStack03Icon} size={16} className="text-primary" />
              Server MCP (Model Context Protocol)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Protocollo standard di contesto e strumenti (tools) per Antigravity. I server installati tramite estensioni sono contrassegnati con il badge dedicato.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadMcpServers()}
              disabled={mcpLoading}
              className="h-7 px-2.5 text-xs gap-1.5"
            >
              <HugeiconsIcon
                icon={Refresh01Icon}
                size={13}
                className={mcpLoading ? "animate-spin" : ""}
              />
              Ricarica
            </Button>
          </div>
        </div>

        {/* LISTA SERVER MCP DIVISA IN CARTELLE */}
        {mcpLoading ? (
          <div className="flex items-center justify-center p-8 text-xs text-muted-foreground gap-2">
            <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin text-primary" />
            Caricamento server MCP in corso...
          </div>
        ) : mcpServers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 rounded-lg border border-dashed border-border bg-card text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted border border-border mb-2">
              <HugeiconsIcon icon={ServerStack03Icon} size={20} className="text-muted-foreground" />
            </div>
            <p className="text-xs font-medium text-foreground">Nessun server MCP configurato</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-sm">
              I server MCP configurati in ~/.gemini/config/mcp_config.json o forniti dalle estensioni installate appariranno automaticamente qui.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {mcpFolders.map((folder) => {
              const folderServers = groupedMcp[folder] || [];
              const allEnabled = folderServers.length > 0 && folderServers.every((s) => s.enabled);
              const someEnabled = folderServers.some((s) => s.enabled);
              const isExpanded = expandedMcpFolders[folder] !== false; // Aperte di default
              const isExt = folderServers.some((s) => Boolean(s.is_extension_provided || s.extension_id || s.extension_name));

              return (
                <div
                  key={folder}
                  className="rounded-lg border border-border bg-muted/30 dark:bg-card overflow-hidden shadow-xs"
                >
                  {/* INTESTAZIONE CARTELLA MCP */}
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-muted border-b border-border">
                    <div
                      onClick={() => toggleMcpFolderExpand(folder)}
                      className="flex items-center gap-2 cursor-pointer select-none flex-1 min-w-0"
                    >
                      <HugeiconsIcon
                        icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon}
                        size={14}
                        className="text-muted-foreground/80 shrink-0"
                      />
                      <div className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        <HugeiconsIcon
                          icon={isExt ? PackageIcon : ServerStack03Icon}
                          size={14}
                          strokeWidth={2}
                        />
                      </div>
                      <span className="text-xs font-semibold text-foreground truncate">
                        {folder}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0 font-normal">
                        {folderServers.length} {folderServers.length === 1 ? "server" : "server"}
                      </span>
                    </div>

                    {/* MASTER SWITCH DELLA CARTELLA MCP */}
                    <div className="flex items-center gap-2 pl-2 shrink-0">
                      <span className="text-[10.5px] font-medium text-muted-foreground">
                        {allEnabled ? "Tutti attivi" : someEnabled ? "Parziali" : "Disattivati"}
                      </span>
                      <Switch
                        checked={allEnabled}
                        onCheckedChange={() => void handleToggleMcpFolder(folder)}
                        title={
                          allEnabled
                            ? `Disattiva tutti i server in ${folder}`
                            : `Attiva tutti i server in ${folder}`
                        }
                      />
                    </div>
                  </div>

                  {/* ELENCO DEI SERVER MCP DELLA CARTELLA */}
                  {isExpanded && (
                    <div className="p-2.5 flex flex-col gap-2 bg-muted/30 dark:bg-card/40">
                      {folderServers.map((server) => (
                        <div
                          key={server.name}
                          className={`flex items-start justify-between gap-4 rounded-lg border px-3 py-2.5 transition-colors shadow-xs hover:border-foreground/30 ${
                            server.enabled
                              ? "border-border bg-white dark:bg-card"
                              : "border-border bg-white/70 dark:bg-card/70 opacity-75"
                          }`}
                        >
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {server.name}
                              </span>
                              <span className="text-[11px] font-mono text-muted-foreground uppercase">
                                {server.transport}
                              </span>
                              {!server.enabled && (
                                <span className="text-[11px] text-muted-foreground font-normal">
                                  Disattivato
                                </span>
                              )}
                            </div>

                            <div className="font-mono text-[11px] text-muted-foreground bg-muted px-2 py-1 rounded border border-border truncate">
                              {server.transport === "sse" ? (
                                server.url || "Nessun URL SSE specificato"
                              ) : (
                                `${server.command} ${server.args.join(" ")}`
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 pt-0.5">
                            <Switch
                              checked={server.enabled}
                              onCheckedChange={() => void handleToggleMcpServer(server)}
                              title={server.enabled ? "Disattiva server MCP" : "Attiva server MCP"}
                            />

                            {!server.is_extension_provided && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setServerToDelete(server)}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                                title="Elimina server MCP"
                              >
                                <HugeiconsIcon icon={Delete02Icon} size={13} />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DIALOG NUOVA CARTELLA */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent className="max-w-[420px] p-5 select-text">
          <DialogHeader className="pb-2 border-b border-border/40">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <HugeiconsIcon icon={Folder01Icon} size={16} className="text-primary" />
              Nuova Cartella Skill
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Crea un gruppo per raccogliere skill correlate (es. Frontend, Workflow, Git).
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">
              Nome Cartella <span className="text-destructive">*</span>
            </label>
            <Input
              value={createFolderName}
              onChange={(e) => setCreateFolderName(e.target.value)}
              placeholder="es. Workflow, Backend, Testing..."
              className="text-xs h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmNewFolder();
              }}
            />
          </div>

          <DialogFooter className="pt-2 border-t border-border/40 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewFolderDialogOpen(false)}
              className="h-8 text-xs"
            >
              Annulla
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmNewFolder}
              disabled={!createFolderName.trim()}
              className="h-8 text-xs gap-1.5"
            >
              Crea Cartella
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG RINOMINA CARTELLA */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-[420px] p-5 select-text">
          <DialogHeader className="pb-2 border-b border-border/40">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <HugeiconsIcon icon={Edit02Icon} size={16} className="text-primary" />
              Rinomina Cartella
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Tutte le skill contenute in "{folderToRename}" verranno aggiornate con il nuovo nome.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">
              Nuovo Nome <span className="text-destructive">*</span>
            </label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="text-xs h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRenameFolder();
              }}
            />
          </div>

          <DialogFooter className="pt-2 border-t border-border/40 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenameDialogOpen(false)}
              disabled={renamingFolder}
              className="h-8 text-xs"
            >
              Annulla
            </Button>
            <Button
              size="sm"
              onClick={() => void handleRenameFolder()}
              disabled={renamingFolder || !newFolderName.trim()}
              className="h-8 text-xs gap-1.5"
            >
              {renamingFolder && <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* ALERT DIALOG ELIMINAZIONE SKILL */}
      <AlertDialog open={Boolean(skillToDelete)} onOpenChange={(open) => !open && setSkillToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">
              Eliminare la skill "{skillToDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Questa azione cancellerà definitivamente la cartella e il file SKILL.md della skill dai dati locali di TauCode. L'azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deleting} className="h-8 text-xs">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDeleteConfirm}
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminazione..." : "Elimina definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ALERT DIALOG ELIMINAZIONE SERVER MCP */}
      <AlertDialog open={Boolean(serverToDelete)} onOpenChange={(open) => !open && setServerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">
              Rimuovere il server MCP "{serverToDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Questa azione rimuoverà la configurazione del server da ~/.gemini/config/mcp_config.json. L'azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deletingServer} className="h-8 text-xs">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingServer}
              onClick={handleDeleteMcpServerConfirm}
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingServer ? "Rimozione..." : "Rimuovi server"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
