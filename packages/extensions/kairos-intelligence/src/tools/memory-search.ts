/**
 * memory:search — RAG search across all long-term memory layers.
 *
 * mode=keyword: soh FTS5 BM25 (instant, offline, sem deps)
 * mode=semantic: soh embeddings cosine (requer Ollama local)
 * mode=deep: FTS + embeddings combinados (fts*0.4 + cosine*0.6)
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import type { IntelligenceSearch } from "../search.js";

const inputSchema = z.object({
  query: z.string().min(1).describe("Query de busca. Pode ser pergunta natural ou palavras-chave."),
  mode: z
    .enum(["keyword", "semantic", "deep"])
    .optional()
    .default("deep")
    .describe("Modo de busca: keyword (FTS), semantic (embeddings), deep (ambos combinados)."),
  limit: z.number().int().min(1).max(20).optional().default(8),
  layer: z.enum(["L1", "L2"]).optional().describe("Filtra por camada (identity=L1, playbook=L2)."),
  minScore: z.number().min(0).max(1).optional().default(0),
});

export const memorySearchTool: (
  searchRef: () => IntelligenceSearch
) => Tool<typeof inputSchema> = (searchRef) => ({
  name: "memory:search",
  description:
    "Busca RAG na memoria persistente do Kairós. " +
    "Combina busca lexical (FTS5) com semantica (embeddings Ollama). " +
    "Use pra responder perguntas sobre contexto anterior ou encontrar fatos salvos.",
  inputSchema,
  execute: async (input) => {
    const search = searchRef();
    const hits = await search.search({
      query: input.query,
      mode: input.mode,
      limit: input.limit,
      layer: input.layer,
      minScore: input.minScore,
    });
    return {
      query: input.query,
      mode: input.mode,
      layer: input.layer ?? "all",
      count: hits.length,
      embeddingsAvailable: search.embeddingsAvailableNow(),
      embeddingModel: search.embeddingModel(),
      hits: hits.map((h) => ({
        id: h.id,
        layer: h.layer,
        statement: h.statement,
        tags: h.tags,
        confidence: h.confidence,
        score: Number(h.score.toFixed(3)),
        signals: {
          fts: h.signals.fts !== null ? Number(h.signals.fts.toFixed(3)) : null,
          cosine: h.signals.cosine !== null ? Number(h.signals.cosine.toFixed(3)) : null,
        },
      })),
    };
  },
});
