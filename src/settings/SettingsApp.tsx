import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SettingsTab as AppSettingsTab } from "@/modules/tabs/lib/useTabs";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  ServerStack01Icon,
  Settings01Icon,
  SourceCodeIcon,
  HammerIcon,
  PackageIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentType, lazy, Suspense, useEffect, useState, useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { GeneralSection } from "./sections/GeneralSection";
import { useExtensionsStore } from "@/modules/extensions/store";
import { ExtensionRegistry } from "@/modules/extensions/ExtensionRegistry";

// Lazy-load heavier sections to drastically reduce initial Settings bundle size and startup latency
const EditorSection = lazy(() =>
  import("./sections/EditorSection").then((m) => ({ default: m.EditorSection })),
);
const AiSection = lazy(() =>
  import("./sections/AiSection").then((m) => ({ default: m.AiSection })),
);
const ExtensionsSection = lazy(() =>
  import("./sections/ExtensionsSection").then((m) => ({ default: m.ExtensionsSection })),
);
const LspSection = lazy(() =>
  import("./sections/LspSection").then((m) => ({ default: m.LspSection })),
);
const RunnersSection = lazy(() =>
  import("./sections/RunnersSection").then((m) => ({ default: m.RunnersSection })),
);

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-6 w-32 bg-muted/60 rounded" />
        <div className="h-4 w-60 bg-muted/30 rounded" />
      </div>
      <div className="space-y-4 pt-4">
        <div className="h-12 w-full bg-muted/20 rounded-lg border border-border/30" />
        <div className="h-12 w-full bg-muted/20 rounded-lg border border-border/30" />
        <div className="h-12 w-full bg-muted/20 rounded-lg border border-border/30" />
      </div>
    </div>
  );
}

interface TabItem {
  id: string;
  label: string;
  icon?: typeof Settings01Icon;
  imgSrc?: string;
  component: ComponentType;
}

const STATIC_TABS: TabItem[] = [
  {
    id: "general",
    label: "General",
    icon: Settings01Icon,
    component: GeneralSection,
  },
  {
    id: "editor",
    label: "Editor",
    icon: SourceCodeIcon,
    component: EditorSection,
  },
  {
    id: "ai",
    label: "AI & Skills",
    imgSrc: "/antigravity/antigravity.svg",
    component: AiSection,
  },
  {
    id: "extensions",
    label: "Estensioni",
    icon: PackageIcon,
    component: ExtensionsSection,
  },
  {
    id: "lsp",
    label: "LSP Servers",
    icon: ServerStack01Icon,
    component: LspSection,
  },
  {
    id: "runners",
    label: "TauCode",
    icon: HammerIcon,
    component: RunnersSection,
  },
];

function ExtensionSettingHost({
  extensionId,
  entry,
  title,
}: {
  extensionId: string;
  entry?: string;
  title: string;
}) {
  const extension = useExtensionsStore((s) =>
    s.extensions.find((e) => e.id === extensionId),
  );
  if (!extension || !entry) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
        <HugeiconsIcon icon={PackageIcon} size={28} className="text-muted-foreground/50 mb-2" />
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-[11px] mt-1">Nessuna interfaccia utente HTML specificata per questa sezione.</p>
      </div>
    );
  }

  const cleanEntry = entry.replace(/^[\\/]/, "");
  const normalizedPath = `${extension.dir_path}/${cleanEntry}`.replace(/\\/g, "/");
  const iframeSrc = convertFileSrc(normalizedPath);

  return (
    <div className="w-full min-h-[500px] border border-border/40 rounded-lg overflow-hidden bg-background">
      <iframe
        src={iframeSrc}
        title={title}
        className="w-full min-h-[550px] border-0"
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
      />
    </div>
  );
}

export function SettingsApp({ tab }: { tab?: AppSettingsTab }) {
  const [active, setActive] = useState<string>(tab?.activeSettingsTab ?? "general");
  const init = usePreferencesStore((s) => s.init);
  const extensions = useExtensionsStore((s) => s.extensions);

  const allTabs = useMemo(() => {
    const extSettings = ExtensionRegistry.getActiveSettings();
    const custom: TabItem[] = extSettings.map(({ extension, settings }) => ({
      id: `ext.${extension.id}.${settings.id}`,
      label: settings.title,
      icon: PackageIcon,
      component: () => (
        <ExtensionSettingHost
          extensionId={extension.id}
          entry={settings.entry}
          title={settings.title}
        />
      ),
    }));
    return [...STATIC_TABS, ...custom];
  }, [extensions]);

  const ActiveSection = allTabs.find((t) => t.id === active)?.component || STATIC_TABS[0].component;

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (tab?.activeSettingsTab) {
      setActive(tab.activeSettingsTab);
    }
  }, [tab?.activeSettingsTab]);

  useEffect(() => {
    // Quietly prefetch secondary sections in background after initial render
    const timer = setTimeout(() => {
      void import("./sections/EditorSection");
      void import("./sections/AiSection");
      void import("./sections/ExtensionsSection");
      void import("./sections/LspSection");
      void import("./sections/RunnersSection");
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground select-none">
      <header
        className={`flex h-11 shrink-0 items-center border-b border-border bg-card px-3`}
      >
        <Tabs
          value={active}
          onValueChange={(v) => setActive(v)}
          orientation="horizontal"
          className="flex-1 items-center"
          data-tauri-drag-region
        >
          <TabsList className="mx-auto h-7 bg-muted px-2 overflow-x-auto max-w-full border border-border/60">
            {allTabs.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="h-6 gap-1.5 px-2.5 text-[11.5px]"
              >
                {t.imgSrc ? (
                  <img
                    src={t.imgSrc}
                    alt={t.label}
                    className="size-3.5 shrink-0 object-contain"
                  />
                ) : t.icon ? (
                  <HugeiconsIcon icon={t.icon} size={12} strokeWidth={1.75} />
                ) : null}
                <span>{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-8 pt-6 pb-7 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto w-full max-w-160">
          <Suspense fallback={<SectionSkeleton />}>
            {ActiveSection && <ActiveSection />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
