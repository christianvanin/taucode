import { native } from "@/lib/native";

export type ProjectType =
  // Web, Node, Meta-Frameworks
  | "node_npm" | "node_yarn" | "node_pnpm" | "node_bun" | "deno"
  | "nextjs" | "vite" | "astro" | "nuxt" | "sveltekit" | "angular" | "solidjs" | "qwik" | "nest_js" | "vue_cli"
  // Rust & Systems
  | "rust_cargo" | "tauri" | "wasm_pack" | "zig"
  | "c_cmake" | "c_make" | "c_meson" | "c_xmake" | "c_pure" | "cpp_pure"
  // Python
  | "python_uv" | "python_poetry" | "python_pipenv" | "python_pip" | "python_pure" | "django" | "fastapi_flask"
  // Go & Backend Tools
  | "go_modules" | "go_taskfile"
  // JVM
  | "java_maven" | "java_gradle" | "scala_sbt" | "clojure_lein" | "java_pure" | "spring_boot"
  // Mobile & Cross Platform
  | "flutter" | "react_native" | "expo" | "swift" | "android_gradle"
  // Game Dev
  | "godot" | "unity" | "unreal" | "love2d"
  // Web3 / Blockchain
  | "foundry" | "hardhat" | "anchor"
  // Sci & Data
  | "julia" | "r_lang" | "mojo"
  // Other / Scripting
  | "dotnet" | "php_composer" | "php_laravel" | "php_symfony" | "ruby_bundler" | "ruby_rails" | "ruby_pure"
  | "elixir_mix" | "erlang_rebar3" | "gleam" | "ocaml_dune" | "nim" | "crystal" | "haskell_cabal" | "haskell_stack"
  | "lua_pure" | "shell_script" | "docker"
  | "generic";

async function fileExists(path: string): Promise<boolean> {
  try {
    const res = await native.readFile(path);
    return res !== undefined && res.kind !== "toolarge";
  } catch {
    return false;
  }
}

/**
 * Analyzes the root directory of the project to determine its type
 * based on presence of key configuration files.
 */
