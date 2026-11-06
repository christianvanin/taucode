export interface TauCodeConfig {
  name?: string;
  file?: string;
  script?: string;
  windowsFile?: string;
  windowsScript?: string;
  command?: string;
  args?: string[];
  cwd?: string;
}

export type TauCodeActionType = "compile" | "run";
