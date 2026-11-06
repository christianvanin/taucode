import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTauCodeTemplates } from "@/modules/settings/store";
import { getTemplatesForProject, type ProjectType } from "@/modules/taucode/projectAnalyzer";
import { useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";
import { HammerIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

const PROJECT_GROUPS: { label: string; options: { value: ProjectType; label: string }[] }[] = [
  {
    label: "Web & JavaScript",
    options: [
      { value: "node_npm", label: "Node.js (npm)" },
      { value: "node_yarn", label: "Node.js (yarn)" },
      { value: "node_pnpm", label: "Node.js (pnpm)" },
      { value: "node_bun", label: "Node.js (bun)" },
      { value: "deno", label: "Deno" },
      { value: "nest_js", label: "NestJS" },
      { value: "vue_cli", label: "Vue CLI" },
      { value: "nextjs", label: "Next.js" },
      { value: "vite", label: "Vite" },
      { value: "astro", label: "Astro" },
      { value: "nuxt", label: "Nuxt (Vue)" },
      { value: "sveltekit", label: "SvelteKit" },
      { value: "angular", label: "Angular" },
      { value: "solidjs", label: "SolidJS" },
      { value: "qwik", label: "Qwik" },
    ],
  },
  {
    label: "Rust & Systems",
    options: [
      { value: "rust_cargo", label: "Rust (Cargo)" },
      { value: "tauri", label: "Tauri" },
      { value: "wasm_pack", label: "Wasm-Pack" },
      { value: "zig", label: "Zig" },
      { value: "c_cmake", label: "C/C++ (CMake)" },
      { value: "c_make", label: "C/C++ (Make)" },
      { value: "c_meson", label: "C/C++ (Meson/Ninja)" },
      { value: "c_xmake", label: "C/C++ (XMake)" },
      { value: "c_pure", label: "C (gcc)" },
      { value: "cpp_pure", label: "C++ (g++)" },
    ],
  },
  {
    label: "Python",
    options: [
      { value: "python_uv", label: "Python (uv)" },
      { value: "python_poetry", label: "Python (Poetry)" },
      { value: "python_pipenv", label: "Python (Pipenv)" },
      { value: "python_pip", label: "Python (pip)" },
      { value: "python_pure", label: "Python (Pure)" },
      { value: "django", label: "Django" },
      { value: "fastapi_flask", label: "FastAPI / Flask" },
    ],
  },
  {
    label: "Go",
    options: [
      { value: "go_modules", label: "Go Modules" },
      { value: "go_taskfile", label: "Go (Taskfile)" },
    ],
  },
  {
    label: "JVM",
    options: [
      { value: "java_maven", label: "Java/Kotlin (Maven)" },
      { value: "java_gradle", label: "Java/Kotlin (Gradle)" },
      { value: "spring_boot", label: "Spring Boot" },
      { value: "scala_sbt", label: "Scala (SBT)" },
      { value: "clojure_lein", label: "Clojure (Leiningen)" },
      { value: "java_pure", label: "Java (javac)" },
    ],
  },
  {
    label: "Mobile & Cross Platform",
    options: [
      { value: "flutter", label: "Flutter" },
      { value: "react_native", label: "React Native" },
      { value: "expo", label: "Expo" },
      { value: "swift", label: "Swift" },
      { value: "android_gradle", label: "Android (Gradle)" },
    ],
  },
  {
    label: "Game Development",
    options: [
      { value: "godot", label: "Godot" },
      { value: "unity", label: "Unity" },
      { value: "unreal", label: "Unreal Engine" },
      { value: "love2d", label: "LÖVE 2D" },
    ],
  },
  {
    label: "Web3",
    options: [
      { value: "foundry", label: "Foundry" },
      { value: "hardhat", label: "Hardhat" },
      { value: "anchor", label: "Anchor (Solana)" },
    ],
  },
  {
    label: "Science & Data",
    options: [
      { value: "julia", label: "Julia" },
      { value: "r_lang", label: "R Ecosystem" },
      { value: "mojo", label: "Mojo" },
    ],
  },
  {
    label: "Other Languages & Tools",
    options: [
      { value: "dotnet", label: ".NET (C#/F#)" },
      { value: "php_composer", label: "PHP (Composer)" },
      { value: "php_laravel", label: "Laravel" },
      { value: "php_symfony", label: "Symfony" },
      { value: "ruby_bundler", label: "Ruby (Bundler)" },
      { value: "ruby_rails", label: "Ruby on Rails" },
      { value: "ruby_pure", label: "Ruby (Pure)" },
      { value: "elixir_mix", label: "Elixir (Mix)" },
      { value: "erlang_rebar3", label: "Erlang (Rebar3)" },
      { value: "gleam", label: "Gleam" },
      { value: "haskell_cabal", label: "Haskell (Cabal)" },
      { value: "haskell_stack", label: "Haskell (Stack)" },
      { value: "ocaml_dune", label: "OCaml (Dune)" },
      { value: "nim", label: "Nim" },
      { value: "crystal", label: "Crystal" },
      { value: "lua_pure", label: "Lua (Pure)" },
      { value: "shell_script", label: "Shell Script (Bash)" },
      { value: "docker", label: "Docker Compose" },
      { value: "generic", label: "Generic / Other" },
    ],
  },
];

export function RunnersSection() {
  const [selectedType, setSelectedType] = useState<ProjectType>("rust_cargo");
  const tauCodeTemplates = usePreferencesStore((s) => s.tauCodeTemplates);

  // Derive the current template for the selected type, either from custom preferences or defaults
  const currentTemplate =
    tauCodeTemplates[selectedType] || getTemplatesForProject(selectedType);

  const handleTemplateChange = (field: keyof typeof currentTemplate, value: string) => {
    setTauCodeTemplates({
      ...tauCodeTemplates,
      [selectedType]: {
        ...currentTemplate,
        [field]: value,
      },
    });
  };

  const textareaClasses = cn(
    "font-mono text-[11.5px] min-h-[140px] rounded-lg border border-border bg-card p-3 leading-relaxed shadow-xs resize-y",
    "focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:bg-card transition-colors"
  );

  return (
    <div className="flex flex-col gap-8 pb-24">
      <SectionHeader
        title="TauCode Runners"
        description="Configure how projects are built and executed. These scripts adapt automatically based on the detected project structure."
      />

      <SettingRow
        title="Project Target"
        description="Select a project structure to customize its default runners."
      >
        <Select
          value={selectedType}
          onValueChange={(v) => setSelectedType(v as ProjectType)}
        >
          <SelectTrigger className="h-8 w-[180px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[350px]">
            {PROJECT_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel className="text-[11px] uppercase text-muted-foreground font-semibold px-2 py-1.5">{group.label}</SelectLabel>
                {group.options.map((pt) => (
                  <SelectItem key={pt.value} value={pt.value} className="text-[12px] pl-6">
                    {pt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      {/* Compile Phase Block */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={HammerIcon} size={16} className="text-primary" />
          <div>
            <h3 className="text-[13px] font-semibold leading-none">Compile Phase</h3>
            <p className="text-[11.5px] text-muted-foreground mt-1.5">Commands executed to build or prepare the project before running.</p>
          </div>
        </div>

        <Tabs defaultValue="unix" className="w-full mt-2">
          <TabsList className="mb-3 h-8 bg-muted border border-border/60 p-0.5 rounded-md">
            <TabsTrigger value="unix" className="h-7 px-4 text-[11px] rounded-sm">
              macOS / Linux (.sh)
            </TabsTrigger>
            <TabsTrigger value="win" className="h-7 px-4 text-[11px] rounded-sm">
              Windows (.bat)
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="unix" className="mt-0">
            <Textarea
              value={currentTemplate.compileSh}
              onChange={(e) => handleTemplateChange("compileSh", e.target.value)}
              className={textareaClasses}
              spellCheck={false}
            />
          </TabsContent>
          <TabsContent value="win" className="mt-0">
            <Textarea
              value={currentTemplate.compileBat}
              onChange={(e) => handleTemplateChange("compileBat", e.target.value)}
              className={textareaClasses}
              spellCheck={false}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Run Phase Block */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={PlayIcon} size={16} className="text-primary" />
          <div>
            <h3 className="text-[13px] font-semibold leading-none">Run Phase</h3>
            <p className="text-[11.5px] text-muted-foreground mt-1.5">Commands executed to start the application or dev server.</p>
          </div>
        </div>

        <Tabs defaultValue="unix" className="w-full mt-2">
          <TabsList className="mb-3 h-8 bg-muted border border-border/60 p-0.5 rounded-md">
            <TabsTrigger value="unix" className="h-7 px-4 text-[11px] rounded-sm">
              macOS / Linux (.sh)
            </TabsTrigger>
            <TabsTrigger value="win" className="h-7 px-4 text-[11px] rounded-sm">
              Windows (.bat)
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="unix" className="mt-0">
            <Textarea
              value={currentTemplate.runSh}
              onChange={(e) => handleTemplateChange("runSh", e.target.value)}
              className={textareaClasses}
              spellCheck={false}
            />
          </TabsContent>
          <TabsContent value="win" className="mt-0">
            <Textarea
              value={currentTemplate.runBat}
              onChange={(e) => handleTemplateChange("runBat", e.target.value)}
              className={textareaClasses}
              spellCheck={false}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
