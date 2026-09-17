/**
 * ocr:read — extrai texto de uma imagem via modelo de visão OpenRouter.
 */

import { z } from "zod";
import path from "node:path";
import type { Tool } from "@kairos/agent";
import { readWithVision, DEFAULT_OCR_MODEL } from "../vision.js";

const inputSchema = z.object({
  path: z.string().describe("Caminho absoluto da imagem (PNG, JPG, WEBP, GIF, BMP)"),
  model: z
    .string()
    .optional()
    .describe(
      "Modelo OpenRouter vision. Default: google/gemma-3-4b-it:free. Outros: meta-llama/llama-3.2-90b-vision-instruct, qwen/qwen2-vl-72b-instruct."
    ),
  prompt: z
    .string()
    .optional()
    .describe("Prompt customizado (default: extrair todo texto)"),
  saveTo: z
    .string()
    .optional()
    .describe(
      "Se informado, salva o texto extraído nesse caminho absoluto (ex: workspace/notas-fiscal.txt). Se omitido, retorna inline."
    ),
});

export const readTool: Tool<typeof inputSchema> = {
  name: "ocr:read",
  description:
    "Extrai texto de uma imagem usando modelo de visão via OpenRouter (zero setup, usa a chave OPENROUTER_API_KEY). Suporta PNG, JPG, WEBP, GIF, BMP. " +
    "Use para ler notas fiscais, recibos, screenshots, etc. Pode salvar em arquivo via saveTo.",
  inputSchema,
  execute: async (input) => {
    const abs = path.resolve(input.path);
    const result = await readWithVision(abs, {
      model: input.model,
      prompt: input.prompt,
    });

    let savedTo: string | null = null;
    if (input.saveTo) {
      const fs = await import("node:fs/promises");
      const saveAbs = path.resolve(input.saveTo);
      await fs.mkdir(path.dirname(saveAbs), { recursive: true });
      await fs.writeFile(saveAbs, result.text, "utf-8");
      savedTo = saveAbs;
    }

    return {
      text: result.text,
      model: result.model,
      durationMs: result.durationMs,
      tokens: result.tokens,
      bytes: result.bytes,
      mime: result.mime,
      length: result.text.length,
      savedTo,
      truncated: result.text.length >= 4000,
      message: `✅ ${result.text.length} caracteres extraídos em ${(result.durationMs / 1000).toFixed(1)}s (${result.model}).`,
    };
  },
};