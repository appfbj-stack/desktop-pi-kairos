/**
 * kairos-local-ai — extensão de IA 100% local (via Ollama).
 *
 * 3 capacidades em uma extension:
 *   - Vision: vision_describe (Moondream/LLaVA)
 *   - RAG: rag_index_path, rag_index_workspace, rag_search, rag_list_indexed, rag_clear
 *   - Voice: transcribe_audio (Whisper)
 *
 * Tudo roda no PC do cliente via Ollama (http://127.0.0.1:11434).
 * Nada sai do PC.
 *
 * Setup:
 *   1. Instalar Ollama: https://ollama.com/download
 *   2. Rodar: ollama serve
 *   3. Baixar modelos: ollama pull moondream  &&  ollama pull nomic-embed-text  &&  ollama pull whisper
 *   4. Pronto — Kairós detecta automaticamente.
 */

import type { Extension } from "@kairos/agent";
import { allTools } from "./tools.js";
import { logStatus } from "./ollama.js";
import { logger } from "@kairos/core";

logStatus().catch(() => {});

logger.info("local-ai: extension loaded (8 tools: vision + rag + whisper)");

const extension: Extension = {
  name: "kairos-local-ai",
  version: "0.1.0",
  description:
    "IA 100% local — Vision (Moondream/LLaVA), RAG (embeddings + busca semântica) e Voice (Whisper) via Ollama.",
  tools: allTools,
};

export default extension;
export { allTools } from "./tools.js";
export * from "./ollama.js";
export * from "./rag-store.js";
