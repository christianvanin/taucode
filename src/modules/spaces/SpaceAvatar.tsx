import { cn } from "@/lib/utils";
import type { SpaceMeta } from "./lib/store";
import { accentFor, spaceInitial } from "./lib/spaceColor";
import { isSkillWorkspace } from "@/modules/antigravity/skillUtils";

type Size = "sm" | "md";

const SIZES: Record<Size, string> = {
  sm: "size-5 rounded-[5px] text-[10px]",
  md: "size-7 rounded-md text-[12px]",
};

type Props = {
  space: Pick<SpaceMeta, "name" | "color"> & { root?: string | null };
  size?: Size;
  active?: boolean;
  className?: string;
};

export function SpaceAvatar({ space, size = "sm", active, className }: Props) {
  if (isSkillWorkspace(space)) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center",
          SIZES[size],
          className,
        )}
      >
        <img
          src="/antigravity/antigravity.svg"
          alt="Skill"
          className={size === "md" ? "size-4 object-contain" : "size-3.5 object-contain"}
        />
      </span>
    );
  }

  const accent = accentFor(space);
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold leading-none select-none transition-transform active:translate-y-[0.5px]",
        SIZES[size],
        active ? "" : "text-muted-foreground",
        className,
      )}
      style={
        active
          ? {
              color: accent,
              background: `linear-gradient(180deg, color-mix(in oklch, ${accent} 24%, transparent) 0%, color-mix(in oklch, ${accent} 14%, transparent) 100%)`,
              boxShadow: `0 1.5px 0 0 color-mix(in oklch, ${accent} 35%, rgba(0,0,0,0.22)), 0 2px 3px -1px rgba(0,0,0,0.15), inset 0 1px 0.5px 0 rgba(255,255,255,0.45), inset 0 -1px 0.5px 0 rgba(0,0,0,0.1)`,
            }
          : {
              background: `linear-gradient(180deg, color-mix(in oklch, var(--muted) 95%, white) 0%, color-mix(in oklch, var(--muted) 90%, black) 100%)`,
              boxShadow: `0 1.5px 0 0 rgba(0, 0, 0, 0.16), 0 2px 3px -1px rgba(0, 0, 0, 0.1), inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.3), inset 0 -1px 0.5px 0 rgba(0, 0, 0, 0.08)`,
            }
      }
    >
      {spaceInitial(space.name)}
    </span>
  );
}
