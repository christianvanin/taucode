import { IS_WINDOWS } from "@/lib/platform";
import { native, type DirEntry } from "@/lib/native";
import type { TauCodeActionType, TauCodeConfig } from "./types";
import { detectProjectType, getTemplatesForProject, AI_AGENT_INSTRUCTIONS } from "./projectAnalyzer";

const DEFAULT_COMPILE_JSON: TauCodeConfig = {
  name: "Compile",
  file: "workflow/compile.sh",
  windowsFile: "workflow/compile.bat",
};

const DEFAULT_RUN_JSON: TauCodeConfig = {
  name: "Run",
  file: "workflow/run.sh",
  windowsFile: "workflow/run.bat",
};

async function fileExists(path: string): Promise<boolean> {
  try {
    const res = await native.readFile(path);
    return res !== undefined && res.kind !== "toolarge";
  } catch {
    return false;
  }
}

/**
 * Ensures the TauCode directory structure and default configuration/workflow files exist
 * in the project root.
 *
 * Folder structure:
 *  <root>/
 *    TauCode/
 *      compile.json
 *      run.json
 *      workflow/
 *        compile.sh
 *        compile.bat
 *        run.sh
 *        run.bat
 */
export async function ensureTauCodeStructure(rootPath: string): Promise<void> {
  if (!rootPath) return;

  const cleanRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "");
  const tauCodeDir = `${cleanRoot}/TauCode`;
  const workflowDir = `${cleanRoot}/TauCode/workflow`;

  // 1. Create directories if needed
  await native.createDir(tauCodeDir).catch(() => {});
  await native.createDir(workflowDir).catch(() => {});

  // 2. Create compile.json if missing
  const compileJsonPath = `${tauCodeDir}/compile.json`;
  if (!(await fileExists(compileJsonPath))) {
    await native
      .writeFile(compileJsonPath, JSON.stringify(DEFAULT_COMPILE_JSON, null, 2))
      .catch(() => {});
  }

  // 3. Create run.json if missing
  const runJsonPath = `${tauCodeDir}/run.json`;
  if (!(await fileExists(runJsonPath))) {
    await native
      .writeFile(runJsonPath, JSON.stringify(DEFAULT_RUN_JSON, null, 2))
      .catch(() => {});
  }

  // Detect project type and get dynamic templates
  const projectType = await detectProjectType(rootPath);
  
  // Load preferences directly to get custom templates if they exist
  const { loadPreferences } = await import("@/modules/settings/store");
  const prefs = await loadPreferences();
  const customTemplates = prefs.tauCodeTemplates?.[projectType];
  const templates = customTemplates || getTemplatesForProject(projectType);

  // 4. Create workflow scripts if missing
  const compileShPath = `${workflowDir}/compile.sh`;
  if (!(await fileExists(compileShPath))) {
    await native.writeFile(compileShPath, templates.compileSh).catch(() => {});
  }

  const compileBatPath = `${workflowDir}/compile.bat`;
  if (!(await fileExists(compileBatPath))) {
    await native.writeFile(compileBatPath, templates.compileBat).catch(() => {});
  }

  const runShPath = `${workflowDir}/run.sh`;
  if (!(await fileExists(runShPath))) {
    await native.writeFile(runShPath, templates.runSh).catch(() => {});
  }

  const runBatPath = `${workflowDir}/run.bat`;
  if (!(await fileExists(runBatPath))) {
    await native.writeFile(runBatPath, templates.runBat).catch(() => {});
  }

  // 5. Create AI instructions file if missing
  const aiInstructionsPath = `${tauCodeDir}/AI_AGENT_INSTRUCTIONS.md`;
  if (!(await fileExists(aiInstructionsPath))) {
    await native.writeFile(aiInstructionsPath, AI_AGENT_INSTRUCTIONS).catch(() => {});
  }
}

/**
 * Reads and parses compile.json or run.json from the TauCode folder.
 */
export async function readTauCodeConfig(
  rootPath: string,
  type: TauCodeActionType,
): Promise<TauCodeConfig | null> {
  if (!rootPath) return null;

  const cleanRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "");
  const fileName = type === "compile" ? "compile.json" : "run.json";
  const configPath = `${cleanRoot}/TauCode/${fileName}`;

  try {
    const res = await native.readFile(configPath);
    if (res && res.kind === "text") {
      return JSON.parse(res.content) as TauCodeConfig;
    }
  } catch {
    // If not found or invalid, return default template
  }

  return type === "compile" ? DEFAULT_COMPILE_JSON : DEFAULT_RUN_JSON;
}

/**
 * Generates the terminal execution command for a given TauCode configuration.
 */
