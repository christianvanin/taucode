import { cn } from "@/lib/utils";
import type { SvgTab, Tab } from "@/modules/tabs";
import { SvgPreviewPane } from "./SvgPreviewPane";

type Props = {
  tabs: Tab[];
  activeId: number;
  onSetSvgView: (id: number, mode: "preview" | "raw") => void;
  borderless?: boolean;
};

export function SvgStack({
  tabs,
  activeId,
  onSetSvgView,
  borderless = true,
}: Props) {
  const svgs = tabs.filter(
    (t): t is SvgTab => t.kind === "svg" && !t.cold,
  );
  if (svgs.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {svgs.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn(
              "absolute inset-0",
              !visible && "invisible pointer-events-none",
            )}
            aria-hidden={!visible}
          >
            <SvgPreviewPane
              path={t.path}
              visible={visible}
              onSetView={(mode) => onSetSvgView(t.id, mode)}
              borderless={borderless}
            />
          </div>
        );
      })}
    </div>
  );
}
