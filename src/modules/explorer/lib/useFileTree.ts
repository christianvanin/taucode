import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { listenFsChanged, watchAdd, watchRemove } from "./watch";

export type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  gitignored: boolean;
};

type ChildrenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; entries: DirEntry[] }
  | { status: "error"; message: string };

type TreeState = Record<string, ChildrenState>;

export type PendingCreate = {
  parentPath: string;
  kind: "file" | "dir";
};

export function normalizeFsPath(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(s)) {
    s = s[0].toUpperCase() + s.slice(1);
  }
  if (s.length > 3 && s.endsWith("/")) {
    s = s.replace(/\/+$/, "");
  }
  return s;
}

export function joinPath(parent: string, name: string): string {
  const p = normalizeFsPath(parent);
  if (p.endsWith("/")) return `${p}${name}`;
  return `${p}/${name}`;
}

export function dirname(path: string): string {
  const norm = normalizeFsPath(path);
  const i = norm.lastIndexOf("/");
  if (i <= 0) return "/";
  if (/^[a-zA-Z]:$/.test(norm.slice(0, i))) {
    return `${norm.slice(0, i)}/`;
  }
  return norm.slice(0, i);
}

const EXPANSION_CACHE_LIMIT = 8;
const expansionCache = new Map<string, string[]>();

function rememberExpansion(root: string, expanded: Set<string>): void {
  const r = normalizeFsPath(root);
  expansionCache.delete(r);
  if (expanded.size > 0) expansionCache.set(r, [...expanded].map(normalizeFsPath));
  while (expansionCache.size > EXPANSION_CACHE_LIMIT) {
    const oldest = expansionCache.keys().next().value;
    if (oldest === undefined) break;
    expansionCache.delete(oldest);
  }
}

function recallExpansion(root: string): string[] {
  const r = normalizeFsPath(root);
  const v = expansionCache.get(r);
  if (!v) return [];
  expansionCache.delete(r);
  expansionCache.set(r, v);
  return v;
}

function isUnder(key: string, root: string): boolean {
  const k = normalizeFsPath(key);
  const r = normalizeFsPath(root);
  return k === r || k.startsWith(`${r}/`);
}

// mtime/size are ignored on purpose: the tree never renders them, so a watcher
// refetch that only bumps mtime (saving a file) must not count as a change.
function sameDirListing(a: DirEntry[], b: DirEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].name !== b[i].name ||
      a[i].kind !== b[i].kind ||
      a[i].gitignored !== b[i].gitignored
    )
      return false;
  }
  return true;
}

type Options = {
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
};

export function useFileTree(rootPath: string | null, options?: Options) {
  const normalizedRoot = useMemo(
    () => (rootPath ? normalizeFsPath(rootPath) : null),
    [rootPath],
  );
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const showHiddenRef = useRef(showHidden);
  const gitDecorations = usePreferencesStore((s) => s.explorerGitDecorations);
  const gitDecorationsRef = useRef(gitDecorations);
  const [nodes, setNodes] = useState<TreeState>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(
    null,
  );
  const [renaming, setRenaming] = useState<string | null>(null);

  const expandedRef = useRef(expanded);
  const nodesRef = useRef(nodes);
  const watchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    showHiddenRef.current = showHidden;
  }, [showHidden]);

  useEffect(() => {
    gitDecorationsRef.current = gitDecorations;
  }, [gitDecorations]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const addWatch = useCallback((rawPath: string) => {
    const path = normalizeFsPath(rawPath);
    if (!path || watchedRef.current.has(path)) return;
    watchedRef.current.add(path);
    watchAdd([path]);
  }, []);

  const removeWatch = useCallback((rawPath: string) => {
    const path = normalizeFsPath(rawPath);
    if (!path || !watchedRef.current.delete(path)) return;
    watchRemove([path]);
  }, []);

  const fetchChildren = useCallback(async (rawPath: string) => {
    const path = normalizeFsPath(rawPath);
    if (!path) return;
    if (nodesRef.current[path]?.status !== "loaded") {
      setNodes((s) => ({ ...s, [path]: { status: "loading" } }));
    }
    try {
      const entries = await invoke<DirEntry[]>("fs_read_dir", {
        path,
        showHidden: showHiddenRef.current,
        gitDecorations: gitDecorationsRef.current,
        workspace: currentWorkspaceEnv(),
      });

      const prev = nodesRef.current[path];
      if (prev?.status === "loaded" && sameDirListing(prev.entries, entries)) {
        return;
      }

      const isWin = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");
      const liveDirs = new Set(
        entries.filter((e) => e.kind === "dir").map((e) => {
          const p = joinPath(path, e.name);
          return isWin ? p.toLowerCase() : p;
        }),
      );
      const removedRoots: string[] = [];
      for (const key of Object.keys(nodesRef.current)) {
        if (dirname(key) === path) {
          const lookupKey = isWin ? key.toLowerCase() : key;
          if (!liveDirs.has(lookupKey)) removedRoots.push(key);
        }
      }
      const dead = new Set<string>();
      if (removedRoots.length > 0) {
        const candidates = new Set<string>([
          ...Object.keys(nodesRef.current),
          ...expandedRef.current,
          ...watchedRef.current,
        ]);
        for (const k of candidates) {
          if (removedRoots.some((r) => isUnder(k, r))) dead.add(k);
        }
      }

      setNodes((s) => {
        const next: TreeState = {};
        for (const [k, v] of Object.entries(s)) if (!dead.has(k)) next[k] = v;
        next[path] = { status: "loaded", entries };
        return next;
      });

      if (dead.size > 0) {
        setExpanded((c) => {
          let changed = false;
          const n = new Set(c);
          for (const d of dead) if (n.delete(d)) changed = true;
          return changed ? n : c;
        });
        const toUnwatch: string[] = [];
        for (const d of dead) if (watchedRef.current.delete(d)) toUnwatch.push(d);
        watchRemove(toUnwatch);
      }
    } catch (e) {
      setNodes((s) => ({
        ...s,
        [path]: { status: "error", message: String(e) },
      }));
    }
  }, []);

  // Root change → restore the cached expansion for this root, re-scope watches,
  // and persist the outgoing root's expansion on the way out.
  useEffect(() => {
    if (!normalizedRoot) {
      setNodes({});
      setExpanded(new Set());
      setPendingCreate(null);
      setRenaming(null);
      return;
    }
    setPendingCreate(null);
    setRenaming(null);

    const restored = recallExpansion(normalizedRoot).map(normalizeFsPath);
    setExpanded(new Set(restored));
    setNodes({});
    // Sync the ref synchronously: nodesRef only updates after the next render,
    // so without this a fast (cached) fetchChildren below would read the stale
    // pre-clear "loaded" node, hit the sameDirListing early-return, and skip
    // re-populating — leaving a valid root with an empty tree when rootPath
    // changes rapidly (e.g. switching folders in quick succession).
    nodesRef.current = {};

    const toWatch = [normalizedRoot, ...restored];
    void fetchChildren(normalizedRoot);
    for (const d of restored) void fetchChildren(d);
    for (const p of toWatch) watchedRef.current.add(p);
    watchAdd(toWatch);

    return () => {
      rememberExpansion(normalizedRoot, expandedRef.current);
      if (watchedRef.current.size > 0) {
        watchRemove([...watchedRef.current]);
        watchedRef.current.clear();
      }
    };
  }, [normalizedRoot, fetchChildren]);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    void listenFsChanged((paths) => {
      const current = nodesRef.current;
      const dirs = new Set<string>();
      for (const raw of paths) {
        const norm = normalizeFsPath(raw);
        if (!norm) continue;

        if (current[norm]?.status === "loaded") {
          dirs.add(norm);
        }

        let parent = dirname(norm);
        while (parent && parent !== norm) {
          if (current[parent]?.status === "loaded") {
            dirs.add(parent);
          }
          if (
            normalizedRoot &&
            (parent === normalizedRoot || !parent.startsWith(normalizedRoot))
          ) {
            break;
          }
          const nextParent = dirname(parent);
          if (nextParent === parent) break;
          parent = nextParent;
        }
      }
      for (const d of dirs) void fetchChildren(d);
    }).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [normalizedRoot, fetchChildren]);

  useEffect(() => {
    if (!normalizedRoot) return;
    const onFocus = () => {
      const loaded = Object.keys(nodesRef.current).filter(
        (p) => nodesRef.current[p]?.status === "loaded",
      );
      for (const p of loaded) void fetchChildren(p);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [normalizedRoot, fetchChildren]);

  useEffect(() => {
    if (!normalizedRoot) return;
    const loadedPaths = Object.entries(nodes)
      .filter(([, state]) => state.status === "loaded")
      .map(([path]) => path);
    for (const path of loadedPaths) void fetchChildren(path);
    // Re-list loaded directories when visibility or git-decoration prefs change.
    // `nodes` is intentionally omitted so ordinary tree edits don't refetch
    // every expanded directory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden, gitDecorations, normalizedRoot, fetchChildren]);

  const toggle = useCallback(
    (rawPath: string) => {
      const path = normalizeFsPath(rawPath);
      if (expandedRef.current.has(path)) {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.delete(path);
          return next;
        });
        removeWatch(path);
      } else {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.add(path);
          return next;
        });
        addWatch(path);
        void fetchChildren(path);
      }
    },
    [fetchChildren, addWatch, removeWatch],
  );

  const expand = useCallback(
    (rawPath: string) => {
      const path = normalizeFsPath(rawPath);
      if (expandedRef.current.has(path)) return;
      setExpanded((curr) => {
        const next = new Set(curr);
        next.add(path);
        return next;
      });
      addWatch(path);
      void fetchChildren(path);
    },
    [fetchChildren, addWatch],
  );

  const refresh = useCallback(
    (path?: string) => {
      if (path) {
        void fetchChildren(normalizeFsPath(path));
      } else {
        const loaded = Object.keys(nodesRef.current).filter(
          (p) => nodesRef.current[p]?.status === "loaded",
        );
        for (const p of loaded) void fetchChildren(p);
      }
    },
    [fetchChildren],
  );

  // --- mutations ---

  const beginCreate = useCallback(
    (parentPath: string, kind: "file" | "dir") => {
      const parent = normalizeFsPath(parentPath);
      setRenaming(null);
      setPendingCreate({ parentPath: parent, kind });
      // Ensure the parent is expanded so the input row is visible.
      if (normalizedRoot && parent !== normalizedRoot) {
        setExpanded((curr) => {
          if (curr.has(parent)) return curr;
          const next = new Set(curr);
          next.add(parent);
          return next;
        });
        addWatch(parent);
      }
      setNodes((curr) => {
        if (!curr[parent]) void fetchChildren(parent);
        return curr;
      });
    },
    [normalizedRoot, fetchChildren, addWatch],
  );

  const cancelCreate = useCallback(() => setPendingCreate(null), []);

  const commitCreate = useCallback(
    async (name: string) => {
      if (!pendingCreate) return;
      const trimmed = name.trim();
      if (!trimmed) {
        setPendingCreate(null);
        return;
      }
      const parent = normalizeFsPath(pendingCreate.parentPath);
      const path = joinPath(parent, trimmed);
      const cmd =
        pendingCreate.kind === "dir" ? "fs_create_dir" : "fs_create_file";
      try {
        await invoke(cmd, { path, workspace: currentWorkspaceEnv() });
        await fetchChildren(parent);
      } catch (e) {
        console.error(`${cmd} failed:`, e);
      } finally {
        setPendingCreate(null);
      }
    },
    [pendingCreate, fetchChildren],
  );

  const beginRename = useCallback((rawPath: string) => {
    setPendingCreate(null);
    setRenaming(normalizeFsPath(rawPath));
  }, []);

  const cancelRename = useCallback(() => setRenaming(null), []);

  const commitRename = useCallback(
    async (newName: string) => {
      if (!renaming) return;
      const trimmed = newName.trim();
      const renamingNorm = normalizeFsPath(renaming);
      const parent = dirname(renamingNorm);
      const oldName = renamingNorm.slice(parent === "/" ? 1 : parent.length + 1);
      if (!trimmed || trimmed === oldName) {
        setRenaming(null);
        return;
      }
      const to = joinPath(parent, trimmed);
      try {
        await invoke("fs_rename", {
          from: renamingNorm,
          to,
          workspace: currentWorkspaceEnv(),
        });
        options?.onPathRenamed?.(renamingNorm, to);
        await fetchChildren(parent);
      } catch (e) {
        console.error("fs_rename failed:", e);
      } finally {
        setRenaming(null);
      }
    },
    [renaming, fetchChildren, options],
  );

  const deletePath = useCallback(
    async (rawPath: string) => {
      const path = normalizeFsPath(rawPath);
      try {
        await invoke("fs_delete", { path, workspace: currentWorkspaceEnv() });
        options?.onPathDeleted?.(path);
        await fetchChildren(dirname(path));
      } catch (e) {
        console.error("fs_delete failed:", e);
      }
    },
    [fetchChildren, options],
  );

  const movePath = useCallback(
    async (rawFrom: string, rawToDir: string) => {
      const from = normalizeFsPath(rawFrom);
      const toDir = normalizeFsPath(rawToDir);
      const name = from.slice(from.lastIndexOf("/") + 1);
      const to = joinPath(toDir, name);
      if (to === from) return;
      const target = nodesRef.current[toDir];
      if (
        target?.status === "loaded" &&
        target.entries.some((e) => e.name === name)
      ) {
        console.warn(`move skipped: "${name}" already exists in ${toDir}`);
        return;
      }
      try {
        await invoke("fs_rename", {
          from,
          to,
          workspace: currentWorkspaceEnv(),
        });
        options?.onPathRenamed?.(from, to);
        await Promise.all([fetchChildren(dirname(from)), fetchChildren(toDir)]);
      } catch (e) {
        console.error("fs_rename (move) failed:", e);
      }
    },
    [fetchChildren, options],
  );

  return {
    nodes,
    expanded,
    pendingCreate,
    renaming,
    toggle,
    expand,
    refresh,
    beginCreate,
    cancelCreate,
    commitCreate,
    beginRename,
    cancelRename,
    commitRename,
    deletePath,
    movePath,
    joinPath,
  };
}
