import { cn } from "@/lib/utils";

type Mode = "preview" | "raw";

type Props = {
  mode: Mode;
  onChange: (mode: Mode) => void;
  previewDisabled?: boolean;
  previewHint?: string;
};

export function SvgViewToggle({
  mode,
  onChange,
  previewDisabled,
  previewHint,
}: Props) {
  return (
    <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-card/85 p-0.5 text-[11px] shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={() => onChange("preview")}
        disabled={previewDisabled}
        title={previewDisabled ? previewHint : undefined}
        className={cn(
          "rounded px-2 py-0.5 transition-colors",
          mode === "preview"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground",
          previewDisabled &&
            "cursor-not-allowed opacity-40 hover:text-muted-foreground",
        )}
      >
        Preview
      </button>
      <button
        type="button"
        onClick={() => onChange("raw")}
        className={cn(
          "rounded px-2 py-0.5 transition-colors",
          mode === "raw"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Raw
      </button>
    </div>
  );
}
