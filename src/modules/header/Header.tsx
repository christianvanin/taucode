import { Button } from "@/components/ui/button";
import { WindowControls } from "@/components/WindowControls";
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import type { Tab } from "@/modules/tabs";
import { TabBar } from "@/modules/tabs";
import {
  CommandIcon,
  HammerIcon,
  PlayIcon,
  Settings01Icon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  SearchInline,
  type SearchInlineHandle,
  type SearchTarget,
} from "./SearchInline";

type Props = {
  tabs: Tab[];
  activeId: number;
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewPrivate: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewGitGraph: () => void;
  onClose: (id: number) => void;
  /** Promote a preview (transient) tab to persistent. */
  onPin: (id: number) => void;
  /** Set a terminal tab's custom label; empty string resets to default. */
  onRename: (id: number, title: string) => void;
  /** Move a dragged tab to a new position (insertion gap index). */
  onReorder: (fromId: number, toGapIndex: number) => void;
  onOverrideLanguage?: (id: number, lang: string | null) => void;
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onNewAntigravity?: () => void;
  onCompile?: () => void;
  onRun?: () => void;
  hasProjectOpen?: boolean;
  isSkillSpace?: boolean;
  isDefaultSkill?: boolean;
  spaceSwitcher: ReactNode;
  searchTarget: SearchTarget;
  searchRef: RefObject<SearchInlineHandle | null>;
  onDockToSidePanel?: (id: number) => void;
  onDragDockHover?: (isHovering: boolean) => void;
  onToggleAntigravitySidePanel?: () => void;
  isAntigravitySidePanelOpen?: boolean;
};

const COMPACT_WIDTH = 720;

export function Header({
  tabs,
  activeId,
  onSelect,
  onNew,
  onNewPrivate,
  onNewPreview,
  onNewEditor,
  onNewGitGraph,
  onClose,
  onPin,
  onRename,
  onReorder,
  onOverrideLanguage,
  onToggleSidebar,
  onOpenCommandPalette,
  onOpenSettings,
  onNewAntigravity,
  onCompile,
  onRun,
  hasProjectOpen = false,
  isSkillSpace = false,
  isDefaultSkill = false,
  spaceSwitcher,
  searchTarget,
  searchRef,
  onDockToSidePanel,
  onDragDockHover,
  onToggleAntigravitySidePanel,
  isAntigravitySidePanelOpen,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCompact(w < COMPACT_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const settingsButton = (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={onOpenSettings}
      title="Settings"
    >
      <HugeiconsIcon icon={Settings01Icon} size={15} strokeWidth={1.75} />
    </Button>
  );

  return (
    <div
      ref={rootRef}
      data-tauri-drag-region
      className={`flex h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-card select-none ${
        IS_MAC ? "pr-2 pl-20" : "pr-0 pl-2"
      }`}
    >
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={SidebarLeftIcon} size={18} strokeWidth={1.75} />
        </Button>

        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onOpenCommandPalette}
          title="Command palette"
          className="shrink-0 gap-1.5 rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={CommandIcon} size={14} strokeWidth={1.75} />
        </Button>
      </div>

      {!IS_MAC && <span className="mx-1 h-full w-px shrink-0 bg-border/70" />}

      {IS_MAC && <span className="mr-1 h-full w-px shrink-0 bg-border/70" />}

      <div
        className="flex min-w-0 flex-1 items-center gap-2"
        data-tauri-drag-region
      >
        {spaceSwitcher}
        <TabBar
          tabs={tabs}
          activeId={activeId}
          onSelect={onSelect}
          onNew={onNew}
          onNewPrivate={onNewPrivate}
          onNewPreview={onNewPreview}
          onNewEditor={onNewEditor}
          onNewGitGraph={onNewGitGraph}
          onNewAntigravity={onNewAntigravity}
          onClose={onClose}
          onPin={onPin}
          onRename={onRename}
          onReorder={onReorder}
          onOverrideLanguage={onOverrideLanguage}
          compact={compact}
          onDockToSidePanel={onDockToSidePanel}
          onDragDockHover={onDragDockHover}
        />
        <div data-tauri-drag-region className="h-full min-w-2 flex-1" />
      </div>

      {onCompile && onRun && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCompile}
            disabled={!hasProjectOpen || isDefaultSkill}
            className="h-7 w-7 xl:w-auto px-0 xl:px-2 gap-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
            title={
              isDefaultSkill
                ? "Skill predefinita di Gemini (sola lettura - non modificabile)"
                : isSkillSpace
                  ? "Compila e aggiorna la Skill (sincronizza SKILL.md e skill.json)"
                  : hasProjectOpen
                    ? "Compile (TauCode/compile.json)"
                    : "Open a project to compile"
            }
            aria-label={isSkillSpace ? "Compila skill" : "Compile project"}
          >
            <HugeiconsIcon icon={HammerIcon} size={14} strokeWidth={1.75} />
            <span className="hidden xl:inline">
              {isDefaultSkill
                ? "Predefinita"
                : isSkillSpace
                  ? "Compila Skill"
                  : "Compile"}
            </span>
          </Button>

          {!isSkillSpace && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRun}
              disabled={!hasProjectOpen}
              className="h-7 w-7 xl:w-auto px-0 xl:px-2 gap-1.5 rounded-md text-xs font-medium text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
              title={hasProjectOpen ? "Run (TauCode/run.json)" : "Open a project to run"}
              aria-label="Run project"
            >
              <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={1.75} />
              <span className="hidden xl:inline">Run</span>
            </Button>
          )}
        </div>
      )}

      <SearchInline ref={searchRef} target={searchTarget} compact={compact} />

      {onToggleAntigravitySidePanel && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleAntigravitySidePanel}
          className={cn(
            "size-7 shrink-0 rounded-md transition-colors",
            isAntigravitySidePanelOpen
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title={isAntigravitySidePanelOpen ? "Nascondi pannello Antigravity" : "Mostra pannello Antigravity"}
          aria-label="Toggle Antigravity Panel"
        >
          <img
            src="/antigravity/antigravity.svg"
            alt="Antigravity"
            className="size-4 object-contain"
          />
        </Button>
      )}

      {settingsButton}

      {USE_CUSTOM_WINDOW_CONTROLS && (
        <>
          <span className="ml-1 h-5 w-px shrink-0 bg-border/60" />
          <WindowControls />
        </>
      )}
    </div>
  );
}
