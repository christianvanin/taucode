import { cn } from "@/lib/utils";

type Mode = "3d" | "code";

type Props = {
  mode: Mode;
  onChange: (mode: Mode) => void;
  className?: string;
};

export function Model3dViewToggle({ mode, onChange, className }: Props) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border/60 bg-card/90 px-1.5 py-1 text-[11px] shadow-sm backdrop-blur select-none",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange("3d")}
        className={cn(
          "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
          mode === "3d"
            ? "bg-accent text-foreground shadow-xs"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        Vista 3D
      </button>
      <button
        type="button"
        onClick={() => onChange("code")}
        className={cn(
          "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
          mode === "code"
            ? "bg-accent text-foreground shadow-xs"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        Codice
      </button>
    </div>
  );
}
