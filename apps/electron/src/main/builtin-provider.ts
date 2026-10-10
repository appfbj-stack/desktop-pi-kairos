/**
 * Provider embarcado — chave MiniMax do Pastor embutida no app.
 *
 * v0.4+: Sem safeStorage. Texto plano direto.
 * Por que: safeStorage usa DPAPI (chave por usuário/PC do Windows).
 * Em outro PC, o blob criptografado de userData não descriptografa.
 * Resultado: cliente instalou em outra máquina, app travou, "LLM não respondeu".
 *
 * Trade-off honesto: a chave está no bundle (.asar). Quem descompactar
 * o .asar acha ela. Isso é inevitável para um app white-label distribuído
 * por link — Pastor controla custo via central-kairos (counter server-side).
 *
 * Cliente que NÃO quer usar a chave bundled: Settings → "Usar minha chave"
 * (BYOK) → escolhe OpenAI/Anthropic/OpenRouter/Gemini e cola a própria.
 */

import { logger } from "@kairos/core";
import type { ProviderConfig } from "@kairos/agent";

/** Chave do Pastor. Para revogar, regenerar no painel MiniMax + rebuildar. */
const BUNDLED_API_KEY = "sk-cp-vrrgT5Bv-VpOfVV7G8ZVaG0FvBovzUOZVwEcxBBFr6cFqwNKJ48LvadhmPQj_mV39xZv9jQIlhLYbhZiMay9QMSJYdpLX5BACb0VYeYcuYfrRqbtJtcTpeY";
const BUNDLED_PROVIDER = "minimax";
const BUNDLED_MODEL = "MiniMax-M3";

/** Retorna a chave bundled direto, sem criptografia. */
export function getBundledApiKey(): string {
  return BUNDLED_API_KEY;
}

/** Provider default que o app sempre usa se cliente não configurar BYOK. */
export function getBundledProviderConfig(): ProviderConfig {
  return {
    provider: BUNDLED_PROVIDER,
    modelId: BUNDLED_MODEL,
    apiKey: BUNDLED_API_KEY,
  };
}

/**
 * Detecta se a config atual está usando a chave bundled do Pastor.
 * Usado pelo Settings pra mostrar o banner "Modo bundled (MiniMax do Pastor)".
 */
export function isUsingBundledKey(provider: ProviderConfig): boolean {
  return provider.provider === BUNDLED_PROVIDER && provider.apiKey === BUNDLED_API_KEY;
}

/** Máscara da chave pra exibir no Settings (últimos 4 chars). */
export function maskApiKey(key: string | undefined): string {
  if (!key) return "vazio";
  if (key.length <= 8) return "•".repeat(key.length);
  return "•".repeat(key.length - 4) + key.slice(-4);
}

logger.info({ provider: BUNDLED_PROVIDER, model: BUNDLED_MODEL }, "builtin-provider pronto (chave bundled, sem criptografia)");
