/**
 * Provider config — Amadeus Self-Service API.
 *
 * Amadeus usa OAuth2 client_credentials:
 *   POST {baseUrl}/v1/security/oauth2/token
 *     grant_type=client_credentials
 *     client_id={AMADEUS_CLIENT_ID}
 *     client_secret={AMADEUS_CLIENT_SECRET}
 *   → { access_token, expires_in: 1799 } (~30 min)
 *
 * As chaves são lidas de:
 *   1. env var (AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET)
 *   2. config-store (configurado pelo usuário no Settings → futuro)
 *
 * Self-Service tier (test.api.amadeus.com) é grátis até ~2k calls/mês.
 * Producao (api.amadeus.com) precisa aprovação comercial.
 *
 * Doc: https://developers.amadeus.com/self-service/apis-docs
 */

import { logger } from "@kairos/core";

const CLIENT_ID = process.env.AMADEUS_CLIENT_ID?.trim() || "";
const CLIENT_SECRET = process.env.AMADEUS_CLIENT_SECRET?.trim() || "";
const ENV = (process.env.AMADEUS_ENV?.trim() || "test").toLowerCase(); // "test" | "production"

const BASE_URL =
  ENV === "production" ? "https://api.amadeus.com" : "https://test.api.amadeus.com";

export const amadeus = {
  available: CLIENT_ID.length > 0 && CLIENT_SECRET.length > 0,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  baseUrl: BASE_URL,
  env: ENV,
} as const;

// Token cache (TTL 30 min)
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/**
 * Retorna access_token válido. Renova automaticamente se expirado/inexistente.
 */
export async function getAccessToken(): Promise<string> {
  if (!amadeus.available) {
    throw new Error(
      "❌ Amadeus sem credenciais. Defina AMADEUS_CLIENT_ID e AMADEUS_CLIENT_SECRET no .env.",
    );
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.accessToken;
  }

  const res = await fetch(`${amadeus.baseUrl}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: amadeus.clientId,
      client_secret: amadeus.clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Amadeus auth ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  logger.info({ expiresIn: data.expires_in }, "amadeus: token refreshed");
  return data.access_token;
}

/** Helper: fetch autenticado pro Amadeus. */
export async function amadeusFetch<T = unknown>(
  path: string,
  query: Record<string, string | number | undefined> = {},
): Promise<T> {
  const token = await getAccessToken();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const url = `${amadeus.baseUrl}${path}${qs.toString() ? "?" + qs : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Amadeus ${res.status} ${path}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

/** Loga status no startup. */
export function logProviderStatus(): void {
  logger.info(
    {
      provider: "amadeus",
      env: amadeus.env,
      baseUrl: amadeus.baseUrl,
      available: amadeus.available,
    },
    amadeus.available
      ? `travel: amadeus provider OK (${amadeus.env})`
      : "travel: amadeus sem credenciais (defina AMADEUS_CLIENT_ID e AMADEUS_CLIENT_SECRET)",
  );
}
