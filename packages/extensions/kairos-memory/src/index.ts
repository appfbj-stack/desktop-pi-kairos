/**
 * kairos-memory — extensão de memória persistente cross-conversa com RAG.
 *
 * Tools expostas:
 *   - memory:save    — salva uma memória (title + content + tags opcionais)
 *   - memory:recall  — recupera uma memória específica por id (ou as N mais recentes)
 *   - memory:list    — lista memorias com paginacao e filtro opcional por tag
 *   - memory:forget  — deleta uma (ou várias) memória(s) por id/tag/all
 *   - memory:search  — busca RAG: combina FTS5 (BM25) + embeddings (cosine) se Ollama tiver modelo de embed
 *
 * Storage:
 *   - Banco SQLite proprio: <workspace>/kairos-memory.db
 *   - Tabela memories + virtual table memories_fts (FTS5) com triggers de sync
 *   - Embeddings armazenados como BLOB (Float32Array serializado)
 *
 * Embeddings (opcional, offline, zero custo):
 *   - Probe em Ollama local (localhost:11434) procurando nomic-embed-text / all-minilm
 *   - Se encontrar: usa pra busca semantica
 *   - Se nao: search usa só FTS5 (BM25) — ainda funciona, só perde a semantica
 *
 * Seguranca:
 *   - memory:save e memory:forget sao `dangerous: true` → modal de confirmacao
 *   - Outras sao read-only (list, recall, search)
 *
 * Configuracao:
 *   - KAIROS_WORKSPACE_DIR env var: onde fica o kairos-memory.db
 *   - KAIROS_OLLAMA_URL env var: URL do Ollama (default localhost:11434)
 */

import path from "node:path";
import os from "node:os";
import { z } from "zod";
import type { Extension, Tool } from "@kairos/agent";
import { MemoryStore } from "./store.js";
import { saveTool } from "./tools/save.js";
import { recallTool } from "./tools/recall.js";
import { listTool } from "./tools/list.js";
import { forgetTool } from "./tools/forget.js";
import { searchTool } from "./tools/search.js";

/** Singleton lazy — inicializado na primeira chamada de tool. */
let _store: MemoryStore | null = null;

function workspaceDir(): string {
  // Prioridade: env var (setada pelo agent-instance) → fallback pra home.
  if (process.env.KAIROS_WORKSPACE_DIR) return process.env.KAIROS_WORKSPACE_DIR;
  return path.join(os.homedir(), ".kairos-workspace");
}

export function getStore(): MemoryStore {
  if (!_store) _store = new MemoryStore(workspaceDir());
  return _store;
}

/** Fecha o singleton (usado em testes ou hot reload). */
export function closeStore(): void {
  if (_store) {
    _store.close();
    _store = null;
  }
}

// Injeta a dependencia do store nas tools via closure.
const extension: Extension = {
  name: "kairos-memory",
  version: "0.1.0",
  description:
    "Memória persistente cross-conversa com RAG: salva fatos, lembra contexto em novas conversas. " +
    "Combina busca lexical (FTS5/BM25) com embeddings semânticos via Ollama local (opcional).",
  tools: [
    saveTool(getStore),
    recallTool(getStore),
    listTool(getStore),
    forgetTool(getStore),
    searchTool(getStore),
  ] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };