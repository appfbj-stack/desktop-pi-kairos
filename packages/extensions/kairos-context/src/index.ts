/**
 * kairos-context — extension entrypoint.
 *
 * Compressão de contexto (billion-context style).
 * Tools: context_stats, compress_history.
 * Função utilitária: getCompressedHistory() — usada pelo agent-loop.
 */

import type { Extension } from "@kairos/agent";
import { allTools } from "./tools.js";
import { logger } from "@kairos/core";

logger.info("context: extension loaded (tools: context_stats, compress_history)");

const extension: Extension = {
  name: "kairos-context",
  version: "0.1.0",
  description: "Compressão de contexto — resume histórico antigo, economiza ~5x tokens.",
  tools: allTools,
};

export default extension;
export { allTools } from "./tools.js";
export {
  getCompressedHistory,
  saveSummary,
  countMessages,
  estimateTokens,
  type ChatMessage,
  type CompressionResult,
} from "./compress.js";
