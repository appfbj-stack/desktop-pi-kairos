/**
 * web:search — busca no DuckDuckGo (HTML interface, sem API key, sem rate limit oficial).
 *
 * Pros & cons:
 *   ✓ Zero setup
 *   ✓ Sem custo
 *   ✗ Pode bloquear se abusar (max ~50 buscas/dia por IP sem variação)
 *   ✗ HTML scraping é frágil (layout do DDG muda às vezes)
 *
 * Pra produção, troque por Tavily/Exa (mantendo mesmo tool name).
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { BROWSER_UA, truncate } from "../html.js";
import { cached } from "../cache.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("Termos da busca. Combine termos para refinar (ex: 'igrejas pequenas Brasília procurando sistema gestão')"),
  region: z
    .enum(["br-pt", "us-en", "wt-wt"])
    .default("br-pt")
    .describe("Região do DuckDuckGo"),
  limit: z.number().int().min(1).max(30).default(10),
  recency: z
    .enum(["any", "day", "week", "month", "year"])
    .default("any")
    .describe("Filtro temporal — só conteúdo recente"),
});

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchDuckDuckGo(
  query: string,
  region: string,
  recency: string,
  limit: number
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, kl: region });
  if (recency !== "any") {
    const map: Record<string, string> = {
      day: "d", week: "w", month: "m", year: "y",
    };
    const dfValue = map[recency];
    if (dfValue) params.set("df", dfValue);
  }

  const url = `https://html.duckduckgo.com/html/?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo ${response.status}: ${await response.text().then((t) => t.slice(0, 200))}`);
  }

  const html = await response.text();

  // Parse dos blocos de resultado: <div class="result ..."> ... <a class="result__a" href="...">title</a> + <a class="result__snippet">snippet</a>
  // Regex robusta o suficiente pra variações do DDG.
  const results: SearchResult[] = [];
  const resultBlockRe = /<div[^>]*class="[^"]*\bresult\b[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi;
  const blocks = html.match(resultBlockRe) ?? [];

  for (const block of blocks) {
    const titleMatch =
      block.match(/<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ??
      block.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

    const snippetMatch =
      block.match(/<a[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ??
      block.match(/<td[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);

    if (!titleMatch) continue;

    const rawUrl: string = titleMatch[1] ?? "";
    const title = stripTags(titleMatch[2] ?? "").trim();
    const snippet = snippetMatch ? stripTags(snippetMatch[1] ?? "").trim() : "";

    // DDG às vezes usa redirect via //duckduckgo.com/l/?uddg=ENCODED
    let finalUrl = rawUrl;
    if (rawUrl.includes("duckduckgo.com/l/")) {
      const m = rawUrl.match(/uddg=([^&]+)/);
      if (m && m[1]) {
        try {
          finalUrl = decodeURIComponent(m[1]);
        } catch {
          // mantém raw
        }
      }
    }

    if (!title || !finalUrl) continue;

    results.push({
      title: truncate(title, 200),
      url: finalUrl,
      snippet: truncate(snippet, 300),
    });

    if (results.length >= limit) break;
  }

  return results;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const webSearchTool: Tool<typeof inputSchema> = {
  name: "web:search",
  description:
    "Busca web no DuckDuckGo (sem API key). Retorna lista de {title, url, snippet}. " +
    "Use pra prospectar clientes, monitorar mercado, achar informação local. " +
    "Combine termos com a intenção de compra pra ter melhores resultados (ex: 'padaria pequena São Paulo querendo modernizar PDV').",
  inputSchema,
  execute: async (input) => {
    const cacheKey = `search:${input.region}:${input.recency}:${input.query}:${input.limit}`;
    const results = await cached(cacheKey, () =>
      searchDuckDuckGo(input.query, input.region, input.recency, input.limit)
    );

    return {
      query: input.query,
      count: results.length,
      results,
      tip:
        results.length === 0
          ? "Nenhum resultado. Tente reformular com termos diferentes ou region=wt-wt."
          : undefined,
    };
  },
};