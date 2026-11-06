import { useExtensionsStore } from "./store";
import type {
  ExtensionInfo,
  ExtensionTabContribution,
  ExtensionSettingsContribution,
  ExtensionCommandContribution,
} from "./types";

export interface ActiveTabContribution {
  extension: ExtensionInfo;
  tab: ExtensionTabContribution;
}

export interface ActiveSettingsContribution {
  extension: ExtensionInfo;
  settings: ExtensionSettingsContribution;
}

export class ExtensionRegistry {
  private static getExts(extensions?: ExtensionInfo[]): ExtensionInfo[] {
    return extensions ?? useExtensionsStore.getState().extensions;
  }

  /**
   * Restituisce tutte le tab registrate da estensioni abilitate
   */
  static getActiveTabs(extensions?: ExtensionInfo[]): ActiveTabContribution[] {
    const exts = this.getExts(extensions);
    const result: ActiveTabContribution[] = [];
    for (const ext of exts) {
      if (!ext.enabled || !ext.contributes?.tabs) continue;
      for (const tab of ext.contributes.tabs) {
        result.push({ extension: ext, tab });
      }
    }
    return result;
  }

  /**
   * Cerca la definizione di una tab per extensionId e tabId
   */
  static findTab(
    extensionId: string,
    tabId: string,
    extensions?: ExtensionInfo[]
  ): ActiveTabContribution | null {
    const exts = this.getExts(extensions);
    const ext = exts.find((e) => e.id === extensionId && e.enabled);
    if (!ext || !ext.contributes?.tabs) return null;
    const tab = ext.contributes.tabs.find((t) => t.id === tabId);
    return tab ? { extension: ext, tab } : null;
  }

  /**
   * Trova la prima tab abilitata associata a una determinata estensione di file (es. ".bbmodel")
   */
  static findTabForFileExtension(
    filePath: string,
    extensions?: ExtensionInfo[]
  ): ActiveTabContribution | null {
    const exts = this.getExts(extensions);
    const rawExt = (filePath.split(".").pop() ?? "").toLowerCase();
    if (!rawExt) return null;

    for (const ext of exts) {
      if (!ext.enabled || !ext.contributes?.tabs) continue;
      for (const tab of ext.contributes.tabs) {
        const fileExts =
          tab.fileExtensions ??
          (tab as { file_extensions?: string[] }).file_extensions;
        if (
          fileExts &&
          fileExts.some((fExt) => {
            const clean = fExt.toLowerCase().replace(/^\./, "");
            return clean === rawExt;
          })
        ) {
          return { extension: ext, tab };
        }
      }
    }
    return null;
  }

  /**
   * Restituisce tutte le sezioni di impostazione registrate da estensioni abilitate
   */
  static getActiveSettings(
    extensions?: ExtensionInfo[]
  ): ActiveSettingsContribution[] {
    const exts = this.getExts(extensions);
    const result: ActiveSettingsContribution[] = [];
    for (const ext of exts) {
      if (!ext.enabled || !ext.contributes?.settings) continue;
      for (const settings of ext.contributes.settings) {
        result.push({ extension: ext, settings });
      }
    }
    return result;
  }

  /**
   * Restituisce tutti i comandi registrati da estensioni abilitate
   */
  static getActiveCommands(
    extensions?: ExtensionInfo[]
  ): Array<{ extension: ExtensionInfo; command: ExtensionCommandContribution }> {
    const exts = this.getExts(extensions);
    const result: Array<{
      extension: ExtensionInfo;
      command: ExtensionCommandContribution;
    }> = [];
    for (const ext of exts) {
      if (!ext.enabled || !ext.contributes?.commands) continue;
      for (const cmd of ext.contributes.commands) {
        result.push({ extension: ext, command: cmd });
      }
    }
    return result;
  }
}
