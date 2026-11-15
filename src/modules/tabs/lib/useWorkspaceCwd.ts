import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Tab } from "./useTabs";
import { normalizeFsPath } from "@/modules/explorer/lib/useFileTree";
import type { WorkspaceEnv } from "@/modules/workspace";

type Result = {
  explorerRoot: string | null;
  inheritedCwdForNewTab: () => string | undefined;
};

export function useWorkspaceCwd(
  activeSpaceRoot: string | null,
  activeTab: Tab | undefined,
  home: string | null,
  workspaceEnv?: WorkspaceEnv,
  activeSpaceId?: string,
): Result {
  const lastTerminalCwdBySpace = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (activeTab?.kind === "terminal" && activeTab.cwd && activeTab.spaceId) {
      lastTerminalCwdBySpace.current.set(activeTab.spaceId, activeTab.cwd);
    }
  }, [activeTab]);

  const explorerRoot = useMemo<string | null>(() => {
    if (!activeSpaceRoot) return null;
    const norm = normalizeFsPath(activeSpaceRoot);
    if (workspaceEnv?.kind === "local" || !workspaceEnv) {
      const isWinDrive = /^[a-zA-Z]:[\\/]/.test(norm.replace(/^\//, ""));
      const isUnc = norm.startsWith("//") || norm.startsWith("\\\\");
      if (!isWinDrive && !isUnc) return null;
    }
    return norm;
  }, [activeSpaceRoot, workspaceEnv]);

  const inheritedCwdForNewTab = useCallback((): string | undefined => {
    if (
      activeTab?.kind === "terminal" &&
      activeTab.cwd &&
      (!activeSpaceId || activeTab.spaceId === activeSpaceId)
    ) {
      return activeTab.cwd;
    }
    const lastForSpace = activeSpaceId
      ? lastTerminalCwdBySpace.current.get(activeSpaceId)
      : undefined;
    return lastForSpace ?? activeSpaceRoot ?? home ?? undefined;
  }, [activeTab, activeSpaceRoot, home, activeSpaceId]);

  return { explorerRoot, inheritedCwdForNewTab };
}
