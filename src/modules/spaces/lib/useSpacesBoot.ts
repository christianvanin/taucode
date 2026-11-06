import { invoke } from "@tauri-apps/api/core";
import { native } from "@/lib/native";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Tab } from "@/modules/tabs";
import { DEFAULT_SPACE_ID } from "@/modules/tabs/lib/useTabs";
import { isLeaf, type PaneNode } from "@/modules/terminal/lib/panes";
import { parseWorkspaceScopeKey, type WorkspaceEnv } from "@/modules/workspace";
import { useEffect, useRef } from "react";
import { activeSpaceEnv, freshTabCwd } from "./activeSpace";
import { freshTerminalTab, hydrateTabs } from "./serialize";
import { loadAll, type SpaceMeta, saveActiveId, saveSpacesList } from "./store";
import { useSpaces } from "./useSpaces";

type Params = {
  ready: boolean;
  launchCwd: string | null;
  home: string | null;
  allocId: () => number;
  replaceTabs: (tabs: Tab[], activeId: number) => void;
  markBooted: () => void;
  setActiveSpaceForNewTabs: (id: string) => void;
  adoptWorkspaceEnv: (env: WorkspaceEnv) => Promise<string | null>;
};

export async function isReachableDirectory(
  path: string,
  env?: WorkspaceEnv,
): Promise<boolean> {
  try {
    await invoke("fs_read_dir", {
      path,
      showHidden: false,
      gitDecorations: false,
      workspace: env,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sanitizeAndVerifySpaces(
  spaces: SpaceMeta[],
  home: string | null,
  launchCwd: string | null,
  checkDir: (
    path: string,
    env?: WorkspaceEnv,
  ) => Promise<boolean> = isReachableDirectory,
): Promise<{ spaces: SpaceMeta[]; modified: boolean }> {
  let modified = false;
  const verifiedSpaces: SpaceMeta[] = [];

  for (const space of spaces) {
    if (!space.root) {
      verifiedSpaces.push(space);
      continue;
    }

    const r = space.root.replace(/\\/g, "/").toLowerCase();
    const h = home ? home.replace(/\\/g, "/").toLowerCase() : "";
    const l = launchCwd ? launchCwd.replace(/\\/g, "/").toLowerCase() : "";

    // Sanitize legacy spaces whose root was automatically assigned to user home or desktop
    if (
      r === h ||
      r === l ||
      r.endsWith("/desktop") ||
      r.endsWith("/desktop/")
    ) {
      modified = true;
      verifiedSpaces.push({ ...space, root: null });
      continue;
    }

    // Verify folder is reachable and accessible
    const reachable = await checkDir(space.root, space.env);
    if (!reachable) {
      modified = true;
      verifiedSpaces.push({ ...space, root: null });
      continue;
    }

    const folderName = space.root.replace(/\\/g, "/").split("/").filter(Boolean).pop();
    if (space.name === "Folder" && folderName) {
      modified = true;
      verifiedSpaces.push({ ...space, name: folderName });
      continue;
    }

    verifiedSpaces.push(space);
  }

  return { spaces: verifiedSpaces, modified };
}

function uniqueCwds(tabs: Tab[]): string[] {
  const set = new Set<string>();
  const walk = (n: PaneNode) => {
    if (isLeaf(n)) {
      if (n.cwd) set.add(n.cwd);
      return;
    }
    for (const c of n.children) walk(c);
  };
  for (const t of tabs) if (t.kind === "terminal") walk(t.paneTree);
  return [...set];
}

export function useSpacesBoot({
  ready,
  launchCwd,
  home,
  allocId,
  replaceTabs,
  markBooted,
  setActiveSpaceForNewTabs,
  adoptWorkspaceEnv,
}: Params) {
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;

    void (async () => {
      try {
        const { spaces, activeId, states } = await loadAll();

        if (spaces.length === 0) {
          // Hydrate prefs before reading the saved workspace env.
          await usePreferencesStore
            .getState()
            .init()
            .catch(() => {});
          const meta: SpaceMeta = {
            id: DEFAULT_SPACE_ID,
            name: "Default",
            root: null,
            env: parseWorkspaceScopeKey(
              usePreferencesStore.getState().defaultWorkspaceEnv,
            ),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await saveSpacesList([meta]);
          await saveActiveId(DEFAULT_SPACE_ID);
          setActiveSpaceForNewTabs(DEFAULT_SPACE_ID);
          useSpaces.getState().hydrate([meta], DEFAULT_SPACE_ID);
          return;
        }

        const { spaces: cleanedSpaces, modified } =
          await sanitizeAndVerifySpaces(spaces, home, launchCwd);

        if (modified) {
          void saveSpacesList(cleanedSpaces);
        }

        const restored: Tab[] = [];
        for (const space of cleanedSpaces) {
          const st = states.get(space.id);
          if (!st) continue;
          restored.push(...hydrateTabs(st.tabs, space.id, allocId));
        }

        const active =
          activeId && cleanedSpaces.some((s) => s.id === activeId)
            ? activeId
            : cleanedSpaces[0].id;
        setActiveSpaceForNewTabs(active);

        // Apply the space's env+home before the fresh-tab fallback and spawns
        // below; env is set synchronously so cwd resolution picks WSL vs local.
        const env = activeSpaceEnv(cleanedSpaces, active);
        const restoredHome = await adoptWorkspaceEnv(env);

        // Active space must never be empty, else its tab list shows nothing.
        if (!restored.some((t) => t.spaceId === active)) {
          const cwd = freshTabCwd(env, restoredHome, launchCwd, home);
          restored.push(freshTerminalTab(active, cwd, allocId));
        }

        await Promise.allSettled([
          ...uniqueCwds(restored).map((cwd) => native.workspaceAuthorize(cwd)),
          ...cleanedSpaces
            .map((s) => s.root)
            .filter((r): r is string => Boolean(r))
            .map((r) => native.workspaceAuthorize(r)),
        ]);

        const initialActiveIndex: Record<string, number> = {};
        for (const [id, st] of states)
          initialActiveIndex[id] = st.activeTabIndex;
        useSpaces.getState().hydrate(cleanedSpaces, active, initialActiveIndex);

        const inActive = restored.filter((t) => t.spaceId === active);
        const idx = states.get(active)?.activeTabIndex ?? 0;
        const activeTab = inActive[idx] ?? inActive[0] ?? restored[0];
        replaceTabs(restored, activeTab.id);
      } catch (e) {
        console.error("[terax] spaces boot failed:", e);
      } finally {
        markBooted();
      }
    })();
  }, [
    ready,
    launchCwd,
    home,
    allocId,
    replaceTabs,
    markBooted,
    setActiveSpaceForNewTabs,
    adoptWorkspaceEnv,
  ]);
}
