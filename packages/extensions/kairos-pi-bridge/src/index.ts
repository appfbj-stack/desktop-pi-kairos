/**
 * kairos-pi-bridge \u2014 extension Kairos que carrega packages do cat\u00e1logo Pi.
 *
 * Habilitada por padr\u00e3o. Para adicionar/remover skills do Pi:
 *   1. Edite `config.json` (campo `enabled`)
 *   2. Adicione a dep no `package.json` deste bridge
 *   3. Rode `pnpm install` na raiz
 *   4. Rode `pnpm --filter @kairos/extension-pi-bridge build`
 *   5. Rebuild do app desktop
 *
 * Tools v\u00eam aparecer namespaced como `pi:<package>:<tool>`.
 *
 * Limita\u00e7\u00f5es:
 *   - Packages que dependem de TUI interativa (pi-mcp-adapter) n\u00e3o funcionam.
 *   - Packages com schema TypeBox puro precisam ser adaptados manualmente.
 *   - Performance: cada `loadPiExtensions()` faz dynamic import no startup do Agent.
 */

import type { Extension, Tool } from "@kairos/agent";
import { z } from "zod";
import { loadPiExtensions, type LoadResult } from "./loader.js";

/** Tools carregadas no startup (cache em mem\u00f3ria). */
let _cached: LoadResult | null = null;

/** Carrega tools Pi sob demanda (chamado uma vez pelo Agent no startup). */
export async function getPiTools(): Promise<Tool<z.ZodTypeAny>[]> {
  if (_cached) return _cached.tools;
  _cached = await loadPiExtensions();
  return _cached.tools;
}

/** Reset do cache (usado em hot-reload ou testes). */
export function resetPiCache(): void {
  _cached = null;
}

const extension: Extension = {
  name: "kairos-pi-bridge",
  version: "0.1.0",
  description:
    "Bridge pra adicionar skills do cat\u00e1logo Pi (pi.dev/packages). " +
    "Tools v\u00eam com prefixo pi:<package>:. Configure em config.json.",
  // Tools carregadas lazy no startup. O agent-instance.js chama getPiTools() antes
  // de registerExtension e mescla as tools aqui.
  tools: [],
};

// Hook de bootstrap \u2014 o agent-instance deve chamar `await getPiTools()` e mesclar
// as tools neste array antes de passar pro Agent. Expor helper:
export async function applyPiTools(tools: Tool<z.ZodTypeAny>[]): Promise<void> {
  extension.tools = tools as unknown as Tool<z.ZodTypeAny>[];
}

export default extension;
export { extension };
