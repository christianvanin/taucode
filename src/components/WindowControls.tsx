import { USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import {
  Cancel01Icon,
  Copy01Icon,
  MinusSignIcon,
  SquareIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

type Props = {
  /** Render only the close button (used by the settings window). */
  closeOnly?: boolean;
};

export function WindowControls({ closeOnly = false }: Props) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!USE_CUSTOM_WINDOW_CONTROLS || closeOnly) return;
    const w = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    const update = () => {
      const check = () => {
        void Promise.all([w.isMaximized(), w.isFullscreen()]).then(([max, full]) => {
          setMaximized(max || full);
        });
      };
      check();
      setTimeout(check, 50);
    };
    update();
    void w
      .onResized(update)
      .then((un) => {
        unlisten = un;
      });
    window.addEventListener("resize", update);
    return () => {
      unlisten?.();
      window.removeEventListener("resize", update);
    };
  }, [closeOnly]);

  if (!USE_CUSTOM_WINDOW_CONTROLS) return null;

  const w = getCurrentWindow();

  return (
    <div className="flex h-full shrink-0 items-center gap-0.5 pr-1">
      {!closeOnly && (
        <>
          <CtlButton ariaLabel="Minimize" onClick={() => void w.minimize()}>
            <HugeiconsIcon icon={MinusSignIcon} size={12} strokeWidth={2} />
          </CtlButton>
          <CtlButton
            ariaLabel={maximized ? "Restore" : "Maximize"}
            onClick={() => {
              void (async () => {
                try {
                  if (await w.isFullscreen()) {
                    await w.setFullscreen(false);
                  } else {
                    await w.toggleMaximize();
                  }
                } catch (e) {
                  console.error("toggleMaximize/fullscreen failed:", e);
                }
              })();
            }}
          >
            <HugeiconsIcon
              icon={maximized ? Copy01Icon : SquareIcon}
              size={12}
              strokeWidth={2}
            />
          </CtlButton>
        </>
      )}
      <CtlButton ariaLabel="Close" onClick={() => void w.close()} danger>
        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
      </CtlButton>
    </div>
  );
}

function CtlButton({
  ariaLabel,
  onClick,
  children,
  danger,
}: {
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 border-0 select-none",
        danger
          ? "hover:bg-destructive/15 hover:text-destructive active:bg-destructive/25"
          : "hover:bg-accent hover:text-foreground active:bg-accent/80",
      )}
    >
      {children}
    </button>
  );
}
