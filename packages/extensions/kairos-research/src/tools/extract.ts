/**
 * web:extract-contacts — extrai emails, telefones e redes sociais de um texto ou URL.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import {
  extractEmails,
  extractPhones,
  extractSocials,
  htmlToText,
  truncate,
} from "../html.js";
import { cached } from "../cache.js";

const inputSchema = z.object({
  source: z
    .string()
    .describe("Texto cru OU URL de página pra extrair contatos"),
  sourceType: z
    .enum(["text", "url"])
    .default("text")
    .describe("'text' = texto cru; 'url' = faz fetch e extrai do HTML"),
  phoneRegion: z.enum(["BR", "INTL"]).default("BR"),
  includeSocial: z.boolean().default(true),
});

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Kairos/1.0)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.text();
}

export const extractContactsTool: Tool<typeof inputSchema> = {
  name: "web:extract-contacts",
  description:
    "Extrai emails, telefones e (opcional) redes sociais de um texto OU de uma URL. " +
    "Use após web:search pra enrichment de leads (pegar contato a partir dos resultados).",
  inputSchema,
  execute: async (input) => {
    let text: string;
    let url: string | null = null;

    if (input.sourceType === "url") {
      url = input.source;
      const cacheKey = `extract:${url}`;
      const html = await cached(cacheKey, () => fetchHtml(url!));
      text = htmlToText(html) + "\n\n" + html; // combina texto limpo + html bruto (pega socials em atributos)
    } else {
      text = input.source;
    }

    const emails = extractEmails(text);
    const phones = extractPhones(text, input.phoneRegion);
    const socials = input.includeSocial ? extractSocials(text) : {};

    // Filtra emails falsos comuns (ex: noreply@, example.com)
    const filteredEmails = emails.filter(
      (e) => !/noreply|no-reply|example\.|wixpress|wordpress|sentry/i.test(e)
    );

    return {
      source: input.sourceType === "url" ? url : "(texto cru)",
      counts: {
        emails: filteredEmails.length,
        phones: phones.length,
        socials: Object.values(socials).reduce((s, v) => s + v.length, 0),
      },
      emails: filteredEmails,
      phones,
      ...(input.includeSocial ? { socials } : {}),
    };
  },
};