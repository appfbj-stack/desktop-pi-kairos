/**
 * kairos-research — busca web + extração de contatos pra prospecção de clientes.
 *
 * Tools expostas (namespace "web:*"):
 *   - web:search            DuckDuckGo search (zero setup, sem API key)
 *   - web:fetch             fetch URL → texto limpo
 *   - web:extract-contacts  extrai emails/telefones/redes de texto ou URL
 *   - web:prospect          fluxo combinado: search + enrich + contacts
 *
 * Por que DuckDuckGo e não Tavily/Brave?
 *   - DDG: zero setup, grátis, mas ~50 buscas/dia por IP sem rotação
 *   - Tavily/Exa: free tier generoso (1k/mês), confiável, precisa de API key
 *   - Pra produção, setar KAIROS_SEARCH_API_KEY (Tavily) e implementar backend em search.ts
 *
 * Cache: in-memory com TTL 30min (1000 entries). Migração futura pra SQLite se virar gargalo.
 */

import { z } from "zod";
import type { Extension, Tool } from "@kairos/agent";
import { webSearchTool } from "./tools/search.js";
import { webFetchTool } from "./tools/fetch.js";
import { extractContactsTool } from "./tools/extract.js";
import { prospectTool } from "./tools/prospect.js";
import { prospectSaveTool } from "./tools/prospect-save.js";

const extension: Extension = {
  name: "kairos-research",
  version: "0.1.0",
  description:
    "Busca web via DuckDuckGo + fetch + extração de contatos pra prospecção de clientes. " +
    "Use para encontrar leads pesquisando termos de nicho + região + intenção de compra.",
  tools: [
    webSearchTool,
    webFetchTool,
    extractContactsTool,
    prospectTool,
    prospectSaveTool,
  ] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };