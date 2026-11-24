import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslation } from "@/modules/i18n";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTauCodeTemplates } from "@/modules/settings/store";
import { getTemplatesForProject, type ProjectType } from "@/modules/taucode/projectAnalyzer";
import { useEffect, useMemo, useRef, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";
import {
  Cancel01Icon,
  HammerIcon,
  PlayIcon,
  Search01Icon,
  Tick02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
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
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState<ProjectType>("rust_cargo");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tauCodeTemplates = usePreferencesStore((s) => s.tauCodeTemplates);

  const allOptions = useMemo(() => {
    return PROJECT_GROUPS.flatMap((g) => g.options);
  }, []);

  const currentOption = allOptions.find((opt) => opt.value === selectedType);
  const currentLabel = currentOption ? currentOption.label : selectedType;

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    } else {
      setSearch("");
    }
  }, [open]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PROJECT_GROUPS;
    return PROJECT_GROUPS.map((group) => {
      const groupMatches = group.label.toLowerCase().includes(q);
      const matchingOptions = group.options.filter(
        (opt) =>
          groupMatches ||
          opt.label.toLowerCase().includes(q) ||
          opt.value.toLowerCase().includes(q)
      );
      return {
        ...group,
        options: matchingOptions,
      };
    }).filter((g) => g.options.length > 0);
  }, [search]);

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
        title={t("settings.runners.title")}
        description={t("settings.runners.desc")}
      />

      <SettingRow
        title={t("settings.runners.target")}
        description={t("settings.runners.targetDesc")}
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              className="flex h-8 min-w-[190px] items-center justify-between gap-2 rounded-3xl border border-transparent bg-input/50 px-3 py-1.5 text-[12px] whitespace-nowrap transition-[color,box-shadow,background-color] outline-none hover:bg-input/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 cursor-pointer"
            >
              <span className="truncate font-medium">{currentLabel}</span>
              <HugeiconsIcon
                icon={UnfoldMoreIcon}
                strokeWidth={2}
                className="pointer-events-none size-4 text-muted-foreground shrink-0"
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[280px] p-0 gap-0 rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl overflow-hidden"
            align="end"
            sideOffset={4}
          >
            {/* Barra di ricerca con icona e pulsante reset */}
            <div className="p-2 border-b border-border/50 bg-popover/80 backdrop-blur-xs">
              <div className="relative flex items-center">
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={14}
                  strokeWidth={2}
                  className="absolute left-2.5 text-muted-foreground pointer-events-none"
                />
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setOpen(false);
                    } else if (e.key === "Enter") {
                      const firstGroup = filteredGroups[0];
                      if (firstGroup && firstGroup.options[0]) {
                        setSelectedType(firstGroup.options[0].value);
                        setOpen(false);
                      }
                    }
                  }}
                  placeholder={t("settings.runners.searchTarget")}
                  className="h-8 pl-8 pr-7 text-xs bg-input/50 border-transparent rounded-xl focus-visible:ring-1 focus-visible:ring-primary/40"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Pannello a scorrimento */}
            <ScrollArea className="max-h-[300px]">
              <div className="p-1 pr-2">
                {filteredGroups.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    {t("settings.runners.noTargetFound")}
                  </div>
                ) : (
                  filteredGroups.map((group) => (
                    <div key={group.label} className="mb-2 last:mb-0">
                      <div className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
                        {group.label}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {group.options.map((pt) => {
                          const isSelected = pt.value === selectedType;
                          return (
                            <button
                              key={pt.value}
                              type="button"
                              onClick={() => {
                                setSelectedType(pt.value);
                                setOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors cursor-pointer select-none",
                                isSelected
                                  ? "bg-accent text-accent-foreground font-medium"
                                  : "text-foreground hover:bg-accent/60 hover:text-foreground"
                              )}
                            >
                              <span className="truncate">{pt.label}</span>
                              {isSelected && (
                                <HugeiconsIcon
                                  icon={Tick02Icon}
                                  size={14}
                                  strokeWidth={2}
                                  className="text-primary shrink-0 ml-2"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </SettingRow>

      {/* Compile Phase Block */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={HammerIcon} size={16} className="text-primary" />
          <div>
            <h3 className="text-[13px] font-semibold leading-none">{t("settings.runners.compilePhase")}</h3>
            <p className="text-[11.5px] text-muted-foreground mt-1.5">{t("settings.runners.compilePhaseDesc")}</p>
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
            <h3 className="text-[13px] font-semibold leading-none">{t("settings.runners.runPhase")}</h3>
            <p className="text-[11.5px] text-muted-foreground mt-1.5">{t("settings.runners.runPhaseDesc")}</p>
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
