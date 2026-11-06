import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { create } from "zustand";

export type LspInstalledInfo = {
  id: string;
  installed: boolean;
  path: string | null;
  size_bytes: number | null;
};

type LspManagerState = {
  installed: Record<string, LspInstalledInfo>;
  downloading: Record<string, boolean>;
  loading: boolean;
  fetchStatuses: () => Promise<void>;
  downloadServer: (id: string, name: string) => Promise<boolean>;
  deleteServer: (id: string, name: string) => Promise<boolean>;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const useLspManagerStore = create<LspManagerState>((set) => ({
  installed: {},
  downloading: {},
  loading: false,

  fetchStatuses: async () => {
    try {
      set({ loading: true });
      const res = await invoke<Record<string, LspInstalledInfo>>(
        "lsp_get_installed_status",
      );
      set({ installed: res ?? {}, loading: false });
    } catch (e) {
      console.error("Failed to fetch LSP statuses", e);
      set({ loading: false });
    }
  },

  downloadServer: async (id: string, name: string) => {
    set((s) => ({ downloading: { ...s.downloading, [id]: true } }));
    toast.info(`Downloading ${name}...`);
    try {
      const info = await invoke<LspInstalledInfo>("lsp_download_server", { id });
      set((s) => ({
        installed: { ...s.installed, [id]: info },
        downloading: { ...s.downloading, [id]: false },
      }));
      toast.success(`${name} downloaded and installed successfully!`);
      return true;
    } catch (e) {
      console.error(`Failed to download ${id}:`, e);
      set((s) => ({ downloading: { ...s.downloading, [id]: false } }));
      toast.error(`Failed to download ${name}: ${String(e)}`);
      return false;
    }
  },

  deleteServer: async (id: string, name: string) => {
    try {
      await invoke("lsp_delete_server", { id });
      set((s) => ({
        installed: {
          ...s.installed,
          [id]: { id, installed: false, path: null, size_bytes: null },
        },
      }));
      toast.success(`${name} uninstalled.`);
      return true;
    } catch (e) {
      console.error(`Failed to delete ${id}:`, e);
      toast.error(`Failed to delete ${name}: ${String(e)}`);
      return false;
    }
  },
}));
