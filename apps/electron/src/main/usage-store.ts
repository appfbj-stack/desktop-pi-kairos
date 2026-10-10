/**
 * Usage store — controla o limite de mensagens grátis do trial.
 *
 * Sprint 1.20+: Pastor vende Kairós Desktop Alves como produto.
 * Cada cliente recebe 15 mensagens grátis pra avaliar. Após isso,
 * bloqueia e mostra tela "Renove".
 *
 * Persistência: %APPDATA%/kairos-pi/usage.json
 * Reset: a cada novo release (Pastor rebuilda + republish) o contador
 *        começa de novo. Pra reset mensal, central-kairos (próxima fase).
 */

import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "@kairos/core";

const USAGE_FILE = "usage.json";
const FREE_LIMIT = 15;

interface UsageState {
  version: 1;
  messagesUsed: number;
  firstUseAt: number;
}

function usagePath(): string {
  return path.join(app.getPath("userData"), USAGE_FILE);
}

async function readUsage(): Promise<UsageState> {
  try {
    const raw = await fs.readFile(usagePath(), "utf-8");
    const parsed = JSON.parse(raw) as UsageState;
    if (parsed.version !== 1) throw new Error("versão desconhecida");
    return parsed;
  } catch {
    // 1ª execução — inicializa
    return {
      version: 1,
      messagesUsed: 0,
      firstUseAt: Date.now(),
    };
  }
}

async function writeUsage(state: UsageState): Promise<void> {
  const file = usagePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

export interface UsageStatus {
  used: number;
  limit: number;
  remaining: number;
  blocked: boolean;
  firstUseAt: number;
}

export async function getUsageStatus(): Promise<UsageStatus> {
  const state = await readUsage();
  return {
    used: state.messagesUsed,
    limit: FREE_LIMIT,
    remaining: Math.max(0, FREE_LIMIT - state.messagesUsed),
    blocked: state.messagesUsed >= FREE_LIMIT,
    firstUseAt: state.firstUseAt,
  };
}

/** Incrementa contador. Retorna o novo status. Se já bloqueado, não incrementa. */
export async function incrementUsage(): Promise<UsageStatus> {
  const state = await readUsage();
  if (state.messagesUsed >= FREE_LIMIT) {
    logger.warn({ used: state.messagesUsed, limit: FREE_LIMIT }, "uso já no limite, ignorando increment");
    return {
      used: state.messagesUsed,
      limit: FREE_LIMIT,
      remaining: 0,
      blocked: true,
      firstUseAt: state.firstUseAt,
    };
  }
  state.messagesUsed += 1;
  await writeUsage(state);
  logger.info({ used: state.messagesUsed, limit: FREE_LIMIT }, "uso incrementado");
  return {
    used: state.messagesUsed,
    limit: FREE_LIMIT,
    remaining: Math.max(0, FREE_LIMIT - state.messagesUsed),
    blocked: state.messagesUsed >= FREE_LIMIT,
    firstUseAt: state.firstUseAt,
  };
}

/** Reseta o contador (uso admin/dev). Não usado em produção. */
export async function resetUsage(): Promise<UsageStatus> {
  const fresh: UsageState = { version: 1, messagesUsed: 0, firstUseAt: Date.now() };
  await writeUsage(fresh);
  logger.info("uso resetado");
  return {
    used: 0,
    limit: FREE_LIMIT,
    remaining: FREE_LIMIT,
    blocked: false,
    firstUseAt: fresh.firstUseAt,
  };
}
