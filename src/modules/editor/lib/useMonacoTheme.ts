import { usePreferencesStore } from "@/modules/settings/preferences";
import { resolveEditorThemeId, useTheme } from "@/modules/theme";
import { useMemo } from "react";

/** Resolves the active Monaco theme ID, honouring the "auto" pairing. */
export function useMonacoThemeId(): string {
  const pref = usePreferencesStore((s) => s.editorTheme);
  const { resolvedMode } = useTheme();
  return useMemo(
    () => resolveEditorThemeId(pref, resolvedMode),
    [pref, resolvedMode],
  );
}
