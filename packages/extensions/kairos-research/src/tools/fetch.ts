/**
 * web:fetch — baixa HTML de uma URL e extrai texto legível.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { BROWSER_UA, htmlToText, truncate } from "../html.js";
import { cached } from "../cache.js";

const inputSchema = z.object({
  url: z.string().url().describe("URL completa (https://...)"),
  maxChars: z
    .number()
    .int()
    .min(500)
    .max(50000)
    .default(8000)
    .describe("Limite de caracteres do texto extraído"),
  rawHtml: z
    .boolean()
    .default(false)
    .describe("Se true, retorna HTML bruto em vez de texto extraído"),
});

async function doFetch(url: string): Promise<{ html: string; finalUrl: string; status: number }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} em ${url}`);
  }

  const html = await response.text();
  return { html, finalUrl: response.url, status: response.status };
}

export const webFetchTool: Tool<typeof inputSchema> = {
  name: "web:fetch",
  description:
    "Faz fetch de uma URL e retorna o conteúdo extraído (texto limpo OU HTML bruto). " +
    "Use pra inspecionar sites de leads, ler páginas completas, ou extrair contatos.",
  inputSchema,
  execute: async (input) => {
    const cacheKey = `fetch:${input.url}`;
    const { html, finalUrl, status } = await cached(cacheKey, () => doFetch(input.url));

    if (input.rawHtml) {
      return {
        url: finalUrl,
        status,
        bytes: html.length,
        html: truncate(html, input.maxChars),
        truncated: html.length > input.maxChars,
      };
    }

    const text = htmlToText(html);
    return {
      url: finalUrl,
      status,
      bytes: html.length,
      textLength: text.length,
      text: truncate(text, input.maxChars),
      truncated: text.length > input.maxChars,
    };
  },
};