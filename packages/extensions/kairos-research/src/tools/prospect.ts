/**
 * web:prospect — fluxo combinado: busca + fetch top results + extrai contatos.
 *
 * Workflow:
 *   1. web:search com query do nicho + região + intenção de compra
 *   2. Pra cada resultado: web:fetch + web:extract-contacts
 *   3. Retorna leads estruturados pra salvar/CRM
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { htmlToText, extractEmails, extractPhones } from "../html.js";

const inputSchema = z.object({
  nicho: z
    .string()
    .min(2)
    .describe(
      "Nicho do mercado + intenção de compra. Ex: 'padaria pequena São Paulo querendo modernizar PDV'"
    ),
  region: z
    .enum(["br-pt", "us-en", "wt-wt"])
    .default("br-pt"),
  maxLeads: z.number().int().min(1).max(20).default(10).describe("Limite de leads retornados"),
  enrich: z
    .boolean()
    .default(false)
    .describe("Se true, faz fetch de cada URL e extrai contatos (mais lento)"),
});

interface Prospect {
  title: string;
  url: string;
  snippet: string;
  emails?: string[];
  phones?: string[];
}

async function ddgSearch(query: string, region: string, limit: number) {
  const params = new URLSearchParams({ q: query, kl: region });
  const url = `https://html.duckduckgo.com/html/?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`DDG ${res.status}`);
  const html = await res.text();
  const out: { title: string; url: string; snippet: string }[] = [];
  const blockRe = /<div[^>]*class="[^"]*\bresult\b[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi;
  for (const block of html.match(blockRe) ?? []) {
    const tm =
      block.match(/<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ??
      block.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const sm = block.match(/<a[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!tm) continue;
    let finalUrl: string = tm[1] ?? "";
    if (finalUrl.includes("duckduckgo.com/l/")) {
      const m = finalUrl.match(/uddg=([^&]+)/);
      if (m && m[1]) {
        try { finalUrl = decodeURIComponent(m[1]); } catch {}
      }
    }
    const strip = (s: string) =>
      s
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    out.push({
      title: strip(tm[2] ?? "").slice(0, 200),
      url: finalUrl,
      snippet: sm ? strip(sm[1] ?? "").slice(0, 300) : "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchAndExtract(url: string, timeoutMs: number = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Kairos/1.0)" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = htmlToText(html);
    return {
      emails: extractEmails(text + "\n" + html).filter(
        (e) => !/noreply|no-reply|example\.|wixpress|wordpress|sentry/i.test(e)
      ),
      phones: extractPhones(text),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const prospectTool: Tool<typeof inputSchema> = {
  name: "web:prospect",
  description:
    "Fluxo combinado de prospecção: busca no DDG pelo nicho, retorna leads estruturados com URL e snippet. " +
    "Se enrich=true, faz fetch de cada URL e extrai emails/telefones (mais lento, ~5-10s por lead).",
  inputSchema,
  execute: async (input) => {
    const searchResults = await ddgSearch(input.nicho, input.region, input.maxLeads);

    if (!input.enrich) {
      return {
        nicho: input.nicho,
        leads: searchResults,
        count: searchResults.length,
        enriched: 0,
        message: `${searchResults.length} leads brutos. Use enrich=true pra extrair contatos.`,
      };
    }

    const enriched = await Promise.allSettled(
      searchResults.map(async (r): Promise<Prospect> => {
        const data = await fetchAndExtract(r.url);
        return {
          ...r,
          emails: data?.emails ?? [],
          phones: data?.phones ?? [],
        };
      })
    );

    const leads: Prospect[] = enriched
      .filter((e): e is PromiseFulfilledResult<Prospect> => e.status === "fulfilled")
      .map((e) => e.value);

    const withContact = leads.filter((l) => (l.emails?.length ?? 0) + (l.phones?.length ?? 0) > 0);

    return {
      nicho: input.nicho,
      count: leads.length,
      enriched: leads.length,
      withContact: withContact.length,
      leads,
      message: `${leads.length} leads processados, ${withContact.length} com contatos extraídos.`,
    };
  },
};