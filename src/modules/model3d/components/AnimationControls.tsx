import { PlayIcon, PauseIcon, RepeatIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type * as THREE from "three";

interface AnimationControlsProps {
  animations: THREE.AnimationClip[];
  activeClipIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  loop: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSelectClip: (idx: number) => void;
  onCycleSpeed: () => void;
  onToggleLoop: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toFixed(1).padStart(4, "0")}`;
}

export function AnimationControls({
  animations,
  activeClipIndex,
  isPlaying,
  currentTime,
  duration,
  speed,
  loop,
  onTogglePlay,
  onSeek,
  onSelectClip,
  onCycleSpeed,
  onToggleLoop,
}: AnimationControlsProps) {
  if (animations.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center justify-between gap-2.5 rounded-lg border border-border/60 bg-card/90 px-2 py-1 text-[11px] shadow-sm backdrop-blur select-none w-[calc(100%-2rem)] max-w-xl">
      {/* 1. Play/Pause, Selettore Clip, Tempo */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onTogglePlay}
          className="flex size-7 items-center justify-center rounded-md text-foreground hover:bg-accent transition-colors cursor-pointer"
          title={isPlaying ? "Pausa (Spazio)" : "Riproduci (Spazio)"}
        >
          <HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} size={15} className="text-primary" />
        </button>

        {animations.length > 1 && (
          <select
            value={activeClipIndex}
            onChange={(e) => onSelectClip(Number(e.target.value))}
            className="h-7 rounded-md border border-border/60 bg-background/80 px-2 text-[11px] font-medium text-foreground focus:outline-hidden focus:border-primary cursor-pointer max-w-[130px] truncate"
          >
            {animations.map((clip, idx) => (
              <option key={clip.name || idx} value={idx}>
                {clip.name || `Clip #${idx + 1}`}
              </option>
            ))}
          </select>
        )}

        <span className="font-mono text-[11px] text-muted-foreground tabular-nums px-1">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div className="h-3.5 w-px bg-border/60 shrink-0" />

      {/* 2. Timeline Scrubber */}
      <div className="flex-1 flex items-center px-1 min-w-[80px]">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full h-1.5 bg-muted/80 rounded-full appearance-none cursor-pointer accent-primary"
        />
      </div>

      <div className="h-3.5 w-px bg-border/60 shrink-0" />

      {/* 3. Velocità e Loop */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onCycleSpeed}
          className="h-7 px-2 rounded-md text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer tabular-nums"
          title="Velocità di riproduzione"
        >
          {speed.toFixed(1)}x
        </button>

        <button
          type="button"
          onClick={onToggleLoop}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition-colors cursor-pointer",
            loop
              ? "bg-accent text-foreground shadow-xs"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title={loop ? "Ripetizione attiva" : "Riproduci una sola volta"}
        >
          <HugeiconsIcon icon={RepeatIcon} size={14} />
        </button>
      </div>
    </div>
  );
}
