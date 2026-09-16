/**
 * kairos-intelligence — extensao de memoria persistente do Kairós.
 *
 * Port de pi-persistent-intelligence (MIT, Mont3ll) — mesma arquitetura
 * L1/L2/daily/scratchpad/inbox + RAG, mas com:
 *   - better-sqlite3 em vez de bun:sqlite (Node compativel)
 *   - embeddings via Ollama local em vez de qmd (zero custo, offline)
 *   - tools simples (4 + curate + bootstrap) em vez de 50+ comandos
 *   - patch governance SIMPLIFICADO: candidate->inbox->curate (vs full patches)
 *
 * Tools expostas (todas namespaced "memory:*"):
 *   - memory:write       append em daily ou cria candidate no inbox (long_term/identity)
 *   - memory:read        le long_term/daily/scratchpad/inbox
 *   - memory:search      RAG search (keyword | semantic | deep)
 *   - memory:curate      promove/rejeita candidate do inbox
 *   - memory:bootstrap   auto-inject de contexto (daily + scratchpad + inbox + RAG)
 *   - scratchpad         checklist persistente
 *
 * Configuracao:
 *   - KAIROS_INTELLIGENCE_ROOT: diretorio raiz (default ~/.kairos-intelligence)
 *   - KAIROS_OLLAMA_URL: URL do Ollama (default localhost:11434)
 *
 * Armazenamento (tudo append-only, JSONL canonical):
 *   memory/L1.identity.jsonl  memoria pessoal (identity)
 *   memory/L2.playbooks.jsonl  decisoes, workflows, preferencias
 *   memory/tombstones.jsonl    audit log de delecoes
 *   inbox/captured.jsonl       candidates aguardando ratificacao
 *   daily/YYYY-MM-DD.md        log diario (Markdown)
 *   scratchpad.md              checklist
 *   rendered/MEMORY.md         projection (regenerated a cada promocao)
 *   search/memory-fts.db       FTS5 index
 *   search/embeddings.db       embeddings persistidos
 */

import path from "node:path";
import os from "node:os";
import { z } from "zod";
import type { Extension, Tool } from "@kairos/agent";
import { Intelligence } from "./intelligence.js";
import { memoryWriteTool } from "./tools/memory-write.js";
import { memoryReadTool } from "./tools/memory-read.js";
import { memorySearchTool } from "./tools/memory-search.js";
import { memoryCurateTool } from "./tools/memory-curate.js";
import { bootstrapTool } from "./tools/bootstrap.js";
import { scratchpadTool } from "./tools/scratchpad.js";

/** Singleton lazy — inicializado na primeira chamada de tool. */
let _intelligence: Intelligence | null = null;

function workspaceDir(): string {
  // Prioridade: env var (setada pelo agent-instance) → fallback pra home.
  if (process.env.KAIROS_INTELLIGENCE_ROOT) return process.env.KAIROS_INTELLIGENCE_ROOT;
  return path.join(os.homedir(), ".kairos-intelligence");
}

export function getIntelligence(): Intelligence {
  if (!_intelligence) _intelligence = new Intelligence(workspaceDir());
  return _intelligence;
}

/** Fecha o singleton (usado em testes ou hot reload). */
export function closeIntelligence(): void {
  if (_intelligence) {
    _intelligence.close();
    _intelligence = null;
  }
}

const extension: Extension = {
  name: "kairos-intelligence",
  version: "0.1.0",
  description:
    "Memória persistente governada do Kairós: L1 (identity) + L2 (playbooks) + daily + scratchpad. " +
    "RAG via FTS5 + embeddings Ollama. Auto-inject de contexto via memory:bootstrap.",
  tools: [
    bootstrapTool(
      () => workspaceDir(),
      () => getIntelligence().search
    ),
    memoryWriteTool(
      () => workspaceDir(),
      () => getIntelligence().search
    ),
    memoryReadTool(() => workspaceDir()),
    memorySearchTool(() => getIntelligence().search),
    memoryCurateTool(() => workspaceDir()),
    scratchpadTool(() => workspaceDir()),
  ] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };
