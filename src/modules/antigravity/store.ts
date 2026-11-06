import { create } from "zustand";

const STORAGE_KEY_OPEN = "terax:antigravity:sidepanel:open";
const STORAGE_KEY_WIDTH = "terax:antigravity:sidepanel:width";

export const MIN_ANTIGRAVITY_PANEL_WIDTH = 350;
export const MAX_ANTIGRAVITY_PANEL_WIDTH = 480;
export const DEFAULT_ANTIGRAVITY_PANEL_WIDTH = 350;

export function clampAntigravityWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_ANTIGRAVITY_PANEL_WIDTH;
  return Math.min(
    MAX_ANTIGRAVITY_PANEL_WIDTH,
    Math.max(MIN_ANTIGRAVITY_PANEL_WIDTH, Math.round(width)),
  );
}

interface AntigravityState {
  isOpen: boolean;
  width: number;
  setOpen: (isOpen: boolean) => void;
  toggle: () => void;
  openSidePanel: () => void;
  closeSidePanel: () => void;
  setWidth: (width: number) => void;
}

const getInitialOpen = (): boolean => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY_OPEN) === "true";
};

const getInitialWidth = (): number => {
  if (typeof window === "undefined") return DEFAULT_ANTIGRAVITY_PANEL_WIDTH;
  try {
    const val = Number(localStorage.getItem(STORAGE_KEY_WIDTH));
    return val >= MIN_ANTIGRAVITY_PANEL_WIDTH && val <= MAX_ANTIGRAVITY_PANEL_WIDTH
      ? val
      : DEFAULT_ANTIGRAVITY_PANEL_WIDTH;
  } catch {
    return DEFAULT_ANTIGRAVITY_PANEL_WIDTH;
  }
};

export const useAntigravityStore = create<AntigravityState>((set) => ({
  isOpen: getInitialOpen(),
  width: getInitialWidth(),
  setOpen: (isOpen) => {
    try {
      localStorage.setItem(STORAGE_KEY_OPEN, String(isOpen));
    } catch {}
    set({ isOpen });
  },
  toggle: () =>
    set((state) => {
      const next = !state.isOpen;
      try {
        localStorage.setItem(STORAGE_KEY_OPEN, String(next));
      } catch {}
      return { isOpen: next };
    }),
  openSidePanel: () => {
    try {
      localStorage.setItem(STORAGE_KEY_OPEN, "true");
    } catch {}
    set({ isOpen: true });
  },
  closeSidePanel: () => {
    try {
      localStorage.setItem(STORAGE_KEY_OPEN, "false");
    } catch {}
    set({ isOpen: false });
  },
  setWidth: (rawWidth) => {
    if (rawWidth < MIN_ANTIGRAVITY_PANEL_WIDTH) return;
    const width = clampAntigravityWidth(rawWidth);
    try {
      localStorage.setItem(STORAGE_KEY_WIDTH, String(width));
    } catch {}
    set({ width });
  },
}));

