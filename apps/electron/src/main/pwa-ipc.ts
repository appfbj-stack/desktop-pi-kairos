/**
 * PWA / Device IPC — handlers que o renderer chama pra logar/deslogar
 * e acompanhar o estado de pareamento do agente com a central-kairos.
 *
 * Sprint 1.20: o agent-client (main process) é o coração. Este arquivo
 * só expõe via IPC os controles pro renderer:
 *   - client:login(email, password, apiUrl?)  → loga + cria device + inicia loops
 *   - client:logout                            → para tudo + limpa store
 *   - client:status                            → snapshot atual
 *   - client:set-api-url(url)                  → setar central-kairos URL
 *
 * Eventos renderer-bound (origin no agent-client):
 *   - agent:status (status, event, payload?)   → push atualizações
 */

import { ipcMain, BrowserWindow } from "electron";
import { logger } from "@kairos/core";
import {
  getAgentStore,
  clearAgentStore,
  AgentData,
} from "./agent-store.js";
import {
  startAgentClient,
  stopAgentClient,
  logoutAgentClient,
  loginAndStart,
} from "./agent-client.js";
import { clearCurrentClient, setCurrentClient } from "./agent-instance.js";

const DEFAULT_API_URL = process.env.KAIROS_CENTRAL_URL || "https://central.fbautomacao.space";

let currentStatus: AgentData | null = null;

function pushStatus(event: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("agent:status", { status: currentStatus, event, payload });
    }
  }
}

export function registerAgentIpc(): void {
  // Login
  ipcMain.handle("client:login", async (_e, args: { email: string; password: string; apiUrl?: string }) => {
    try {
      const apiUrl = (args.apiUrl || DEFAULT_API_URL).trim();
      const data = await loginAndStart(apiUrl, args.email, args.password, {
        onStatus: (status, event, payload) => {
          currentStatus = status;
          pushStatus(event, payload);
        },
      });
      currentStatus = data;
      // tenant novo: zera cache de outro cliente se houver
      clearCurrentClient();
      setCurrentClient(data.clientId, data.clientEmail);
      return { ok: true, status: data };
    } catch (err) {
      logger.error({ err: String(err) }, "[pwa-ipc] login falhou");
      return { ok: false, error: String(err) };
    }
  });

  // Logout
  ipcMain.handle("client:logout", async () => {
    try {
      await logoutAgentClient();
      clearCurrentClient();
      currentStatus = null;
      pushStatus("logout");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Snapshot atual
  ipcMain.handle("client:status", async () => {
    if (!currentStatus) {
      currentStatus = await getAgentStore();
    }
    return { status: currentStatus, defaultApiUrl: DEFAULT_API_URL };
  });

  // Set API URL (para ambientes diferentes)
  ipcMain.handle("client:set-api-url", async (_e, url: string) => {
    const existing = await getAgentStore();
    if (!existing) {
      return { ok: false, error: "Faca login primeiro" };
    }
    existing.apiUrl = url.trim();
    await import("./agent-store.js").then(({ saveAgentStore }) => saveAgentStore(existing));
    return { ok: true, apiUrl: existing.apiUrl };
  });

  // Reload (re-inicia loops usando o store atual)
  ipcMain.handle("client:resume", async () => {
    const store = await getAgentStore();
    if (!store) return { ok: false, error: "Sem login ativo" };
    currentStatus = store;
    const started = await startAgentClient({
      onStatus: (status, event, payload) => {
        currentStatus = status;
        pushStatus(event, payload);
      },
    });
    return { ok: !!started, status: currentStatus };
  });

  logger.info("[pwa-ipc] handlers registrados");
}

/** Tenta restaurar sessão no startup (caso já tenha login salvo). */
export async function tryRestoreAgent(): Promise<AgentData | null> {
  const store = await getAgentStore();
  if (!store) return null;
  currentStatus = store;
  // Inicia state machine em background — não bloqueia startup do Electron.
  startAgentClient({
    onStatus: (status, event, payload) => {
      currentStatus = status;
      pushStatus(event, payload);
    },
  }).catch((err) => logger.error({ err: String(err) }, "[pwa-ipc] resume falhou"));
  return store;
}

// ensureClear usado em testes/dev — não exportado pelo IPC.
export async function _devClearAgentForTesting(): Promise<void> {
  await stopAgentClient();
  await clearAgentStore();
  currentStatus = null;
}
