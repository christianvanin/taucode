import { cn } from "@/lib/utils";
import { useTheme } from "@/modules/theme";
import {
  ArrowReloadHorizontalIcon,
  MinusSignIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";
import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GridTheme = "light" | "dark";

type Props = {
  content: string;
};

function extractSvgSize(svgText: string): { width: number; height: number } | null {
  try {
    const svgTagMatch = svgText.match(/<svg\b([^>]*)>/i);
    if (!svgTagMatch) return null;
    const attrs = svgTagMatch[1];

    let width: number | null = null;
    let height: number | null = null;

    const wMatch = attrs.match(/\bwidth=["']([^"']+)["']/i);
    const hMatch = attrs.match(/\bheight=["']([^"']+)["']/i);
    const vbMatch = attrs.match(/\bviewBox=["']([^"']+)["']/i);

    if (wMatch && !wMatch[1].includes("%")) {
      const parsed = parseFloat(wMatch[1]);
      if (!isNaN(parsed) && parsed > 0) width = parsed;
    }
    if (hMatch && !hMatch[1].includes("%")) {
      const parsed = parseFloat(hMatch[1]);
      if (!isNaN(parsed) && parsed > 0) height = parsed;
    }

    if (vbMatch) {
      const parts = vbMatch[1].trim().split(/[\s,]+/).map(parseFloat);
      if (parts.length === 4 && !isNaN(parts[2]) && !isNaN(parts[3])) {
        if (width === null) width = parts[2];
        if (height === null) height = parts[3];
      }
    }

    if (width !== null && height !== null) {
      return { width: Math.round(width), height: Math.round(height) };
    }
    return null;
  } catch {
    return null;
  }
}

export function SvgRenderer({ content }: Props) {
  const { resolvedMode } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panzoomRef = useRef<HTMLDivElement | null>(null);
  const svgWrapperRef = useRef<HTMLDivElement | null>(null);
  const panzoomInstanceRef = useRef<PanzoomObject | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(() =>
    extractSvgSize(content),
  );
  const [gridTheme, setGridTheme] = useState<GridTheme>(
    () => (resolvedMode === "light" ? "light" : "dark"),
  );

  useEffect(() => {
    const extracted = extractSvgSize(content);
    if (extracted) {
      setDimensions(extracted);
    } else if (svgWrapperRef.current) {
      const svgEl = svgWrapperRef.current.querySelector("svg");
      if (svgEl) {
        const b = svgEl.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) {
          setDimensions({ width: Math.round(b.width), height: Math.round(b.height) });
        }
      }
    }
  }, [content]);

  // Sanitize SVG content using DOMPurify with SVG profile and strict tag/attribute restrictions
  const sanitizedSvg = useMemo(() => {
    try {
      const purify =
        typeof window !== "undefined"
          ? typeof (DOMPurify as unknown as { sanitize?: unknown }).sanitize ===
            "function"
            ? DOMPurify
            : typeof DOMPurify === "function"
              ? (DOMPurify as unknown as (w: Window) => typeof DOMPurify)(window)
              : DOMPurify
          : null;

      if (purify && typeof purify.sanitize === "function") {
        return purify.sanitize(content, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ["use"],
          FORBID_TAGS: ["script", "iframe", "object", "embed", "foreignObject"],
          FORBID_ATTR: [
            "onerror",
            "onload",
            "onclick",
            "onmouseover",
            "onmouseout",
            "onfocus",
            "onblur",
            "onmouseenter",
            "onmouseleave",
          ],
        });
      }

      // Safe fallback when not in a browser DOM context
      return content
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, "")
        .replace(/\son\w+="[^"]*"/gi, "")
        .replace(/\son\w+='[^']*'/gi, "");
    } catch {
      return "";
    }
  }, [content]);

  // Initialize Panzoom
  useEffect(() => {
    const target = panzoomRef.current;
    const container = containerRef.current;
    if (!target || !container) return;

    const pz = Panzoom(target, {
      maxScale: 40,
      minScale: 0.05,
      cursor: "grab",
      canvas: true,
    });
    panzoomInstanceRef.current = pz;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      pz.zoomWithWheel(e);
    };

    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ scale: number }>).detail;
      if (detail && typeof detail.scale === "number") {
        setScale(detail.scale);
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    target.addEventListener("panzoomchange", onChange);

    return () => {
      container.removeEventListener("wheel", onWheel);
      target.removeEventListener("panzoomchange", onChange);
      pz.destroy();
      panzoomInstanceRef.current = null;
    };
  }, []);

  const handleZoomIn = useCallback(() => {
    panzoomInstanceRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    panzoomInstanceRef.current?.zoomOut();
  }, []);

  const handleReset = useCallback(() => {
    panzoomInstanceRef.current?.reset();
    setScale(1);
  }, []);

  const toggleGridTheme = useCallback(() => {
    setGridTheme((curr) => (curr === "light" ? "dark" : "light"));
  }, []);

  return (
    <div className="relative h-full w-full select-none overflow-hidden">
      {/* Background canvas viewport covering the whole tab with permanent grid */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: canvas double click resets panzoom */}
      <div
        ref={containerRef}
        onDoubleClick={handleReset}
        className={cn(
          "relative flex h-full w-full items-center justify-center overflow-hidden transition-colors",
          gridTheme === "light"
            ? "svg-checkerboard-light"
            : "svg-checkerboard-dark",
        )}
      >
        {/* Panzoom target */}
        <div
          ref={panzoomRef}
          className="flex items-center justify-center p-12 active:cursor-grabbing"
        >
          {sanitizedSvg ? (
            <div className="relative flex items-center justify-center">
              <div
                ref={svgWrapperRef}
                className="relative flex items-center justify-center transition-all [&>svg]:max-h-[85vh] [&>svg]:max-w-[85vw] [&>svg]:overflow-visible"
                style={{
                  width: dimensions ? `${dimensions.width}px` : undefined,
                  height: dimensions ? `${dimensions.height}px` : undefined,
                }}
              >
                {dimensions && (
                  <div className="pointer-events-none absolute inset-0 z-10 border-2 border-dashed border-red-500" />
                )}
                <div
                  className="flex size-full items-center justify-center [&>svg]:size-full [&>svg]:overflow-visible"
                  /* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized securely with DOMPurify */
                  dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-card p-6 text-center text-xs text-muted-foreground shadow-sm">
              Empty or invalid SVG content.
            </div>
          )}
        </div>
      </div>

      {/* Floating Toolbar */}
      <div className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-lg border border-border/60 bg-card/85 p-1 text-[11px] shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={toggleGridTheme}
          title={`Grid Theme: ${gridTheme} (Click to switch)`}
          className="flex h-6 items-center gap-1 rounded px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <span className="capitalize">{gridTheme}</span>
        </button>

        <div className="h-4 w-px bg-border/50" />

        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom out (Mouse wheel down)"
          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={MinusSignIcon} size={13} strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={handleReset}
          title="Reset Zoom to 100%"
          className="min-w-[42px] px-1 text-center font-mono text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {Math.round(scale * 100)}%
        </button>

        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom in (Mouse wheel up)"
          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
        </button>

        <div className="h-4 w-px bg-border/50" />

        <button
          type="button"
          onClick={handleReset}
          title="Reset View"
          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowReloadHorizontalIcon}
            size={13}
            strokeWidth={2}
          />
        </button>
      </div>
    </div>
  );
}
