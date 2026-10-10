/**
 * Provider embarcado — chave MiniMax do Pastor embutida no app.
 *
 * Por que:
 * - Cliente instala, abre, já funciona (sem onboarding, sem chave)
 * - Pastor controla custo: usageStore limita 15 msgs grátis no trial
 * - Criptografa com Electron safeStorage (chave derivada do SO — só descriptografa no PC do usuário)
 *
 * Sprint 1.20+: substitui o fluxo de "escolher provider + colar chave" no primeiro launch.
 * Após trial, mostra tela "Renove" — Pastor vende licença via central-kairos.
 *
 * Trocar a chave: atualizar BUNDLED_API_KEY abaixo e rebuildar.
 */

import { app, safeStorage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "@kairos/core";
import type { ProviderConfig } from "@kairos/agent";

/** Chave do Pastor. Para revogar, basta regenerar no painel MiniMax + rebuildar. */
const BUNDLED_API_KEY = "sk-cp-vrrgT5Bv-VpOfVV7G8ZVaG0FvBovzUOZVwEcxBBFr6cFqwNKJ48LvadhmPQj_mV39xZv9jQIlhLYbhZiMay9QMSJYdpLX5BACb0VYeYcuYfrRqbtJtcTpeY";
const BUNDLED_MODEL = "MiniMax-M3";

const STORAGE_FILE = "builtin-key.bin";

function storagePath(): string {
  return path.join(app.getPath("userData"), STORAGE_FILE);
}

/** Retorna a chave descriptografada. Na 1ª vez, criptografa e salva. */
export async function getBundledApiKey(): Promise<string> {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: retorna texto plano (plataforma sem safeStorage)
    logger.warn("safeStorage indisponível — usando chave em texto plano");
    return BUNDLED_API_KEY;
  }
  try {
    const buf = await fs.readFile(storagePath());
    return safeStorage.decryptString(buf);
  } catch {
    // 1ª inicialização: criptografa e persiste
    const encrypted = safeStorage.encryptString(BUNDLED_API_KEY);
    await fs.writeFile(storagePath(), encrypted);
    logger.info("chave MiniMax embarcada criptografada e salva em userData");
    return BUNDLED_API_KEY;
  }
}

/** Provider default que o app sempre usa. Cliente não troca. */
export async function getBundledProviderConfig(): Promise<ProviderConfig> {
  const apiKey = await getBundledApiKey();
  return {
    provider: "minimax",
    modelId: BUNDLED_MODEL,
    apiKey,
  };
}

/** Máscara da chave pra exibir no Settings (mostra só últimos 4 chars). */
export function maskApiKey(key: string | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return "•".repeat(key.length - 4) + key.slice(-4);
}
