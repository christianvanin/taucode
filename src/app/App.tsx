import type { GroupImperativeHandle, PanelImperativeHandle } from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { consumeLaunchFiles, getLaunchDir } from "@/lib/launchDir";
import { quoteShellArg } from "@/lib/shellQuote";
import { useZoom } from "@/lib/useZoom";
import { isMarkdownPath, isSvgPath } from "@/lib/utils";
import { native } from "@/lib/native";
import {
  AntigravityPane,
  useAntigravityStore,
  MIN_ANTIGRAVITY_PANEL_WIDTH,
} from "@/modules/antigravity";
import { CommandPalette, createCommandItems } from "@/modules/command-palette";
import {
  type EditorPaneHandle,
  NewEditorDialog,
  useApplyEditorFontSize,
  useEditorFileSync,
} from "@/modules/editor";
import { FileExplorer, type FileExplorerHandle } from "@/modules/explorer";
import type { GitHistorySearchHandle } from "@/modules/git-history";
import {
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import { setLspNavigator } from "@/modules/lsp";
import type { PreviewPaneHandle } from "@/modules/preview";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  shouldDisablePaneSwapShortcut,
  type ShortcutHandlers,
  type ShortcutId,
  useGlobalShortcuts,
} from "@/modules/shortcuts";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SidebarRail,
  useSidebarPanel,
} from "@/modules/sidebar";
import {
  SourceControlPanel,
  useSourceControlContext,
} from "@/modules/source-control";
import {
  SpaceSwitcher,
  useSpacePersistence,
  useSpaces,
  useSpacesBoot,
} from "@/modules/spaces";
import { StatusBar } from "@/modules/statusbar";
import {
  TabSwitcherHud,
  useTabSwitcher,
  useTabs,
  useWindowTitle,
  useWorkspaceCwd,
} from "@/modules/tabs";
import { DEFAULT_SPACE_ID } from "@/modules/tabs/lib/useTabs";
import type { TerminalTab } from "@/modules/tabs";
import {
  ensureTauCodeStructure,
  readTauCodeConfig,
  buildScriptCommand,
  type TauCodeActionType,
} from "@/modules/taucode";
import { ExtensionRegistry } from "@/modules/extensions/ExtensionRegistry";
import { useExtensionsStore } from "@/modules/extensions/store";
import { toast } from "sonner";
import {
  clearFocusedTerminal,
  disposeSession,
  findLeafCwd,
  leafIds,
  type PaneBounds,
  type TerminalPaneHandle,
  useTerminalFileDrop,
  writeToSession,
} from "@/modules/terminal";
import { ThemeProvider } from "@/modules/theme";
import { useWorkspaceEnvStore, type WorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toPng } from "html-to-image";
import type { SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloseDialogs } from "./components/CloseDialogs";
import { WorkspaceSurface } from "./components/WorkspaceSurface";
import { useAppCloseGuard } from "./hooks/useAppCloseGuard";
import { useTabCloseGuards } from "./hooks/useTabCloseGuards";
import { useWorkspaceSwitcher } from "./hooks/useWorkspaceSwitcher";
import {
  isSkillWorkspace,
  isSkillPath,
  extractSkillName,
  isDefaultGeminiSkill,
  OPEN_SKILL_PROJECT_EVENT,
  type OpenSkillProjectPayload,
} from "@/modules/antigravity/skillUtils";

