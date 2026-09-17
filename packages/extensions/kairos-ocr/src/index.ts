/**
 * kairos-ocr — extrai texto de imagens via OpenRouter vision models.
 *
 * Tools expostas:
 *   - ocr:read   extrai texto de uma imagem (png/jpg/webp/gif/bmp)
 *   - ocr:status mostra configuração
 *
 * Configuração:
 *   - OPENROUTER_API_KEY: obrigatória (setada em agent-instance.ts)
 *   - KAIROS_OCR_MODEL: modelo default (default: google/gemma-3-4b-it:free)
 *
 * Por que não tesseract.js ou MinerU?
 *   - tesseract.js = 30MB de WASM pesado demais
 *   - MinerU = requer token gratuito separado
 *   - OpenRouter = zero setup, chave já existente, modelo trocável por chamada
 */

import { z } from "zod";
import type { Extension, Tool } from "@kairos/agent";
import { readTool } from "./tools/read.js";
import { statusTool } from "./tools/status.js";

const extension: Extension = {
  name: "kairos-ocr",
  version: "0.1.0",
  description:
    "OCR via OpenRouter vision. Extrai texto de imagens (notas fiscais, recibos, screenshots). " +
    "Zero setup: usa a chave OPENROUTER_API_KEY existente. Modelo trocável por chamada.",
  tools: [readTool, statusTool] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };