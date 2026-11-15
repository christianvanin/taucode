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
): Result {
  const lastTerminalCwd = useRef<string | null>(null);

  useEffect(() => {
    if (activeTab?.kind === "terminal" && activeTab.cwd) {
      lastTerminalCwd.current = activeTab.cwd;
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
    if (activeTab?.kind === "terminal" && activeTab.cwd) return activeTab.cwd;
    // Editor tabs inherit the last terminal's cwd (or workspace root), not
    // the file's folder — opening a new terminal from a file shouldn't
    // hijack the user's working directory context.
    return lastTerminalCwd.current ?? activeSpaceRoot ?? home ?? undefined;
  }, [activeTab, activeSpaceRoot, home]);

  return { explorerRoot, inheritedCwdForNewTab };
}