export default function App() {
  const {
    tabs,
    activeId,
    setActiveId,
    allocId,
    replaceTabs,
    moveTabToSpace,
    reorderTab,
    reorderTabByGap,
    newTabInSpace,
    removeTabsForSpace,
    markBooted,
    setActiveSpaceForNewTabs,
    newTab,
    newPrivateTab,
    openFileTab,
    pinTab,
    openSettingsTab,
    openAntigravityTab,
    openAntigravitySettingsTab,
    newPreviewTab,
    newMarkdownTab,
    setMarkdownView,
    newSvgTab,
    openExtensionTab,
    setSvgView,
    setOverrideLanguage,
    openGitDiffTab,
    openCommitHistoryTab,
    openCommitFileDiffTab,
    closeTab,
    updateTab,
    selectByIndex,
    setLeafCwd,
    focusPane,
    focusNextPaneInTab,
    swapActivePaneInDirection,
    splitActivePane,
    closeActivePane,
    closePaneByLeaf,
    resetWorkspace,
  } = useTabs(getLaunchDir() ? { cwd: getLaunchDir() } : undefined);

  const isAntigravityPanelOpen = useAntigravityStore((s) => s.isOpen);
  const openAntigravitySidePanel = useAntigravityStore((s) => s.openSidePanel);
  const closeAntigravitySidePanel = useAntigravityStore((s) => s.closeSidePanel);
  const toggleAntigravitySidePanel = useAntigravityStore((s) => s.toggle);
  const [dragDockHover, setDragDockHover] = useState(false);

  const handleDockAntigravityToSidePanel = useCallback(
    (tabId: number) => {
      openAntigravitySidePanel();
      closeTab(tabId);
    },
    [openAntigravitySidePanel, closeTab],
  );

  const handleMoveAntigravityToTab = useCallback(() => {
    closeAntigravitySidePanel();
    openAntigravityTab();
  }, [closeAntigravitySidePanel, openAntigravityTab]);

  useEffect(() => {
    let timer: any = null;
    void (async () => {
      await usePreferencesStore.getState().init();
      const autoUpdate = usePreferencesStore.getState().autoUpdateOnLaunch;
      if (autoUpdate) {
        timer = setTimeout(async () => {
          try {
            const { check } = await import("@tauri-apps/plugin-updater");
            const update = await check();
            if (update?.available) {
              toast.info(`Nuova versione TauCode disponibile: v${update.version}`, {
                description: "Apri le impostazioni per scaricarla e aggiornare.",
                action: {
                  label: "Aggiorna",
                  onClick: () => void openSettingsTab(),
                },
                duration: 12000,
              });
            }
          } catch (err) {
            console.debug("Silent auto-update check skipped/failed:", err);
          }
        }, 3500);
      }
    })();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [openSettingsTab]);

  useEffect(() => {
    const handleOpenSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      void openSettingsTab(detail);
    };
    window.addEventListener("terax:open-settings", handleOpenSettings);
    return () => window.removeEventListener("terax:open-settings", handleOpenSettings);
  }, [openSettingsTab]);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const activeTerminalTab = useMemo(() => {
    const t = tabs.find((x) => x.id === activeId);
    return t && t.kind === "terminal" ? t : null;
  }, [tabs, activeId]);
  const activeLeafId = activeTerminalTab?.activeLeafId ?? null;

  const searchAddons = useRef<Map<number, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalRefs = useRef<Map<number, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const [gitHistoryHandle, setGitHistoryHandle] =
    useState<GitHistorySearchHandle | null>(null);
  const { zoomIn, zoomOut, zoomReset } = useZoom();
  useApplyEditorFontSize();
  useTerminalFileDrop();
  const explorerRef = useRef<FileExplorerHandle>(null);

  const liveLeavesRef = useRef<Set<number>>(new Set());

  const clearWorkspaceState = useCallback(() => {
    for (const id of liveLeavesRef.current) disposeSession(id);
    searchAddons.current.clear();
    terminalRefs.current.clear();
    editorRefs.current.clear();
    previewRefs.current.clear();
    setActiveSearchAddon(null);
    setActiveEditorHandle(null);
  }, []);

  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const setWorkspaceEnv = useWorkspaceEnvStore((s) => s.setEnv);
  const {
    home,
    launchCwd,
    launchCwdResolved,
    switchWorkspace,
    adoptWorkspaceEnv,
  } = useWorkspaceSwitcher({
    tabsRef,
    workspaceEnv,
    setWorkspaceEnv,
    resetWorkspace,
    clearWorkspaceState,
  });

  const activeSpaceId = useSpaces((s) => s.activeId);
  const spacesHydrated = useSpaces((s) => s.hydrated);

  const handleWorkspaceChange = useCallback(
    async (env: WorkspaceEnv) => {
      const switched = await switchWorkspace(env);
      if (switched && activeSpaceId) {
        useSpaces.getState().setEnv(activeSpaceId, env);
      }
    },
    [switchWorkspace, activeSpaceId],
  );

  useSpacesBoot({
    ready: launchCwdResolved,
    launchCwd,
    home,
    allocId,
    replaceTabs,
    markBooted,
    setActiveSpaceForNewTabs,
    adoptWorkspaceEnv,
  });

  useSpacePersistence({
    tabs,
    activeId,
    activeSpaceId: activeSpaceId ?? DEFAULT_SPACE_ID,
    enabled: spacesHydrated,
  });

  const prevSpaceRef = useRef(activeSpaceId);
  useEffect(() => {
    if (!spacesHydrated || !activeSpaceId) return;
    setActiveSpaceForNewTabs(activeSpaceId);
    const prev = prevSpaceRef.current;
    prevSpaceRef.current = activeSpaceId;
    if (prev === null || prev === activeSpaceId) return;
    const meta = useSpaces
      .getState()
      .spaces.find((s) => s.id === activeSpaceId);
    if (meta) {
      if (meta.root) void native.workspaceAuthorize(meta.root).catch(() => {});
      void adoptWorkspaceEnv(meta.env);
    }
    const inSpace = tabsRef.current.filter((t) => t.spaceId === activeSpaceId);
    if (inSpace.length === 0) return;
    if (inSpace.some((t) => t.id === activeId)) return;
    setActiveId(inSpace[inSpace.length - 1].id);
  }, [
    activeSpaceId,
    activeId,
    spacesHydrated,
    setActiveSpaceForNewTabs,
    setActiveId,
    adoptWorkspaceEnv,
  ]);

  useEffect(() => {
    const cleanup = useExtensionsStore.getState().initWatcher();
    return () => cleanup();
  }, []);

  const [switcherOpen, setSwitcherOpen] = useState(false);

  const spaceTabs = useMemo(
    () => tabs.filter((t) => t.spaceId === (activeSpaceId ?? DEFAULT_SPACE_ID)),
    [tabs, activeSpaceId],
  );

  const {
    sidebarRef,
    sidebarView,
    collapsedRef,
    persistSidebarView,
    persistSidebarCollapsed,
    toggleSidebar,
    cycleSidebarView,
    persistSidebarWidth,
    toggleExplorerFocus,
  } = useSidebarPanel(explorerRef);

  const mainContainerRef = useRef<HTMLElement | null>(null);
  const panelGroupRef = useRef<GroupImperativeHandle | null>(null);
  const antigravityPanelRef = useRef<PanelImperativeHandle | null>(null);

  // Applica e forza il layout con i pannelli laterali alla dimensione minima prima della chiusura
  // (SIDEBAR_MIN_WIDTH = 330px e MIN_ANTIGRAVITY_PANEL_WIDTH = 350px) ogni volta che la finestra
  // viene modificata, ridimensionata, tolta o rimessa a tutto schermo, garantendo che il pannello centrale
  // (workspace) prenda tutto lo spazio rimanente e sia aperto del tutto e ben visibile.
  const applyMinimalPanelLayout = useCallback(() => {
    const group = panelGroupRef.current;
    if (!group) return;
    const container = mainContainerRef.current;
    const containerWidth = container ? container.clientWidth : window.innerWidth;
    if (containerWidth <= 0) return;

    const isSidebarOpen = !collapsedRef.current && (sidebarRef.current ? !sidebarRef.current.isCollapsed() : true);
    const isAgyOpen = isAntigravityPanelOpen;

    if (containerWidth < 640) {
      if (isSidebarOpen && sidebarRef.current && !sidebarRef.current.isCollapsed()) {
        sidebarRef.current.collapse();
      }
      return;
    }

    let sidebarPct = 0;
    if (isSidebarOpen) {
      sidebarPct = Math.min(35, (SIDEBAR_MIN_WIDTH / containerWidth) * 100);
    }

    let agyPct = 0;
    if (isAgyOpen) {
      agyPct = Math.min(35, (MIN_ANTIGRAVITY_PANEL_WIDTH / containerWidth) * 100);
    }

    const workspacePct = Math.max(20, 100 - sidebarPct - agyPct);

    const newLayout: Record<string, number> = {};
    if (isSidebarOpen) {
      newLayout["sidebar"] = sidebarPct;
    }
    newLayout["workspace"] = workspacePct;
    if (isAgyOpen) {
      newLayout["antigravity-panel"] = agyPct;
    }

    try {
      group.setLayout(newLayout);
    } catch {
      if (isSidebarOpen && sidebarRef.current && !sidebarRef.current.isCollapsed()) {
        sidebarRef.current.resize(`${SIDEBAR_MIN_WIDTH}px`);
      }
      if (isAgyOpen && antigravityPanelRef.current) {
        antigravityPanelRef.current.resize(`${MIN_ANTIGRAVITY_PANEL_WIDTH}px`);
      }
    }
  }, [isAntigravityPanelOpen, collapsedRef, sidebarRef]);

  useEffect(() => {
    const container = mainContainerRef.current;
    let rafId: number | null = null;

    const handleResize = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        applyMinimalPanelLayout();
      });
    };

    let observer: ResizeObserver | null = null;
    if (container) {
      observer = new ResizeObserver(() => {
        handleResize();
      });
      observer.observe(container);
    }

    window.addEventListener("resize", handleResize);
    // Esegui anche subito al mount per normalizzare layout preesistenti
    handleResize();

    return () => {
      if (observer) observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
    };
  }, [applyMinimalPanelLayout]);

  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteInitialMode, setPaletteInitialMode] = useState<
    "commands" | "content"
  >("commands");
  const openCommandPalette = useCallback(
    (mode: "commands" | "content" = "commands") => {
      setPaletteInitialMode(mode);
      setCommandPaletteOpen(true);
    },
    [],
  );

  const activeTab = tabs.find((t) => t.id === activeId);
  const isTerminalTab = activeTab?.kind === "terminal";

  useEditorFileSync({ tabs, tabsRef, editorRefs });

  const activeSpace = useSpaces((s) =>
    s.spaces.find((x) => x.id === s.activeId),
  );

  const isSkillSpace = useMemo(() => isSkillWorkspace(activeSpace), [activeSpace]);
  const isDefaultSkill = useMemo(
    () =>
      isSkillSpace &&
      isDefaultGeminiSkill(activeSpace?.name || activeSpace?.root || ""),
    [isSkillSpace, activeSpace],
  );

  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(
    activeSpace?.root ?? null,
    activeTab,
    launchCwd ?? home,
  );

  useWindowTitle(activeTab, explorerRoot);

  useEffect(() => {
    setActiveSearchAddon(
      activeLeafId !== null
        ? (searchAddons.current.get(activeLeafId) ?? null)
        : null,
    );
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
  }, [activeId, activeLeafId]);

  const handleSearchReady = useCallback(
    (leafId: number, addon: SearchAddon) => {
      searchAddons.current.set(leafId, addon);
      if (leafId === activeLeafId) setActiveSearchAddon(addon);
    },
    [activeLeafId],
  );

  const disposeTab = useCallback(
    (id: number) => {
      editorRefs.current.delete(id);
      previewRefs.current.delete(id);
      closeTab(id);
    },
    [closeTab],
  );

  const {
    pendingCloseTab,
    pendingTerminalCloseTab,
    pendingDeleteTabs,
    handleClose,
    confirmClose,
    cancelClose,
    confirmTerminalClose,
    cancelTerminalClose,
    confirmDeleteClose,
    cancelDeleteClose,
    handlePathDeleted,
  } = useTabCloseGuards({ tabs, disposeTab });

  const { pendingAppClose, confirmAppClose, cancelAppClose } =
    useAppCloseGuard(tabsRef);

  useEffect(() => {
    const live = new Set<number>();
    for (const t of tabs) {
      if (t.kind === "terminal") {
        for (const id of leafIds(t.paneTree)) live.add(id);
      }
    }
    for (const id of liveLeavesRef.current) {
      if (!live.has(id)) disposeSession(id);
    }
    liveLeavesRef.current = live;
    for (const k of [...terminalRefs.current.keys()])
      if (!live.has(k)) terminalRefs.current.delete(k);
    for (const k of [...searchAddons.current.keys()])
      if (!live.has(k)) searchAddons.current.delete(k);
  }, [tabs]);

  const mruRef = useRef<number[]>([activeId]);
  useEffect(() => {
    mruRef.current = [
      activeId,
      ...mruRef.current.filter((id) => id !== activeId),
    ];
  }, [activeId]);
  useEffect(() => {
    const live = new Set(tabs.map((t) => t.id));
    mruRef.current = mruRef.current.filter((id) => live.has(id));
  }, [tabs]);

  const getSwitcherOrder = useCallback(() => {
    const space = activeSpaceId ?? DEFAULT_SPACE_ID;
    const inSpace = tabsRef.current
      .filter((t) => t.spaceId === space)
      .map((t) => t.id);
    const present = new Set(inSpace);
    const ordered = mruRef.current.filter((id) => present.has(id));
    for (const id of inSpace) if (!ordered.includes(id)) ordered.push(id);
    return [activeId, ...ordered.filter((id) => id !== activeId)];
  }, [activeId, activeSpaceId]);

  const { state: switcherState, step: stepSwitcher } = useTabSwitcher({
    getOrder: getSwitcherOrder,
    onCommit: (id) => {
      if (tabsRef.current.some((t) => t.id === id)) setActiveId(id);
    },
  });

  const cycleSpace = useCallback((delta: 1 | -1) => {
    const { spaces, activeId: sid, setActive } = useSpaces.getState();
    if (spaces.length < 2) return;
    const idx = spaces.findIndex((s) => s.id === sid);
    const next = (idx + delta + spaces.length) % spaces.length;
    setActive(spaces[next].id);
  }, []);

  const openNewTab = useCallback(() => {
    newTab(inheritedCwdForNewTab());
  }, [newTab, inheritedCwdForNewTab]);

  const openNewPrivateTab = useCallback(() => {
    newPrivateTab(inheritedCwdForNewTab());
  }, [newPrivateTab, inheritedCwdForNewTab]);


  const sendCd = useCallback(
    (path: string) => {
      if (activeLeafId === null) return;
      const term = terminalRefs.current.get(activeLeafId);
      if (!term) return;
      term.write(`cd ${quoteShellArg(path)}\r`);
      term.focus();
    },
    [activeLeafId],
  );

  const cdInNewTab = useCallback(
    (path: string) => {
      const tabId = newTab(path);
      setTimeout(() => {
        const tab = tabsRef.current.find((x) => x.id === tabId);
        if (!tab || tab.kind !== "terminal") return;
        const t = terminalRefs.current.get(tab.activeLeafId);
        if (!t) return;
        t.write(`cd ${quoteShellArg(path)}\r`);
        t.focus();
      }, 80);
    },
    [newTab],
  );

  const pendingGotoLine = useRef<Map<number, number>>(new Map());
  const openContentHit = useCallback(
    (path: string, line: number) => {
      const id = openFileTab(path, true);
      if (id == null) return;
      const h = editorRefs.current.get(id);
      if (h) h.gotoLine(line);
      else pendingGotoLine.current.set(id, line);
    },
    [openFileTab],
  );

  useEffect(() => {
    setLspNavigator({ openFile: openContentHit });
    return () => setLspNavigator(null);
  }, [openContentHit]);

  const handleOpenFile = useCallback(
    (path: string, pin?: boolean, line?: number, customTitle?: string) => {
      if (line != null) {
        openContentHit(path, line);
        return;
      }
      const extMatch = ExtensionRegistry.findTabForFileExtension(path);
      if (extMatch) {
        const title =
          customTitle || path.split(/[\\/]/).pop() || extMatch.tab.title || "Extension Tab";
        openExtensionTab({
          extensionId: extMatch.extension.id,
          tabContributionId: extMatch.tab.id,
          title,
          path,
        });
        return;
      }
      if (isMarkdownPath(path)) newMarkdownTab(path, customTitle);
      else if (isSvgPath(path)) newSvgTab(path);
      else {
        openFileTab(path, pin ?? false);
      }
    },
    [openFileTab, newMarkdownTab, newSvgTab, openExtensionTab, openContentHit],
  );

  useEffect(() => {
    const handleOpenExt = (e: Event) => {
      const customEvent = e as CustomEvent<{
        extensionId: string;
        tabContributionId: string;
        title?: string;
        path?: string;
        params?: Record<string, unknown>;
      }>;
      if (customEvent.detail?.extensionId && customEvent.detail?.tabContributionId) {
        openExtensionTab(customEvent.detail);
      }
    };
    window.addEventListener("terax:open-extension-tab", handleOpenExt);
    return () => window.removeEventListener("terax:open-extension-tab", handleOpenExt);
  }, [openExtensionTab]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const openAll = (paths: string[]) => {
      for (const path of paths) handleOpenFile(path, true);
    };
    (async () => {
      unlisten = await listen<string[]>("terax:open-file", (e) => {
        openAll(e.payload);
      });
      openAll(await consumeLaunchFiles());
    })();
    return () => unlisten?.();
  }, [handleOpenFile]);

  const runnerTerminalTabsRef = useRef<number[]>([]);

  const handleCloseTerminal = useCallback(
    (filter?: { tabId?: number; title?: string; last?: boolean; all?: boolean }) => {
      const currentTabs = tabsRef.current;
      const runnerTabs = runnerTerminalTabsRef.current;

      // 1. Se specificato tabId numerico
      if (filter?.tabId != null) {
        closeTab(filter.tabId);
        runnerTerminalTabsRef.current = runnerTabs.filter((id) => id !== filter.tabId);
        return [filter.tabId];
      }

      // 2. Se specificato title
      if (filter?.title) {
        const targetTitle = filter.title.toLowerCase().trim();
        const matching = currentTabs.filter(
          (t) =>
            t.kind === "terminal" &&
            (t.customTitle?.toLowerCase().trim() === targetTitle ||
              t.title.toLowerCase().trim() === targetTitle),
        );
        for (const t of matching) {
          closeTab(t.id);
        }
        const closedIds = matching.map((t) => t.id);
        runnerTerminalTabsRef.current = runnerTabs.filter(
          (id) => !closedIds.includes(id),
        );
        return closedIds;
      }

      // 3. Se specificato all: chiude tutti i tab aperti dal runner
      if (filter?.all) {
        const closedIds: number[] = [];
        for (const id of [...runnerTabs]) {
          const exists = currentTabs.some((t) => t.id === id);
          if (exists) {
            closeTab(id);
            closedIds.push(id);
          }
        }
        runnerTerminalTabsRef.current = [];
        return closedIds;
      }

      // 4. Default / last: chiude l'ultimo tab terminale aperto dal runner
      while (runnerTerminalTabsRef.current.length > 0) {
        const lastId = runnerTerminalTabsRef.current.pop()!;
        const exists = currentTabs.some((t) => t.id === lastId);
        if (exists) {
          closeTab(lastId);
          return [lastId];
        }
      }

      // Fallback: se nessun tab tracciato dal runner, chiudi il tab terminale attualmente attivo
      const activeTab = currentTabs.find((t) => t.id === activeId);
      if (activeTab && activeTab.kind === "terminal") {
        closeTab(activeTab.id);
        return [activeTab.id];
      }

      return [];
    },
    [closeTab, activeId],
  );

  const handleRunInTerminal = useCallback(
    (command: string, cwd?: string, title?: string, autoClose?: boolean, interactive?: boolean) => {
      const tabId = newTab(cwd || inheritedCwdForNewTab());
      runnerTerminalTabsRef.current.push(tabId);
      if (title) {
        updateTab(tabId, { customTitle: title });
      }

      const isWin =
        typeof navigator !== "undefined" &&
        (navigator.platform?.includes("Win") ||
          navigator.userAgent?.includes("Windows"));
      const executionCmd = autoClose && !interactive
        ? isWin
          ? `${command}; exit`
          : `${command} && exit`
        : command;

      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const tab = tabsRef.current.find((x) => x.id === tabId);
        if (!tab || tab.kind !== "terminal") {
          clearInterval(interval);
          return;
        }
        const t = terminalRefs.current.get(tab.activeLeafId);
        if (t) {
          clearInterval(interval);
          t.write(`${executionCmd}\r`);
          t.focus();
        } else if (attempts > 30) {
          clearInterval(interval);
        }
      }, 50);
      return tabId;
    },
    [newTab, inheritedCwdForNewTab, updateTab],
  );

  const handleRunInTerminalRef = useRef(handleRunInTerminal);
  handleRunInTerminalRef.current = handleRunInTerminal;

  const handleCloseTerminalRef = useRef(handleCloseTerminal);
  handleCloseTerminalRef.current = handleCloseTerminal;

