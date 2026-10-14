/**
 * kairos-travel — extension entrypoint.
 *
 * Auto-registrada pelo Kairos agent via @kairos/extension-* (mesmo padrão das outras).
 * Exporta tools de busca de viagem com preço real (Amadeus Self-Service API).
 */

import type { Extension } from "@kairos/agent";
import { allTools } from "./tools.js";
import { logProviderStatus } from "./providers.js";

// Loga status dos providers na importação.
logProviderStatus();

const extension: Extension = {
  name: "kairos-travel",
  version: "0.1.0",
  description: "Busca de voos e hotéis com preço real (Amadeus Self-Service).",
  tools: allTools,
};

export default extension;
export { allTools } from "./tools.js";
