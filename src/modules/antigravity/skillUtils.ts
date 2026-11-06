/**
 * Utility e costanti per la gestione delle Skill di Antigravity
 */

export const DEFAULT_GEMINI_SKILLS = [
  "agy-customizations",
  "antigravity_guide",
  "antigravity-guide",
  "automation",
  "generative_ui",
  "migrate-workflows",
  "permissioned-github",
  "plugin",
  "run-workflow",
  "ui-plugin-navigation",
  "taucode-tabs",
  "skill-builder",
] as const;

export interface SkillInfo {
  name: string;
  description: string;
  folder: string;
  enabled: boolean;
  path: string;
  dir: string;
  content?: string;
  is_default: boolean;
  extension_id?: string;
  extension_name?: string;
}

export interface McpServerInfo {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  url?: string;
  transport: "stdio" | "sse";
  enabled: boolean;
  extension_id?: string;
  extension_name?: string;
  is_extension_provided: boolean;
}

export interface SkillProjectInfo {
  name: string;
  folder: string;
  path: string;
  entry_file: string;
  enabled: boolean;
  is_default: boolean;
}

export const OPEN_SKILL_PROJECT_EVENT = "terax:open-skill-project";

export interface OpenSkillProjectPayload {
  name: string;
  path: string;
  entryFile?: string;
}

/**
 * Invia l'evento globale per aprire o creare uno Space dell'editor dedicato alla Skill.
 */
export function openSkillAsWorkspace(payload: OpenSkillProjectPayload): void {
  window.dispatchEvent(
    new CustomEvent<OpenSkillProjectPayload>(OPEN_SKILL_PROJECT_EVENT, {
      detail: payload,
    }),
  );
}

/**
 * Verifica se un nome o un percorso file appartiene a una Skill predefinita di Gemini.
 * Le skill predefinite sono di sistema e protette (sola lettura, non modificabili, non eliminabili).
 */
export function isDefaultGeminiSkill(nameOrPath: string | null | undefined): boolean {
  if (!nameOrPath) return false;
  const clean = nameOrPath.trim().toLowerCase().replace(/\\/g, "/");

  // 1. Corrispondenza diretta del nome (es. "antigravity_guide" o "Skill: antigravity-guide")
  const strippedName = clean
    .replace(/^skill:\s*/i, "")
    .trim()
    .replace(/_/g, "-");

  if (
    DEFAULT_GEMINI_SKILLS.some((s) => s.toLowerCase().replace(/_/g, "-") === strippedName)
  ) {
    return true;
  }

  // 2. Corrispondenza da percorso cartella: .../skills/<folder_name>/...
  const match = clean.match(/(?:^|\/)skills\/([^/]+)/);
  if (match?.[1]) {
    const folder = match[1].toLowerCase().replace(/_/g, "-");
    if (
      DEFAULT_GEMINI_SKILLS.some((s) => s.toLowerCase().replace(/_/g, "-") === folder)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Verifica se un percorso appartiene a una cartella di una Skill Antigravity.
 */
export function isSkillPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const norm = path.replace(/\\/g, "/").toLowerCase();
  return (
    norm.includes("/.gemini/antigravity/builtin/skills/") ||
    norm.includes("/.gemini/antigravity/skills/") ||
    norm.includes("/.gemini/config/skills/")
  );
}

/**
 * Verifica se un workspace Space aperto corrisponde a un progetto di una Skill.
 */
export function isSkillWorkspace(
  space: { name?: string | null; root?: string | null } | null | undefined,
): boolean {
  if (!space) return false;
  if (space.name?.startsWith("Skill: ")) return true;
  return isSkillPath(space.root);
}

/**
 * Estrae il nome pulito della Skill dal nome o dal root dello Space.
 */
export function extractSkillName(
  spaceName?: string | null,
  spaceRoot?: string | null,
): string {
  if (spaceName && spaceName.startsWith("Skill: ")) {
    return spaceName.replace(/^Skill:\s*/i, "").trim();
  }
  if (spaceRoot) {
    const norm = spaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const parts = norm.split("/");
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return spaceName || "skill";
}
