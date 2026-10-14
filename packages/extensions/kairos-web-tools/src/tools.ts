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

/** Direct fetch (keyless) — funciona só em sites sem JS/anti-bot. */
async function directScrape(url: string, maxChars: number): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Kairós/0.5)" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Direct fetch ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/html") && !ct.includes("text/plain")) {
    return `[Tipo de conteúdo: ${ct}]\n\n${(await res.text()).slice(0, maxChars)}`;
  }
  const html = await res.text();
  // Converte HTML pra pseudo-markdown (remove tags, mantém texto)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > maxChars ? text.slice(0, maxChars) + "\n\n[…truncado em " + maxChars + " chars]" : text;
}

export const webScrape: Tool = {
  name: "web_scrape",
  description:
    "Raspa uma URL e retorna o conteúdo em markdown limpo (sem ads, sem nav, sem boilerplate). " +
    "Providers (em ordem): Jina Reader (melhor qualidade) → Direct fetch (keyless, sem API). " +
    "Se nenhum provider com key estiver configurado, usa direct (não requer key, mas pode falhar em sites com JS).",
  inputSchema: ScrapeInput,
  execute: async (input) => {
    const { url, maxChars } = ScrapeInput.parse(input);
    logger.info({ url, maxChars }, "web_scrape iniciado");
    let md = "";
    let provider = "none";
    if (providers.jina.available) {
      try {
        md = await jinaReader(url, maxChars);
        provider = "jina";
      } catch (e: any) {
        logger.warn({ err: String(e) }, "web_scrape: jina falhou, tentando direct");
      }
    }
    if (!md) {
      try {
        md = await directScrape(url, maxChars);
        provider = "direct";
      } catch (e: any) {
        throw new Error(`web_scrape falhou (jina+direct): ${e.message?.slice(0, 200)}`);
      }
    }
    logger.info({ url, len: md.length, provider }, "web_scrape OK");
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

/** OpenAI: usa o gpt-4o com web search tool (busca real) */
async function openaiSearch(query: string, count: number): Promise<SearchResult[]> {
  if (!providers.openai.available) throw new Error(missingKeyError("openai", "OPENAI_API_KEY"));
  const res = await fetch(`${providers.openai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${providers.openai.apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-search-preview",
      web_search_options: { search_context_size: "medium" },
      messages: [{ role: "user", content: query }],
      max_tokens: 2000,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI search ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  // OpenAI devolve texto + annotations com URLs. Parse simples:
  const msg = data.choices?.[0]?.message;
  const content = msg?.content || "";
  const annotations = msg?.annotations || [];
  const urls: Array<{ title: string; url: string; snippet: string }> = [];
  for (const ann of annotations) {
    if (ann.url_citation?.url) {
      urls.push({ title: ann.url_citation.title || ann.url_citation.url, url: ann.url_citation.url, snippet: "" });
    }
  }
  // Se não tem annotations, devolve só o texto
  if (urls.length === 0) {
    return [{ title: "OpenAI response", url: "(sem link)", snippet: String(content).slice(0, 1000) }];
  }
  return urls.slice(0, count);
}

/** Google Programmable Search Engine (Custom Search JSON API) */
async function googlePSESearch(query: string, count: number): Promise<SearchResult[]> {
  if (!providers.google_pse.available) throw new Error(missingKeyError("google_pse", "GOOGLE_PSE_KEY + GOOGLE_PSE_CX"));
  const url = `${providers.google_pse.baseUrl}?key=${providers.google_pse.apiKey}&cx=${providers.google_pse.searchEngineId}&q=${encodeURIComponent(query)}&num=${Math.min(count, 10)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google PSE ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json() as { items?: Array<{ title: string; link: string; snippet: string }> };
  return (data.items ?? []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
}

/** DuckDuckGo HTML (keyless!) — fallback quando nenhum provider tem key */
async function ddgSearch(query: string, count: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Kairós/0.5)" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DuckDuckGo ${res.status}: ${text.slice(0, 300)}`);
  }
  const html = await res.text();
  // Parse simples: pega <a class="result__a"> com título e href
  const results: SearchResult[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = re.exec(html)) && results.length < count) {
    const href = match[1];
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    if (title && href) results.push({ title, url: href, snippet: "" });
  }
  return results;
}

export const webSearch: Tool = {
  name: "web_search",
  description:
    "Busca na web e retorna lista de resultados com título, URL e snippet. " +
    "Providers (em ordem de preferência): OpenAI web search > Brave > Google PSE > Tavily > Parallel > DuckDuckGo (keyless). " +
    "Se nenhum provider com key estiver configurado, usa DuckDuckGo (sem custo, sem conta).",
  inputSchema: SearchInput,
  execute: async (input) => {
    const { query, count } = SearchInput.parse(input);
    logger.info({ query, count }, "web_search iniciado");

    const tried: string[] = [];
    const errors: string[] = [];

    const tryProvider = async (name: string, fn: () => Promise<SearchResult[]>): Promise<SearchResult[] | null> => {
      try {
        const r = await fn();
        if (r.length > 0) {
          logger.info({ provider: name, count: r.length }, "web_search provider OK");
          return r;
        }
        return null;
      } catch (e: any) {
        errors.push(`${name}: ${e.message?.slice(0, 100)}`);
        return null;
      }
    };

    // Ordem: keyless primeiro se nenhum provider pago, senão ordem por qualidade
    let results: SearchResult[] | null = null;
    if (providers.openai.available) {
      results = await tryProvider("openai", () => openaiSearch(query, count));
      tried.push("openai");
    }
    if (!results && providers.brave.available) {
      results = await tryProvider("brave", () => braveSearch(query, count));
      tried.push("brave");
    }
    if (!results && providers.google_pse.available) {
      results = await tryProvider("google_pse", () => googlePSESearch(query, count));
      tried.push("google_pse");
    }
    if (!results && providers.tavily.available) {
      results = await tryProvider("tavily", () => tavilySearch(query, count));
      tried.push("tavily");
    }
    // DDG é keyless — sempre tenta como último fallback
    if (!results) {
      results = await tryProvider("ddg", () => ddgSearch(query, count));
      tried.push("ddg");
    }

    if (!results || results.length === 0) {
      return `Nenhum resultado encontrado. Tentou: ${tried.join(", ")}. Erros: ${errors.join(" | ") || "nenhum"}`;
    }

    return results.map((r, i) =>
      `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet || "(sem snippet)"}`,
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
