import {
  native,
  type GitChangedFile,
  type GitDiscardEntry,
  type GitRepoInfo,
  type GitStatusSnapshot,
} from "@/lib/native";
import {
  invalidateDiff,
  invalidateRepoDiffs,
  workingDiffKey,
} from "@/modules/editor/lib/diffCache";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SourceControlSummary } from "./useSourceControl";

type PanelState = "closed" | "loading" | "no-repo" | "ready" | "error";
type DiffMode = "+" | "-";
type SelectionTransition = "none" | "moved-group" | "reset";

const RECONCILE_DEBOUNCE_MS = 180;

export type DiffSelection = {
  path: string;
  mode: DiffMode;
};

export type SourceControlEntry = {
  key: string;
  path: string;
  mode: DiffMode;
  indexStatus: string;
  worktreeStatus: string;
  statusLabel: string;
  statusCode: string;
  originalPath: string | null;
  untracked: boolean;
};

export type CheckState = "checked" | "indeterminate" | "unchecked";

/** One row per changed file (flat list) — merges the staged/unstaged split. */
export type SourceControlFileEntry = {
  key: string;
  path: string;
  originalPath: string | null;
  statusCode: string;
  statusLabel: string;
  checkState: CheckState;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
};

export type PendingDiscard = {
  scope: "single" | "all";
  count: number;
  label: string;
};

type SourceControlPanelState = {
  panelState: PanelState;
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
  selected: DiffSelection | null;
  commitMessage: string;
  actionBusy: string | null;
  statusError: string | null;
  actionError: string | null;
  remoteError: string | null;
  actionMessage: string | null;
  stagedEntries: SourceControlEntry[];
  unstagedEntries: SourceControlEntry[];
  fileEntries: SourceControlFileEntry[];
  headerCheckState: CheckState;
  allClean: boolean;
  canPush: boolean;
  pushHint: string | null;
  selectionTransition: SelectionTransition;
  stagedEmptyText: string;
  unstagedEmptyText: string;
  pendingDiscard: PendingDiscard | null;
  setCommitMessage: (value: string) => void;
  refresh: () => Promise<void>;
  selectEntry: (entry: SourceControlEntry) => Promise<void>;
  selectFile: (entry: SourceControlFileEntry) => Promise<void>;
  stageEntry: (entry: SourceControlEntry) => Promise<void>;
  unstageEntry: (entry: SourceControlEntry) => Promise<void>;
  toggleStageFile: (entry: SourceControlFileEntry) => Promise<void>;
  toggleAll: () => Promise<void>;
  requestDiscardEntry: (entry: SourceControlEntry) => void;
  requestDiscardFile: (entry: SourceControlFileEntry) => void;
  requestDiscardAll: () => void;
  confirmPendingDiscard: () => Promise<void>;
  cancelPendingDiscard: () => void;
  stageAllEntries: () => Promise<void>;
  unstageAllEntries: () => Promise<void>;
  commit: () => Promise<void>;
  push: () => Promise<void>;
};

function normalizeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown source control error";
}

function normalizeStatusCode(status: string): string {
  const code = status.trim().toUpperCase();
  switch (code) {
    case "?":
      return "U";
    case "A":
      return "A";
    case "M":
      return "M";
    case "D":
      return "D";
    case "R":
    case "C":
      return "R";
    case "U":
      return "U";
    default:
      return code || "M";
  }
}

function statusCodeForMode(mode: DiffMode, file: GitChangedFile): string {
  if (mode === "-" && file.untracked) return "U";
  const primary = mode === "+" ? file.indexStatus : file.worktreeStatus;
  const fallback = mode === "+" ? file.worktreeStatus : file.indexStatus;
  return normalizeStatusCode(primary !== " " ? primary : fallback);
}

function makeEntry(
  path: string,
  mode: DiffMode,
  file: GitChangedFile,
): SourceControlEntry {
  return {
    key: `${mode}:${path}`,
    path,
    mode,
    indexStatus: file.indexStatus,
    worktreeStatus: file.worktreeStatus,
    statusLabel: file.statusLabel,
    statusCode: statusCodeForMode(mode, file),
    originalPath: file.originalPath,
    untracked: file.untracked,
  };
}



