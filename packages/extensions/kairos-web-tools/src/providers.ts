/**
 * Provider config — APIs de web tools.
 *
 * As chaves são lidas de:
 *   1. env var (JINA_API_KEY, BRAVE_API_KEY, FIRECRAWL_API_KEY, TAVILY_API_KEY)
 *   2. config-store (configurado pelo usuário no Settings → futuro)
 *
 * Se uma chave não estiver presente, a tool retorna mensagem amigável em vez de erro 401.
 */

import { logger } from "@kairos/core";

const JINA_KEY = process.env.JINA_API_KEY?.trim() || "";
const BRAVE_KEY = process.env.BRAVE_API_KEY?.trim() || "";
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY?.trim() || "";
const TAVILY_KEY = process.env.TAVILY_API_KEY?.trim() || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim() || "";
const PARALLEL_KEY = process.env.PARALLEL_API_KEY?.trim() || "";
const GOOGLE_PSE_KEY = process.env.GOOGLE_PSE_KEY?.trim() || "";
const GOOGLE_PSE_CX = process.env.GOOGLE_PSE_CX?.trim() || "";

export const providers = {
  jina: {
    available: JINA_KEY.length > 0,
    apiKey: JINA_KEY,
    baseUrl: "https://r.jina.ai",
  },
  brave: {
    available: BRAVE_KEY.length > 0,
    apiKey: BRAVE_KEY,
    baseUrl: "https://api.search.brave.com",
  },
  firecrawl: {
    available: FIRECRAWL_KEY.length > 0,
    apiKey: FIRECRAWL_KEY,
    baseUrl: "https://api.firecrawl.dev",
  },
  tavily: {
    available: TAVILY_KEY.length > 0,
    apiKey: TAVILY_KEY,
    baseUrl: "https://api.tavily.com",
  },
  openai: {
    available: OPENAI_KEY.length > 0,
    apiKey: OPENAI_KEY,
    baseUrl: "https://api.openai.com/v1",
  },
  parallel: {
    available: PARALLEL_KEY.length > 0,
    apiKey: PARALLEL_KEY,
    baseUrl: "https://api.parallel.ai",
  },
  google_pse: {
    available: GOOGLE_PSE_KEY.length > 0 && GOOGLE_PSE_CX.length > 0,
    apiKey: GOOGLE_PSE_KEY,
    searchEngineId: GOOGLE_PSE_CX,
    baseUrl: "https://www.googleapis.com/customsearch/v1",
  },
  /** Provider keyless: scraping básico de páginas HTML via fetch puro.
   *  Não funciona em sites com JS ou anti-bot, mas não precisa de key. */
  direct: {
    available: true,
  },
  /** Provider keyless: busca via DuckDuckGo HTML (lite.duckduckgo.com).
   *  Menos resultados que Google mas zero config. */
  ddg: {
    available: true,
  },
} as const;

/** Loga status dos providers no startup (sem expor a key). */
export function logProviderStatus(): void {
  for (const [name, p] of Object.entries(providers)) {
    logger.info(
      { provider: name, available: p.available },
      p.available
        ? `web-tools: ${name} provider OK`
        : `web-tools: ${name} sem API key (defina ${name.toUpperCase()}_API_KEY)`,
    );
  }
}

/** Helper: erro amigável quando provider não tem key. */
export function missingKeyError(provider: keyof typeof providers, envVar: string): string {
  return `❌ Provider ${provider} sem API key. Defina ${envVar} no .env ou variável de ambiente.`;
}
