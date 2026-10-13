/**
 * Agent client — conecta o Electron à central-kairos.
 *
 * Sprint 1.20 (PWA):
 *  - Após o user logar uma vez (email/senha), o agente cria um Device PENDING
 *    via POST /api/pwa/devices (kind=ELECTRON, usando o clientJwt salvo).
 *  - Mostra o otpCode no console e em IPC `agent:status` pro renderer exibir.
 *  - User vai na PWA, abre "Meus dispositivos", digita o codigo (ou cola o
 *    otpToken completo), confirma. PWA chama /link/confirm e ativa o device.
 *  - Electron polling /api/pwa/devices/by-otp descobre a ativacao, salva o
 *    deviceToken, e dispara o ciclo:
 *      1) heartbeat a cada 30s (POST /api/agent/heartbeat)
 *      2) long-poll de tasks (GET /api/agent/tasks/pending)
 *      3) quando recebe task, executa via task-executor e POST resultado.
 *
 * State machine simples:
 *   no_login → login → register_device → wait_link → active
 *
 * Reset: clearAgentStore() remove tudo (logout) → no_login.
 */

import os from "node:os";
import { app } from "electron";
import { logger } from "@kairos/core";
import {
  AgentData,
  getAgentStore,
  saveAgentStore,
  clearAgentStore,
  extractOtpCode,
} from "./agent-store.js";
import { executeTask, TaskExecutionResult } from "./task-executor.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;
const POLL_PENDING_LINK_INTERVAL_MS = 5_000;
const LONG_POLL_TIMEOUT_MS = 25_000;

interface ClientCallbacks {
  /** Renderer quer saber status atualizado (pairing code, ativo, etc). */
  onStatus: (status: AgentData, event: "registered" | "link_pending" | "active" | "revoked" | "logout" | "task_progress" | "task_done" | "error", payload?: unknown) => void;
}

let stopRequested = false;
let currentStore: AgentData | null = null;
let apiBase: string | null = null;

/**
 * Inicializa (ou recarrega) o agent client.
 * Chamado em app.whenReady() após IPC handler `client:login` ter salvo JWT.
 */
export async function startAgentClient(callbacks: ClientCallbacks): Promise<AgentData | null> {
  const stored = await getAgentStore();
  if (!stored) {
    logger.info("[agent-client] sem agent store (user nao logou)");
    return null;
  }
  stopRequested = false;
  currentStore = stored;
  apiBase = stored.apiUrl.replace(/\/+$/, "");
  logger.info({ apiBase, status: stored.status }, "[agent-client] iniciando");

  // Máquina de estados: cada estado roda em loop e transiciona ao próximo.
  // Mantém callbacks disponível pro resto da sessão.
  setImmediate(() => {
    runStateMachine(stored, callbacks).catch((err) => {
      logger.error({ err: String(err) }, "[agent-client] state machine crashed");
    });
  });

  return stored;
}

/** Pede parada limpa. */
export async function stopAgentClient(): Promise<void> {
  stopRequested = true;
  currentStore = null;
  apiBase = null;
  logger.info("[agent-client] stop requested");
}

/** Logout: limpa store e pede stop. */
export async function logoutAgentClient(): Promise<void> {
  await stopAgentClient();
  await clearAgentStore();
}

