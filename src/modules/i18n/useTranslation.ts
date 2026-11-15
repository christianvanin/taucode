import { useCallback } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setLanguage, type LanguagePref } from "@/modules/settings/store";
import { en } from "./locales/en";
import { it } from "./locales/it";
import type { TranslationKey, TranslationParams, TranslationSchema } from "./types";

const dictionaries: Record<LanguagePref, TranslationSchema> = {
  en,
  it,
};

function resolveKey(dict: Record<string, unknown>, path: string): string | null {
  const parts = path.split(".");
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return typeof current === "string" ? current : null;
}

export function translate(
  lang: LanguagePref,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const dict = dictionaries[lang] || dictionaries.en;
  let text = resolveKey(dict as unknown as Record<string, unknown>, key);

  // Fallback to English if missing in target locale
  if (text === null && lang !== "en") {
    text = resolveKey(dictionaries.en as unknown as Record<string, unknown>, key);
  }

  if (text === null) {
    return key;
  }

  if (params) {
    return text.replace(/\{(\w+)\}/g, (_, k: string) => {
      return params[k] !== undefined ? String(params[k]) : `{${k}}`;
    });
  }

  return text;
}

export function useTranslation() {
  const language = usePreferencesStore((s) => s.language) || "it";

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => {
      return translate(language, key, params);
    },
    [language],
  );

  return {
    t,
    language,
    setLanguage,
  };
}

/**
 * Static translation helper for use outside React component lifecycles.
 */
export function tStatic(key: TranslationKey, params?: TranslationParams): string {
  const currentLang = usePreferencesStore.getState().language || "it";
  return translate(currentLang, key, params);
}

