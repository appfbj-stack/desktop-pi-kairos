/**
 * Agent store — persiste credenciais do agente local na central-kairos.
 *
 * Sprint 1.20 (PWA): Electron rodando como agente remoto autenticado no
 * central-kairos. Para isso, o user faz login uma vez no Electron (mesma
 * conta da PWA), o agente registra o device, recebe um OTP code, o user
 * confirma a vinculação pela PWA, e o Electron passa a:
 *   1. Mandar heartbeat a cada 30s
 *   2. Long-poll de tasks e executar
 *
 * Tudo persistido em %APPDATA%/kairos-pi/agent.json.
 */

import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "@kairos/core";

const AGENT_FILE = "agent.json";

const FILE_VERSION = 1;

export interface AgentData {
  version: number;

  /** URL da central-kairos (ex.: https://central.fbautomacao.space). */
  apiUrl: string;

  /** JWT da conta cliente (do login /api/pwa/auth/login). */
  clientJwt: string;
  /** Email logado (apenas para UI). */
  clientEmail: string;
  /** ID único do cliente no PWA SaaS (tenant_id). Vem do login response. */
  clientId: string;
  /** Data do login. */
  clientLoggedInAt: number;

  /** Device criado em /api/pwa/devices (UUID). */
  deviceId: string;
  /** Nome amigável do device (preenchido na criação). */
  deviceName: string;
  /** otpToken completo retornado pelo /api/pwa/devices (código.deviceToken). */
  otpToken: string;
  /** Apenas o código (6 primeiros chars antes do ponto). */
  otpCode: string;
  /** Status atual. */
  status: "pending" | "active" | "revoked";

  /** deviceToken retornado pelo /link/confirm. undefined até user vincular. */
  deviceToken?: string;
  /** Data de ativação. */
  activatedAt?: number;
}

interface StoredAgent extends AgentData {}

function agentPath(): string {
  return path.join(app.getPath("userData"), AGENT_FILE);
}

async function readAgent(): Promise<StoredAgent | null> {
  try {
    const raw = await fs.readFile(agentPath(), "utf-8");
    const parsed = JSON.parse(raw) as StoredAgent;
    if (parsed.version !== FILE_VERSION) {
      logger.warn({ version: parsed.version }, "agent.json: versão desconhecida, descartando");
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeAgent(data: StoredAgent): Promise<void> {
  const file = agentPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

/** Lê o agent.json sem criar. */
export async function getAgentStore(): Promise<AgentData | null> {
  return readAgent();
}

/** Persiste novo estado. Substitui completamente o anterior. */
export async function saveAgentStore(data: AgentData): Promise<void> {
  await writeAgent({ ...data, version: FILE_VERSION });
}

/** Apaga o arquivo (logout / reset). */
export async function clearAgentStore(): Promise<void> {
  try {
    await fs.unlink(agentPath());
  } catch {
    /* já não existia */
  }
}

/** Helper: extrai apenas o código (antes do ponto) do otpToken. */
export function extractOtpCode(otpToken: string): string {
  const idx = otpToken.indexOf(".");
  return idx >= 0 ? otpToken.slice(0, idx) : otpToken.slice(0, 6);
}
