import type { SVGProps } from "react";

export function TauIcon({
  size = 14,
  strokeWidth = 2.2,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Top horizontal stroke with left downward hook */}
      <path d="M 4.5 9.5 C 4.5 7 6 5.5 8.5 5.5 L 19.5 5.5" />
      {/* Vertical stem with bottom right hook */}
      <path d="M 12 5.5 V 14.8 C 12 17.2 13.8 18.8 16.5 18.8 C 18 18.8 19.2 18.1 19.8 17" />
    </svg>
  );
}

export function TerminalTauIcon({
  size = 14,
  strokeWidth = 2,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Terminal Screen Frame */}
      <rect width="20" height="16" x="2" y="4" rx="3" />
      {/* Greek Tau (τ) in the center */}
      <path d="M 8 10.5 C 8 9.2 8.8 8.4 10 8.4 L 16 8.4" />
      <path d="M 11.8 8.4 V 13.2 C 11.8 14.4 12.6 15.2 14 15.2 C 14.8 15.2 15.4 14.8 15.7 14.2" />
    </svg>
  );
}

export function TauWatermark({ className }: { className?: string }) {
  const tauPath =
    "M 501.0 166.0 472.0 453.0 Q 465.0 528.0 465.0 603.0 Q 465.0 746.0 498.5 776.5 Q 532.0 807.0 575.0 807.0 Q 671.0 807.0 689.0 686.0 H 726.0 Q 693.0 964.0 505.0 964.0 Q 308.0 964.0 308.0 738.0 Q 308.0 624.0 330.0 454.0 L 367.0 166.0 H 268.0 Q 186.0 166.0 140.5 193.5 Q 95.0 221.0 56.0 304.0 H 20.0 Q 52.0 194.0 96.0 129.5 Q 140.0 65.0 180.0 42.5 Q 220.0 20.0 299.0 20.0 H 791.0 V 166.0 Z";

  return (
    <svg
      viewBox="0 0 811 984"
      className={
        className ??
        "h-64 w-auto select-none transition-opacity duration-300 sm:h-80 md:h-96 lg:h-[420px]"
      }
      aria-hidden
    >
      <defs>
        {/* Soft background fill for cavity floor */}
        <linearGradient id="tau-cavity-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.08" />
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.04" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.01" />
        </linearGradient>

        <filter
          id="tau-deboss-filter"
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          {/* 1. Deep Top-Left Inner Shadow (cavity wall in shadow) */}
          <feOffset in="SourceAlpha" dx="18" dy="24" result="offDark1" />
          <feGaussianBlur in="offDark1" stdDeviation="22" result="blurDark1" />
          <feComposite
            operator="out"
            in="SourceAlpha"
            in2="blurDark1"
            result="darkCut1"
          />
          <feFlood floodColor="black" floodOpacity="0.45" result="floodDark1" />
          <feComposite
            operator="in"
            in="floodDark1"
            in2="darkCut1"
            result="innerDark1"
          />

          {/* 2. Tight Top-Left Cut Line for incision definition */}
          <feOffset in="SourceAlpha" dx="6" dy="10" result="offDark2" />
          <feGaussianBlur in="offDark2" stdDeviation="8" result="blurDark2" />
          <feComposite
            operator="out"
            in="SourceAlpha"
            in2="blurDark2"
            result="darkCut2"
          />
          <feFlood floodColor="black" floodOpacity="0.30" result="floodDark2" />
          <feComposite
            operator="in"
            in="floodDark2"
            in2="darkCut2"
            result="innerDark2"
          />

          {/* 3. Bottom-Right Inner Highlight (rising trench slope catching light) */}
          <feOffset in="SourceAlpha" dx="-18" dy="-24" result="offLight1" />
          <feGaussianBlur in="offLight1" stdDeviation="20" result="blurLight1" />
          <feComposite
            operator="out"
            in="SourceAlpha"
            in2="blurLight1"
            result="lightCut1"
          />
          <feFlood floodColor="white" floodOpacity="0.75" result="floodLight1" />
          <feComposite
            operator="in"
            in="floodLight1"
            in2="lightCut1"
            result="innerLight1"
          />

          {/* 4. Tight Bottom-Right Inner Rim Highlight */}
          <feOffset in="SourceAlpha" dx="-6" dy="-8" result="offLight2" />
          <feGaussianBlur in="offLight2" stdDeviation="6" result="blurLight2" />
          <feComposite
            operator="out"
            in="SourceAlpha"
            in2="blurLight2"
            result="lightCut2"
          />
          <feFlood floodColor="white" floodOpacity="0.70" result="floodLight2" />
          <feComposite
            operator="in"
            in="floodLight2"
            in2="lightCut2"
            result="innerLight2"
          />

          {/* 5. Outer Top-Left Soft Ambient Highlight (outer surface curving down) */}
          <feOffset in="SourceAlpha" dx="-12" dy="-16" result="offOuterLight" />
          <feGaussianBlur
            in="offOuterLight"
            stdDeviation="18"
            result="blurOuterLight"
          />
          <feComposite
            operator="out"
            in="blurOuterLight"
            in2="SourceAlpha"
            result="outerLightCut"
          />
          <feFlood
            floodColor="white"
            floodOpacity="0.50"
            result="floodOuterLight"
          />
          <feComposite
            operator="in"
            in="floodOuterLight"
            in2="outerLightCut"
            result="outerLight"
          />

          {/* 6. Outer Bottom-Right Soft Ambient Shadow (outer surface depression transition) */}
          <feOffset in="SourceAlpha" dx="14" dy="18" result="offOuterDark" />
          <feGaussianBlur
            in="offOuterDark"
            stdDeviation="22"
            result="blurOuterDark"
          />
          <feComposite
            operator="out"
            in="blurOuterDark"
            in2="SourceAlpha"
            result="outerDarkCut"
          />
          <feFlood
            floodColor="black"
            floodOpacity="0.16"
            result="floodOuterDark"
          />
          <feComposite
            operator="in"
            in="floodOuterDark"
            in2="outerDarkCut"
            result="outerDark"
          />

          {/* Merge all 3D lighting layers in correct depth order */}
          <feMerge result="debossed">
            <feMergeNode in="outerLight" />
            <feMergeNode in="outerDark" />
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="innerDark1" />
            <feMergeNode in="innerDark2" />
            <feMergeNode in="innerLight1" />
            <feMergeNode in="innerLight2" />
          </feMerge>

          {/* 7. Dither noise to break 8-bit color banding in dark themes */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            seed="2"
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="saturate"
            values="0"
            result="grayNoise"
          />
          <feBlend
            in="debossed"
            in2="grayNoise"
            mode="overlay"
            result="dithered"
          />
          <feComposite
            operator="in"
            in="dithered"
            in2="SourceAlpha"
            result="masked"
          />
          {/* Mix: 92% dithered + 8% original to keep the dither subtle */}
          <feBlend in="masked" in2="debossed" mode="normal" />
        </filter>
      </defs>

      <path
        d={tauPath}
        fill="url(#tau-cavity-fill)"
        filter="url(#tau-deboss-filter)"
      />
    </svg>
  );
}
