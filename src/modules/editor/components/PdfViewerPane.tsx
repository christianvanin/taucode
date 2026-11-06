import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  MinusSignIcon,
  PlusSignIcon,
  RotateRightIcon,
  Download01Icon,
  PrinterIcon,
  Sun01Icon,
  Moon01Icon,
  File02Icon,
} from "@hugeicons/core-free-icons";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type Props = {
  path: string;
};

export function PdfViewerPane({ path }: Props) {
  const fileName = useMemo(() => path.split(/[/\\]/).pop() || "Document.pdf", [path]);
  const assetUrl = useMemo(() => convertFileSrc(path), [path]);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInputValue, setPageInputValue] = useState<string>("1");
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [invertColors, setInvertColors] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Load PDF Document
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setNumPages(0);
    setCurrentPage(1);

    async function loadPdf() {
      try {
        const response = await fetch(assetUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF file (${response.statusText})`);
        }
        const data = await response.arrayBuffer();
        if (!active) return;

        const loadingTask = pdfjsLib.getDocument({ data });
        const doc = await loadingTask.promise;

        if (!active) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        console.error("PDF load error:", err);
        setError(err instanceof Error ? err.message : "Failed to load PDF file.");
        setLoading(false);
      }
    }

    void loadPdf();

    return () => {
      active = false;
    };
  }, [assetUrl]);

  // Sync pageInputValue with currentPage
  useEffect(() => {
    setPageInputValue(currentPage.toString());
  }, [currentPage]);

  // Handle scroll to detect active page
  const handleScroll = useCallback(() => {
    if (!containerRef.current || numPages === 0) return;
    const containerTop = containerRef.current.getBoundingClientRect().top;

    let bestPage = 1;
    let minDistance = Infinity;

    pageRefs.current.forEach((el, pageNum) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.top - containerTop);
      if (distance < minDistance) {
        minDistance = distance;
        bestPage = pageNum;
      }
    });

    if (bestPage !== currentPage) {
      setCurrentPage(bestPage);
    }
  }, [numPages, currentPage]);

  const scrollToPage = (pageNum: number) => {
    const targetPage = Math.max(1, Math.min(pageNum, numPages));
    const el = pageRefs.current.get(targetPage);
    if (el && containerRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentPage(targetPage);
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number.parseInt(pageInputValue, 10);
    if (!Number.isNaN(val)) {
      scrollToPage(val);
    } else {
      setPageInputValue(currentPage.toString());
    }
  };

  const zoomIn = () => setScale((prev) => Math.min(3.0, +(prev + 0.15).toFixed(2)));
  const zoomOut = () => setScale((prev) => Math.max(0.4, +(prev - 0.15).toFixed(2)));
  const resetZoom = () => setScale(1.0);
  const rotateRight = () => setRotation((prev) => (prev + 90) % 360);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = assetUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    const win = window.open(assetUrl, "_blank");
    if (win) {
      win.focus();
      win.print();
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground overflow-hidden select-none">
      {/* Top Toolbar matching program theme */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-3 py-1.5 text-xs">
        {/* Document Info */}
        <div className="flex items-center gap-2 truncate max-w-[200px] sm:max-w-[300px]">
          <HugeiconsIcon icon={File02Icon} className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium text-foreground/90">{fileName}</span>
        </div>

        {/* Center Controls: Navigation & Zoom */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Page Navigation */}
          <div className="flex items-center gap-1 bg-background/80 rounded-md border border-border/60 p-0.5 shadow-xs">
            <button
              type="button"
              disabled={currentPage <= 1 || loading}
              onClick={() => scrollToPage(currentPage - 1)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors"
              title="Previous Page"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
            </button>

            <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1 px-1">
              <input
                type="text"
                value={pageInputValue}
                onChange={(e) => setPageInputValue(e.target.value)}
                onBlur={handlePageInputSubmit}
                disabled={loading || numPages === 0}
                className="w-8 text-center bg-transparent border-b border-border text-foreground font-medium text-xs focus:outline-hidden focus:border-primary"
              />
              <span className="text-muted-foreground text-[11px]">/ {numPages || 1}</span>
            </form>

            <button
              type="button"
              disabled={currentPage >= numPages || loading}
              onClick={() => scrollToPage(currentPage + 1)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors"
              title="Next Page"
            >
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-border/60 mx-0.5 hidden sm:block" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-background/80 rounded-md border border-border/60 p-0.5 shadow-xs">
            <button
              type="button"
              disabled={loading}
              onClick={zoomOut}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors"
              title="Zoom Out"
            >
              <HugeiconsIcon icon={MinusSignIcon} className="size-3.5" />
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={resetZoom}
              className="px-1.5 py-0.5 text-[11px] font-medium text-foreground/80 hover:bg-accent hover:text-accent-foreground rounded transition-colors"
              title="Reset Zoom (100%)"
            >
              {Math.round(scale * 100)}%
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={zoomIn}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors"
              title="Zoom In"
            >
              <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Right Tools: Rotate, Dark Mode Invert, Download, Print */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={loading}
            onClick={rotateRight}
            className="rounded border border-border/60 bg-background/80 p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors"
            title="Rotate Clockwise"
          >
            <HugeiconsIcon icon={RotateRightIcon} className="size-3.5" />
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => setInvertColors((prev) => !prev)}
            className={cn(
              "rounded border border-border/60 bg-background/80 p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors",
              invertColors && "bg-accent text-accent-foreground border-primary/50"
            )}
            title={invertColors ? "Disable Dark Page Invert" : "Enable Dark Page Invert"}
          >
            <HugeiconsIcon icon={invertColors ? Sun01Icon : Moon01Icon} className="size-3.5" />
          </button>

          <div className="h-4 w-px bg-border/60 mx-0.5" />

          <button
            type="button"
            disabled={loading}
            onClick={handleDownload}
            className="rounded border border-border/60 bg-background/80 p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors"
            title="Download PDF"
          >
            <HugeiconsIcon icon={Download01Icon} className="size-3.5" />
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handlePrint}
            className="rounded border border-border/60 bg-background/80 p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors"
            title="Print PDF"
          >
            <HugeiconsIcon icon={PrinterIcon} className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-auto bg-muted/20 p-4 sm:p-6 flex flex-col items-center gap-6"
      >
        {loading && (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Spinner className="size-6 text-primary" />
            <span className="text-xs font-medium">Loading document…</span>
          </div>
        )}

        {error && (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-destructive">
            <p className="text-xs font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && pdfDoc && (
          Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <PdfPageCard
              key={pageNum}
              pdfDoc={pdfDoc}
              pageNum={pageNum}
              scale={scale}
              rotation={rotation}
              invertColors={invertColors}
              ref={(el) => {
                if (el) pageRefs.current.set(pageNum, el);
                else pageRefs.current.delete(pageNum);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Individual PDF Page Component with lazy rendering and crisp high-DPI canvas
import { forwardRef } from "react";

type PageCardProps = {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  scale: number;
  rotation: number;
  invertColors: boolean;
};

const PdfPageCard = forwardRef<HTMLDivElement, PageCardProps>(function PdfPageCard(
  { pdfDoc, pageNum, scale, rotation, invertColors },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderLoading, setRenderLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    let renderTask: pdfjsLib.RenderTask | null = null;

    async function renderPage() {
      try {
        setRenderLoading(true);
        const page = await pdfDoc.getPage(pageNum);
        if (!active || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const viewport = page.getViewport({ scale, rotation });
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        const renderContext = {
          canvasContext: ctx,
          canvas: canvas,
          transform,
          viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;

        if (active) {
          setRenderLoading(false);
        }
      } catch (err: unknown) {
        if (active && (err as { name?: string })?.name !== "RenderingCancelledException") {
          console.error(`Error rendering PDF page ${pageNum}:`, err);
          setRenderLoading(false);
        }
      }
    }

    void renderPage();

    return () => {
      active = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNum, scale, rotation]);

  return (
    <div
      ref={ref}
      className={cn(
        "relative rounded-xs bg-card border border-border/70 shadow-md transition-shadow",
        invertColors && "invert hue-rotate-180"
      )}
    >
      {renderLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/60 backdrop-blur-xs">
          <Spinner className="size-5 text-primary" />
        </div>
      )}
      <canvas ref={canvasRef} className="block rounded-xs" />
    </div>
  );
});
