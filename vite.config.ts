import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, type PluginOption, type UserConfig } from "vite";
import Inspect from "vite-plugin-inspect";

const host = process.env.TAURI_DEV_HOST;

// Bundle/treemap analysis is opt-in: `ANALYZE=true pnpm build` emits stats.html.
const analyze = process.env.ANALYZE === "true";

// Module-graph inspector is opt-in via `pnpm dev:inspect`; keeps plain
// `pnpm dev` from paying its transform-tracking overhead on every run.
const inspectGraph = process.env.INSPECT === "true";

// https://vite.dev/config/
export default defineConfig(async ({ mode }): Promise<UserConfig> => ({
  plugins: [
    babel({
      presets: [reactCompilerPreset({ target: "19" })],
    }),
    react(),
    tailwindcss(),
    // Module-graph inspector at /__inspect (who-imports-what, per-plugin
    // transforms). Opt-in via `pnpm dev:inspect`, never in a production build.
    ...(mode === "development" && inspectGraph
      ? [Inspect() as PluginOption]
      : []),
    ...(analyze
      ? [
          (await import("rollup-plugin-visualizer")).visualizer({
            filename: "stats.html",
            template: "treemap",
            gzipSize: true,
            brotliSize: true,
            open: true,
          }) as PluginOption,
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Shim keeps the ~117 kB CJS protocol package out of the bundle.
      "vscode-languageserver-protocol": path.resolve(
        __dirname,
        "./src/modules/lsp/lib/protocolShim.ts",
      ),
    },
  },
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome120" : "es2022",
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
      // Oxc drops `debugger` by default. These calls return undefined, so
      // marking them pure lets DCE strip them from production builds.
      treeshake: {
        manualPureFunctions: [
          "console.debug",
          "console.info",
          "console.trace",
        ],
      },
      output: {
        manualChunks(id: string) {
          if (id.includes("vite/preload-helper") || id.includes("/vite/dist/"))
            return "react";

          if (!id.includes("node_modules")) return null;

          if (
            id.includes("/clsx/") ||
            id.includes("/tailwind-merge/") ||
            id.includes("/class-variance-authority/")
          )
            return "react";

          if (id.includes("/xterm/") || id.includes("@xterm/")) return "xterm";

          // Monaco Editor — split into core + workers to avoid one giant chunk
          if (id.includes("monaco-editor/esm/vs/editor/editor.worker"))
            return "monaco-worker-editor";
          if (id.includes("monaco-editor/esm/vs/language/typescript"))
            return "monaco-worker-ts";
          if (id.includes("monaco-editor/esm/vs/language/json"))
            return "monaco-worker-json";
          if (id.includes("monaco-editor/esm/vs/language/css"))
            return "monaco-worker-css";
          if (id.includes("monaco-editor/esm/vs/language/html"))
            return "monaco-worker-html";
          if (
            id.includes("monaco-editor/") ||
            id.includes("@monaco-editor/")
          )
            return "monaco";

          // Lang packs and legacy modes are dynamically imported by
          // languageResolver; give each its own named chunk so they load on
          // demand instead of being glued into the codemirror core chunk.
          {
            const m = id.match(/@codemirror\/lang-([\w-]+)/);
            if (m) return `cm-lang-${m[1]}`;
          }
          {
            const m = id.match(/@codemirror\/legacy-modes\/mode\/([\w-]+)/);
            if (m) return `cm-legacy-${m[1]}`;
          }
          if (
            id.includes("@codemirror/") ||
            id.includes("@uiw/codemirror") ||
            id.includes("@replit/codemirror")
          )
            return "codemirror";
          if (
            id.includes("/react-dom/") ||
            id.includes("/react/") ||
            id.includes("/scheduler/")
          )
            return "react";
          if (id.includes("@radix-ui/") || id.includes("/radix-ui/"))
            return "radix";

          return null;
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/models/**",
        "**/ai-local/**",
        "**/tmp/**",
        "**/*.gguf",
        "**/*.safetensors",
        "**/*.bin",
        "**/*.log",
        "**/*.png",
        "**/.git/**",
      ],
    },
  },
}));
