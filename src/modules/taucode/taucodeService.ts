import { IS_WINDOWS } from "@/lib/platform";
import { native } from "@/lib/native";
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
