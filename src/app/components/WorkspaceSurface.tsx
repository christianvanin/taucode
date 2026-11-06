import { type ComponentProps, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { EditorStack, GitDiffStack } from "@/modules/editor";
import type { GitHistoryStack as GitHistoryStackType } from "@/modules/git-history";
import type { PreviewStack as PreviewStackType } from "@/modules/preview";
import { type Tab, type SettingsTab } from "@/modules/tabs";
import { TerminalStack } from "@/modules/terminal";
import { TauWatermark } from "@/components/icons/TerminalTauIcon";
import { SettingsApp } from "@/settings/SettingsApp";

const GitHistoryStack = lazy(() =>
  import("@/modules/git-history").then((m) => ({ default: m.GitHistoryStack })),
);
const MarkdownStack = lazy(() =>
  import("@/modules/markdown").then((m) => ({ default: m.MarkdownStack })),
);
const PreviewStack = lazy(() =>
  import("@/modules/preview").then((m) => ({ default: m.PreviewStack })),
);
const SvgStack = lazy(() =>
  import("@/modules/svg").then((m) => ({ default: m.SvgStack })),
);
const AntigravityPane = lazy(() =>
  import("@/modules/antigravity/AntigravityPane").then((m) => ({
    default: m.AntigravityPane,
  })),
);
const ExtensionTabHost = lazy(() =>
  import("@/modules/extensions/components/ExtensionTabHost").then((m) => ({
    default: m.ExtensionTabHost,
  })),
);

type TerminalStackProps = ComponentProps<typeof TerminalStack>;
type EditorStackProps = ComponentProps<typeof EditorStack>;
type PreviewStackProps = ComponentProps<typeof PreviewStackType>;
type GitHistoryStackProps = ComponentProps<typeof GitHistoryStackType>;

type Props = {
  tabs: Tab[];
  activeId: number;
  activeTab: Tab | undefined;
  registerTerminalHandle: TerminalStackProps["registerHandle"];
  onSearchReady: TerminalStackProps["onSearchReady"];
  onCwd: TerminalStackProps["onCwd"];
  onExit: TerminalStackProps["onExit"];
  onFocusLeaf: TerminalStackProps["onFocusLeaf"];
  registerEditorHandle: EditorStackProps["registerHandle"];
  onEditorDirtyChange: EditorStackProps["onDirtyChange"];
  onEditorCloseTab: EditorStackProps["onCloseTab"];
  registerPreviewHandle: PreviewStackProps["registerHandle"];
  onPreviewUrlChange: PreviewStackProps["onUrlChange"];
  onOpenCommitFile: GitHistoryStackProps["onOpenCommitFile"];
  onGitHistorySearchHandle: GitHistoryStackProps["onSearchHandle"];
  onSetMarkdownView: EditorStackProps["onSetMarkdownView"];
  onSetSvgView?: (id: number, mode: "preview" | "raw") => void;
  workspaceRoot: string | null;
  onCloseTab: (id: number) => void;
  onOpenAntigravitySettings?: (targetScreen?: string) => void;
  onOpenFile?: (path: string, pin?: boolean, line?: number, customTitle?: string) => void;
  onRunInTerminal?: (command: string, cwd?: string, title?: string, autoClose?: boolean) => void;
  onCloseTerminal?: (filter?: { tabId?: number; title?: string; last?: boolean; all?: boolean }) => void;
};

/**
 * Stacks every tab-kind surface absolutely on top of each other and toggles
 * visibility off the active tab, so panes keep their mounted state (terminal
 * buffers, editor scroll, ...) when switching tabs.
 */
export function WorkspaceSurface({
  tabs,
  activeId,
  activeTab,
  registerTerminalHandle,
  onSearchReady,
  onCwd,
  onExit,
  onFocusLeaf,
  registerEditorHandle,
  onEditorDirtyChange,
  onEditorCloseTab,
  registerPreviewHandle,
  onPreviewUrlChange,
  onOpenCommitFile,
  onGitHistorySearchHandle,
  onSetMarkdownView,
  onSetSvgView,
  workspaceRoot,
  onCloseTab,
  onOpenAntigravitySettings,
  onOpenFile,
  onRunInTerminal,
  onCloseTerminal,
}: Props) {
  const kind = activeTab?.kind;
  const isTerminalTab = kind === "terminal";
  const isEditorTab = kind === "editor";
  const isPreviewTab = kind === "preview";
  const isMarkdownTab = kind === "markdown";
  const isSvgTab = kind === "svg";
  const isGitDiffTab = kind === "git-diff" || kind === "git-commit-file";
  const isGitHistoryTab = kind === "git-history";
  const isSettingsTab = kind === "settings";
  const settingsTab = tabs.find(
    (t): t is SettingsTab => t.kind === "settings",
  );

  
  return (
    <div id="taucode-workspace-surface" className="relative h-full min-h-0 overflow-hidden">
      {tabs.length === 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center overflow-hidden opacity-30"
        >
          <TauWatermark className="h-72 w-auto select-none transition-opacity duration-300 sm:h-80 md:h-[440px] lg:h-[560px]" />
        </div>
      )}
      <div
        className={cn(
          "absolute inset-0",
          !isTerminalTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isTerminalTab}
      >
        <TerminalStack
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerTerminalHandle}
          onSearchReady={onSearchReady}
          onCwd={onCwd}
          onExit={onExit}
          onFocusLeaf={onFocusLeaf}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isEditorTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isEditorTab}
      >
        <EditorStack
          borderless
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerEditorHandle}
          onDirtyChange={onEditorDirtyChange}
          onCloseTab={onEditorCloseTab}
          onSetMarkdownView={onSetMarkdownView}
          onSetSvgView={onSetSvgView}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isPreviewTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isPreviewTab}
      >
        <Suspense fallback={null}>
          <PreviewStack
            borderless
            tabs={tabs}
            activeId={activeId}
            registerHandle={registerPreviewHandle}
            onUrlChange={onPreviewUrlChange}
          />
        </Suspense>
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isMarkdownTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isMarkdownTab}
      >
        <Suspense fallback={null}>
          <MarkdownStack
            borderless
            tabs={tabs}
            activeId={activeId}
            onSetMarkdownView={onSetMarkdownView}
          />
        </Suspense>
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isSvgTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isSvgTab}
      >
        <Suspense fallback={null}>
          <SvgStack
            borderless
            tabs={tabs}
            activeId={activeId}
            onSetSvgView={onSetSvgView ?? (() => {})}
          />
        </Suspense>
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isGitDiffTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isGitDiffTab}
      >
        <GitDiffStack tabs={tabs} activeId={activeId} borderless />
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isGitHistoryTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isGitHistoryTab}
      >
        <Suspense fallback={null}>
          <GitHistoryStack
            tabs={tabs}
            activeId={activeId}
            onOpenCommitFile={onOpenCommitFile}
            onSearchHandle={onGitHistorySearchHandle}
          />
        </Suspense>
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isSettingsTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isSettingsTab}
      >
        {settingsTab && (
          <SettingsApp tab={activeTab?.kind === "settings" ? activeTab : settingsTab} />
        )}
      </div>

      {tabs
        .filter((t): t is import("@/modules/tabs").AntigravityTab => t.kind === "antigravity")
        .map((tab) => {
          const isActive = activeTab?.id === tab.id;
          return (
            <div
              key={tab.id}
              className={cn(
                "absolute inset-0",
                !isActive && "invisible pointer-events-none",
              )}
              aria-hidden={!isActive}
            >
              <Suspense fallback={null}>
                <AntigravityPane
                  key={tab.id}
                  workspaceRoot={workspaceRoot}
                  onClose={() => onCloseTab(tab.id)}
                  variant="tab"
                  targetRoute={tab.targetRoute}
                  targetScreen={tab.targetScreen}
                  onOpenSettings={onOpenAntigravitySettings}
                  onOpenFile={onOpenFile}
                  onRunInTerminal={onRunInTerminal}
                  onCloseTerminal={onCloseTerminal}
                />
              </Suspense>
            </div>
          );
        })}

      {tabs
        .filter((t): t is import("@/modules/tabs").ExtensionTab => t.kind === "extension")
        .map((tab) => {
          const isActive = activeTab?.id === tab.id;
          return (
            <div
              key={tab.id}
              className={cn(
                "absolute inset-0",
                !isActive && "invisible pointer-events-none",
              )}
              aria-hidden={!isActive}
            >
              <Suspense fallback={null}>
                <ExtensionTabHost
                  tab={tab}
                  workspaceRoot={workspaceRoot}
                  onClose={() => onCloseTab(tab.id)}
                  onOpenFile={onOpenFile}
                  onRunInTerminal={onRunInTerminal}
                />
              </Suspense>
            </div>
          );
        })}

    </div>
  );
}