const openExtensionTabRef = useRef(openExtensionTab);
  openExtensionTabRef.current = openExtensionTab;

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const newPreviewTabRef = useRef(newPreviewTab);
  newPreviewTabRef.current = newPreviewTab;

  const openFileTabRef = useRef(openFileTab);
  openFileTabRef.current = openFileTab;

  const newMarkdownTabRef = useRef(newMarkdownTab);
  newMarkdownTabRef.current = newMarkdownTab;

  const newSvgTabRef = useRef(newSvgTab);
  newSvgTabRef.current = newSvgTab;

  const openSettingsTabRef = useRef(openSettingsTab);
  openSettingsTabRef.current = openSettingsTab;

  const newTabRef = useRef(newTab);
  newTabRef.current = newTab;

  const closeTabRef = useRef(closeTab);
  closeTabRef.current = closeTab;

  const setActiveIdRef = useRef(setActiveId);
  setActiveIdRef.current = setActiveId;

  const updateTabRef = useRef(updateTab);
  updateTabRef.current = updateTab;


  const lastProcessedRef = useRef<{
    id?: string | number;
    cmd?: string;
    time: number;
  }>({ time: 0 });

  useEffect(() => {
    let unlistenOpen: (() => void) | null = null;
    let unlistenClose: (() => void) | null = null;
    let unlistenEval: (() => void) | null = null;
    let mounted = true;

    listen<{
      command: string;
      cwd?: string;
      title?: string;
      autoClose?: boolean;
      interactive?: boolean;
      reqId?: string | number;
    }>("terax:open-terminal-command", (e) => {
      const payload = e.payload;
      if (!payload?.command) return;

      const now = Date.now();
      // Deduplicazione: ignora eventi duplicati ricevuti entro 400ms o con lo stesso reqId
      if (payload.reqId && payload.reqId === lastProcessedRef.current.id) {
        return;
      }
      if (
        payload.command === lastProcessedRef.current.cmd &&
        now - lastProcessedRef.current.time < 400
      ) {
        return;
      }
      lastProcessedRef.current = {
        id: payload.reqId,
        cmd: payload.command,
        time: now,
      };

      handleRunInTerminalRef.current(
        payload.command,
        payload.cwd,
        payload.title,
        payload.autoClose,
        payload.interactive,
      );
    }).then((fn) => {
      if (mounted) unlistenOpen = fn;
      else fn();
    });

    listen<{
      tabId?: number;
      title?: string;
      last?: boolean;
      all?: boolean;
    }>("terax:close-terminal-command", (e) => {
      handleCloseTerminalRef.current(e.payload);
    }).then((fn) => {
      if (mounted) unlistenClose = fn;
      else fn();
    });
listen<{
      reqId: string;
      action: string;
      params?: any;
    }>("terax:eval-request", async (e) => {
      const { reqId, action, params = {} } = e.payload;
      let result: any = { ok: true };

      try {
        switch (action) {
          case "list_tabs": {
            const list = tabsRef.current.map((t) => ({
              id: t.id,
              kind: t.kind,
              title: t.kind === "terminal" && t.customTitle ? t.customTitle : t.title,
              active: t.id === activeIdRef.current,
              path: "path" in t ? t.path : undefined,
              url: "url" in t ? t.url : undefined,
              cwd: "cwd" in t ? t.cwd : undefined,
              activeLeafId: "activeLeafId" in t ? t.activeLeafId : undefined,
            }));
            result = { ok: true, activeId: activeIdRef.current, tabs: list };
            break;
          }

          case "open_tab": {
            const {
              kind,
              title,
              path,
              url,
              line,
              cwd,
              command,
              autoClose,
              interactive,
              focus = true,
            } = params;
            let tabId: number | undefined;
            let leafId: number | undefined;

            if (kind === "preview") {
              tabId = newPreviewTabRef.current(url || "http://localhost:5173", title);
            } else if (kind === "extension") {
              tabId = openExtensionTabRef.current({
                extensionId: params.extensionId || "",
                tabContributionId: params.tabContributionId || "",
                title: title || (path ? path.split(/[\\/]/).pop() : undefined),
                path,
                params: params.params,
              });
            } else if (kind === "editor") {
              if (path) {
                tabId = openFileTabRef.current(path, false);
                if (line != null && tabId != null) {
                  pendingGotoLine.current.set(tabId, line);
                  const editorH = editorRefs.current.get(tabId);
                  if (editorH) editorH.gotoLine(line);
                }
              }
            } else if (kind === "terminal") {
              if (command) {
                tabId = handleRunInTerminalRef.current(
                  command,
                  cwd,
                  title,
                  autoClose,
                  interactive ?? true,
                );
              } else {
                tabId = newTabRef.current(cwd || inheritedCwdForNewTab());
                if (title && tabId != null) updateTabRef.current(tabId, { customTitle: title });
              }
              const tab = tabsRef.current.find((t) => t.id === tabId);
              if (tab && "activeLeafId" in tab) {
                leafId = tab.activeLeafId;
              }
            } else if (kind === "markdown") {
              if (path) tabId = newMarkdownTabRef.current(path, title);
            } else if (kind === "svg") {
              if (path) tabId = newSvgTabRef.current(path);
            } else if (kind === "settings") {
              openSettingsTabRef.current(params.section || "general");
              const active = tabsRef.current.find((t) => t.kind === "settings");
              tabId = active?.id;
            } else {
              tabId = newTabRef.current(cwd);
            }

            if (tabId != null && focus) {
              setActiveIdRef.current(tabId);
            }

            result = { ok: true, tabId, leafId, kind };
            break;
          }

          case "close_tab": {
            const closedIds = handleCloseTerminalRef.current(params);
            if (params.tabId != null && !closedIds.includes(params.tabId)) {
              closeTabRef.current(params.tabId);
              closedIds.push(params.tabId);
            } else if (params.kind && params.kind !== "terminal") {
              const matching = tabsRef.current.filter((t) => t.kind === params.kind);
              for (const t of matching) {
                closeTabRef.current(t.id);
                closedIds.push(t.id);
              }
            }
            result = { ok: true, closedCount: closedIds.length, closedIds };
            break;
          }

          case "focus_tab": {
            if (params.tabId != null) {
              setActiveIdRef.current(params.tabId);
              result = { ok: true, activeId: params.tabId };
            } else {
              result = { ok: false, error: "Parametro tabId mancante" };
            }
            break;
          }

          case "get_tab_layout": {
            result = {
              ok: true,
              layout: "1",
              message: "TauCode opera in modalità single-tab",
            };
            break;
          }

          case "set_tab_layout": {
            result = {
              ok: true,
              layout: "1",
              message: "TauCode opera in modalità single-tab",
            };
            break;
          }

          case "terminal_output": {
            const targetId = params.tabId != null ? params.tabId : activeIdRef.current;
            let tab = tabsRef.current.find(
              (t) => t.id === targetId && t.kind === "terminal",
            );
            if (!tab) {
              tab = [...tabsRef.current].reverse().find((t) => t.kind === "terminal");
            }
            if (tab && "activeLeafId" in tab) {
              const handle = terminalRefs.current.get(tab.activeLeafId);
              const maxLines = typeof params.lines === "number" ? params.lines : 200;
              const buffer = handle ? handle.getBuffer(maxLines) || "" : "";
              result = {
                ok: true,
                tabId: tab.id,
                leafId: tab.activeLeafId,
                title: tab.customTitle || tab.title,
                buffer,
                linesCount: buffer ? buffer.split("\n").length : 0,
              };
            } else {
              result = { ok: false, error: "Nessun tab terminale trovato" };
            }
            break;
          }

          case "terminal_input": {
            const targetId = params.tabId != null ? params.tabId : activeIdRef.current;
            let tab = tabsRef.current.find(
              (t) => t.id === targetId && t.kind === "terminal",
            );
            if (!tab) {
              tab = [...tabsRef.current].reverse().find((t) => t.kind === "terminal");
            }

            if (tab && "activeLeafId" in tab) {
              const handle = terminalRefs.current.get(tab.activeLeafId);
              if (handle) {
                let toWrite = params.text || "";
                if (params.key) {
                  const k = params.key.toLowerCase();
                  if (k === "enter" || k === "return") toWrite += "\r";
                  else if (k === "arrowdown" || k === "down") toWrite += "\x1b[B";
                  else if (k === "arrowup" || k === "up") toWrite += "\x1b[A";
                  else if (k === "arrowright" || k === "right") toWrite += "\x1b[C";
                  else if (k === "arrowleft" || k === "left") toWrite += "\x1b[D";
                  else if (k === "ctrl+c" || k === "sigint") toWrite += "\x03";
                  else if (k === "ctrl+d" || k === "eof") toWrite += "\x04";
                  else if (k === "backspace") toWrite += "\x7f";
                  else if (k === "tab") toWrite += "\t";
                  else if (k === "escape" || k === "esc") toWrite += "\x1b";
                }
                handle.write(toWrite);
                handle.focus();
                result = {
                  ok: true,
                  tabId: tab.id,
                  leafId: tab.activeLeafId,
                  bytesWritten: toWrite.length,
                };
              } else {
                result = { ok: false, error: "Handle terminale non ancora pronto" };
              }
            } else {
              result = { ok: false, error: "Nessun terminale attivo per l'input" };
            }
            break;
          }

          case "tab_screenshot": {
            const targetId = params.tabId != null ? params.tabId : activeIdRef.current;
            const targetTab = tabsRef.current.find((t) => t.id === targetId);

            

            const surfaceEl =
              document.getElementById("taucode-workspace-surface") ||
              document.querySelector(".relative.h-full.min-h-0") ||
              document.body;

            const dataUrl = await toPng(surfaceEl as HTMLElement, {
              quality: 0.95,
              skipFonts: true,
            });

            result = {
              ok: true,
              tabId: targetId,
              kind: targetTab?.kind || "workspace",
              title: targetTab?.title || "TauCode Workspace",
              dataUrl,
              savePath: params.savePath,
            };
            break;
          }

          default:
            result = { ok: false, error: `Azione sconosciuta: ${action}` };
        }
      } catch (err: any) {
        result = { ok: false, error: err?.message || String(err) };
      }

      try {
        await invoke("terax_eval_response", { reqId, result });
      } catch (invokeErr) {
        console.warn("[App] Errore risposta terax_eval_response:", invokeErr);
      }
    }).then((fn) => {
      if (mounted) unlistenEval = fn;
      else fn();
    });

    return () => {
      mounted = false;
      if (unlistenOpen) unlistenOpen();
      if (unlistenClose) unlistenClose();
      if (unlistenEval) unlistenEval();
    };
  }, []);

  // Trim working set pages on idle/minimize to free physical RAM when backgrounded
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibility = () => {
      if (document.hidden) {
        timer = setTimeout(() => {
          invoke("trim_process_memory").catch(() => {});
        }, 6000);
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Ascolta l'evento globale per aprire o creare una Skill come Space/Workspace nativo dell'editor
  useEffect(() => {
    const handleOpenSkill = (e: Event) => {
      const customEvent = e as CustomEvent<OpenSkillProjectPayload>;
      const { name, path, entryFile } = customEvent.detail || {};
      if (!name || !path) return;

      const normTarget = path.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
      const { spaces, create, setActive } = useSpaces.getState();

      const existing = spaces.find((s) => {
        if (!s.root) return false;
        const normRoot = s.root.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
        return normRoot === normTarget || s.name === `Skill: ${name}`;
      });

      let targetSpaceId: string;
      if (existing) {
        targetSpaceId = existing.id;
        setActive(existing.id);
      } else {
        const meta = create({
          name: `Skill: ${name}`,
          root: path,
        });
        targetSpaceId = meta.id;
        setActive(meta.id);
      }

      setActiveSpaceForNewTabs(targetSpaceId);

      const fileToOpen =
        entryFile ||
        `${path.replace(/[\\/]+$/, "")}/skill.json`;

      setTimeout(() => {
        handleOpenFile(fileToOpen, true);
      }, 80);
    };

    window.addEventListener(OPEN_SKILL_PROJECT_EVENT, handleOpenSkill);
    return () => {
      window.removeEventListener(OPEN_SKILL_PROJECT_EVENT, handleOpenSkill);
    };
  }, [handleOpenFile, setActiveSpaceForNewTabs]);

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      const normFrom = from.replace(/\\/g, "/").replace(/\/+$/, "");
      const normTo = to.replace(/\\/g, "/").replace(/\/+$/, "");
      for (const t of tabs) {
        if (t.kind !== "editor" && t.kind !== "markdown" && t.kind !== "svg")
          continue;
        const normTabPath = t.path.replace(/\\/g, "/");
        if (normTabPath === normFrom) {
          const i = to.lastIndexOf("/");
          const j = to.lastIndexOf("\\");
          const idx = Math.max(i, j);
          updateTab(t.id, { path: to, title: idx === -1 ? to : to.slice(idx + 1) });
        } else if (normTabPath.startsWith(`${normFrom}/`)) {
          const suffix = normTabPath.slice(normFrom.length);
          const newPath = `${normTo}${suffix}`;
          const i = newPath.lastIndexOf("/");
          updateTab(t.id, {
            path: newPath,
            title: i === -1 ? newPath : newPath.slice(i + 1),
          });
        }
      }
    },
    [tabs, updateTab],
  );

  const activeTerminalLeafCwd =
    activeTab?.kind === "terminal"
      ? (findLeafCwd(activeTab.paneTree, activeTab.activeLeafId) ??
        activeTab.cwd ??
        null)
      : null;

  const activeFilePath = (() => {
    if (activeTab?.kind === "editor") return activeTab.path;
    if (activeTab?.kind === "git-diff") {
      if (/^([A-Za-z]:|\/|\\)/.test(activeTab.path)) return activeTab.path;
      const root = activeTab.repoRoot.replace(/[\\/]+$/, "");
      const rel = activeTab.path.replace(/^[\\/]+/, "");
      return `${root}/${rel}`;
    }
    if (activeTab?.kind === "git-commit-file") {
      const root = activeTab.repoRoot.replace(/[\\/]+$/, "");
      const rel = activeTab.path.replace(/^[\\/]+/, "");
      return `${root}/${rel}`;
    }
    return null;
  })();
  const explorerActiveFilePath =
    activeTab?.kind === "editor" ||
    activeTab?.kind === "markdown" ||
    activeTab?.kind === "svg"
      ? activeTab.path
      : null;
  const { sourceControl, toggleSourceControl, openGitGraphFromContext } =
    useSourceControlContext({
      activeTab,
      tabs,
      activeTerminalLeafCwd,
      explorerRoot,
      launchCwd,
      launchCwdResolved,
      home,
      sidebarView,
      cycleSidebarView,
      openCommitHistoryTab,
    });
  const sourceControlRef = useRef(sourceControl);
  sourceControlRef.current = sourceControl;

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;

    listen<{
      repoRoot?: string;
      remote?: string | null;
      branch?: string | null;
      pushed?: boolean;
    }>("terax:git-pushed", (e) => {
      sourceControlRef.current.refresh({ remote: "always" });
      const target = `${e.payload.remote ?? "origin"}/${e.payload.branch ?? "main"}`;
      toast.success(`Antigravity: Git Push completato su ${target}`);
    }).then((fn) => {
      if (mounted) unlisten = fn;
      else fn();
    });

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  const explorerGitDecorations = usePreferencesStore(
    (s) => s.explorerGitDecorations,
  );

  const openPreviewTab = useCallback(
    (url: string) => {
      const id = newPreviewTab(url);
      if (!url) {
        setTimeout(() => previewRefs.current.get(id)?.focusAddressBar(), 0);
      }
      return id;
    },
    [newPreviewTab],
  );

  const splitActivePaneInActiveTab = useCallback(
    (dir: "row" | "col") => {
      const t = tabsRef.current.find((x) => x.id === activeId);
      if (!t || t.kind !== "terminal") return;
      splitActivePane(activeId, dir);
    },
    [activeId, splitActivePane],
  );

  const livePaneBounds = useCallback((tabId: number): PaneBounds[] => {
    const tab = document.querySelector<HTMLElement>(
      `[data-terminal-tab="${tabId}"]`,
    );
    if (!tab) return [];
    return [...tab.querySelectorAll<HTMLElement>("[data-pane-leaf]")].flatMap(
      (element) => {
        const id = Number(element.dataset.paneLeaf);
        if (!Number.isFinite(id)) return [];
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return [{ id, left, right, top, bottom }];
      },
    );
  }, []);

  const swapActivePane = useCallback(
    (direction: "left" | "right" | "up" | "down") => {
      swapActivePaneInDirection(activeId, direction, livePaneBounds(activeId));
    },
    [activeId, livePaneBounds, swapActivePaneInDirection],
  );

  const handleCloseTabOrPane = useCallback(() => {
    const t = tabsRef.current.find((x) => x.id === activeId);
    if (t?.kind === "terminal" && leafIds(t.paneTree).length > 1) {
      closeActivePane(activeId);
      return;
    }
    void handleClose(activeId);
  }, [activeId, closeActivePane, handleClose]);

  const [zenMode, setZenMode] = useState(false);

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "commandPalette.open": () => openCommandPalette("commands"),
      "commandPalette.content": () => openCommandPalette("content"),
      "tab.new": openNewTab,
      "tab.newPrivate": openNewPrivateTab,
      "tab.newPreview": () => openPreviewTab(""),
      "tab.newEditor": () => setNewEditorOpen(true),
      "tab.close": handleCloseTabOrPane,
      "tab.next": () => stepSwitcher(1),
      "tab.prev": () => stepSwitcher(-1),
      "tab.selectByIndex": (e) =>
        selectByIndex(
          parseInt(e.key, 10) - 1,
          activeSpaceId ?? DEFAULT_SPACE_ID,
        ),
      "space.next": () => cycleSpace(1),
      "space.prev": () => cycleSpace(-1),
      "space.overview": () => setSwitcherOpen(true),
      "pane.splitRight": () => splitActivePaneInActiveTab("row"),
      "pane.splitDown": () => splitActivePaneInActiveTab("col"),
      "pane.focusNext": () => focusNextPaneInTab(activeId, 1),
      "pane.focusPrev": () => focusNextPaneInTab(activeId, -1),
      "pane.swapLeft": () => swapActivePane("left"),
      "pane.swapRight": () => swapActivePane("right"),
      "pane.swapUp": () => swapActivePane("up"),
      "pane.swapDown": () => swapActivePane("down"),
      "pane.source": toggleSourceControl,
      "terminal.clear": () => {
        clearFocusedTerminal();
      },
      "search.focus": () => {
        const editor = editorRefs.current.get(activeId);
        if (editor) editor.openSearch();
        else searchInlineRef.current?.focus();
      },
      "settings.open": () => void openSettingsTab(),
      "sidebar.toggle": toggleSidebar,
      "explorer.focus": toggleExplorerFocus,
      "view.zoomIn": zoomIn,
      "view.zoomOut": zoomOut,
      "view.zoomReset": zoomReset,
      "view.zenMode": () => setZenMode((v) => !v),
      "view.toggleFullscreen": () => {
        void (async () => {
          try {
            const w = getCurrentWindow();
            const isFull = await w.isFullscreen();
            if (!isFull && (await w.isMaximized())) {
              await w.unmaximize();
            }
            await w.setFullscreen(!isFull);
          } catch (err) {
            console.error("toggleFullscreen failed:", err);
          }
        })();
      },
      "editor.undo": () => editorRefs.current.get(activeId)?.undo(),
      "editor.redo": () => editorRefs.current.get(activeId)?.redo(),
      "editor.codeComplete": () =>
        editorRefs.current.get(activeId)?.triggerCodeComplete(),
    }),
    [
      activeId,
      openCommandPalette,
      stepSwitcher,
      cycleSpace,
      handleCloseTabOrPane,
      openNewTab,
      openNewPrivateTab,
      openPreviewTab,
      activeSpaceId,
      selectByIndex,
      splitActivePaneInActiveTab,
      focusNextPaneInTab,
      swapActivePane,
      toggleSourceControl,
      openSettingsTab,
      toggleSidebar,
      toggleExplorerFocus,
      zoomIn,
      zoomOut,
      zoomReset,
    ],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => {
      const terminalPaneCount =
        activeTab?.kind === "terminal"
          ? leafIds(activeTab.paneTree).length
          : null;
      if (shouldDisablePaneSwapShortcut(id, terminalPaneCount)) return true;
      if (
        id === "editor.undo" ||
        id === "editor.redo" ||
        id === "editor.codeComplete"
      ) {
        return activeTab?.kind !== "editor";
      }
      if (id === "terminal.clear") {
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        return !(target as HTMLElement | null)?.closest?.(".xterm");
      }
      if (id === "sidebar.toggle") {
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        const inTerminal = !!(target as HTMLElement | null)?.closest?.(
          ".xterm",
        );
        return inTerminal && !e.shiftKey;
      }
      return false;
    },
    [activeTab],
  );

  useGlobalShortcuts(shortcutHandlers, { isDisabled: shortcutsDisabled });

  const registerTerminalHandle = useCallback(
    (leafId: number, handle: TerminalPaneHandle | null) => {
      if (handle) terminalRefs.current.set(leafId, handle);
      else terminalRefs.current.delete(leafId);
    },
    [],
  );

  const registerEditorHandle = useCallback(
    (id: number, handle: EditorPaneHandle | null) => {
      if (handle) {
        editorRefs.current.set(id, handle);
        const line = pendingGotoLine.current.get(id);
        if (line != null) {
          pendingGotoLine.current.delete(id);
          handle.gotoLine(line);
        }
      } else {
        editorRefs.current.delete(id);
      }
      if (id === activeId) setActiveEditorHandle(handle);
    },
    [activeId],
  );

  const registerPreviewHandle = useCallback(
    (id: number, handle: PreviewPaneHandle | null) => {
      if (handle) previewRefs.current.set(id, handle);
      else previewRefs.current.delete(id);
    },
    [],
  );

  const handleEditorDirty = useCallback(
    (id: number, dirty: boolean) => {
      updateTab(id, { dirty });
    },
    [updateTab],
  );

  const handlePreviewUrl = useCallback(
    (id: number, url: string) => {
      updateTab(id, { url });
    },
    [updateTab],
  );

  const handleRenameTab = useCallback(
    (id: number, title: string) => {
      updateTab(id, { customTitle: title });
    },
    [updateTab],
  );


  const handleTerminalCwd = useCallback(
    (leafId: number, cwd: string) => {
      setLeafCwd(leafId, cwd);
    },
    [setLeafCwd],
  );

  const handleLeafExit = useCallback(
    (leafId: number) => {
      disposeSession(leafId);
      closePaneByLeaf(leafId);
    },
    [closePaneByLeaf],
  );

  const handleFocusLeaf = useCallback(
    (tabId: number, leafId: number) => {
      focusPane(tabId, leafId);
    },
    [focusPane],
  );

  const handleOpenFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open Folder in New Space",
    });
    if (typeof selected === "string") {
      await native.workspaceAuthorize(selected).catch(() => {});
      const normalized = selected.replace(/\\/g, "/");
      const folderName =
        normalized.split("/").filter(Boolean).pop() || "Folder";
      const { create, setActive } = useSpaces.getState();
      const meta = create({ name: folderName, root: normalized });
      setActive(meta.id);
    }
  }, []);

  const handleCloseFolder = useCallback(() => {
    if (!activeSpaceId) return;
    const { spaces, remove, create, setActive } = useSpaces.getState();
    const remaining = spaces.filter((s) => s.id !== activeSpaceId);
    if (remaining.length > 0) {
      const fallbackSpaceId = remaining[0].id;
      setActive(fallbackSpaceId);
      remove(activeSpaceId);
      removeTabsForSpace(activeSpaceId, fallbackSpaceId, home ?? undefined);
    } else {
      remove(activeSpaceId);
      const meta = create({
        id: DEFAULT_SPACE_ID,
        name: "Default",
        root: null,
      });
      setActive(meta.id);
      removeTabsForSpace(activeSpaceId, meta.id, home ?? undefined);
    }
  }, [activeSpaceId, home, removeTabsForSpace]);

  const activeCwd =
    activeTab?.kind === "terminal"
      ? (findLeafCwd(activeTab.paneTree, activeTab.activeLeafId) ??
        activeTab.cwd ??
        home)
      : (explorerRoot ?? home);

  const spaceSwitcher = (
    <SpaceSwitcher
      open={switcherOpen}
      onOpenChange={setSwitcherOpen}
      tabs={tabs}
      onNewSpace={() => {
        const { create, setActive } = useSpaces.getState();
        const meta = create({ name: "New Space", root: null });
        setActive(meta.id);
      }}
      onDeleteSpace={(id: string) => {
        const { spaces, remove, create, setActive } = useSpaces.getState();
        const remaining = spaces.filter((s) => s.id !== id);
        if (remaining.length === 0) {
          remove(id);
          const meta = create({
            id: DEFAULT_SPACE_ID,
            name: "Default",
            root: null,
          });
          setActive(meta.id);
          removeTabsForSpace(id, meta.id, home ?? undefined);
        } else {
          const fallback = remaining[0]?.id ?? DEFAULT_SPACE_ID;
          remove(id);
          removeTabsForSpace(id, fallback, home ?? undefined);
        }
      }}
      onNewTabInSpace={newTabInSpace}
      onJumpTab={(id: number) => setActiveId(id)}
      onCloseTab={(id: number) => void handleClose(id)}
      onMoveTabToSpace={moveTabToSpace}
      onReorderTab={reorderTab}
      onReorderSpaces={(orderedIds: string[]) => {
        useSpaces.getState().reorder(orderedIds);
      }}
    />
  );

  const searchTarget: SearchTarget = useMemo(() => {
    if (activeTab?.kind === "terminal") {
      if (!activeSearchAddon) return null;
      return {
        kind: "terminal",
        addon: activeSearchAddon,
        focus: () => {
          if (activeLeafId !== null)
            terminalRefs.current.get(activeLeafId)?.focus();
        },
      };
    }
    if (activeTab?.kind === "editor") {
      if (!activeEditorHandle) return null;
      return {
        kind: "editor",
        handle: activeEditorHandle,
        focus: () => activeEditorHandle.focus(),
      };
    }
    if (activeTab?.kind === "git-history") {
      if (!gitHistoryHandle) return null;
      return {
        kind: "git-history",
        handle: gitHistoryHandle,
        focus: () => {},
      };
    }
    return null;
  }, [
    activeTab?.kind,
    activeSearchAddon,
    activeLeafId,
    activeEditorHandle,
    gitHistoryHandle,
  ]);

  const handleNewSpace = useCallback(() => {
    const { create, setActive } = useSpaces.getState();
    const meta = create({ name: "New Space", root: null });
    setActive(meta.id);
  }, []);

  // Automatically ensure TauCode directory and files when a project folder is open (excluded for skill workspaces)
  const currentProjectRoot = activeSpace?.root ?? explorerRoot ?? null;
  const isSkillProject = isSkillSpace || isSkillPath(currentProjectRoot);
  useEffect(() => {
    if (currentProjectRoot && !isSkillProject) {
      void ensureTauCodeStructure(currentProjectRoot).then(() => {
        // Force refresh explorer so TauCode folder appears immediately
        explorerRef.current?.refresh();
      });
    }
  }, [currentProjectRoot, isSkillProject]);

  const executeTauCodeAction = useCallback(
    async (type: TauCodeActionType) => {
      const projectRoot = activeSpace?.root ?? explorerRoot;
      if (!projectRoot) {
        toast.error("Nessun progetto aperto. Apri una cartella per compilare o eseguire.");
        return;
      }
      if (isSkillSpace || isSkillPath(projectRoot)) {
        return;
      }

      await ensureTauCodeStructure(projectRoot);
      const config = await readTauCodeConfig(projectRoot, type);
      const command = buildScriptCommand(config ?? {}, type);

      const actionLabel = type === "compile" ? "Compilazione" : "Esecuzione";
      toast.info(`${actionLabel}: ${command}`);

      const terminalTab =
        activeTab?.kind === "terminal"
          ? activeTab
          : (spaceTabs.find((t): t is TerminalTab => t.kind === "terminal") ?? null);

      const fullCommand = `cd "${projectRoot}"\r${command}\r`;

      if (terminalTab) {
        setActiveId(terminalTab.id);
        const leafId = terminalTab.activeLeafId;
        const term = terminalRefs.current.get(leafId);
        if (term) {
          term.write(fullCommand);
          term.focus();
        } else {
          writeToSession(leafId, fullCommand);
        }
      } else {
        const tabId = newTab(projectRoot);
        setTimeout(() => {
          const tab = tabsRef.current.find((x) => x.id === tabId);
          if (!tab || tab.kind !== "terminal") return;
          const t = terminalRefs.current.get(tab.activeLeafId);
          if (t) {
            t.write(fullCommand);
            t.focus();
          } else {
            writeToSession(tab.activeLeafId, fullCommand);
          }
        }, 150);
      }
    },
    [activeSpace?.root, explorerRoot, activeTab, spaceTabs, setActiveId, newTab],
  );

  const handleCompile = useCallback(async () => {
    if (isSkillSpace && activeSpace) {
      const skillName = extractSkillName(activeSpace.name, activeSpace.root);
      if (isDefaultGeminiSkill(skillName) || isDefaultGeminiSkill(activeSpace.root ?? "")) {
        toast.error(
          "Le skill predefinite di Gemini sono protette e non possono essere modificate né compilate.",
        );
        return;
      }

      // 1. Salva automaticamente tutti gli editor aperti con modifiche non salvate nello space corrente
      const dirtyTabs = spaceTabs.filter((t) => t.kind === "editor" && t.dirty);
      for (const tab of dirtyTabs) {
        const handle = editorRefs.current.get(tab.id);
        if (handle?.save) {
          await handle.save();
        }
      }

      // 2. Compila e sincronizza metadati della skill su disco (SKILL.md e skill.json)
      try {
        const oldRoot = activeSpace.root;
        const compiled = await invoke<{
          name: string;
          folder: string;
          path: string;
          entry_file: string;
          enabled: boolean;
        }>("compile_antigravity_skill_project", {
          name: skillName,
          path: activeSpace.root,
        });

        // Se il percorso è cambiato su disco a seguito della rinomina in skill.json
        if (oldRoot && compiled.path) {
          const normOld = oldRoot.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
          const normNew = compiled.path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
          if (normOld !== normNew) {
            useSpaces.getState().rename(activeSpace.id, `Skill: ${compiled.name}`);
            useSpaces.getState().setRoot(activeSpace.id, compiled.path);
            handlePathRenamed(oldRoot, compiled.path);
          } else if (activeSpace.name !== `Skill: ${compiled.name}`) {
            useSpaces.getState().rename(activeSpace.id, `Skill: ${compiled.name}`);
          }
        }

        // 3. Ricarica i tab editor aperti nello spazio corrente per mostrare frontmatter e json aggiornati
        for (const tab of spaceTabs) {
          if (tab.kind === "editor") {
            const handle = editorRefs.current.get(tab.id);
            if (handle?.reload) {
              handle.reload();
            }
          }
        }

        toast.success(`Skill "${compiled.name}" compilata e sincronizzata con successo!`);
        window.dispatchEvent(new CustomEvent("terax:skills-updated"));
      } catch (err) {
        toast.error(`Errore durante la compilazione della skill: ${err}`);
      }
      return;
    }

    void executeTauCodeAction("compile");
  }, [isSkillSpace, activeSpace, spaceTabs, executeTauCodeAction, handlePathRenamed]);

  const handleRun = useCallback(() => {
    void executeTauCodeAction("run");
  }, [executeTauCodeAction]);

  const commandPaletteItems = useMemo(
    () =>
      createCommandItems({
        tabs: spaceTabs,
        activeId,
        searchTarget,
        explorerRoot,
        home,
        openNewTab,
        openNewPrivate: openNewPrivateTab,
        openNewEditor: () => setNewEditorOpen(true),
        openNewPreview: () => openPreviewTab(""),
        openGitGraph: openGitGraphFromContext,
        toggleSourceControl,
        compileProject: handleCompile,
        runProject: handleRun,
        closeActiveTabOrPane: handleCloseTabOrPane,
        splitPaneRight: () => splitActivePaneInActiveTab("row"),
        splitPaneDown: () => splitActivePaneInActiveTab("col"),
        focusSearch: () => searchInlineRef.current?.focus(),
        focusExplorerSearch: () => explorerRef.current?.focusSearch(),
        toggleSidebar,
        openSettings: () => void openSettingsTab(),
        openKeyboardShortcuts: () => setCommandPaletteOpen(true),
        spaces: useSpaces.getState().spaces,
        activeSpaceId,
        openSpacesOverview: () => setSwitcherOpen(true),
        newSpace: handleNewSpace,
        switchSpace: (id) => useSpaces.getState().setActive(id),
        openAntigravity: openAntigravityTab,
        openAntigravitySettings: () => void openAntigravitySettingsTab(),
      }),
    [
      spaceTabs,
      activeId,
      searchTarget,
      explorerRoot,
      home,
      openNewTab,
      openNewPrivateTab,
      openPreviewTab,
      openGitGraphFromContext,
      toggleSourceControl,
      handleCompile,
      handleRun,
      handleCloseTabOrPane,
      splitActivePaneInActiveTab,
      toggleSidebar,
      openSettingsTab,
      activeSpaceId,
      handleNewSpace,
    ],
  );

  const insertHistoryCommand = useMemo(
    () =>
      isTerminalTab && activeLeafId !== null
        ? (cmd: string) => {
            writeToSession(activeLeafId, cmd);
            terminalRefs.current.get(activeLeafId)?.focus();
          }
        : null,
    [isTerminalTab, activeLeafId],
  );

  return (
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
          {!zenMode && (
            <Header
              tabs={spaceTabs}
              activeId={activeId}
              onSelect={setActiveId}
              onNew={openNewTab}
              onNewPrivate={openNewPrivateTab}
              onNewPreview={() => openPreviewTab("")}
              onNewEditor={() => setNewEditorOpen(true)}
              onNewGitGraph={openGitGraphFromContext}
              onClose={handleClose}
              onPin={pinTab}
              onRename={handleRenameTab}
              onReorder={reorderTabByGap}
              onToggleSidebar={toggleSidebar}
              onOpenCommandPalette={() => openCommandPalette("commands")}
              onOpenSettings={() => void openSettingsTab()}
              onNewAntigravity={openAntigravityTab}
              onDockToSidePanel={handleDockAntigravityToSidePanel}
              onDragDockHover={setDragDockHover}
              onToggleAntigravitySidePanel={toggleAntigravitySidePanel}
              isAntigravitySidePanelOpen={isAntigravityPanelOpen}
              onCompile={handleCompile}
              onRun={handleRun}
              isSkillSpace={isSkillSpace}
              isDefaultSkill={isDefaultSkill}
              hasProjectOpen={Boolean(activeSpace?.root ?? explorerRoot)}
              spaceSwitcher={spaceSwitcher}
              searchTarget={searchTarget}
              searchRef={searchInlineRef}
              onOverrideLanguage={setOverrideLanguage}
            />
          )}

          <main ref={mainContainerRef} className="zoom-content flex min-h-0 flex-1 flex-col">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1"
              groupRef={panelGroupRef}
            >
              <ResizablePanel
                id="sidebar"
                panelRef={sidebarRef}
                groupResizeBehavior="preserve-pixel-size"
                defaultSize={
                  collapsedRef.current
                    ? "0px"
                    : `${SIDEBAR_MIN_WIDTH}px`
                }
                minSize={`${SIDEBAR_MIN_WIDTH}px`}
                maxSize={`${SIDEBAR_MAX_WIDTH}px`}
                collapsible
                collapsedSize={0}
                onResize={(size) => {
                  if (size.inPixels > 0) persistSidebarWidth(size.inPixels);
                  persistSidebarCollapsed(size.inPixels <= 0);
                }}
              >
                <div className="flex h-full min-h-0 flex-col border-r border-border/60 bg-card">
                  <div
                    key={sidebarView}
                    className="min-h-0 flex-1 terax-panel-in"
                  >
                    {sidebarView === "explorer" ? (
                      <FileExplorer
                        ref={explorerRef}
                        rootPath={explorerRoot}
                        gitStatus={
                          explorerGitDecorations ? sourceControl.status : null
                        }
                        activeFilePath={explorerActiveFilePath}
                        onOpenFile={handleOpenFile}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={cdInNewTab}
                        onOpenFolder={handleOpenFolder}
                        onCloseFolder={handleCloseFolder}
                      />
                    ) : (
                      <SourceControlPanel
                        open
                        sourceControl={sourceControl}
                        onOpenDiff={openGitDiffTab}
                        onOpenGitGraph={openGitGraphFromContext}
                        onOpenFile={handleOpenFile}
                        onNavigateToPath={cdInNewTab}
                      />
                    )}
                  </div>
                  <SidebarRail
                    activeView={sidebarView}
                    onSelectView={persistSidebarView}
                    changedCount={sourceControl.changedCount}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="workspace"
                minSize="20%"
                groupResizeBehavior="preserve-relative-size"
              >
                <div className="flex h-full min-h-0 flex-col">
                  <div className="relative min-h-0 flex-1">
                    <WorkspaceSurface
                      tabs={tabs}
                      activeId={activeId}
                      activeTab={activeTab}
                      registerTerminalHandle={registerTerminalHandle}
                      onSearchReady={handleSearchReady}
                      onCwd={handleTerminalCwd}
                      onExit={handleLeafExit}
                      onFocusLeaf={handleFocusLeaf}
                      registerEditorHandle={registerEditorHandle}
                      onEditorDirtyChange={handleEditorDirty}
                      onEditorCloseTab={disposeTab}
                      registerPreviewHandle={registerPreviewHandle}
                      onPreviewUrlChange={handlePreviewUrl}
                      onOpenCommitFile={openCommitFileDiffTab}
                      onGitHistorySearchHandle={setGitHistoryHandle}
                      onSetMarkdownView={setMarkdownView}
                      onSetSvgView={setSvgView}
                      workspaceRoot={explorerRoot ?? home}
                      onCloseTab={disposeTab}
                      onOpenAntigravitySettings={openAntigravitySettingsTab}
                      onOpenFile={handleOpenFile}
                      onRunInTerminal={handleRunInTerminal}
                      onCloseTerminal={handleCloseTerminal}
                    />
                  </div>
                </div>
              </ResizablePanel>

              {isAntigravityPanelOpen && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    id="antigravity-panel"
                    panelRef={antigravityPanelRef}
                    groupResizeBehavior="preserve-pixel-size"
                    defaultSize={`${MIN_ANTIGRAVITY_PANEL_WIDTH}px`}
                    minSize={`${MIN_ANTIGRAVITY_PANEL_WIDTH}px`}
                    maxSize="450px"
                    onResize={(size) => {
                      if (size.inPixels >= MIN_ANTIGRAVITY_PANEL_WIDTH) {
                        useAntigravityStore.getState().setWidth(size.inPixels);
                      }
                    }}
                  >
                    <div className="flex h-full min-h-0 flex-col border-l border-border/60 bg-card">
                      <AntigravityPane
                        workspaceRoot={explorerRoot ?? home}
                        variant="panel"
                        onClose={closeAntigravitySidePanel}
                        onMoveToTab={handleMoveAntigravityToTab}
                        onOpenSettings={openAntigravitySettingsTab}
                        onOpenFile={handleOpenFile}
                        onRunInTerminal={handleRunInTerminal}
                        onCloseTerminal={handleCloseTerminal}
                      />
                    </div>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>

            {dragDockHover && (
              <div className="pointer-events-none absolute inset-y-0 right-0 w-[35%] min-w-[280px] z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
                <div className="w-full h-full rounded-xl border-2 border-dashed border-primary/80 bg-primary/10 backdrop-blur-md flex flex-col items-center justify-center gap-3 shadow-2xl">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/20 shadow-lg border border-primary/30">
                    <img
                      src="/antigravity/antigravity.svg"
                      alt="Antigravity"
                      className="size-8 object-contain drop-shadow"
                    />
                  </div>
                  <div className="text-center px-4">
                    <p className="text-sm font-semibold text-foreground">
                      Affianca nel pannello laterale
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Rilascia qui per posizionare Antigravity accanto all'editor
                    </p>
                  </div>
                </div>
              </div>
            )}
          </main>

          {!zenMode && (
            <StatusBar
              cwd={activeCwd}
              filePath={activeFilePath}
              home={home}
              onCd={sendCd}
              onWorkspaceChange={handleWorkspaceChange}
            />
          )}

          <Toaster position="bottom-right" />

          {switcherState && (
            <TabSwitcherHud tabs={spaceTabs} state={switcherState} />
          )}

          <CommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
            initialMode={paletteInitialMode}
            commandItems={commandPaletteItems}
            workspaceRoot={explorerRoot}
            onOpenContentHit={openContentHit}
            insertCommand={insertHistoryCommand}
          />

          <NewEditorDialog
            open={newEditorOpen}
            onOpenChange={setNewEditorOpen}
            rootPath={explorerRoot ?? home}
            onCreated={(path) => openFileTab(path)}
          />

          <CloseDialogs
            tabs={tabs}
            pendingCloseTab={pendingCloseTab}
            onCancelClose={cancelClose}
            onConfirmClose={confirmClose}
            pendingTerminalCloseTab={pendingTerminalCloseTab}
            onCancelTerminalClose={cancelTerminalClose}
            onConfirmTerminalClose={confirmTerminalClose}
            pendingDeleteTabs={pendingDeleteTabs}
            onCancelDeleteClose={cancelDeleteClose}
            onConfirmDeleteClose={confirmDeleteClose}
            pendingAppClose={pendingAppClose}
            onCancelAppClose={cancelAppClose}
            onConfirmAppClose={confirmAppClose}
          />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
