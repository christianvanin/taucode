import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { useUpdater } from "@/modules/updater/useUpdater";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { ThemePref } from "@/modules/settings/store";
import {
  setAutostart,
  setAutoUpdateOnLaunch,
  setDefaultWorkspaceEnv,
  setExplorerGitDecorations,
  setRestoreWindowState,
  setShowHidden,
  setTerminalCursorBlink,
  setTerminalFontFamily,
  setTerminalFontSize,
  setTerminalFontWeight,
  setTerminalLetterSpacing,
  setTerminalScrollback,
  setTerminalShell,
  setTerminalWebglEnabled,
  setZoomLevel,
  TERMINAL_FONT_SIZES,
  TERMINAL_SCROLLBACK_PRESETS,
} from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import {
  ArrowReloadHorizontalIcon,
  BadgeCheckIcon,
  ComputerIcon,
  Download01Icon,
  Moon02Icon,
  SparklesIcon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

const APPEARANCE: {
  id: ThemePref;
  label: string;
  icon: typeof ComputerIcon;
}[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];

const TERMINAL_FONT_WEIGHTS = [
  { value: "normal", label: "Normal" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi-Bold" },
  { value: "bold", label: "Bold" },
] as const;
const LETTER_SPACINGS = [-4, -3, -2, -1, 0, 1, 2, 3, 4] as const;

type ShellInfo = { name: string; path: string; integrated: boolean };
const SHELL_AUTO = "auto";
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.05;

export function GeneralSection() {
  const { mode, setMode } = useTheme();

  const {
    currentVersion,
    status: updateStatus,
    updateInfo,
    progress: updateProgress,
    downloadedBytes,
    totalBytes,
    errorMessage: updateError,
    checkForUpdates,
    startDownloadAndInstall,
    applyUpdateAndRestart,
  } = useUpdater();

  const [syncingSkills, setSyncingSkills] = useState(false);
  const [syncSkillsMessage, setSyncSkillsMessage] = useState<string | null>(null);

  const handleSyncSkills = async () => {
    try {
      setSyncingSkills(true);
      setSyncSkillsMessage(null);
      const report = await invoke<{
        installed: string[];
        updated: string[];
        up_to_date: string[];
      }>("sync_builtin_skills_command");
      const totalChanges = report.installed.length + report.updated.length;
      if (totalChanges > 0) {
        setSyncSkillsMessage(
          `${totalChanges} skill sincronizzata/e (${report.installed.length} installate, ${report.updated.length} aggiornate).`,
        );
      } else {
        setSyncSkillsMessage(
          `Tutte le ${report.up_to_date.length} skill built-in sono già all'ultima versione.`,
        );
      }
    } catch (err) {
      setSyncSkillsMessage(
        err instanceof Error ? err.message : "Errore durante la sincronizzazione delle skill.",
      );
    } finally {
      setSyncingSkills(false);
    }
  };


  const autoUpdateOnLaunch = usePreferencesStore((s) => s.autoUpdateOnLaunch);
  const autostart = usePreferencesStore((s) => s.autostart);
  const restoreWindowState = usePreferencesStore((s) => s.restoreWindowState);
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const explorerGitDecorations = usePreferencesStore(
    (s) => s.explorerGitDecorations,
  );
  const terminalWebglEnabled = usePreferencesStore(
    (s) => s.terminalWebglEnabled,
  );
  const terminalCursorBlink = usePreferencesStore((s) => s.terminalCursorBlink);
  const terminalFontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const terminalFontWeight = usePreferencesStore((s) => s.terminalFontWeight);
  const terminalShell = usePreferencesStore((s) => s.terminalShell);
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [wslDistros, setWslDistros] = useState<{ name: string }[]>([]);
  const defaultWorkspaceEnv = usePreferencesStore((s) => s.defaultWorkspaceEnv);
  const terminalLetterSpacing = usePreferencesStore(
    (s) => s.terminalLetterSpacing,
  );
  const terminalFontSize = usePreferencesStore((s) => s.terminalFontSize);
  const terminalScrollback = usePreferencesStore((s) => s.terminalScrollback);
  const zoomLevel = usePreferencesStore((s) => s.zoomLevel);

  useEffect(() => {
    let alive = true;
    void isEnabled()
      .then((on) => {
        if (!alive) return;
        if (on !== usePreferencesStore.getState().autostart) {
          void setAutostart(on);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void invoke<ShellInfo[]>("pty_list_shells")
      .then((s) => {
        if (alive) setShells(s);
      })
      .catch(() => {});

    const wslTimeout = new Promise<{ name: string }[]>((resolve) =>
      setTimeout(() => resolve([]), 2000),
    );
    void Promise.race([
      invoke<{ name: string }[]>("wsl_list_distros"),
      wslTimeout,
    ])
      .then((distros) => {
        if (alive) setWslDistros(distros);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  const onToggleAutostart = async (next: boolean) => {
    try {
      if (next) await enable();
      else await disable();
      await setAutostart(next);
    } catch (e) {
      console.error("autostart toggle failed", e);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="General"
        description="Mode, terminal, and startup."
      />

      <div className="flex flex-col gap-2">
        <Label>Appearance</Label>
        <div className="grid grid-cols-3 gap-2">
          {APPEARANCE.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setMode(o.id)}
              className={cn(
                "group flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border bg-card transition-all",
                mode === o.id
                  ? "border-foreground/60 ring-1 ring-foreground/20"
                  : "border-border/60 hover:border-border",
              )}
            >
              <HugeiconsIcon icon={o.icon} size={18} strokeWidth={1.5} />
              <span className="text-[11.5px]">{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Zoom</Label>
        <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11.5px] text-muted-foreground">
              UI zoom level
            </span>
            <span className="tabular-nums text-[11px] text-muted-foreground">
              {Math.round(zoomLevel * 100)}%
            </span>
          </div>
          <Slider
            value={[zoomLevel]}
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_STEP}
            onValueChange={(v) => void setZoomLevel(v[0] ?? 1)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Explorer</Label>
        <SettingRow
          title="Show hidden files"
          description="Include dot-prefixed files and folders (.env, .gitignore, .config) in the file explorer and search."
        >
          <Switch
            checked={showHidden}
            onCheckedChange={(v) => void setShowHidden(v)}
          />
        </SettingRow>
        <SettingRow
          title="Git decorations"
          description="Tint changed files and dim gitignored entries in the file explorer."
        >
          <Switch
            checked={explorerGitDecorations}
            onCheckedChange={(v) => void setExplorerGitDecorations(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Terminal</Label>
        <SettingRow
          title={
            <span className="inline-flex items-center gap-1.5">
              Use WebGL renderer
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="cursor-help text-[11px] text-muted-foreground/70 leading-none"
                      aria-label="More info about WebGL renderer"
                    >
                      ⓘ
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-65 text-[11px]">
                    xterm's WebGL renderer caches glyphs in a GPU texture atlas.
                    On some macOS setups (especially with Nerd Fonts), the atlas
                    corrupts and terminal text becomes unreadable. Turn this off
                    as a fallback — performance dips slightly, but text renders
                    correctly via the DOM renderer.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          }
          description="Hardware-accelerated rendering. Turn off if text shows corruption or blank tiles."
        >
          <Switch
            checked={terminalWebglEnabled}
            onCheckedChange={(v) => void setTerminalWebglEnabled(v)}
          />
        </SettingRow>
        <SettingRow
          title="Cursor blinking"
          description="Blink the terminal cursor. Off by default for lower idle CPU, matching VS Code and the macOS terminal."
        >
          <Switch
            checked={terminalCursorBlink}
            onCheckedChange={(v) => void setTerminalCursorBlink(v)}
          />
        </SettingRow>
        <FontFamilyInput
          value={terminalFontFamily}
          onCommit={(v) => void setTerminalFontFamily(v)}
        />
        <SettingRow
          title="Font weight"
          description="Thickness of terminal characters"
        >
          <Select
            value={terminalFontWeight}
            onValueChange={(v) => void setTerminalFontWeight(v)}
          >
            <SelectTrigger
              value={terminalFontWeight}
              className="h-8 w-28 text-[12px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_FONT_WEIGHTS.map((w) => (
                <SelectItem
                  key={w.value}
                  value={w.value}
                  className="text-[12px]"
                >
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          title="Integrated terminal shell"
          description={
            shells.find((s) => s.path === terminalShell)?.integrated === false
              ? "Command blocks and directory tracking are unavailable for this shell."
              : wslDistros.length > 0
                ? "Shell for the integrated terminal. WSL spaces use the distro login shell. Existing tabs keep their shell."
                : "Shell for new terminal tabs. Existing tabs keep their shell."
          }
        >
          <Select
            value={terminalShell || SHELL_AUTO}
            onValueChange={(v) =>
              void setTerminalShell(v === SHELL_AUTO ? "" : v)
            }
          >
            <SelectTrigger
              value={terminalShell || SHELL_AUTO}
              className="h-8 w-40 text-[12px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SHELL_AUTO} className="text-[12px]">
                Auto
              </SelectItem>
              {shells.map((s) => (
                <SelectItem key={s.path} value={s.path} className="text-[12px]">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        {(wslDistros.length > 0 || defaultWorkspaceEnv !== "local") && (
          <SettingRow
            title="Workspace environment"
            description="Where new spaces run: Windows or a WSL distro. Existing spaces keep theirs; switch any from the status bar."
          >
            <Select
              value={defaultWorkspaceEnv}
              onValueChange={(v) => void setDefaultWorkspaceEnv(v)}
            >
              <SelectTrigger
                value={defaultWorkspaceEnv}
                className="h-8 w-40 text-[12px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local" className="text-[12px]">
                  Windows
                </SelectItem>
                {wslDistros.map((d) => (
                  <SelectItem
                    key={d.name}
                    value={`wsl:${d.name}`}
                    className="text-[12px]"
                  >
                    WSL: {d.name}
                  </SelectItem>
                ))}
                {defaultWorkspaceEnv.startsWith("wsl:") &&
                  !wslDistros.some(
                    (d) => `wsl:${d.name}` === defaultWorkspaceEnv,
                  ) && (
                    <SelectItem
                      value={defaultWorkspaceEnv}
                      className="text-[12px]"
                    >
                      {defaultWorkspaceEnv.slice("wsl:".length)} (unavailable)
                    </SelectItem>
                  )}
              </SelectContent>
            </Select>
          </SettingRow>
        )}
        <SettingRow
          title="Letter spacing"
          description="Extra horizontal space between characters (px). Use negative values to tighten Nerd Fonts."
        >
          <Select
            value={String(terminalLetterSpacing)}
            onValueChange={(v) => void setTerminalLetterSpacing(Number(v))}
          >
            <SelectTrigger size="sm" className="h-8 w-28 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LETTER_SPACINGS.map((v) => (
                <SelectItem key={v} value={String(v)} className="text-[12px]">
                  {v > 0 ? `+${v}` : v} px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow title="Font size" description="Terminal text size.">
          <Select
            value={String(terminalFontSize)}
            onValueChange={(v) => void setTerminalFontSize(Number(v))}
          >
            <SelectTrigger size="sm" className="h-8 w-28 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_FONT_SIZES.map((size) => (
                <SelectItem
                  key={size}
                  value={String(size)}
                  className="text-[12px]"
                >
                  {size} px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          title="Scrollback"
          description="Lines of history kept per terminal. Higher uses more RAM (~3 KB / line)."
        >
          <Select
            value={String(terminalScrollback)}
            onValueChange={(v) => void setTerminalScrollback(Number(v))}
          >
            <SelectTrigger size="sm" className="h-8 w-36 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_SCROLLBACK_PRESETS.map((lines) => (
                <SelectItem
                  key={lines}
                  value={String(lines)}
                  className="text-[12px]"
                >
                  {lines.toLocaleString()} lines
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Startup</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Launch at login"
            description="Open TauCode automatically when you sign in."
          >
            <Switch
              checked={autostart}
              onCheckedChange={(v) => void onToggleAutostart(v)}
            />
          </SettingRow>
          <SettingRow
            title="Restore window position & size"
            description="Reopen the main window where you left it. Applies on next launch."
          >
            <Switch
              checked={restoreWindowState}
              onCheckedChange={(v) => void setRestoreWindowState(v)}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Aggiornamenti & Built-in Skills</Label>
        <div className="flex flex-col gap-3">
          {/* App Update Card */}
          <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">TauCode</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                    v{currentVersion}
                  </span>
                  {updateStatus === "up-to-date" && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                      <HugeiconsIcon icon={BadgeCheckIcon} className="size-3.5" />
                      All'ultima versione
                    </span>
                  )}
                  {updateStatus === "available" && (
                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-500">
                      Nuova versione: v{updateInfo?.version}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Aggiornamenti automatici distribuiti e firmati digitalmente via GitHub Releases.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {(updateStatus === "idle" || updateStatus === "up-to-date" || updateStatus === "error") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void checkForUpdates(true)}
                    className="gap-1.5 text-[12px]"
                  >
                    <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-3.5" />
                    Verifica aggiornamenti
                  </Button>
                )}

                {updateStatus === "checking" && (
                  <Button size="sm" variant="outline" disabled className="gap-1.5 text-[12px]">
                    <Spinner className="size-3.5" />
                    Controllo in corso...
                  </Button>
                )}

                {updateStatus === "available" && (
                  <Button
                    size="sm"
                    onClick={() => void startDownloadAndInstall()}
                    className="gap-1.5 text-[12px]"
                  >
                    <HugeiconsIcon icon={Download01Icon} className="size-3.5" />
                    Aggiorna a v{updateInfo?.version}
                  </Button>
                )}

                {updateStatus === "ready" && (
                  <Button
                    size="sm"
                    onClick={() => void applyUpdateAndRestart()}
                    className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 text-[12px]"
                  >
                    <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-3.5" />
                    Riavvia per completare
                  </Button>
                )}
              </div>
            </div>

            {updateStatus === "downloading" && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-border/50 pt-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Download aggiornamento in corso...</span>
                  <span>
                    {updateProgress}%{" "}
                    {totalBytes > 0
                      ? `(${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)`
                      : ""}
                  </span>
                </div>
                <Progress value={updateProgress} className="h-1.5" />
              </div>
            )}

            {updateStatus === "available" && updateInfo?.body && (
              <div className="mt-3 rounded-lg border border-border/40 bg-muted/40 p-2.5 text-[11px] text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap">
                <div className="mb-1 font-medium text-foreground">Note di rilascio:</div>
                {updateInfo.body}
              </div>
            )}

            {updateStatus === "error" && updateError && (
              <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-[11px] text-destructive">
                {updateError}
              </div>
            )}
            {/* Setting: Auto-update check at launch */}
            <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[12px] font-medium text-foreground">
                  Aggiornamento automatico all'avvio
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Verifica automaticamente la disponibilità di nuove versioni all'apertura dell'app.
                </span>
              </div>
              <Switch
                checked={autoUpdateOnLaunch}
                onCheckedChange={(v) => void setAutoUpdateOnLaunch(v)}
              />
            </div>
          </div>

          {/* Built-in Skills Card */}
          <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">Skill Built-in</span>
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <HugeiconsIcon icon={SparklesIcon} className="size-3" />
                    2 skill incluse
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Skill integrate direttamente nell'app. Si sincronizzano e aggiornano automaticamente all'avvio.
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {["taucode-tabs", "skill-builder"].map(
                    (skill) => (
                      <span
                        key={skill}
                        className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {skill}
                      </span>
                    ),
                  )}
                </div>
                {syncSkillsMessage && (
                  <p className="mt-1 text-[11px] font-medium text-emerald-500">
                    {syncSkillsMessage}
                  </p>
                )}
              </div>

              <Button
                size="sm"
                variant="outline"
                disabled={syncingSkills}
                onClick={() => void handleSyncSkills()}
                className="gap-1.5 text-[12px] shrink-0"
              >
                {syncingSkills ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-3.5" />
                )}
                Sincronizza ora
              </Button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}

function FontFamilyInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Commit (and trim) only on blur/Enter so a trailing space can be typed
  // mid-edit, e.g. "JetBrains Mono ".
  const commit = () => {
    const next = draft.trim();
    if (next !== draft) setDraft(next);
    if (next !== value) onCommit(next);
  };

  return (
    <SettingRow
      title="Font family"
      description='Nerd Font name for icons (e.g. "CaskaydiaCove Nerd Font Mono"). Leave blank to auto-detect.'
    >
      <input
        type="text"
        value={draft}
        placeholder="Auto-detect"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-8 w-48 rounded-md border border-border bg-background px-2.5 text-[12px] outline-none focus:border-foreground/40"
      />
    </SettingRow>
  );
}
