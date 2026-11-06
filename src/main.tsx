import "@xterm/xterm/css/xterm.css";
import "./styles/globals.css";

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { initLaunchDir } from "./lib/launchDir";
import { USE_CUSTOM_WINDOW_CONTROLS } from "./lib/platform";

if (USE_CUSTOM_WINDOW_CONTROLS) {
  document.documentElement.dataset.chrome = "borderless";
  const w = getCurrentWindow();
  const updateWindowState = () => {
    const check = () => {
      void Promise.all([w.isMaximized(), w.isFullscreen()]).then(([max, full]) => {
        if (max || full) {
          document.documentElement.dataset.maximized = "true";
        } else {
          delete document.documentElement.dataset.maximized;
        }
        if (full) {
          document.documentElement.dataset.fullscreen = "true";
        } else {
          delete document.documentElement.dataset.fullscreen;
        }
      });
    };
    check();
    setTimeout(check, 50);
  };
  updateWindowState();
  void w.onResized(updateWindowState);
  window.addEventListener("resize", updateWindowState);
}

// Render-instrumentation overlay, opt-in: `VITE_REACT_SCAN=true pnpm dev`.
// Dev-only dynamic import so it never reaches the production bundle.
if (import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN === "true") {
  const { scan } = await import("react-scan");
  scan({ enabled: true });
}

// Reap PTY sessions orphaned by a prior webview load before any tab spawns.
await invoke("pty_close_all").catch(() => {});

// Seed before first paint so default tab mounts at target cwd (no flicker).
await initLaunchDir();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);

// Window starts hidden (per tauri.conf.json) so users never see a transparent
// shadow-only frame before React paints. Use setTimeout — rAF is throttled
// while the window is hidden and would never fire.
const showWindow = () => {
  getCurrentWindow()
    .show()
    .catch((e) => console.error("window.show failed:", e));
};
showWindow();
