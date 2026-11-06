import { useState, useCallback, useEffect } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "ready"
  | "error";

export function useUpdater() {
  const [currentVersion, setCurrentVersion] = useState<string>("1.0.0");
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [downloadedBytes, setDownloadedBytes] = useState<number>(0);
  const [totalBytes, setTotalBytes] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void getVersion()
      .then(setCurrentVersion)
      .catch(() => {});
  }, []);

  const checkForUpdates = useCallback(async (manual = true) => {
    try {
      setStatus("checking");
      setErrorMessage(null);
      const update = await check();
      if (update?.available) {
        setUpdateInfo(update);
        setStatus("available");
      } else {
        setUpdateInfo(null);
        setStatus("up-to-date");
      }
    } catch (err: unknown) {
      console.warn("Controllo aggiornamenti fallito o non in runtime Tauri:", err);
      if (manual) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : typeof err === "object" && err !== null && "message" in err
                ? String((err as { message: unknown }).message)
                : "Impossibile contattare il server di aggiornamento GitHub.";
        setErrorMessage(errorMsg);
        setStatus("error");
      } else {
        setStatus("idle");
      }
    }
  }, []);

  const startDownloadAndInstall = useCallback(async () => {
    if (!updateInfo) return;
    try {
      setStatus("downloading");
      setProgress(0);
      setErrorMessage(null);

      let downloaded = 0;
      let total = 0;

      await updateInfo.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          setTotalBytes(total);
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setDownloadedBytes(downloaded);
          if (total > 0) {
            const pct = Math.min(100, Math.round((downloaded / total) * 100));
            setProgress(pct);
          }
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });

      setStatus("ready");
    } catch (err: unknown) {
      console.error("Installazione aggiornamento fallita:", err);
      const errorMsg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : "Errore durante il download dell'aggiornamento.";
      setErrorMessage(errorMsg);
      setStatus("error");
    }
  }, [updateInfo]);

  const applyUpdateAndRestart = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error("Riavvio fallito:", err);
      setErrorMessage("Impossibile riavviare l'applicazione automaticamente. Riavvia manualmente.");
    }
  }, []);

  return {
    currentVersion,
    status,
    updateInfo,
    progress,
    downloadedBytes,
    totalBytes,
    errorMessage,
    checkForUpdates,
    startDownloadAndInstall,
    applyUpdateAndRestart,
  };
}

