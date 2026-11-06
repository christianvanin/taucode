import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useThreeScene } from "./hooks/useThreeScene";
import { useModelAnimation } from "./hooks/useModelAnimation";
import { loadModelFile } from "./loaders/modelLoader";
import { Model3dToolbar } from "./components/Model3dToolbar";
import { Model3dViewToggle } from "./components/Model3dViewToggle";
import { AnimationControls } from "./components/AnimationControls";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Model3dStats } from "./types";

interface Model3dPaneProps {
  path: string;
  content?: string;
  viewMode?: "3d" | "code";
  onViewModeChange?: (mode: "3d" | "code") => void;
}

export function Model3dPane({
  path,
  content,
  viewMode,
  onViewModeChange,
}: Model3dPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Model3dStats | null>(null);
  const [animations, setAnimations] = useState<THREE.AnimationClip[]>([]);

  const {
    modelRootRef,
    fitCameraToObject,
    wireframe,
    setWireframe,
    showGrid,
    setShowGrid,
  } = useThreeScene(containerRef);

  const {
    isPlaying,
    currentTime,
    duration,
    speed,
    loop,
    activeClipIndex,
    togglePlay,
    seek,
    selectClip,
    cycleSpeed,
    toggleLoop,
  } = useModelAnimation({
    modelRoot: modelRootRef.current,
    animations,
  });

  // Caricamento del modello quando il path o il contenuto cambiano
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadModelFile(path, content)
      .then((res) => {
        if (cancelled) return;
        const modelRoot = modelRootRef.current;
        if (!modelRoot) return;

        // Pulisci modello precedente
        while (modelRoot.children.length > 0) {
          const child = modelRoot.children[0];
          modelRoot.remove(child);
        }

        // Aggiungi nuova scena
        modelRoot.add(res.scene);
        setAnimations(res.animations);
        setStats(res.stats);

        // Centra e inquadra automaticamente
        fitCameraToObject(res.scene);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || "Errore sconosciuto durante il caricamento del modello 3D.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path, content, fitCameraToObject]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-background select-none">
      {/* Viewport 3D Canvas a tutto schermo */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-xs text-xs text-muted-foreground gap-2">
          <HugeiconsIcon icon={Loading03Icon} size={20} className="animate-spin text-primary" />
          <span className="font-medium">Caricamento modello 3D e texture...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-background/90 backdrop-blur-xs">
          <div className="size-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-2 font-bold">
            !
          </div>
          <h4 className="text-sm font-semibold text-foreground">Impossibile visualizzare il modello 3D</h4>
          <p className="text-xs text-muted-foreground max-w-md mt-1">{error}</p>
        </div>
      )}

      {/* Se c'è errore o caricamento ma c'è onViewModeChange, mantieni visibile il toggle per andare al codice */}
      {(loading || error) && onViewModeChange && (
        <Model3dViewToggle
          mode={viewMode || "3d"}
          onChange={onViewModeChange}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30"
        />
      )}

      {/* Toolbar Superiore Centrata e Arrotondata */}
      {!loading && !error && (
        <Model3dToolbar
          stats={stats}
          wireframe={wireframe}
          showGrid={showGrid}
          onResetCamera={() => {
            if (modelRootRef.current) fitCameraToObject(modelRootRef.current);
          }}
          onToggleWireframe={setWireframe}
          onToggleGrid={setShowGrid}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      )}

      {/* Controlli Animazione Inferiori Centrati e Arrotondati */}
      {!loading && !error && animations.length > 0 && (
        <AnimationControls
          animations={animations}
          activeClipIndex={activeClipIndex}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          speed={speed}
          loop={loop}
          onTogglePlay={togglePlay}
          onSeek={seek}
          onSelectClip={selectClip}
          onCycleSpeed={cycleSpeed}
          onToggleLoop={toggleLoop}
        />
      )}
    </div>
  );
}