export async function detectProjectType(rootPath: string): Promise<ProjectType> {
  const cleanRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "");

  let files: string[] = [];
  let dirs: string[] = [];
  try {
    const entries = await native.readDir(cleanRoot);
    files = entries.filter(e => e.kind === "file").map(e => e.name);
    dirs = entries.filter(e => e.kind === "dir").map(e => e.name);
  } catch {}

  const hasExt = (ext: string) => files.some(f => f.toLowerCase().endsWith(ext));
  const hasDirExt = (ext: string) => dirs.some(d => d.toLowerCase().endsWith(ext));

  // Game Dev
  if (await fileExists(`${cleanRoot}/project.godot`)) return "godot";
  if (await fileExists(`${cleanRoot}/ProjectSettings/ProjectSettings.asset`)) return "unity";
  if (await fileExists(`${cleanRoot}/main.lua`) && await fileExists(`${cleanRoot}/conf.lua`)) return "love2d";

  // Web3
  if (await fileExists(`${cleanRoot}/foundry.toml`)) return "foundry";
  if (await fileExists(`${cleanRoot}/hardhat.config.js`) || await fileExists(`${cleanRoot}/hardhat.config.ts`)) return "hardhat";
  if (await fileExists(`${cleanRoot}/Anchor.toml`)) return "anchor";

  // Mobile / Desktop
  if (await fileExists(`${cleanRoot}/pubspec.yaml`)) return "flutter";
  if (await fileExists(`${cleanRoot}/app.json`) && await fileExists(`${cleanRoot}/package.json`)) return "expo";
  if (await fileExists(`${cleanRoot}/react-native.config.js`)) return "react_native";
  if (await fileExists(`${cleanRoot}/Package.swift`) || await fileExists(`${cleanRoot}/App.swift`) || await fileExists(`${cleanRoot}/ContentView.swift`) || hasExt(".swift") || hasDirExt(".xcodeproj") || hasDirExt(".xcworkspace")) return "swift";
  if (await fileExists(`${cleanRoot}/settings.gradle`) && await fileExists(`${cleanRoot}/app/build.gradle`)) return "android_gradle";

  // Rust ecosystem
  if (await fileExists(`${cleanRoot}/src-tauri/Cargo.toml`)) return "tauri";
  if (await fileExists(`${cleanRoot}/Cargo.toml`)) {
    // maybe check for wasm-bindgen here, but rust_cargo is a safe fallback
    return "rust_cargo";
  }
  if (await fileExists(`${cleanRoot}/build.zig`)) return "zig";

  // Web / JS / TS ecosystem (Frameworks first)
  if (await fileExists(`${cleanRoot}/nest-cli.json`)) return "nest_js";
  if (await fileExists(`${cleanRoot}/vue.config.js`) || await fileExists(`${cleanRoot}/vue.config.ts`)) return "vue_cli";
  if (await fileExists(`${cleanRoot}/next.config.js`) || await fileExists(`${cleanRoot}/next.config.mjs`) || await fileExists(`${cleanRoot}/next.config.ts`)) return "nextjs";
  if (await fileExists(`${cleanRoot}/vite.config.js`) || await fileExists(`${cleanRoot}/vite.config.ts`)) return "vite";
  if (await fileExists(`${cleanRoot}/astro.config.mjs`) || await fileExists(`${cleanRoot}/astro.config.ts`)) return "astro";
  if (await fileExists(`${cleanRoot}/nuxt.config.ts`) || await fileExists(`${cleanRoot}/nuxt.config.js`)) return "nuxt";
  if (await fileExists(`${cleanRoot}/svelte.config.js`)) return "sveltekit";
  if (await fileExists(`${cleanRoot}/angular.json`)) return "angular";
  if (await fileExists(`${cleanRoot}/qwik.config.ts`)) return "qwik";

  if (await fileExists(`${cleanRoot}/package.json`)) {
    if (await fileExists(`${cleanRoot}/pnpm-lock.yaml`)) return "node_pnpm";
    if (await fileExists(`${cleanRoot}/bun.lockb`) || await fileExists(`${cleanRoot}/bun.lock`)) return "node_bun";
    if (await fileExists(`${cleanRoot}/yarn.lock`)) return "node_yarn";
    return "node_npm";
  }
  if (await fileExists(`${cleanRoot}/deno.json`) || await fileExists(`${cleanRoot}/deno.jsonc`)) return "deno";

  // Python ecosystem
  if (await fileExists(`${cleanRoot}/manage.py`)) return "django";
  if (await fileExists(`${cleanRoot}/uv.lock`)) return "python_uv";
  if (await fileExists(`${cleanRoot}/poetry.lock`)) return "python_poetry";
  if (await fileExists(`${cleanRoot}/Pipfile`)) return "python_pipenv";
  if (await fileExists(`${cleanRoot}/requirements.txt`) || await fileExists(`${cleanRoot}/pyproject.toml`) || await fileExists(`${cleanRoot}/setup.py`)) return "python_pip";
  if (await fileExists(`${cleanRoot}/main.py`) || await fileExists(`${cleanRoot}/app.py`) || hasExt(".py")) return "python_pure";

  // Go
  if (await fileExists(`${cleanRoot}/Taskfile.yml`)) return "go_taskfile";
  if (await fileExists(`${cleanRoot}/go.mod`)) return "go_modules";

  // JVM
  if (await fileExists(`${cleanRoot}/pom.xml`)) return "java_maven";
  if (await fileExists(`${cleanRoot}/build.gradle`) || await fileExists(`${cleanRoot}/build.gradle.kts`)) return "java_gradle";
  if (await fileExists(`${cleanRoot}/build.sbt`)) return "scala_sbt";
  if (await fileExists(`${cleanRoot}/project.clj`)) return "clojure_lein";
  if (await fileExists(`${cleanRoot}/Main.java`) || await fileExists(`${cleanRoot}/src/Main.java`) || hasExt(".java")) return "java_pure";

  // C / C++
  if (await fileExists(`${cleanRoot}/CMakeLists.txt`)) return "c_cmake";
  if (await fileExists(`${cleanRoot}/meson.build`)) return "c_meson";
  if (await fileExists(`${cleanRoot}/xmake.lua`)) return "c_xmake";
  if (await fileExists(`${cleanRoot}/Makefile`) || await fileExists(`${cleanRoot}/makefile`)) return "c_make";
  if (await fileExists(`${cleanRoot}/main.cpp`) || await fileExists(`${cleanRoot}/src/main.cpp`) || hasExt(".cpp")) return "cpp_pure";
  if (await fileExists(`${cleanRoot}/main.c`) || await fileExists(`${cleanRoot}/src/main.c`) || hasExt(".c")) return "c_pure";

  // PHP
  if (await fileExists(`${cleanRoot}/symfony.lock`) || await fileExists(`${cleanRoot}/bin/console`)) return "php_symfony";
  if (await fileExists(`${cleanRoot}/artisan`)) return "php_laravel";
  if (await fileExists(`${cleanRoot}/composer.json`)) return "php_composer";

  // Ruby
  if (await fileExists(`${cleanRoot}/bin/rails`)) return "ruby_rails";
  if (await fileExists(`${cleanRoot}/Gemfile`)) return "ruby_bundler";
  if (await fileExists(`${cleanRoot}/main.rb`) || hasExt(".rb")) return "ruby_pure";

  // Sci / Data
  if (await fileExists(`${cleanRoot}/Project.toml`) && await fileExists(`${cleanRoot}/Manifest.toml`)) return "julia";
  if (await fileExists(`${cleanRoot}/DESCRIPTION`) && await fileExists(`${cleanRoot}/NAMESPACE`)) return "r_lang";
  if (await fileExists(`${cleanRoot}/mojoproject.toml`)) return "mojo";

  // Others
  if (await fileExists(`${cleanRoot}/mix.exs`)) return "elixir_mix";
  if (await fileExists(`${cleanRoot}/rebar.config`)) return "erlang_rebar3";
  if (await fileExists(`${cleanRoot}/gleam.toml`)) return "gleam";
  if (await fileExists(`${cleanRoot}/stack.yaml`)) return "haskell_stack";
  if (await fileExists(`${cleanRoot}/project.cabal`)) return "haskell_cabal";
  if (await fileExists(`${cleanRoot}/dune-project`)) return "ocaml_dune";
  if (await fileExists(`${cleanRoot}/shard.yml`)) return "crystal";
  if (await fileExists(`${cleanRoot}/main.lua`) || hasExt(".lua")) return "lua_pure";
  if (await fileExists(`${cleanRoot}/main.sh`) || await fileExists(`${cleanRoot}/script.sh`) || hasExt(".sh")) return "shell_script";
  if (await fileExists(`${cleanRoot}/docker-compose.yml`)) return "docker";

  return "generic";
}

export interface ProjectTemplates {
  compileSh: string;
  compileBat: string;
  runSh: string;
  runBat: string;
}

/**
 * Returns appropriate shell and batch scripts for compiling and running
 * based on the project type.
 */
export function getTemplatesForProject(type: ProjectType): ProjectTemplates {
  let compileCmd = "";
  let runCmd = "";

  switch (type) {
    // Node / JS
    case "node_npm": compileCmd = "npm install\nnpm run build"; runCmd = "npm run dev"; break;
    case "node_yarn": compileCmd = "yarn install\nyarn build"; runCmd = "yarn dev"; break;
    case "node_pnpm": compileCmd = "pnpm install\npnpm run build"; runCmd = "pnpm run dev"; break;
    case "node_bun": compileCmd = "bun install\nbun run build"; runCmd = "bun run dev"; break;
    case "deno": compileCmd = "deno task build"; runCmd = "deno task dev"; break;
    
    // JS Frameworks
    case "nest_js": compileCmd = "npm run build"; runCmd = "npm run start:dev"; break;
    case "vue_cli": compileCmd = "npm run build"; runCmd = "npm run serve"; break;
    case "nextjs": compileCmd = "npm run build"; runCmd = "npm run dev"; break;
    case "vite": case "astro": case "sveltekit": case "solidjs": case "qwik":
      compileCmd = "npm run build"; runCmd = "npm run dev"; break;
    case "nuxt": compileCmd = "npm run build"; runCmd = "npx nuxt dev"; break;
    case "angular": compileCmd = "ng build"; runCmd = "ng serve"; break;

    // Rust & Systems
    case "rust_cargo": compileCmd = "cargo build"; runCmd = "cargo run"; break;
    case "tauri": compileCmd = "npm run tauri build"; runCmd = "npm run tauri dev"; break;
    case "wasm_pack": compileCmd = "wasm-pack build"; runCmd = "npm run dev"; break;
    case "zig": compileCmd = "zig build"; runCmd = "zig build run"; break;
    
    // C/C++
    case "c_cmake": compileCmd = "cmake -B build\ncmake --build build"; runCmd = "./build/main"; break;
    case "c_make": compileCmd = "make"; runCmd = "make run"; break;
    case "c_meson": compileCmd = "meson setup build\nninja -C build"; runCmd = "./build/main"; break;
    case "c_xmake": compileCmd = "xmake"; runCmd = "xmake run"; break;
    case "c_pure": compileCmd = "gcc main.c -o main"; runCmd = "./main"; break;
    case "cpp_pure": compileCmd = "g++ main.cpp -o main"; runCmd = "./main"; break;

    // Python
    case "python_uv": compileCmd = "uv sync"; runCmd = "uv run main.py"; break;
    case "python_poetry": compileCmd = "poetry install"; runCmd = "poetry run python main.py"; break;
    case "python_pipenv": compileCmd = "pipenv install"; runCmd = "pipenv run python main.py"; break;
    case "python_pip": compileCmd = "pip install -r requirements.txt"; runCmd = "python main.py"; break;
    case "python_pure": compileCmd = "# No compile step"; runCmd = "python app.py"; break;
    case "django": compileCmd = "python manage.py migrate"; runCmd = "python manage.py runserver"; break;
    case "fastapi_flask": compileCmd = "pip install -r requirements.txt"; runCmd = "uvicorn main:app --reload"; break;

    // Go
    case "go_modules": compileCmd = "go build"; runCmd = "go run ."; break;
    case "go_taskfile": compileCmd = "task build"; runCmd = "task run"; break;

    // JVM
    case "java_maven": compileCmd = "mvn compile"; runCmd = "mvn exec:java"; break;
    case "java_gradle": compileCmd = "./gradlew build"; runCmd = "./gradlew run"; break;
    case "spring_boot": compileCmd = "./gradlew build"; runCmd = "./gradlew bootRun"; break;
    case "scala_sbt": compileCmd = "sbt compile"; runCmd = "sbt run"; break;
    case "clojure_lein": compileCmd = "lein compile"; runCmd = "lein run"; break;
    case "java_pure": compileCmd = "javac Main.java"; runCmd = "java Main"; break;

    // Mobile / Cross Platform
    case "flutter": compileCmd = "flutter build"; runCmd = "flutter run"; break;
    case "react_native": compileCmd = "npm run build"; runCmd = "npx react-native run-android"; break;
    case "expo": compileCmd = "npx expo prebuild"; runCmd = "npx expo start"; break;
    case "swift": compileCmd = "swift build"; runCmd = "swift run"; break;
    case "android_gradle": compileCmd = "./gradlew assembleDebug"; runCmd = "./gradlew installDebug"; break;

    // Game Dev
    case "godot": compileCmd = "# godot --headless --export-release \"HTML5\""; runCmd = "godot"; break;
    case "unity": compileCmd = "# Unity CLI build"; runCmd = "# Unity Editor run"; break;
    case "unreal": compileCmd = "# UnrealBuildTool.exe ..."; runCmd = "# Launch UE Game"; break;
    case "love2d": compileCmd = "# No compile step"; runCmd = "love ."; break;

    // Web3
    case "foundry": compileCmd = "forge build"; runCmd = "forge test"; break;
    case "hardhat": compileCmd = "npx hardhat compile"; runCmd = "npx hardhat node"; break;
    case "anchor": compileCmd = "anchor build"; runCmd = "anchor test"; break;

    // Sci & Data
    case "julia": compileCmd = "julia --project -e 'using Pkg; Pkg.instantiate()'"; runCmd = "julia --project src/main.jl"; break;
    case "r_lang": compileCmd = "R CMD build ."; runCmd = "Rscript main.R"; break;
    case "mojo": compileCmd = "mojo build main.mojo"; runCmd = "mojo run main.mojo"; break;

    // Other Scripting
    case "dotnet": compileCmd = "dotnet build"; runCmd = "dotnet run"; break;
    case "php_composer": compileCmd = "composer install"; runCmd = "php -S localhost:8000 -t public"; break;
    case "php_laravel": compileCmd = "composer install"; runCmd = "php artisan serve"; break;
    case "php_symfony": compileCmd = "composer install"; runCmd = "symfony server:start"; break;
    case "ruby_bundler": compileCmd = "bundle install"; runCmd = "bundle exec ruby main.rb"; break;
    case "ruby_rails": compileCmd = "bundle install"; runCmd = "bin/rails server"; break;
    case "ruby_pure": compileCmd = "# No compile step"; runCmd = "ruby main.rb"; break;
    case "elixir_mix": compileCmd = "mix compile"; runCmd = "mix run"; break;
    case "erlang_rebar3": compileCmd = "rebar3 compile"; runCmd = "rebar3 shell"; break;
    case "gleam": compileCmd = "gleam build"; runCmd = "gleam run"; break;
    case "haskell_cabal": compileCmd = "cabal build"; runCmd = "cabal run"; break;
    case "haskell_stack": compileCmd = "stack build"; runCmd = "stack run"; break;
    case "ocaml_dune": compileCmd = "dune build"; runCmd = "dune exec ./main.exe"; break;
    case "nim": compileCmd = "nimble build"; runCmd = "nimble run"; break;
    case "crystal": compileCmd = "shards build"; runCmd = "crystal run src/main.cr"; break;
    case "lua_pure": compileCmd = "# No compile step"; runCmd = "lua main.lua"; break;
    case "shell_script": compileCmd = "chmod +x main.sh"; runCmd = "./main.sh"; break;
    case "docker": compileCmd = "docker compose build"; runCmd = "docker compose up"; break;

    case "generic":
    default:
      compileCmd = "# Put your compilation / build commands here (e.g. npm run build, cargo build, make, etc.)";
      runCmd = "# Put your run commands here (e.g. npm start, cargo run, python main.py, etc.)";
      break;
  }

  return {
    compileSh: `#!/usr/bin/env bash\necho "==> [TauCode] Compiling project..."\n${compileCmd}\necho "==> [TauCode] Compilation completed."\n`,
    compileBat: `@echo off\necho ==^> [TauCode] Compiling project...\n${compileCmd}\necho ==^> [TauCode] Compilation completed.\n`,
    runSh: `#!/usr/bin/env bash\necho "==> [TauCode] Running project..."\n${runCmd}\n`,
    runBat: `@echo off\necho ==^> [TauCode] Running project...\n${runCmd}\n`,
  };
}

export const AI_AGENT_INSTRUCTIONS = `# TauCode Workflow - Istruzioni per Agenti AI

Questa directory (\`TauCode/\`) contiene gli script utilizzati dall'IDE per compilare e avviare questo progetto.
L'IDE esegue gli script che si trovano in \`workflow/\` basandosi sui file \`compile.json\` e \`run.json\`.

## ⚠️ DIRETTIVA CRITICA PER GLI AGENTI AI ⚠️
Tu, come assistente o agente AI che lavora su questo codice, **HAI LA RESPONSABILITÀ** di mantenere questi script aggiornati.

- Se aggiungi un nuovo step di build (es. Tailwind, Prisma, compilazione di asset).
- Se cambi il package manager (es. da npm a pnpm).
- Se cambi il file entrypoint (es. rinomini \`main.py\` in \`app.py\`).
- Se cambi framework.

**DEVI automaticamente modificare i file:**
- \`workflow/compile.sh\` / \`workflow/compile.bat\`
- \`workflow/run.sh\` / \`workflow/run.bat\`

...per riflettere i nuovi comandi, **senza aspettare che l'utente te lo chieda esplicitamente**. Questi script devono SEMPRE funzionare out-of-the-box in base alla struttura del progetto attuale.
`;