/** Login novo: chamado pelo IPC `client:login` no renderer. */
export async function loginAndStart(
  apiUrlIn: string,
  email: string,
  password: string,
  callbacks: ClientCallbacks
): Promise<AgentData> {
  // Para qualquer sessão em andamento.
  stopRequested = false;

  const apiUrlClean = apiUrlIn.replace(/\/+$/, "");
  logger.info({ apiUrl: apiUrlClean, email }, "[agent-client] login");

  // 1) Login no /api/pwa/auth/login
  const loginRes = await fetchJson<{ token: string; client: { id: string; email: string } }>(
    `${apiUrlClean}/api/pwa/auth/login`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) },
    "login"
  );
  if (!loginRes.ok) throw new Error(loginRes.error || "Falha no login");

  apiBase = apiUrlClean;

  // 2) Cria device PENDING
  const devRes = await fetchJson<{ deviceId: string; otpToken: string }>(
    `${apiUrlClean}/api/pwa/devices`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginRes.data!.token}` },
      body: JSON.stringify({
        kind: "ELECTRON",
        name: `Electron @ ${os.userInfo().username}`,
        os: `${process.platform} ${process.arch} (${os.release()})`,
        hardware: `${os.cpus()[0]?.model ?? "cpu-unknown"} / ${(os.totalmem() / 1024 ** 3).toFixed(1)}GB`,
      }),
    },
    "device register"
  );
  if (!devRes.ok) throw new Error(devRes.error || "Falha ao registrar device");

  // 3) Salva
  const otpToken = devRes.data!.otpToken;
  const otpCode = extractOtpCode(otpToken);
  const fresh: AgentData = {
    version: 1,
    apiUrl: apiUrlClean,
    clientJwt: loginRes.data!.token,
    clientEmail: loginRes.data!.client.email,
    clientLoggedInAt: Date.now(),
    deviceId: devRes.data!.deviceId,
    deviceName: `Electron @ ${os.userInfo().username}`,
    otpToken,
    otpCode,
    status: "pending",
  };
  await saveAgentStore(fresh);
  currentStore = fresh;

  logger.info({ otpCode }, "[agent-client] device PENDING. Codigo de pareamento:");
  logger.info(`\n╔════════════════════════════════════════════════╗\n║  SEU CODIGO DE PAREAMENTO:  ${otpCode}        ║\n║  Abra a PWA > Perfil > Dispositivos > Adicionar ║\n║  (valido por 15 minutos)                       ║\n╚════════════════════════════════════════════════╝`);

  callbacks.onStatus(fresh, "registered", { otpCode });
  setImmediate(() => {
    runStateMachine(fresh, callbacks).catch((err) => {
      logger.error({ err: String(err) }, "[agent-client] state machine crashed");
    });
  });
  return fresh;
}

/** State machine — orquestra registro, polling de vínculo, heartbeat e long-poll. */
async function runStateMachine(store: AgentData, callbacks: ClientCallbacks): Promise<void> {
  // POLLING DE VÍNCULO: roda até device ficar ACTIVE.
  while (!stopRequested && currentStore && currentStore.deviceId === store.deviceId && currentStore.status === "pending") {
    const r = await pollLinkOnce(currentStore);
    if (r.status === "active" && r.deviceToken) {
      currentStore = { ...currentStore, status: "active", deviceToken: r.deviceToken, activatedAt: Date.now() };
      await saveAgentStore(currentStore);
      store = currentStore;
      logger.info({ deviceToken: r.deviceToken.slice(0, 8) + "..." }, "[agent-client] device ATIVADO!");
      callbacks.onStatus(currentStore, "active");
      break;
    }
    await sleep(POLL_PENDING_LINK_INTERVAL_MS);
  }
  if (stopRequested || !currentStore) return;

  // CORPO ATIVO: heartbeat + long-poll concorrentes.
  await Promise.all([
    heartbeatLoop(store, callbacks),
    longPollLoop(store, callbacks),
  ]);
}

async function pollLinkOnce(store: AgentData): Promise<{ status: "pending" | "active" | "not_found"; deviceToken?: string }> {
  try {
    const url = `${store.apiUrl}/api/pwa/devices/by-otp?otpToken=${encodeURIComponent(store.otpToken)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${store.clientJwt}` } });
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) {
      const body = await safeText(res);
      logger.warn({ status: res.status, body }, "[agent-client] by-otp error");
      return { status: "pending" };
    }
    const data = (await res.json()) as { status: "pending" | "active"; deviceId: string; deviceToken?: string };
    if (data.status === "active" && data.deviceToken) return { status: "active", deviceToken: data.deviceToken };
    return { status: "pending" };
  } catch (err) {
    logger.warn({ err: String(err) }, "[agent-client] pollLink failed");
    return { status: "pending" };
  }
}

async function heartbeatLoop(store: AgentData, callbacks: ClientCallbacks): Promise<void> {
  while (!stopRequested && currentStore?.deviceToken) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
      const res = await fetch(`${store.apiUrl}/api/agent/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-Token": currentStore.deviceToken },
        body: JSON.stringify({
          meta: { app: "kairos-electron", version: app.getVersion(), node: process.versions.node },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.status === 403) {
        logger.warn("[agent-client] device revoked (403)");
        callbacks.onStatus(currentStore, "revoked");
        await clearAgentStore();
        return;
      }
      if (!res.ok) {
        const body = await safeText(res);
        logger.warn({ status: res.status, body }, "[agent-client] heartbeat error");
      } else {
        logger.debug("[agent-client] heartbeat OK");
      }
    } catch (err) {
      logger.warn({ err: String(err) }, "[agent-client] heartbeat failed");
    }
    await sleep(HEARTBEAT_INTERVAL_MS);
  }
}

