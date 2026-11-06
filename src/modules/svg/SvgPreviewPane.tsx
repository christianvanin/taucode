import { cn } from "@/lib/utils";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { SvgRenderer } from "./SvgRenderer";
import { SvgViewToggle } from "./SvgViewToggle";

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

type Status =
  | { kind: "loading" }
  | { kind: "ready"; content: string }
  | { kind: "binary" }
  | { kind: "toolarge"; size: number; limit: number }
  | { kind: "error"; message: string };

type Props = {
  path: string;
  visible: boolean;
  onSetView: (mode: "preview" | "raw") => void;
  borderless?: boolean;
};

export function SvgPreviewPane({
  path,
  visible,
  onSetView,
  borderless = false,
}: Props) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    invoke<ReadResult>("fs_read_file", {
      path,
      workspace: currentWorkspaceEnv(),
    })
      .then((res) => {
        if (cancelled) return;
        if (res.kind === "text") {
          setStatus({ kind: "ready", content: res.content });
        } else if (res.kind === "binary") {
          setStatus({ kind: "binary" });
        } else {
          setStatus({ kind: "toolarge", size: res.size, limit: res.limit });
        }
      })
      .catch((e) => {
        if (!cancelled) setStatus({ kind: "error", message: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden",
        !borderless
          ? "rounded-md border border-border/60 bg-background"
          : "bg-transparent",
        !visible && "pointer-events-none",
      )}
    >
      <SvgViewToggle mode="preview" onChange={onSetView} />
      <div className="relative flex-1 overflow-hidden">
        {status.kind === "loading" && (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-[12px] text-muted-foreground">Loading SVG…</p>
          </div>
        )}
        {status.kind === "error" && (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-[12px] text-destructive">
              Failed to read SVG file: {status.message}
            </p>
          </div>
        )}
        {status.kind === "binary" && (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-[12px] text-muted-foreground">
              Binary file — cannot render as SVG.
            </p>
          </div>
        )}
        {status.kind === "toolarge" && (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-[12px] text-muted-foreground">
              File is {status.size} bytes; limit {status.limit}.
            </p>
          </div>
        )}
        {status.kind === "ready" && <SvgRenderer content={status.content} />}
      </div>
    </div>
  );
}
