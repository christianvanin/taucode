import { cn } from "@/lib/utils";
import type { Model3dStats } from "../types";

interface Model3dToolbarProps {
  stats: Model3dStats | null;
  wireframe: boolean;
  showGrid: boolean;
  onResetCamera: () => void;
  onToggleWireframe: (enabled: boolean) => void;
  onToggleGrid: (enabled: boolean) => void;
  viewMode?: "3d" | "code";
  onViewModeChange?: (mode: "3d" | "code") => void;
}

export function Model3dToolbar({
  stats,
  wireframe,
  showGrid,
  onResetCamera,
  onToggleWireframe,
  onToggleGrid,
  viewMode,
  onViewModeChange,
}: Model3dToolbarProps) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/90 px-1.5 py-1 text-[11px] shadow-sm backdrop-blur select-none">
      {/* 1. Selettore Vista 3D / Codice */}
      {onViewModeChange && (
        <>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onViewModeChange("3d")}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                viewMode === "3d"
                  ? "bg-accent text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              Vista 3D
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("code")}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                viewMode === "code"
                  ? "bg-accent text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              Codice
            </button>
          </div>
          <div className="h-3.5 w-px bg-border/60 mx-1" />
        </>
      )}

      {/* 2. Statistiche modello */}
      {stats && (
        <>
          <div className="flex items-center gap-1.5 px-1.5 text-[11px] text-muted-foreground">
            <span title="Numero di triangoli">
              <strong className="text-foreground font-semibold">{stats.triangleCount.toLocaleString()}</strong> tris
            </span>
            {stats.animationCount > 0 && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span title="Animazioni incorporate" className="text-primary font-medium">
                  {stats.animationCount} anim
                </span>
              </>
            )}
          </div>
          <div className="h-3.5 w-px bg-border/60 mx-1" />
        </>
      )}

      {/* 3. Azioni Viewport */}
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={onResetCamera}
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          title="Centra e inquadra il modello (Fit to view)"
        >
          Inquadra
        </button>

        <button
          type="button"
          onClick={() => onToggleWireframe(!wireframe)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
            wireframe
              ? "bg-accent text-foreground shadow-xs"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title="Visualizza reticolo wireframe"
        >
          Wireframe
        </button>

        <button
          type="button"
          onClick={() => onToggleGrid(!showGrid)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
            showGrid
              ? "bg-accent text-foreground shadow-xs"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title="Mostra / Nascondi griglia di riferimento"
        >
          Griglia
        </button>
      </div>
    </div>
  );
}