function optimisticStage(
  status: GitStatusSnapshot,
  paths: Set<string>,
): GitStatusSnapshot {
  let changed = false;
  const next: GitChangedFile[] = [];
  for (const file of status.changedFiles) {
    if (!paths.has(file.path)) {
      next.push(file);
      continue;
    }
    changed = true;
    const idx = file.worktreeStatus === " " ? file.indexStatus : file.worktreeStatus;
    next.push({
      ...file,
      originalPath: file.originalPath,
      indexStatus: idx === "?" ? "A" : idx,
      worktreeStatus: " ",
      staged: true,
      unstaged: false,
      untracked: false,
    });
  }
  if (!changed) return status;
  return { ...status, changedFiles: next };
}

function optimisticUnstage(
  status: GitStatusSnapshot,
  paths: Set<string>,
): GitStatusSnapshot {
  let changed = false;
  const next: GitChangedFile[] = [];
  for (const file of status.changedFiles) {
    if (!paths.has(file.path)) {
      next.push(file);
      continue;
    }
    changed = true;
    const idx = file.indexStatus === " " ? file.worktreeStatus : file.indexStatus;
    next.push({
      ...file,
      originalPath: null,
      indexStatus: " ",
      worktreeStatus: idx === "A" ? "?" : idx,
      staged: false,
      unstaged: true,
      untracked: idx === "A",
    });
  }
  if (!changed) return status;
  return { ...status, changedFiles: next };
}

function optimisticDiscard(
  status: GitStatusSnapshot,
  paths: Set<string>,
): GitStatusSnapshot {
  let changed = false;
  const next: GitChangedFile[] = [];
  for (const file of status.changedFiles) {
    if (!paths.has(file.path)) {
      next.push(file);
      continue;
    }
    if (file.staged) {
      changed = true;
      next.push({
        ...file,
        worktreeStatus: " ",
        unstaged: false,
        untracked: false,
      });
    } else {
      changed = true;
    }
  }
  if (!changed) return status;
  return { ...status, changedFiles: next };
}