async function longPollLoop(store: AgentData, callbacks: ClientCallbacks): Promise<void> {
  while (!stopRequested && currentStore?.deviceToken) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LONG_POLL_TIMEOUT_MS);
      const res = await fetch(
        `${store.apiUrl}/api/agent/tasks/pending`,
        { headers: { "X-Device-Token": currentStore.deviceToken }, signal: controller.signal }
      );
      clearTimeout(timeout);
      if (res.status === 401 || res.status === 403) {
        logger.warn({ status: res.status }, "[agent-client] long-poll auth fail");
        await sleep(HEARTBEAT_INTERVAL_MS);
        continue;
      }
      if (!res.ok) {
        logger.warn({ status: res.status }, "[agent-client] long-poll error");
        await sleep(2_000);
        continue;
      }
      const data = (await res.json()) as { task: { id: string; kind: string; params: unknown; conversationId?: string; clientId: string } | null };
      if (data.task) {
        // Executa task em background (não bloqueia o long-poll)
        const t = data.task;
        logger.info({ taskId: t.id, kind: t.kind }, "[agent-client] task recebida");
        const storeSnapshot = currentStore;
        if (!storeSnapshot) continue;
        callbacks.onStatus(storeSnapshot, "task_progress", { taskId: t.id, kind: t.kind });
        executeTask(t, storeSnapshot, callbacks)
          .then(async (result) => {
            await postTaskResult(storeSnapshot, t.id, result);
            callbacks.onStatus(storeSnapshot, "task_done", { taskId: t.id, result });
          })
          .catch(async (err) => {
            logger.error({ err: String(err) }, "[agent-client] task execute falhou");
            const fail: TaskExecutionResult = { ok: false, errorMsg: String(err), tokensIn: 0, tokensOut: 0 };
            await postTaskResult(storeSnapshot, t.id, fail);
          });
        await sleep(500); // pequeno respiro antes do próximo poll
      } else {
        // 204-like: sem task, voltar a pollar imediatamente.
        continue;
      }
    } catch (err) {
      const msg = String(err);
      if (msg.includes("aborted")) {
        // timeout OK, volta a pollar
        continue;
      }
      logger.warn({ err: msg }, "[agent-client] long-poll fail");
      await sleep(2_000);
    }
  }
}

async function postTaskResult(store: AgentData, taskId: string, result: TaskExecutionResult): Promise<void> {
  if (!store.deviceToken) return;
  try {
    const res = await fetch(`${store.apiUrl}/api/agent/tasks/${taskId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Token": store.deviceToken },
      body: JSON.stringify(result),
    });
    if (!res.ok) {
      const body = await safeText(res);
      logger.warn({ status: res.status, body }, "[agent-client] postTaskResult error");
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "[agent-client] postTaskResult fail");
  }
}

// ---------- utils ----------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "<no body>";
  }
}

interface FetchResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

async function fetchJson<T>(url: string, init: RequestInit, label: string): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url, init);
    const status = res.status;
    if (!res.ok) {
      const body = await safeText(res);
      return { ok: false, status, error: `${label}: HTTP ${status} ${body}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status, data };
  } catch (err) {
    return { ok: false, status: 0, error: `${label}: ${String(err)}` };
  }
}
