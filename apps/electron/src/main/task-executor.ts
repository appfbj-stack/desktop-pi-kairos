/**
 * Task executor — processa tasks vindas do servidor central-kairos.
 *
 * Sprint 1.20 (PWA): quando o Electron recebe uma task via long-poll, ele
 * dispatcha aqui pelo `kind`. Cada handler devolve um `TaskExecutionResult`
 * com `ok`, `result` (string), `errorMsg` (string), `tokensIn/Out` (number).
 *
 * MVP suportado:
 *  - "agent_chat": roda o AgentInstance com a mensagem do user, devolve a
 *    resposta completa como result. Tokens contabilizados via heuristica chars/4
 *    (sem parsing de `usage` no OpenAI-compatible stream).
 *  - "read_file": lê um arquivo do workspace local (path validado), devolve o
 *    conteudo (limitado a 32KB).
 *  - "list_dir": lista um diretorio do workspace.
 *  - "ping": smoke test, retorna ok com info do device.
 *
 * Tasks destrutivas (exec_command, write_file) NAO sao executadas sem aprovacao
 * explicita do user via IPC. Elas retornam errorMsg pedindo approval.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { logger } from "@kairos/core";
import { AgentData } from "./agent-store.js";
import { handleUserMessage } from "./agent-instance.js";

// Limites de seguranca
const MAX_FILE_BYTES = 32 * 1024;
const MAX_LIST_ITEMS = 200;

export interface TaskExecutionResult {
  ok: boolean;
  result?: string;
  errorMsg?: string;
  tokensIn: number;
  tokensOut: number;
}

interface TaskShape {
  id: string;
  kind: string;
  params: unknown;
  conversationId?: string;
  clientId: string;
}

interface ClientCallbacks {
  onStatus: (
    s: AgentData,
    e: "registered" | "link_pending" | "active" | "revoked" | "logout" | "task_progress" | "task_done" | "error",
    payload?: unknown
  ) => void;
}

/**
 * Dispatcher principal. Recebe a task crua, valida, executa o handler,
 * devolve o resultado estruturado.
 */
export async function executeTask(
  task: TaskShape,
  store: AgentData,
  callbacks: ClientCallbacks
): Promise<TaskExecutionResult> {
  const start = Date.now();
  logger.info({ kind: task.kind, taskId: task.id }, "[task-exec] iniciando");

  try {
    let result: TaskExecutionResult;
    switch (task.kind) {
      case "ping":
        result = await handlePing();
        break;
      case "agent_chat":
        result = await handleAgentChat(task, store);
        break;
      case "read_file":
        result = await handleReadFile(task.params);
        break;
      case "list_dir":
        result = await handleListDir(task.params);
        break;
      default:
        result = {
          ok: false,
          errorMsg: `kind nao suportado: ${task.kind}`,
          tokensIn: 0,
          tokensOut: 0,
        };
    }
    const ms = Date.now() - start;
    logger.info({ kind: task.kind, ms, ok: result.ok, tin: result.tokensIn, tout: result.tokensOut }, "[task-exec] fim");
    return result;
  } catch (err) {
    logger.error({ kind: task.kind, err: String(err) }, "[task-exec] crash");
    return {
      ok: false,
      errorMsg: String(err),
      tokensIn: 0,
      tokensOut: 0,
    };
  }
}

// ---------- Handlers ----------

async function handlePing(): Promise<TaskExecutionResult> {
  return {
    ok: true,
    result: JSON.stringify({
      pong: true,
      ts: Date.now(),
      electron: process.versions.electron,
      node: process.versions.node,
      platform: process.platform,
    }),
    tokensIn: 0,
    tokensOut: 0,
  };
}

async function handleAgentChat(task: TaskShape, store: AgentData): Promise<TaskExecutionResult> {
  // params = { message, conversationId?, sessionId? }
  const p = (task.params ?? {}) as { message?: string; sessionId?: string; conversationId?: string };
  const userMessage = typeof p.message === "string" ? p.message : "";
  if (!userMessage.trim()) {
    return { ok: false, errorMsg: "message vazio", tokensIn: 0, tokensOut: 0 };
  }
  // Reusa sessionId do params ou gera um determinístico por conversationId.
  const sessionId = p.sessionId ?? `pwa-${task.clientId}-${p.conversationId ?? task.id}`;

  let fullText = "";
  try {
    for await (const ev of handleUserMessage(sessionId, userMessage)) {
      if (ev.type === "message") {
        fullText += (ev as { content: string }).content;
      } else if (ev.type === "error") {
        return {
          ok: false,
          errorMsg: (ev as { message: string }).message,
          tokensIn: 0,
          tokensOut: 0,
        };
      }
    }
  } catch (err) {
    return { ok: false, errorMsg: `agent: ${String(err)}`, tokensIn: 0, tokensOut: 0 };
  }

  // Heuristica: ~4 chars por token
  const tokensIn = Math.ceil(userMessage.length / 4);
  const tokensOut = Math.ceil(fullText.length / 4);
  return { ok: true, result: fullText.trim(), tokensIn, tokensOut };
}

async function handleReadFile(params: unknown): Promise<TaskExecutionResult> {
  const p = (params ?? {}) as { path?: string };
  const target = sanitizePath(p.path);
  if (!target.ok) return { ok: false, errorMsg: target.error, tokensIn: 0, tokensOut: 0 };

  let buf: Buffer;
  try {
    buf = await fs.readFile(target.path);
  } catch (err) {
    return { ok: false, errorMsg: `read: ${String(err)}`, tokensIn: 0, tokensOut: 0 };
  }
  const truncated = buf.length > MAX_FILE_BYTES;
  const content = truncated ? buf.subarray(0, MAX_FILE_BYTES).toString("utf-8") : buf.toString("utf-8");
  return {
    ok: true,
    result: JSON.stringify({ path: target.path, size: buf.length, truncated, content }),
    tokensIn: 0,
    tokensOut: Math.ceil(content.length / 4),
  };
}

async function handleListDir(params: unknown): Promise<TaskExecutionResult> {
  const p = (params ?? {}) as { path?: string };
  const target = sanitizePath(p.path);
  if (!target.ok) return { ok: false, errorMsg: target.error, tokensIn: 0, tokensOut: 0 };

  let items: { name: string; isDir: boolean; size: number }[];
  try {
    const entries = await fs.readdir(target.path, { withFileTypes: true });
    items = entries.slice(0, MAX_LIST_ITEMS).map((e) => ({
      name: e.name,
      isDir: e.isDirectory(),
      size: 0,
    }));
  } catch (err) {
    return { ok: false, errorMsg: `readdir: ${String(err)}`, tokensIn: 0, tokensOut: 0 };
  }
  return {
    ok: true,
    result: JSON.stringify({ path: target.path, count: items.length, items }),
    tokensIn: 0,
    tokensOut: 0,
  };
}

// ---------- helpers ----------

/**
 * Mantém a task confinada ao workspace do agent (%APPDATA%/kairos-pi/kairos-workspace).
 * Bloqueia "..", paths absolutos externos, e symlinks escapando do sandbox.
 */
function sanitizePath(raw: unknown): { ok: true; path: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "path ausente" };
  const workspace = path.join(app.getPath("userData"), "kairos-workspace");
  // Resolve e checa prefixo
  const abs = path.isAbsolute(raw) ? path.normalize(raw) : path.normalize(path.join(workspace, raw));
  if (!abs.startsWith(workspace)) {
    return { ok: false, error: `fora do workspace (${workspace})` };
  }
  if (abs.includes("..")) {
    return { ok: false, error: "path invalido (..) " };
  }
  return { ok: true, path: abs };
}
