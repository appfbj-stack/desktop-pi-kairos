/**
 * kairos-memory — extensão de memória persistente (gentle-engram style).
 *
 * Persiste fatos sobre o cliente, negócio, contatos, decisões, preferências.
 * Cross-session: funciona em TODAS as conversas futuras.
 *
 * Tools:
 *   - remember_business_context  : salva
 *   - recall_business_context    : busca
 *   - list_business_context      : lista tudo
 *   - forget_business_context    : remove
 *
 * Schema: business_context(key UNIQUE, value, category, importance, LRU)
 */

import type { Extension } from "@kairos/agent";
import { allTools } from "./tools.js";
import { logger } from "@kairos/core";

logger.info("memory: extension loaded (tools: remember/recall/list/forget_business_context)");

const extension: Extension = {
  name: "kairos-memory",
  version: "0.1.0",
  description: "Memória persistente do negócio do cliente. Lê, lembra, esquece fatos cross-session.",
  tools: allTools,
};

export default extension;
export { allTools } from "./tools.js";
export * from "./store.js";