export function useSourceControlPanel(
  isOpen: boolean,
  summary: SourceControlSummary,
  onOpenDiff:
    | ((input: {
        path: string;
        repoRoot: string;
        mode: DiffMode;
        originalPath: string | null;
        title?: string;
      }) => void)
    | null,
): SourceControlPanelState {
  const [selected, setSelected] = useState<DiffSelection | null>(null);
  const [selectionTransition, setSelectionTransition] =
    useState<SelectionTransition>("none");
  const [commitMessage, setCommitMessage] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [localActionBusy, setLocalActionBusy] = useState<string | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<
    | { scope: "single"; entry: SourceControlEntry }
    | { scope: "all"; entries: GitDiscardEntry[] }
    | null
  >(null);

  const reconcileTimerRef = useRef<number>(0);
  const status = summary.status;
  const repo = summary.repo;

  const panelState: PanelState = useMemo(() => {
    if (!isOpen) return "closed";
    if (summary.busyAction && !summary.status) return "loading";
    if (summary.localError) return "error";
    if (!summary.repo) return "no-repo";
    return "ready";
  }, [isOpen, summary.busyAction, summary.localError, summary.repo, summary.status]);

  const stagedEntries = useMemo<SourceControlEntry[]>(() => {
    if (!status) return [];
    return status.changedFiles
      .filter((file) => file.staged)
      .map((file) => makeEntry(file.path, "+", file));
  }, [status]);

  const unstagedEntries = useMemo<SourceControlEntry[]>(() => {
    if (!status) return [];
    return status.changedFiles
      .filter((file) => file.unstaged)
      .map((file) => makeEntry(file.path, "-", file));
  }, [status]);

  const fileEntries = useMemo<SourceControlFileEntry[]>(() => {
    const seen = new Set<string>();
    const out: SourceControlFileEntry[] = [];
    for (const file of status?.changedFiles ?? []) {
      if (seen.has(file.path)) continue;
      seen.add(file.path);
      const checkState: CheckState =
        file.staged && file.unstaged
          ? "indeterminate"
          : file.staged
            ? "checked"
            : "unchecked";
      const statusCode = file.unstaged
        ? statusCodeForMode("-", file)
        : statusCodeForMode("+", file);
      out.push({
        key: file.path,
        path: file.path,
        originalPath: file.originalPath,
        statusCode,
        statusLabel: file.statusLabel,
        checkState,
        staged: file.staged,
        unstaged: file.unstaged,
        untracked: file.untracked,
      });
    }
    return out;
  }, [status]);

  const headerCheckState = useMemo<CheckState>(() => {
    if (fileEntries.length === 0) return "unchecked";
    const allChecked = fileEntries.every((e) => e.checkState === "checked");
    if (allChecked) return "checked";
    const anyStaged = fileEntries.some((e) => e.staged);
    return anyStaged ? "indeterminate" : "unchecked";
  }, [fileEntries]);

  const allClean = stagedEntries.length === 0 && unstagedEntries.length === 0;
  const canPush = !!status?.upstream && status.behind === 0;
  const pushHint = useMemo(() => {
    if (!status) return null;
    if (!status.upstream) {
      return "Configure or publish this branch in the terminal to enable push in this iteration.";
    }
    if (status.behind > 0) {
      return "Pull remote changes before pushing local commits.";
    }
    if (status.ahead === 0) {
      return `No local commits to push to ${status.upstream}.`;
    }
    return `Pushes to ${status.upstream}.`;
  }, [status]);
  const stagedEmptyText = "No staged changes";
  const unstagedEmptyText = "No unstaged changes";

  const cancelReconcile = useCallback(() => {
    if (reconcileTimerRef.current) {
      window.clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = 0;
    }
  }, []);

  const openDiff = useCallback(
    (entry: {
      path: string;
      mode: DiffMode;
      originalPath: string | null;
      title?: string;
    }) => {
      if (!repo || !onOpenDiff) return;
      onOpenDiff({
        path: entry.path,
        repoRoot: repo.repoRoot,
        mode: entry.mode,
        originalPath: entry.originalPath,
        title: entry.title,
      });
    },
    [onOpenDiff, repo],
  );

  const selectEntry = useCallback(
    async (entry: SourceControlEntry) => {
      const next: DiffSelection = { path: entry.path, mode: entry.mode };
      setSelected(next);
      setSelectionTransition("none");
      openDiff({
        path: entry.path,
        mode: entry.mode,
        originalPath: entry.originalPath,
        title: entry.path,
      });
    },
    [openDiff],
  );

  const selectFile = useCallback(
    async (entry: SourceControlFileEntry) => {
      const mode: DiffMode = entry.staged && !entry.unstaged ? "+" : "-";
      const next: DiffSelection = { path: entry.path, mode };
      setSelected(next);
      setSelectionTransition("none");
      openDiff({
        path: entry.path,
        mode,
        originalPath: entry.originalPath,
        title: entry.path,
      });
    },
    [openDiff],
  );

  useEffect(() => {
    if (!isOpen || !status) {
      cancelReconcile();
      return;
    }
    if (!selected) {
      setSelectionTransition("none");
      return;
    }

    cancelReconcile();
    reconcileTimerRef.current = window.setTimeout(() => {
      const exactStaged = stagedEntries.find((e) => e.path === selected.path);
      const exactUnstaged = unstagedEntries.find(
        (e) => e.path === selected.path,
      );
      if (selected.mode === "+" && exactStaged) {
        setSelectionTransition("none");
        return;
      }
      if (selected.mode === "-" && exactUnstaged) {
        setSelectionTransition("none");
        return;
      }
      if (selected.mode === "+" && exactUnstaged) {
        const next: DiffSelection = { path: selected.path, mode: "-" };
        setSelected(next);
        setSelectionTransition("moved-group");
        openDiff({
          path: next.path,
          mode: next.mode,
          originalPath: exactUnstaged.originalPath,
          title: next.path,
        });
        return;
      }
      if (selected.mode === "-" && exactStaged) {
        const next: DiffSelection = { path: selected.path, mode: "+" };
        setSelected(next);
        setSelectionTransition("moved-group");
        openDiff({
          path: next.path,
          mode: next.mode,
          originalPath: exactStaged.originalPath,
          title: next.path,
        });
        return;
      }

      setSelected(null);
      setSelectionTransition("reset");
    }, RECONCILE_DEBOUNCE_MS);

    return cancelReconcile;
  }, [
    cancelReconcile,
    isOpen,
    openDiff,
    selected,
    stagedEntries,
    status,
    unstagedEntries,
  ]);

  const refresh = useCallback(async () => {
    setActionError(null);
    await summary.refresh();
  }, [summary]);

  const stageEntry = useCallback(
    async (entry: SourceControlEntry) => {
      if (!repo || summary.busyAction) return;
      setLocalActionBusy("stage");
      setActionError(null);
      summary.applyStatus((curr) =>
        optimisticStage(curr, new Set([entry.path])),
      );
      try {
        await native.gitStage(repo.repoRoot, [entry.path]);
        invalidateDiff(workingDiffKey(repo.repoRoot, entry.path, "-"));
        invalidateDiff(workingDiffKey(repo.repoRoot, entry.path, "+"));
        await summary.refresh();
      } catch (error) {
        setActionError(normalizeError(error));
        await summary.refresh();
      } finally {
        setLocalActionBusy(null);
      }
    },
    [repo, summary],
  );

  const unstageEntry = useCallback(
    async (entry: SourceControlEntry) => {
      if (!repo || summary.busyAction) return;
      setLocalActionBusy("unstage");
      setActionError(null);
      summary.applyStatus((curr) =>
        optimisticUnstage(curr, new Set([entry.path])),
      );
      try {
        await native.gitUnstage(repo.repoRoot, [entry.path]);
        invalidateDiff(workingDiffKey(repo.repoRoot, entry.path, "-"));
        invalidateDiff(workingDiffKey(repo.repoRoot, entry.path, "+"));
        await summary.refresh();
      } catch (error) {
        setActionError(normalizeError(error));
        await summary.refresh();
      } finally {
        setLocalActionBusy(null);
      }
    },
    [repo, summary],
  );

  const toggleStageFile = useCallback(
    async (entry: SourceControlFileEntry) => {
      if (!repo || summary.busyAction) return;
      const willStage = entry.checkState !== "checked";
      setLocalActionBusy(willStage ? "stage" : "unstage");
      setActionError(null);
      summary.applyStatus((curr) =>
        willStage
          ? optimisticStage(curr, new Set([entry.path]))
          : optimisticUnstage(curr, new Set([entry.path])),
      );
      try {
        if (willStage) {
          await native.gitStage(repo.repoRoot, [entry.path]);
        } else {
          await native.gitUnstage(repo.repoRoot, [entry.path]);
        }
        invalidateDiff(workingDiffKey(repo.repoRoot, entry.path, "-"));
        invalidateDiff(workingDiffKey(repo.repoRoot, entry.path, "+"));
        await summary.refresh();
      } catch (error) {
        setActionError(normalizeError(error));
        await summary.refresh();
      } finally {
        setLocalActionBusy(null);
      }
    },
    [repo, summary],
  );

  const stageAllEntries = useCallback(async () => {
    if (!repo || summary.busyAction || unstagedEntries.length === 0) return;
    const paths = unstagedEntries.map((e) => e.path);
    setLocalActionBusy("stage-all");
    setActionError(null);
    summary.applyStatus((curr) =>
      optimisticStage(curr, new Set(paths)),
    );
    try {
      await native.gitStage(repo.repoRoot, paths);
      invalidateRepoDiffs(repo.repoRoot);
      await summary.refresh();
    } catch (error) {
      setActionError(normalizeError(error));
      await summary.refresh();
    } finally {
      setLocalActionBusy(null);
    }
  }, [repo, summary, unstagedEntries]);

  const unstageAllEntries = useCallback(async () => {
    if (!repo || summary.busyAction || stagedEntries.length === 0) return;
    const paths = stagedEntries.map((e) => e.path);
    setLocalActionBusy("unstage-all");
    setActionError(null);
    summary.applyStatus((curr) =>
      optimisticUnstage(curr, new Set(paths)),
    );
    try {
      await native.gitUnstage(repo.repoRoot, paths);
      invalidateRepoDiffs(repo.repoRoot);
      await summary.refresh();
    } catch (error) {
      setActionError(normalizeError(error));
      await summary.refresh();
    } finally {
      setLocalActionBusy(null);
    }
  }, [repo, stagedEntries, summary]);

  const toggleAll = useCallback(async () => {
    if (headerCheckState === "checked") {
      await unstageAllEntries();
    } else {
      await stageAllEntries();
    }
  }, [headerCheckState, stageAllEntries, unstageAllEntries]);

  const requestDiscardEntry = useCallback(
    (entry: SourceControlEntry) => {
      if (!repo || summary.busyAction) return;
      setPendingDiscard({ scope: "single", entry });
    },
    [repo, summary.busyAction],
  );

  const requestDiscardFile = useCallback(
    (entry: SourceControlFileEntry) => {
      if (!repo || summary.busyAction) return;
      setPendingDiscard({
        scope: "single",
        entry: {
          key: `-:${entry.path}`,
          path: entry.path,
          mode: "-",
          indexStatus: " ",
          worktreeStatus: entry.statusCode,
          statusLabel: entry.statusLabel,
          statusCode: entry.statusCode,
          originalPath: entry.originalPath,
          untracked: entry.untracked,
        },
      });
    },
    [repo, summary.busyAction],
  );

  const requestDiscardAll = useCallback(() => {
    if (!repo || summary.busyAction || unstagedEntries.length === 0) return;
    const entries: GitDiscardEntry[] = unstagedEntries.map((e) => ({
      path: e.path,
      untracked: e.untracked,
    }));
    setPendingDiscard({ scope: "all", entries });
  }, [repo, summary.busyAction, unstagedEntries]);

  const cancelPendingDiscard = useCallback(() => {
    setPendingDiscard(null);
  }, []);

  const confirmPendingDiscard = useCallback(async () => {
    if (!repo || !pendingDiscard || summary.busyAction) return;
    const target = pendingDiscard;
    setPendingDiscard(null);
    setLocalActionBusy("discard");
    setActionError(null);

    const discardEntries: GitDiscardEntry[] =
      target.scope === "single"
        ? [
            {
              path: target.entry.path,
              untracked: target.entry.untracked,
            },
          ]
        : target.entries;

    const pathSet = new Set(discardEntries.map((e) => e.path));
    summary.applyStatus((curr) => optimisticDiscard(curr, pathSet));

    try {
      await native.gitDiscard(repo.repoRoot, discardEntries);
      for (const p of pathSet) {
        invalidateDiff(workingDiffKey(repo.repoRoot, p, "-"));
        invalidateDiff(workingDiffKey(repo.repoRoot, p, "+"));
      }
      if (selected && pathSet.has(selected.path)) {
        setSelected(null);
      }
      await summary.refresh();
    } catch (error) {
      setActionError(normalizeError(error));
      await summary.refresh();
    } finally {
      setLocalActionBusy(null);
    }
  }, [pendingDiscard, repo, selected, summary]);

  const commit = useCallback(async () => {
    if (!repo || summary.busyAction) return;
    setLocalActionBusy("commit");
    setActionMessage(null);
    setActionError(null);
    try {
      const result = await native.gitCommit(repo.repoRoot, commitMessage);
      setCommitMessage("");
      setActionMessage(
        `Committed ${result.commitSha.slice(0, 7)} ${result.summary}`,
      );
      invalidateRepoDiffs(repo.repoRoot);
      await summary.refresh();
    } catch (error) {
      setActionError(normalizeError(error));
    } finally {
      setLocalActionBusy(null);
    }
  }, [commitMessage, repo, summary]);

  const push = useCallback(async () => {
    if (!repo || summary.busyAction) return;
    setLocalActionBusy("push");
    setActionMessage(null);
    setActionError(null);
    try {
      const result = await native.gitPush(repo.repoRoot);
      if (result.pushed) {
        setActionMessage(
          `Pushed to ${result.remote ?? "origin"}/${result.branch ?? ""}`.trim(),
        );
      } else {
        setActionMessage("Everything up-to-date");
      }
      await summary.refresh();
    } catch (error) {
      setActionError(normalizeError(error));
    } finally {
      setLocalActionBusy(null);
    }
  }, [repo, summary]);

  const pendingDiscardView: PendingDiscard | null = useMemo(() => {
    if (!pendingDiscard) return null;
    if (pendingDiscard.scope === "single") {
      return {
        scope: "single",
        count: 1,
        label: pendingDiscard.entry.path,
      };
    }
    return {
      scope: "all",
      count: pendingDiscard.entries.length,
      label: `${pendingDiscard.entries.length} unstaged ${
        pendingDiscard.entries.length === 1 ? "file" : "files"
      }`,
    };
  }, [pendingDiscard]);

  return {
    panelState,
    repo,
    status,
    selected,
    commitMessage,
    actionBusy: localActionBusy ?? summary.busyAction,
    statusError: summary.localError,
    actionError,
    remoteError: summary.lastRemoteError,
    actionMessage,
    stagedEntries,
    unstagedEntries,
    fileEntries,
    headerCheckState,
    allClean,
    canPush,
    pushHint,
    selectionTransition,
    stagedEmptyText,
    unstagedEmptyText,
    pendingDiscard: pendingDiscardView,
    setCommitMessage,
    refresh,
    selectEntry,
    selectFile,
    stageEntry,
    unstageEntry,
    toggleStageFile,
    toggleAll,
    requestDiscardEntry,
    requestDiscardFile,
    requestDiscardAll,
    confirmPendingDiscard,
    cancelPendingDiscard,
    stageAllEntries,
    unstageAllEntries,
    commit,
    push,
  };
}
