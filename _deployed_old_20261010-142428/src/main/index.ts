/**
 * Electron main process — entrypoint.
 *
 * Sprint 0: abre a janela com "Kairós Desktop Alves" no título.
 * Sprint 1+: carrega o Agent, registra IPC handlers.
 */

import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMainWindow } from "./window.js";
import { registerIpcHandlers } from "./ipc.js";
import { initAutoUpdater, getCurrentVersion } from "./updater.js";
import { initProvider } from "./agent-instance.js";
import { logger } from "@kairos/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";

app.whenReady().then(async () => {
  // Carrega provider config (env vars + override do disco) ANTES de criar a janela,
  // pra primeira chamada de getProvider() pelo renderer já ter a chave certa.
  await initProvider();

  registerIpcHandlers();
  createMainWindow({ isDev });

  // Auto-update só em produção (no dev roda via vite + electron, não tem .exe)
  if (!isDev) {
    initAutoUpdater();
    logger.info({ version: getCurrentVersion() }, "Kairós Desktop Alves iniciado");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({ isDev });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Garante que só uma instância do app roda por vez.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
