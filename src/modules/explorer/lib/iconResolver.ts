import catppuccinIcons from "@iconify-json/catppuccin/icons.json";
import { EXT_TO_LANGUAGE_ID } from "./constants";
import * as fileIconsMod from "./fileIcons";
import * as folderIconsMod from "./folderIcons";

const catFileNames = fileIconsMod.fileNames as Record<string, string>;
const catFileExtensions = fileIconsMod.fileExtensions as Record<string, string>;
const catLanguageIds = fileIconsMod.languageIds as Record<string, string>;
const catFolderNames = folderIconsMod.folderNames as Record<string, string>;

type IconifySet = {
  icons: Record<string, { body: string }>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
};

const cat = catppuccinIcons as unknown as IconifySet;
const CAT_W = cat.width ?? 16;
const CAT_H = cat.height ?? 16;

const DEFAULT_FILE = "file";
const DEFAULT_FOLDER = "folder";
const DEFAULT_FOLDER_OPEN = "folder-open";

const dataUrlCache = new Map<string, string>();

// Catppuccin's manifest emits names like `folder_src`/`typescript-react`, but
// the iconify export normalizes everything to hyphenated slugs.
function toIconifySlug(name: string): string {
  return name.replace(/_/g, "-");
}

function catBody(iconName: string): string | null {
  const slug = toIconifySlug(iconName);
  const direct = cat.icons[slug];
  if (direct) return direct.body;
  const alias = cat.aliases?.[slug];
  if (alias) {
    const parent = cat.icons[alias.parent];
    if (parent) return parent.body;
  }
  return null;
}

function isDarkMode(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.classList.contains("dark");
}

function buildDataUrl(iconName: string, dark = isDarkMode()): string | null {
  const cacheKey = `${dark ? "dark" : "light"}:${iconName}`;
  const cached = dataUrlCache.get(cacheKey);
  if (cached !== undefined) return cached || null;
  let body = catBody(iconName);
  if (!body) {
    dataUrlCache.set(cacheKey, "");
    return null;
  }
  if (!dark) {
    // In light theme, replace low-contrast dark-theme text/stroke colors (#cad3f5) with Catppuccin Latte text color (#4c4f69)
    body = body
      .replace(/#cad3f5/gi, "#4c4f69")
      .replace(/#b7bdf8/gi, "#7287fd")
      .replace(/#f4dbd6/gi, "#dc8a78");
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CAT_W} ${CAT_H}">${body}</svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  dataUrlCache.set(cacheKey, url);
  return url;
}

function extOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.indexOf(".");
  if (dot === -1 || dot === lower.length - 1) return "";
  return lower.slice(dot + 1);
}

export function fileIconUrl(name: string, isDark?: boolean): string {
  const lower = name.toLowerCase();
  const dark = isDark ?? isDarkMode();

  const byName = catFileNames[lower];
  if (byName) {
    const url = buildDataUrl(byName, dark);
    if (url) return url;
  }

  let ext = extOf(lower);
  while (ext) {
    const iconName = catFileExtensions[ext];
    if (iconName) {
      const url = buildDataUrl(iconName, dark);
      if (url) return url;
    }
    const langId = EXT_TO_LANGUAGE_ID[ext];
    if (langId) {
      const iconByLang = catLanguageIds[langId];
      if (iconByLang) {
        const url = buildDataUrl(iconByLang, dark);
        if (url) return url;
      }
    }
    const nextDot = ext.indexOf(".");
    if (nextDot === -1) break;
    ext = ext.slice(nextDot + 1);
  }

  return buildDataUrl(DEFAULT_FILE, dark) ?? "";
}

export function folderIconUrl(
  name: string,
  expanded: boolean,
  isDark?: boolean,
): string {
  const lower = name.toLowerCase();
  const dark = isDark ?? isDarkMode();

  const mapped = catFolderNames[lower];
  if (mapped) {
    const slug = toIconifySlug(mapped);
    const target = expanded ? `${slug}-open` : slug;
    const url = buildDataUrl(target, dark);
    if (url) return url;
  }

  return (
    buildDataUrl(expanded ? DEFAULT_FOLDER_OPEN : DEFAULT_FOLDER, dark) ?? ""
  );
}
