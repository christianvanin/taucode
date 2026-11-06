import {
  EDITOR_THEME_AUTO,
  EDITOR_THEME_MODE,
  isEditorThemeId,
  type EditorThemeId,
  type EditorThemePref,
} from "@/modules/settings/store";

const FALLBACK: Record<"light" | "dark", EditorThemeId> = {
  light: "github-light",
  dark: "atomone",
};

/**
 * Resolve the concrete Monaco/CodeMirror theme to apply.
 * In "auto" or when the preference mode conflicts with the active app mode,
 * the editor follows the active mode (light -> github-light, dark -> atomone).
 * When an explicit theme preference matches the current mode, that preference is used.
 */
export function resolveEditorThemeId(
  pref: EditorThemePref,
  mode: "light" | "dark",
): EditorThemeId {
  if (pref && pref !== EDITOR_THEME_AUTO && isEditorThemeId(pref)) {
    if (EDITOR_THEME_MODE[pref] === mode) {
      return pref;
    }
  }
  return FALLBACK[mode];
}
