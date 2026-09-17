/**
 * Cliente OpenRouter Vision — chama modelos multimodais direto, bypassa o loop do agente.
 *
 * Por que direto: o modelo principal do agente pode não ter visão (ex: nex-n2.5-mini:free).
 * O OCR tool precisa SEMPRE de um modelo com visão, então chama a API direto.
 *
 * Config via env (setada por agent-instance.ts):
 *   OPENROUTER_API_KEY: obrigatória
 *   KAIROS_OCR_MODEL: modelo default (override por chamada também)
 */

import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_OCR_MODEL = "google/gemma-3-4b-it:free";

const SUPPORTED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

export interface OcrResult {
  text: string;
  model: string;
  tokens?: number;
  durationMs: number;
  bytes: number;
  mime: string;
}

/** Verifica se o arquivo tem extensão suportada. */
export function isSupportedImage(filePath: string): boolean {
  return SUPPORTED_EXT.has(path.extname(filePath).toLowerCase());
}

/** Extrai MIME da extensão. */
export function mimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Chama OpenRouter vision API. Retorna texto extraído. */
export async function readWithVision(
  filePath: string,
  options: { model?: string; prompt?: string } = {}
): Promise<OcrResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY não configurada. agent-instance.ts deve carregar do env."
    );
  }

  if (!isSupportedImage(filePath)) {
    throw new Error(
      `Formato não suportado: ${path.extname(filePath)}. Suportados: ${[...SUPPORTED_EXT].join(", ")}`
    );
  }

  const buffer = await fs.readFile(filePath);
  const mime = mimeFromExt(filePath);
  const base64 = buffer.toString("base64");

  const model = options.model ?? process.env.KAIROS_OCR_MODEL ?? DEFAULT_OCR_MODEL;
  const prompt =
    options.prompt ??
    "Extraia TODO o texto desta imagem exatamente como aparece. Preserve números, tabelas, formatação. Responda APENAS com o texto extraído, sem comentários antes ou depois.";

  const start = Date.now();

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://fbautomacao.space",
      "X-Title": "Kairós OCR",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter ${response.status}: ${errBody.slice(0, 500)}. Tente outro modelo (ex: 'meta-llama/llama-3.2-90b-vision-instruct', 'qwen/qwen2-vl-72b-instruct').`
    );
  }

  const json = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { total_tokens?: number };
  };

  const text = json.choices?.[0]?.message?.content?.trim() ?? "";

  return {
    text,
    model,
    tokens: json.usage?.total_tokens,
    durationMs: Date.now() - start,
    bytes: buffer.length,
    mime,
  };
}