/**
 * Janela principal do Electron.
 */

import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createMainWindow({ isDev }: { isDev: boolean }): BrowserWindow {
  console.log(`[window] creating BrowserWindow (isDev=${isDev})`);
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 600,
    minHeight: 500,
    title: "Kairós Desktop Alves",
    backgroundColor: "#0f172a", // slate-900 (paleta definida no briefing §8)
    show: true, // Sprint 1.9 fix: forca show=true pra nao depender de ready-to-show
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  console.log(`[window] BrowserWindow created, id=${win.id}`);

  // Tambem escuta ready-to-show caso queira esconder ate carregar
  win.once("ready-to-show", () => {
    console.log(`[window] ready-to-show fired, showing window`);
    win.show();
  });

  // Loga tudo que acontece no console do renderer pra ajudar debug em dev.
  win.webContents.on("console-message", (_e, level, message, line, source) => {
    const tag = ["DEBUG", "INFO", "WARN", "ERROR"][level] ?? `L${level}`;
    console.log(`[renderer:${tag}] ${message} (${source}:${line})`);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[renderer:load-fail] ${code} ${desc} url=${url}`);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error(`[renderer:gone] reason=${details.reason} exitCode=${details.exitCode}`);
  });
  win.webContents.on("did-finish-load", () => {
    console.log(`[window] did-finish-load`);
  });

  // Links externos abrem no browser do sistema, não na app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    console.log(`[window] loadURL http://localhost:5173`);
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // No empacotado, app.getAppPath() retorna o path do app.asar (dentro de resources/).
    // O dist-renderer esta em <appPath>/dist-renderer/index.html. __dirname nao funciona
    // dentro de app.asar (resolve pra outro lugar).
    const indexHtml = path.join(app.getAppPath(), "dist-renderer", "index.html");
    console.log(`[window] loadFile ${indexHtml}`);
    win.loadFile(indexHtml);
  }

  return win;
}
