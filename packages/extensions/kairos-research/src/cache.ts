/**
 * Cache singleton de resultados de busca (TTL simples em memória).
 *
 * Evita bater no DuckDuckGo repetidamente pra mesma query.
 * Pra produção longa, migrar pra SQLite em <workspace>/kairos-research-cache.db.
 */

interface Entry<T> {
  data: T;
  expiresAt: number;
}

const STORE = new Map<string, Entry<unknown>>();

/** Retorna cached se ainda válido, senão executa fn e cacheia. */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = 1000 * 60 * 30 // 30 min default
): Promise<T> {
  const cached = STORE.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }
  const data = await fn();
  STORE.set(key, { data, expiresAt: Date.now() + ttlMs });
  // Limpa entradas expiradas periodicamente
  if (STORE.size > 1000) {
    const now = Date.now();
    for (const [k, v] of STORE.entries()) {
      if (v.expiresAt <= now) STORE.delete(k);
    }
  }
  return data;
}

/** Limpa todo cache (útil pra testes). */
export function clearCache(): void {
  STORE.clear();
}