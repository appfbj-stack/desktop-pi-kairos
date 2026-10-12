/**
 * kairos-web-tools — extension entrypoint.
 *
 * Auto-registrada pelo Kairos agent via @kairos/extension-* (mesmo padrão das outras).
 * Exporta um array de tools nativas para web: scrape, extract (mask template), search, crawl, youtube.
 */

import type { Extension } from "@kairos/agent";
import { allTools } from "./tools.js";
import { logProviderStatus } from "./providers.js";

// Loga status dos providers na importação (executa quando o agent registra a extension).
logProviderStatus();

const extension: Extension = {
  name: "kairos-web-tools",
  version: "0.1.0",
  description: "Web scraping, structured extraction (mask template), search, crawl e YouTube.",
  tools: allTools,
};

export default extension;
export { allTools } from "./tools.js";
