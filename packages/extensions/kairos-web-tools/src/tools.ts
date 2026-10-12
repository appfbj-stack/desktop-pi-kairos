/**
 * Web tools — 5 tools nativas que usam APIs REST direto (sem dependência do Pi).
 *
 * 1. web_scrape   — Jina Reader: extrai markdown limpo de qualquer URL
 * 2. web_extract  — Jina com respond-with-schema: extrai dados estruturados seguindo JSON schema (mask template!)
 * 3. web_search   — Brave ou Tavily: busca na web com snippet + URL
 * 4. web_crawl    — Firecrawl: crawl recursivo de site
 * 5. web_youtube  — Jina Reader: transcrição/entendimento de vídeo YouTube
 *
 * Cada tool retorna string (markdown ou JSON) que o LLM pode usar diretamente.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { logger } from "@kairos/core";
import { providers, missingKeyError } from "./providers.js";

// ============================================================================
// 1. web_scrape — Jina Reader (markdown limpo)
// ============================================================================

const ScrapeInput = z.object({
  url: z.string().url().describe("URL da página a raspar"),
  maxChars: z.number().int().min(100).max(200000).default(50000)
    .describe("Tamanho máximo do markdown retornado (default 50k)"),
});

async function jinaReader(url: string, maxChars: number): Promise<string> {
  if (!providers.jina.available) {
    throw new Error(missingKeyError("jina", "JINA_API_KEY"));
  }
  const target = `${providers.jina.baseUrl}/${url}`;
  const res = await fetch(target, {
    headers: {
      "Authorization": `Bearer ${providers.jina.apiKey}`,
      "X-Return-Format": "markdown",
      "X-Timeout": "30",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jina Reader ${res.status}: ${text.slice(0, 300)}`);
  }
  const md = await res.text();
  return md.length > maxChars ? md.slice(0, maxChars) + "\n\n[…truncado em " + maxChars + " chars]" : md;
}

export const webScrape: Tool = {
  name: "web_scrape",
  description:
    "Raspa uma URL e retorna o conteúdo em markdown limpo (sem ads, sem nav, sem boilerplate). " +
    "Use para ler páginas web, artigos, documentação, etc. Provider: Jina Reader.",
  inputSchema: ScrapeInput,
  execute: async (input) => {
    const { url, maxChars } = ScrapeInput.parse(input);
    logger.info({ url, maxChars }, "web_scrape iniciado");
    const md = await jinaReader(url, maxChars);
    logger.info({ url, len: md.length }, "web_scrape OK");
    return md;
  },
};

// ============================================================================
// 2. web_extract — Jina com respond-with-schema (MASK TEMPLATE!)
// ============================================================================

const ExtractInput = z.object({
  url: z.string().url().describe("URL da página"),
  schema: z.record(z.any())
    .describe("JSON Schema descrevendo os campos a extrair. " +
      "Exemplo: {type:'object',properties:{title:{type:'string'},price:{type:'number'}},required:['title','price']}"),
  schemaName: z.string().min(1).default("extracted")
    .describe("Nome do schema (apenas para organização; default 'extracted')"),
});

export const webExtract: Tool = {
  name: "web_extract",
  description:
    "Lê uma URL e extrai dados estruturados seguindo um JSON Schema (mask template). " +
    "Retorna o JSON preenchido com os campos que a página tem. " +
    "Exemplo: schema={type:'object',properties:{preco:{type:'number'},titulo:{type:'string'}}}. " +
    "Provider: Jina Reader (respond-with-schema).",
  inputSchema: ExtractInput,
  execute: async (input) => {
    const { url, schema, schemaName } = ExtractInput.parse(input);
    if (!providers.jina.available) {
      throw new Error(missingKeyError("jina", "JINA_API_KEY"));
    }
    logger.info({ url, schemaName }, "web_extract iniciado");
    const target = `${providers.jina.baseUrl}/${url}`;
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${providers.jina.apiKey}`,
        "Content-Type": "application/json",
        "X-Respond-With": "json",
        "X-Respond-With-Schema": JSON.stringify(schema),
        "X-Respond-With-Schema-Name": schemaName,
      },
      body: "{}",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Jina Extract ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const out = JSON.stringify(data, null, 2);
    logger.info({ url, schemaName, len: out.length }, "web_extract OK");
    return out;
  },
};

// ============================================================================
// 3. web_search — Brave (primary) ou Tavily (fallback)
// ============================================================================

const SearchInput = z.object({
  query: z.string().min(2).describe("Termos de busca"),
  count: z.number().int().min(1).max(20).default(5)
    .describe("Quantos resultados (default 5)"),
});

interface SearchResult { title: string; url: string; snippet: string; }

async function braveSearch(query: string, count: number): Promise<SearchResult[]> {
  if (!providers.brave.available) throw new Error(missingKeyError("brave", "BRAVE_API_KEY"));
  const url = `${providers.brave.baseUrl}/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  const res = await fetch(url, { headers: { "X-Subscription-Token": providers.brave.apiKey } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brave Search ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json() as { web?: { results?: { title: string; url: string; description: string }[] } };
  return (data.web?.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.description }));
}

async function tavilySearch(query: string, count: number): Promise<SearchResult[]> {
  if (!providers.tavily.available) throw new Error(missingKeyError("tavily", "TAVILY_API_KEY"));
  const res = await fetch(`${providers.tavily.baseUrl}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: providers.tavily.apiKey, query, max_results: count, include_answer: false }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tavily Search ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json() as { results?: { title: string; url: string; content: string }[] };
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content }));
}

export const webSearch: Tool = {
  name: "web_search",
  description:
    "Busca na web e retorna lista de resultados com título, URL e snippet. " +
    "Provider: Brave (preferido) ou Tavily (fallback se Brave não configurado). " +
    "Requer BRAVE_API_KEY ou TAVILY_API_KEY.",
  inputSchema: SearchInput,
  execute: async (input) => {
    const { query, count } = SearchInput.parse(input);
    logger.info({ query, count }, "web_search iniciado");
    let results: SearchResult[];
    if (providers.brave.available) {
      results = await braveSearch(query, count);
    } else if (providers.tavily.available) {
      results = await tavilySearch(query, count);
    } else {
      throw new Error("❌ Nenhum provider de busca configurado. Defina BRAVE_API_KEY ou TAVILY_API_KEY.");
    }
    logger.info({ query, count: results.length }, "web_search OK");
    if (results.length === 0) return "Nenhum resultado encontrado.";
    return results.map((r, i) =>
      `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`,
    ).join("\n\n");
  },
};

// ============================================================================
// 4. web_crawl — Firecrawl (crawl recursivo de site)
// ============================================================================

const CrawlInput = z.object({
  url: z.string().url().describe("URL inicial do crawl"),
  maxPages: z.number().int().min(1).max(50).default(5)
    .describe("Máximo de páginas a raspar (default 5)"),
  prompt: z.string().optional()
    .describe("Prompt opcional para extrair info específica de cada página (usa LLM do Firecrawl)"),
});

interface CrawlPage { url: string; title?: string; markdown?: string; }

async function firecrawlCrawl(url: string, maxPages: number, prompt?: string): Promise<CrawlPage[]> {
  if (!providers.firecrawl.available) {
    throw new Error(missingKeyError("firecrawl", "FIRECRAWL_API_KEY"));
  }
  // 1) inicia o crawl
  const startRes = await fetch(`${providers.firecrawl.baseUrl}/v1/crawl`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${providers.firecrawl.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      limit: maxPages,
      ...(prompt ? { prompt } : {}),
      scrapeOptions: { formats: ["markdown"] },
    }),
  });
  if (!startRes.ok) {
    const text = await startRes.text().catch(() => "");
    throw new Error(`Firecrawl start ${startRes.status}: ${text.slice(0, 300)}`);
  }
  const { id } = await startRes.json() as { id: string };

  // 2) poll status
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    await new Promise((r) => setTimeout(r, 3_000));
    const stRes = await fetch(`${providers.firecrawl.baseUrl}/v1/crawl/${id}`, {
      headers: { "Authorization": `Bearer ${providers.firecrawl.apiKey}` },
    });
    if (!stRes.ok) {
      const text = await stRes.text().catch(() => "");
      throw new Error(`Firecrawl status ${stRes.status}: ${text.slice(0, 300)}`);
    }
    const st = await stRes.json() as { status: string; data?: CrawlPage[]; completed?: number; total?: number };
    if (st.status === "completed") return st.data ?? [];
    if (st.status === "failed") throw new Error(`Firecrawl crawl failed`);
    logger.info({ id, completed: st.completed, total: st.total }, "firecrawl polling");
  }
  throw new Error("Firecrawl crawl timeout (120s)");
}

export const webCrawl: Tool = {
  name: "web_crawl",
  description:
    "Faz crawl recursivo de um site (segue links internos) e retorna markdown de cada página. " +
    "Mais lento que web_scrape, mas pega múltiplas páginas. " +
    "Provider: Firecrawl. Requer FIRECRAWL_API_KEY.",
  inputSchema: CrawlInput,
  execute: async (input) => {
    const { url, maxPages, prompt } = CrawlInput.parse(input);
    logger.info({ url, maxPages, hasPrompt: !!prompt }, "web_crawl iniciado");
    const pages = await firecrawlCrawl(url, maxPages, prompt);
    logger.info({ url, count: pages.length }, "web_crawl OK");
    if (pages.length === 0) return "Nenhuma página encontrada.";
    return pages.map((p, i) =>
      `## ${i + 1}. ${p.title ?? p.url}\nURL: ${p.url}\n\n${(p.markdown ?? "").slice(0, 3000)}${(p.markdown?.length ?? 0) > 3000 ? "\n[…truncado]" : ""}`,
    ).join("\n\n---\n\n");
  },
};

// ============================================================================
// 5. web_youtube — Jina Reader (transcrição/understanding de YouTube)
// ============================================================================

const YoutubeInput = z.object({
  url: z.string().url().describe("URL do vídeo YouTube (youtube.com/watch?v=... ou youtu.be/...)"),
  question: z.string().optional()
    .describe("Pergunta específica sobre o vídeo (opcional; se não passar, retorna a transcrição)"),
  maxChars: z.number().int().min(100).max(100000).default(20000)
    .describe("Tamanho máximo do retorno (default 20k)"),
});

export const webYoutube: Tool = {
  name: "web_youtube",
  description:
    "Lê um vídeo do YouTube e retorna transcrição ou resposta a uma pergunta. " +
    "Se passar `question`, o Jina usa o Gemini pra responder baseado no vídeo. " +
    "Provider: Jina Reader (s/ YouTube).",
  inputSchema: YoutubeInput,
  execute: async (input) => {
    const { url, question, maxChars } = YoutubeInput.parse(input);
    if (!providers.jina.available) {
      throw new Error(missingKeyError("jina", "JINA_API_KEY"));
    }
    logger.info({ url, hasQuestion: !!question }, "web_youtube iniciado");
    const target = `${providers.jina.baseUrl}/${url}`;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${providers.jina.apiKey}`,
      "X-Return-Format": "markdown",
      "X-Timeout": "60",
    };
    if (question) headers["X-With-Generated-Alt"] = "true";
    const res = await fetch(target, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Jina YouTube ${res.status}: ${text.slice(0, 300)}`);
    }
    const md = await res.text();
    const out = md.length > maxChars ? md.slice(0, maxChars) + "\n\n[…truncado]" : md;
    logger.info({ url, len: out.length }, "web_youtube OK");
    return out;
  },
};

// ============================================================================
// Aggregate
// ============================================================================

export const allTools: Tool[] = [webScrape, webExtract, webSearch, webCrawl, webYoutube];