export function buildScriptCommand(
  config: TauCodeConfig,
  type: TauCodeActionType,
): string {
  // If direct custom command is specified without explicit file/script
  if (config.command && !config.file && !config.script && !config.windowsFile && !config.windowsScript) {
    return config.command;
  }

  const defaultScript =
    type === "compile" ? "workflow/compile.sh" : "workflow/run.sh";
  const defaultBat =
    type === "compile" ? "workflow/compile.bat" : "workflow/run.bat";

  let target = config.file || config.script;

  if (IS_WINDOWS) {
    if (config.windowsFile || config.windowsScript) {
      target = config.windowsFile || config.windowsScript;
    } else if (!target) {
      target = defaultBat;
    }
  } else if (!target) {
    target = defaultScript;
  }

  if (!target) {
    target = defaultScript;
  }

  // Strip leading ./ or .\ or TauCode/
  let cleanScript = target
    .replace(/^[./\\]*TauCode[/\\]/i, "")
    .replace(/^[./\\]+/, "");

  // If the user just specified "compile.sh" or "run.sh" without "workflow/", automatically route inside workflow/
  if (!cleanScript.includes("/") && !cleanScript.includes("\\")) {
    cleanScript = `workflow/${cleanScript}`;
  }

  const argsSuffix = Array.isArray(config.args) && config.args.length > 0
    ? ` ${config.args.join(" ")}`
    : "";

  if (IS_WINDOWS) {
    const ext = cleanScript.toLowerCase();
    if (ext.endsWith(".bat") || ext.endsWith(".cmd")) {
      return `.\\TauCode\\${cleanScript.replace(/\//g, "\\")}${argsSuffix}`;
    }
    if (ext.endsWith(".ps1")) {
      return `powershell -ExecutionPolicy Bypass -File ".\\TauCode\\${cleanScript.replace(/\//g, "\\")}"${argsSuffix}`;
    }
    // Unix shell script execution on Windows (e.g. bash or sh)
    return `bash "./TauCode/${cleanScript.replace(/\\/g, "/")}"${argsSuffix}`;
  }

  return `bash "./TauCode/${cleanScript.replace(/\\/g, "/")}"${argsSuffix}`;
}

/**
 * Checks if a given path is the TauCode directory or inside it.
 */
export function isTauCodePath(rootPath: string | null | undefined, filePath: string): boolean {
  if (!rootPath || !filePath) return false;
  const cleanRoot = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const cleanFile = filePath.replace(/\\/g, "/").replace(/\/+$/, "");
  const tauCodePrefix = `${cleanRoot}/TauCode`;

  if (IS_WINDOWS) {
    const lowerFile = cleanFile.toLowerCase();
    const lowerPrefix = tauCodePrefix.toLowerCase();
    return lowerFile === lowerPrefix || lowerFile.startsWith(`${lowerPrefix}/`);
  }
  return cleanFile === tauCodePrefix || cleanFile.startsWith(`${tauCodePrefix}/`);
}

/**
 * Returns the virtual content of a TauCode configuration or workflow file
 * if it does not physically exist on disk.
 */
export async function getVirtualTauCodeFile(
  rootPath: string,
  filePath: string,
): Promise<string | null> {
  if (!rootPath || !filePath) return null;
  const cleanRoot = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const cleanFile = filePath.replace(/\\/g, "/");
  const tauCodePrefix = `${cleanRoot}/TauCode/`;

  let rel = "";
  if (IS_WINDOWS) {
    if (cleanFile.toLowerCase().startsWith(tauCodePrefix.toLowerCase())) {
      rel = cleanFile.slice(tauCodePrefix.length);
    }
  } else if (cleanFile.startsWith(tauCodePrefix)) {
    rel = cleanFile.slice(tauCodePrefix.length);
  }

  if (!rel) return null;
  const normalizedRel = rel.replace(/^[./\\]+/, "");

  if (normalizedRel === "compile.json") {
    return JSON.stringify(DEFAULT_COMPILE_JSON, null, 2);
  }
  if (normalizedRel === "run.json") {
    return JSON.stringify(DEFAULT_RUN_JSON, null, 2);
  }
  if (normalizedRel === "AI_AGENT_INSTRUCTIONS.md") {
    return AI_AGENT_INSTRUCTIONS;
  }

  // Workflow scripts
  const projectType = await detectProjectType(rootPath);
  const { loadPreferences } = await import("@/modules/settings/store");
  const prefs = await loadPreferences();
  const customTemplates = prefs.tauCodeTemplates?.[projectType];
  const templates = customTemplates || getTemplatesForProject(projectType);

  if (normalizedRel === "workflow/compile.sh" || normalizedRel === "compile.sh") {
    return templates.compileSh;
  }
  if (normalizedRel === "workflow/compile.bat" || normalizedRel === "compile.bat") {
    return templates.compileBat;
  }
  if (normalizedRel === "workflow/run.sh" || normalizedRel === "run.sh") {
    return templates.runSh;
  }
  if (normalizedRel === "workflow/run.bat" || normalizedRel === "run.bat") {
    return templates.runBat;
  }

  return null;
}

