/**
 * Auto-updater — verifica GitHub Releases por versão nova via electron-updater.
 *
 * Comportamento:
 * - Check automático 5s após app iniciar (e a cada 6h)
 * - Notifica renderer via IPC "update:available" / "update:downloaded"
 * - Renderer mostra banner "tem versão nova" e usuário escolhe atualizar
 * - install/downloadUpdate baixa e prepara; quitAndInstall() aplica no quit
 *
 * Sem assinatura digital: o download funciona, mas Windows SmartScreen pode
 * mostrar warning "app não assinado" no primeiro launch. Aceitável para
 * distribuição interna (link no WhatsApp).
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import { logger } from "@kairos/core";

let initialized = false;
let checkInterval: NodeJS.Timeout | null = null;

function emit(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

export function initAutoUpdater(): void {
  if (initialized) return;
  initialized = true;

  // Não auto-instala; renderer decide.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Log estruturado
  autoUpdater.logger = {
    info: (...args: unknown[]) => logger.info({ scope: "updater" }, String(args[0] ?? "")),
    warn: (...args: unknown[]) => logger.warn({ scope: "updater" }, String(args[0] ?? "")),
    error: (...args: unknown[]) => logger.error({ scope: "updater" }, String(args[0] ?? "")),
    debug: (...args: unknown[]) => logger.debug({ scope: "updater" }, String(args[0] ?? "")),
  };

  // Eventos → renderer
  autoUpdater.on("checking-for-update", () => {
    emit("update:status", { phase: "checking" });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    emit("update:available", { version: info.version, releaseDate: info.releaseDate });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    emit("update:status", { phase: "up-to-date", current: info.version });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    emit("update:download-progress", {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    emit("update:downloaded", { version: info.version, releaseDate: info.releaseDate });
  });

  autoUpdater.on("error", (err: Error) => {
    logger.error({ scope: "updater", err: err.message }, "update error");
    emit("update:status", { phase: "error", message: err.message });
  });

  // IPC handlers
  ipcMain.handle("update:check", async () => {
    try {
      return await autoUpdater.checkForUpdates();
    } catch (err) {
      logger.error({ scope: "updater", err: String(err) }, "check failed");
      return null;
    }
  });

  ipcMain.handle("update:download", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("update:install", () => {
    // Sai do app, instala a versão baixada e reabre.
    autoUpdater.quitAndInstall();
  });

  // Check inicial 5s após start (deixa o app terminar de carregar)
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);

  // Check a cada 6h
  checkInterval = setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);

  app.on("before-quit", () => {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  });
}

export function getCurrentVersion(): string {
  return app.getVersion();
}
