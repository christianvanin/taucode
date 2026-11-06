import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ExtensionInfo } from "../types";
import { useExtensionsStore } from "../store";
import { Delete02Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface Props {
  extension: ExtensionInfo;
}

export function ExtensionCard({ extension }: Props) {
  const toggleExtension = useExtensionsStore((s) => s.toggleExtension);
  const uninstallExtension = useExtensionsStore((s) => s.uninstallExtension);

  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleToggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      await toggleExtension(extension.id, enabled);
    } catch (err) {
      console.error("[Extensions] Errore toggle estensione:", err);
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await uninstallExtension(extension.id);
    } catch (err) {
      console.error("[Extensions] Errore disinstallazione estensione:", err);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const title = extension.display_name || extension.name;

  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-lg border px-3.5 py-3 transition-colors shadow-xs hover:border-foreground/20 ${
        extension.enabled
          ? "border-border bg-card"
          : "border-border bg-muted/50 opacity-80"
      }`}
    >
      {/* Left: Icon & Info */}
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg overflow-hidden ${
            extension.icon_path ? "bg-transparent" : "border border-border bg-muted"
          }`}
        >
          {extension.icon_path ? (
            <img
              src={convertFileSrc(extension.icon_path)}
              alt={title}
              className="size-full object-contain p-0.5"
            />
          ) : (
            <HugeiconsIcon icon={PackageIcon} size={20} className="text-primary" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">
              {title}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded border border-border/50">
              v{extension.version}
            </span>
            {extension.author && (
              <span className="text-[11px] text-muted-foreground">
                di {extension.author}
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {extension.description || "Nessuna descrizione specificata."}
          </p>
        </div>
      </div>

      {/* Right: Actions (Switch + Delete) */}
      <div className="flex items-center gap-2 shrink-0 pt-0.5">
        <Switch
          checked={extension.enabled}
          onCheckedChange={handleToggle}
          disabled={toggling || deleting}
          title={extension.enabled ? "Disattiva estensione" : "Attiva estensione"}
        />

        {confirmDelete ? (
          <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
            <span className="text-[11px] text-destructive font-medium">Elimina?</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="h-6 px-2 text-[11px] cursor-pointer"
            >
              {deleting ? "..." : "Sì"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="h-6 px-2 text-[11px] cursor-pointer"
            >
              No
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            disabled={toggling || deleting}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
            title="Disinstalla estensione"
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
