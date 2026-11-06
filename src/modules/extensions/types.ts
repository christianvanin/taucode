export interface ExtensionTabContribution {
  id: string;
  title: string;
  icon?: string;
  renderType: "webview" | "esm" | "custom-editor";
  entry?: string;
  fileExtensions?: string[];
  singleton?: boolean;
}

export interface ExtensionSettingsContribution {
  id: string;
  title: string;
  icon?: string;
  renderType: "declarative" | "custom";
  schema?: {
    fields: Array<{
      key: string;
      label: string;
      type: "string" | "boolean" | "number" | "select";
      options?: string[];
      default?: unknown;
      description?: string;
    }>;
  };
  entry?: string;
}

export interface ExtensionSkillContribution {
  name: string;
  path: string;
}

export interface ExtensionMcpServerContribution {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface ExtensionCommandContribution {
  id: string;
  title: string;
  action: string;
  icon?: string;
}

export interface ExtensionContributes {
  tabs?: ExtensionTabContribution[];
  settings?: ExtensionSettingsContribution[];
  skills?: ExtensionSkillContribution[];
  mcpServers?: Record<string, ExtensionMcpServerContribution>;
  commands?: ExtensionCommandContribution[];
}

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  author?: string;
  icon?: string;
  homepage?: string;
  minTaucodeVersion?: string;
  contributes?: ExtensionContributes;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  display_name: string;
  description: string;
  author: string;
  icon_path: string | null;
  homepage: string | null;
  dir_path: string;
  enabled: boolean;
  contributes: ExtensionContributes;
}
