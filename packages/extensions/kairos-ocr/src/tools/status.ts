/**
 * ocr:status — mostra configuração atual do OCR.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { DEFAULT_OCR_MODEL } from "../vision.js";

const inputSchema = z.object({});

export const statusTool: Tool<typeof inputSchema> = {
  name: "ocr:status",
  description:
    "Mostra a configuração atual do OCR: backend, modelo padrão, chave OpenRouter detectada.",
  inputSchema,
  execute: async () => {
    const apiKeyPresent = !!process.env.OPENROUTER_API_KEY;
    const maskedKey = apiKeyPresent
      ? `${process.env.OPENROUTER_API_KEY!.slice(0, 8)}...${process.env.OPENROUTER_API_KEY!.slice(-4)}`
      : null;
    const model = process.env.KAIROS_OCR_MODEL ?? DEFAULT_OCR_MODEL;

    return {
      backend: "openrouter-vision",
      apiKeyPresent,
      maskedKey,
      model,
      envOverride: process.env.KAIROS_OCR_MODEL ?? null,
      supportedFormats: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"],
      maxTokens: 4096,
    };
  },
};