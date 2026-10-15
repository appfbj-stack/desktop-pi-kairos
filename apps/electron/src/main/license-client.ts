/**
 * License client — consulta central-kairos sobre uso/licença do app.
 *
 * Endpoint: POST https://central.fbautomacao.space/api/public/installation/:id/check-usage
 *   - INCREMENTA usageUsed server-side
 *   - Retorna { allowed, plan, usageLimit, usageUsed, remaining, blocked, reason, currentPeriodEnd, renewUrl }
 *
 * Falha de rede → cache offline de 24h (last-known-status.json)
 *
 * v0.3.0+: este é o enforcement REAL. O usage-store local é só fallback/telemetria.
 */

import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "@kairos/core";

const CENTRAL_BASE = process.env.KAIROS_CENTRAL_URL || "https://central.fbautomacao.space";
const CACHE_FILE = "license-cache.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h grace offline
const REQUEST_TIMEOUT_MS = 5000;

export interface LicenseStatus {
  allowed: boolean;
  blocked: boolean;
  plan: "FREE" | "BASIC" | "PRO" | "ULTRA" | "ENTERPRISE" | "UNKNOWN";
  usageLimit: number;
  usageUsed: number;
  remaining: number;
  reason: string | null;
  currentPeriodEnd: string | null;
  renewUrl: string;
  source: "server" | "cache" | "local-fallback";
  cachedAt?: number;
  // Sprint 2026-10-15
  tokensLimit: number;
  tokensUsed: number;
  tokensRemaining: number;
  outputTokenCap: number;
  periodType: "DAILY" | "MONTHLY";
}

interface CachedStatus {
  cachedAt: number;
  status: LicenseStatus;
}

function cachePath(): string {
  return path.join(app.getPath("userData"), CACHE_FILE);
}

async function readCache(): Promise<CachedStatus | null> {
  try {
    const raw = await fs.readFile(cachePath(), "utf-8");
    return JSON.parse(raw) as CachedStatus;
  } catch {
    return null;
  }
}

async function writeCache(status: LicenseStatus): Promise<void> {
  const file = cachePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  const data: CachedStatus = { cachedAt: Date.now(), status };
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

interface CheckUsageResponse {
  installation_id: string;
  allowed: boolean;
  plan: string;
  usageLimit: number;
  usageUsed: number;
  remaining: number;
  blocked: boolean;
  reason: string | null;
  currentPeriodEnd: string | null;
  renewUrl: string;
  tokensLimit?: number;
  tokensUsed?: number;
  tokensRemaining?: number;
  outputTokenCap?: number;
  periodType?: "DAILY" | "MONTHLY";
}

/**
 * Verifica se pode usar mais 1 mensagem. INCREMENTA o counter server-side.
 * Em caso de falha de rede, usa cache de até 24h.
 * Se sem cache, libera (grace online-required).
 */
export async function checkUsage(installationId: string): Promise<LicenseStatus> {
  const url = `${CENTRAL_BASE}/api/public/installation/${encodeURIComponent(installationId)}/check-usage`;

  // Tenta servidor
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = (await res.json()) as CheckUsageResponse;
    const status: LicenseStatus = {
      allowed: data.allowed,
      blocked: data.blocked,
      plan: data.plan as LicenseStatus["plan"],
      usageLimit: data.usageLimit,
      usageUsed: data.usageUsed,
      remaining: data.remaining,
      reason: data.reason,
      currentPeriodEnd: data.currentPeriodEnd,
      renewUrl: data.renewUrl,
      tokensLimit: data.tokensLimit ?? 30000,
      tokensUsed: data.tokensUsed ?? 0,
      tokensRemaining: data.tokensRemaining ?? 30000,
      outputTokenCap: data.outputTokenCap ?? 500,
      periodType: data.periodType ?? "DAILY",
      source: "server",
    };

    // Cacheia pra fallback offline
    await writeCache(status).catch((e) => logger.warn({ e: String(e) }, "falha ao cachear license"));

    logger.info(
      { installationId, plan: status.plan, used: status.usageUsed, remaining: status.remaining, blocked: status.blocked },
      "license check (server)"
    );
    return status;
  } catch (e) {
    // Falha de rede → tenta cache
    const cache = await readCache();
    if (cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
      const cached: LicenseStatus = { ...cache.status, source: "cache", cachedAt: cache.cachedAt };
      logger.warn(
        { installationId, cachedAt: cache.cachedAt, reason: String(e) },
        "license check (cache offline)"
      );
      return cached;
    }

    // Sem cache válido → libera (Pastor pode decidir bloquear depois se quiser)
    logger.warn({ installationId, error: String(e) }, "license check falhou sem cache — liberando por padrão");
    return {
      allowed: true,
      blocked: false,
      plan: "UNKNOWN",
      usageLimit: 999999,
      usageUsed: 0,
      remaining: 999999,
      reason: `Sem conexão: ${String(e)}`,
      currentPeriodEnd: null,
      renewUrl: `${CENTRAL_BASE}`,
      tokensLimit: 999999,
      tokensUsed: 0,
      tokensRemaining: 999999,
      outputTokenCap: 4000,
      periodType: "MONTHLY",
      source: "local-fallback",
    };
  }
}

/** Apenas lê status, sem incrementar (pra UI banner). */
export async function getLicenseStatus(installationId: string): Promise<LicenseStatus> {
  const url = `${CENTRAL_BASE}/api/public/installation/${encodeURIComponent(installationId)}/status`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as {
      installation_id: string;
      status: string;
      plan: string;
      usageLimit: number;
      usageUsed: number;
      remaining: number;
      currentPeriodEnd: string | null;
      tokensLimit?: number;
      tokensUsed?: number;
      tokensRemaining?: number;
      outputTokenCap?: number;
      periodType?: "DAILY" | "MONTHLY";
    };

    return {
      allowed: data.status === "active" && data.remaining > 0,
      blocked: data.status === "blocked" || data.remaining <= 0,
      plan: data.plan as LicenseStatus["plan"],
      usageLimit: data.usageLimit,
      usageUsed: data.usageUsed,
      remaining: data.remaining,
      reason: null,
      currentPeriodEnd: data.currentPeriodEnd,
      renewUrl: `${CENTRAL_BASE}`,
      tokensLimit: data.tokensLimit ?? 30000,
      tokensUsed: data.tokensUsed ?? 0,
      tokensRemaining: data.tokensRemaining ?? 30000,
      outputTokenCap: data.outputTokenCap ?? 500,
      periodType: data.periodType ?? "DAILY",
      source: "server",
    };
  } catch (e) {
    const cache = await readCache();
    if (cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
      return { ...cache.status, source: "cache", cachedAt: cache.cachedAt };
    }
    return {
      allowed: true,
      blocked: false,
      plan: "UNKNOWN",
      usageLimit: 999999,
      usageUsed: 0,
      remaining: 999999,
      reason: `Sem conexão: ${String(e)}`,
      currentPeriodEnd: null,
      renewUrl: `${CENTRAL_BASE}`,
      tokensLimit: 999999,
      tokensUsed: 0,
      tokensRemaining: 999999,
      outputTokenCap: 4000,
      periodType: "MONTHLY",
      source: "local-fallback",
    };
  }
}