/**
 * Returns default virtual DirEntry items for /TauCode and /TauCode/workflow.
 */
export function getVirtualTauCodeEntries(
  rootPath: string,
  dirPath: string,
): DirEntry[] | null {
  if (!rootPath || !dirPath) return null;
  const cleanRoot = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const cleanDir = dirPath.replace(/\\/g, "/").replace(/\/+$/, "");

  const tauCodeDir = `${cleanRoot}/TauCode`;
  const workflowDir = `${cleanRoot}/TauCode/workflow`;

  const isTauCode = IS_WINDOWS
    ? cleanDir.toLowerCase() === tauCodeDir.toLowerCase()
    : cleanDir === tauCodeDir;

  if (isTauCode) {
    return [
      { name: "workflow", kind: "dir", size: 0, mtime: 0, gitignored: false },
      { name: "compile.json", kind: "file", size: 0, mtime: 0, gitignored: false },
      { name: "run.json", kind: "file", size: 0, mtime: 0, gitignored: false },
      { name: "AI_AGENT_INSTRUCTIONS.md", kind: "file", size: 0, mtime: 0, gitignored: false },
    ];
  }

  const isWorkflow = IS_WINDOWS
    ? cleanDir.toLowerCase() === workflowDir.toLowerCase()
    : cleanDir === workflowDir;

  if (isWorkflow) {
    return [
      { name: "compile.bat", kind: "file", size: 0, mtime: 0, gitignored: false },
      { name: "compile.sh", kind: "file", size: 0, mtime: 0, gitignored: false },
      { name: "run.bat", kind: "file", size: 0, mtime: 0, gitignored: false },
      { name: "run.sh", kind: "file", size: 0, mtime: 0, gitignored: false },
    ];
  }

  return null;
}

/**
 * Resolves the executable terminal command.
 * If physical files exist on disk, uses them.
 * If purely virtual, runs the default project commands directly in the terminal without disk writes.
 */
export async function resolveExecutableCommand(
  rootPath: string,
  type: TauCodeActionType,
): Promise<string> {
  if (!rootPath) return "";
  const cleanRoot = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const config = await readTauCodeConfig(rootPath, type);

  // If custom inline command is set, prioritize it
  if (config?.command && !config.file && !config.script && !config.windowsFile && !config.windowsScript) {
    return config.command;
  }

  const defaultScript = type === "compile" ? "workflow/compile.sh" : "workflow/run.sh";
  const defaultBat = type === "compile" ? "workflow/compile.bat" : "workflow/run.bat";
  const target = (IS_WINDOWS ? (config?.windowsFile || config?.windowsScript) : (config?.file || config?.script)) || (IS_WINDOWS ? defaultBat : defaultScript);

  let cleanTarget = target.replace(/^[./\\]*TauCode[/\\]/i, "").replace(/^[./\\]+/, "");
  if (!cleanTarget.includes("/") && !cleanTarget.includes("\\")) {
    cleanTarget = `workflow/${cleanTarget}`;
  }

  const physicalPath = `${cleanRoot}/TauCode/${cleanTarget}`;
  if (await fileExists(physicalPath)) {
    return buildScriptCommand(config ?? {}, type);
  }

  // File does not physically exist on disk -> fallback to project default command
  const projectType = await detectProjectType(rootPath);
  const { loadPreferences } = await import("@/modules/settings/store");
  const prefs = await loadPreferences();
  const customTemplates = prefs.tauCodeTemplates?.[projectType];
  const defaultTemplates = getTemplatesForProject(projectType);
  const rawCmd = type === "compile"
    ? (customTemplates as { compileCmd?: string } | undefined)?.compileCmd || defaultTemplates.compileCmd
    : (customTemplates as { runCmd?: string } | undefined)?.runCmd || defaultTemplates.runCmd;
  const argsSuffix = Array.isArray(config?.args) && config.args.length > 0 ? ` ${config.args.join(" ")}` : "";

  if (rawCmd && !rawCmd.trim().startsWith("#")) {
    const lines = rawCmd.split("\n").map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith("#"));
    if (lines.length > 0) {
      return `${lines.join(" && ")}${argsSuffix}`;
    }
  }

  // If project has no compile step or generic placeholder
  if (type === "compile") {
    return `echo "[TauCode] Nessun comando di compilazione richiesto per questo progetto (${projectType})."`;
  }
  return `echo "[TauCode] Nessun comando di esecuzione configurato per questo progetto (${projectType})."`;
}
