import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  allServers,
  formatBytes,
  type LspPreset,
  useLspManagerStore,
} from "@/modules/lsp";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  type LspCustomServer,
  setLspActivation,
  setLspCustomServers,
} from "@/modules/settings/store";
import { Delete02Icon, Download01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useId, useState } from "react";
import { SettingRow } from "./SettingRow";

export function LspServersGroup() {
  const activation = usePreferencesStore((s) => s.lspActivation);
  const customServers = usePreferencesStore((s) => s.lspCustomServers);
  const servers = allServers(customServers);
  const fetchStatuses = useLspManagerStore((s) => s.fetchStatuses);

  useEffect(() => {
    void fetchStatuses();
  }, [fetchStatuses]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Language servers</Label>
        <AddCustomServerDialog customServers={customServers} />
      </div>
      {servers.map((server) => (
        <ServerRow
          key={server.id}
          server={server}
          enabled={activation[server.id] === "enabled"}
          custom={customServers.some((c) => c.id === server.id)}
          customServers={customServers}
        />
      ))}
    </div>
  );
}

function ServerRow({
  server,
  enabled,
  custom,
  customServers,
}: {
  server: LspPreset;
  enabled: boolean;
  custom: boolean;
  customServers: LspCustomServer[];
}) {
  const info = useLspManagerStore((s) => s.installed[server.id]);
  const isDownloading = useLspManagerStore((s) => !!s.downloading[server.id]);
  const downloadServer = useLspManagerStore((s) => s.downloadServer);
  const deleteServer = useLspManagerStore((s) => s.deleteServer);

  const isInstalled = custom || !!info?.installed;
  const langs = Object.keys(server.languages).join(", ");

  const statusText = isDownloading
    ? "Downloading..."
    : isInstalled
      ? info?.size_bytes
        ? `Downloaded (${formatBytes(info.size_bytes)})`
        : "Installed"
      : "Not downloaded";

  return (
    <SettingRow
      title={
        <span className="flex items-center gap-1.5 font-medium">
          {server.name}
          {isInstalled && (
            <span
              className="size-1.5 rounded-full bg-emerald-500"
              title="Installed"
            />
          )}
        </span>
      }
      description={`${server.command} (${langs}) • ${statusText}`}
    >
      <div className="flex items-center gap-2">
        {isDownloading ? (
          <Button
            size="sm"
            variant="outline"
            disabled
            className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground"
          >
            <Spinner className="size-3 text-primary" />
            <span>Downloading</span>
          </Button>
        ) : !isInstalled ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2.5 text-xs font-medium cursor-pointer hover:bg-accent hover:text-foreground"
            onClick={async () => {
              const ok = await downloadServer(server.id, server.name);
              if (ok) {
                void setLspActivation(server.id, "enabled");
              }
            }}
          >
            <HugeiconsIcon icon={Download01Icon} size={13} strokeWidth={2} />
            <span>Download</span>
          </Button>
        ) : (
          <>
            {!custom ? (
              <button
                type="button"
                className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                onClick={() => void deleteServer(server.id, server.name)}
                title="Uninstall server"
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.75} />
              </button>
            ) : (
              <button
                type="button"
                className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                onClick={() => {
                  void setLspActivation(server.id, null);
                  void setLspCustomServers(
                    customServers.filter((c) => c.id !== server.id),
                  );
                }}
                title="Remove custom server"
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.75} />
              </button>
            )}
            <Switch
              checked={enabled}
              onCheckedChange={(v) =>
                void setLspActivation(server.id, v ? "enabled" : "dismissed")
              }
            />
          </>
        )}
      </div>
    </SettingRow>
  );
}

function AddCustomServerDialog({
  customServers,
}: {
  customServers: LspCustomServer[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [extensions, setExtensions] = useState("");
  const [languageId, setLanguageId] = useState("");
  const [rootMarkers, setRootMarkers] = useState("");
  const formId = useId();

  const parsedExts = extensions
    .split(",")
    .map((s) => s.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
  const valid =
    name.trim().length > 0 &&
    command.trim().length > 0 &&
    parsedExts.length > 0;

  const save = () => {
    if (!valid) return;
    const langId = languageId.trim() || (parsedExts[0] ?? "");
    const id = `custom-${command.trim()}`;
    const server: LspCustomServer = {
      id,
      name: name.trim(),
      command: command.trim(),
      args: args.trim() ? args.trim().split(/\s+/) : [],
      languages: Object.fromEntries(parsedExts.map((e) => [e, langId])),
      rootMarkers: rootMarkers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    void setLspCustomServers([
      ...customServers.filter((c) => c.id !== id),
      server,
    ]);
    void setLspActivation(id, "enabled");
    setOpen(false);
    setName("");
    setCommand("");
    setArgs("");
    setExtensions("");
    setLanguageId("");
    setRootMarkers("");
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
  ) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`${formId}-${label}`} className="text-[11px]">
        {label}
      </Label>
      <Input
        id={`${formId}-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 text-xs"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]">
          Add custom server
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Custom language server</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          {field("Name", name, setName, "Zig")}
          {field("Command", command, setCommand, "zls")}
          {field("Arguments", args, setArgs, "--stdio")}
          {field("File extensions", extensions, setExtensions, "zig, zon")}
          {field("LSP language id", languageId, setLanguageId, "zig")}
          {field("Root markers", rootMarkers, setRootMarkers, "build.zig")}
        </div>
        <DialogFooter>
          <Button size="sm" disabled={!valid} onClick={save}>
            Add server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
