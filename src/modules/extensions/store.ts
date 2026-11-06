import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ExtensionInfo } from "./types";

interface ExtensionsState {
  extensions: ExtensionInfo[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  filter: "all" | "enabled" | "disabled";

  setSearchQuery: (query: string) => void;
  setFilter: (filter: "all" | "enabled" | "disabled") => void;
  loadExtensions: () => Promise<void>;
  toggleExtension: (id: string, enabled: boolean) => Promise<void>;
  uninstallExtension: (id: string) => Promise<void>;
  installZip: (zipPath: string) => Promise<ExtensionInfo>;
  installGit: (repoUrl: string) => Promise<ExtensionInfo>;
  initWatcher: () => () => void;
}

export const useExtensionsStore = create<ExtensionsState>((set, get) => ({
  extensions: [],
  isLoading: true,
  error: null,
  searchQuery: "",
  filter: "all",

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setFilter: (filter) => set({ filter }),

  loadExtensions: async () => {
    set({ isLoading: true, error: null });
    try {
      const exts = await invoke<ExtensionInfo[]>("list_extensions");
      set({ extensions: exts, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  toggleExtension: async (id: string, enabled: boolean) => {
    // Optimistic update
    set((state) => ({
      extensions: state.extensions.map((ext) =>
        ext.id === id ? { ...ext, enabled } : ext
      ),
    }));

    try {
      const updated = await invoke<ExtensionInfo[]>("toggle_extension", {
        extId: id,
        enabled,
      });
      set({ extensions: updated });
    } catch (err) {
      // Revert on error
      await get().loadExtensions();
      throw err;
    }
  },

  uninstallExtension: async (id: string) => {
    set((state) => ({
      extensions: state.extensions.filter((ext) => ext.id !== id),
    }));
    try {
      await invoke("uninstall_extension", { extId: id });
    } catch (err) {
      await get().loadExtensions();
      throw err;
    }
  },

  installZip: async (zipPath: string) => {
    const ext = await invoke<ExtensionInfo>("install_extension_zip", { zipPath });
    await get().loadExtensions();
    return ext;
  },

  installGit: async (repoUrl: string) => {
    const ext = await invoke<ExtensionInfo>("install_extension_git", { repoUrl });
    await get().loadExtensions();
    return ext;
  },

  initWatcher: () => {
    let unlisten: (() => void) | undefined;
    listen("terax:extensions-updated", () => {
      void get().loadExtensions();
    }).then((fn) => {
      unlisten = fn;
    });

    void get().loadExtensions();

    return () => {
      unlisten?.();
    };
  },
}));
