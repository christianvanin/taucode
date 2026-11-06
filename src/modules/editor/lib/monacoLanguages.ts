/**
 * Maps file extension (lower-case, without the dot) to a Monaco language ID.
 * Monaco has built-in support for these languages; unknown extensions fall
 * back to "plaintext".
 */

const EXT_MAP: Record<string, string> = {
  // JavaScript / TypeScript
  js: "javascript",
  cjs: "javascript",
  mjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  cts: "typescript",
  mts: "typescript",
  tsx: "typescript",
  // Web
  html: "html",
  htm: "html",
  svelte: "html",
  twig: "html",
  astro: "html",
  vue: "html",
  css: "css",
  scss: "scss",
  less: "less",
  // Data
  json: "json",
  jsonc: "jsonc",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "plaintext", // Monaco has no built-in TOML; LSP provides highlighting
  xml: "xml",
  iml: "xml",
  xsd: "xml",
  xsl: "xml",
  xslt: "xml",
  svg: "xml",
  plist: "xml",
  csproj: "xml",
  props: "xml",
  targets: "xml",
  // Systems
  rs: "rust",
  go: "go",
  py: "python",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  sc: "scala",
  swift: "swift",
  rb: "ruby",
  rake: "ruby",
  gemspec: "ruby",
  ru: "ruby",
  // C family
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  cs: "csharp",
  dart: "dart",
  // Scripting
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  php: "php",
  pl: "perl",
  pm: "perl",
  lua: "lua",
  r: "r",
  // Query
  sql: "sql",
  psql: "sql",
  pgsql: "sql",
  mysql: "sql",
  sqlite: "sql",
  mariadb: "sql",
  mssql: "sql",
  plsql: "sql",
  // Docs / config
  md: "markdown",
  markdown: "markdown",
  env: "shell",
  ini: "ini",
  cfg: "ini",
  properties: "ini",
  conf: "ini",
  nginx: "ini",
  // Other
  proto: "proto",
  dockerfile: "dockerfile",
  groovy: "java",  // best approximation
  gradle: "java",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  edn: "clojure",
  hs: "haskell",
  diff: "diff",
  patch: "diff",
  vb: "vb",
  tex: "latex",
  latex: "latex",
  sty: "latex",
  cls: "latex",
  cmake: "cmake",
};

const FILENAME_MAP: Record<string, string> = {
  dockerfile: "dockerfile",
  "dockerfile.dev": "dockerfile",
  gemfile: "ruby",
  rakefile: "ruby",
  podfile: "ruby",
  ".editorconfig": "ini",
  ".env": "shell",
  ".eslintrc": "json",
  ".babelrc": "json",
  ".prettierrc": "json",
  "nginx.conf": "ini",
  "cmakelists.txt": "cmake",
};

/**
 * Given a file name (base name or full path), returns the Monaco language ID.
 * Returns "plaintext" when the language is unrecognised.
 */
export function resolveMonacoLanguage(filename: string): string {
  const base = filename
    .toLowerCase()
    .split(/[\\/]/)
    .pop() as string;

  // Exact filename match
  const byName = FILENAME_MAP[base];
  if (byName) return byName;

  // Extension match
  const dot = base.lastIndexOf(".");
  if (dot !== -1 && dot < base.length - 1) {
    const ext = base.slice(dot + 1);
    const byExt = EXT_MAP[ext];
    if (byExt) return byExt;
  }

  // Filename prefix (e.g. "Dockerfile.web" → "dockerfile")
  const firstDot = base.indexOf(".", base.startsWith(".") ? 1 : 0);
  if (firstDot > 0) {
    const prefix = base.slice(0, firstDot);
    const byPrefix = FILENAME_MAP[prefix];
    if (byPrefix) return byPrefix;
  }

  return "plaintext";
}
