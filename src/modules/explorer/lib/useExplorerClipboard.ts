import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { currentWorkspaceEnv } from "@/modules/workspace";

/**
 * Legge i file/cartelle presenti nella clipboard di sistema (copiati da Esplora Risorse, Finder o File Manager)
 * e li copia ricorsivamente all'interno di `targetDir` con gestione automatica delle collisioni di nome.
 */
export async function pasteFilesFromClipboard(
  targetDir: string,
  onCopied: (destDir: string, createdPaths: string[]) => void,
): Promise<boolean> {
  try {
    const sources = await invoke<string[]>("clipboard_get_files");
    if (!sources || sources.length === 0) {
      toast.info("Nessun file o cartella presente negli appunti");
      return false;
    }

    const created = await invoke<string[]>("fs_copy", {
      sources,
      destDir: targetDir,
      autoRename: true,
      workspace: currentWorkspaceEnv(),
    });

    const count = sources.length;
    if (count === 1) {
      const name = sources[0].split(/[/\\]/).pop() || "file";
      toast.success(`Incollato "${name}"`);
    } else {
      toast.success(`Incollati ${count} elementi`);
    }

    onCopied(targetDir, created || []);
    return true;
  } catch (err) {
    toast.error(`Errore copia file: ${String(err)}`);
    return false;
  }
}

