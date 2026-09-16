/**
 * memory:search — RAG search.
 *
 * Combina:
 *   - FTS5 (BM25): bom pra queries literais ("João", "15 congregações", "reunião 2024-03-15")
 *   - Embeddings cosine (se Ollama tiver modelo): bom pra semantica ("culto" ~= "celebração")
 *
 * Score final = fts_norm * 0.4 + cosine * 0.6 (se embeddings ativos) OU fts_norm sozinho.
 *
 * Retorna top-K com snippet do conteúdo (do FTS5 highlight).
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import type { MemoryStore } from "../store.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "Texto da busca. Pode ser uma pergunta natural ('quem é o líder de louvor?') " +
        "ou palavras-chave ('João congregação sede')."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe("Máximo de resultados (default 5, max 20)."),
  tag: z
    .string()
    .optional()
    .describe("Filtra resultados só dessa tag."),
  minScore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0)
    .describe("Score mínimo (0..1) pra incluir no resultado. Default 0 = inclui tudo."),
});

export const searchTool: (getStore: () => MemoryStore) => Tool<typeof inputSchema> = (getStore) => ({
  name: "memory:search",
  description:
    "Busca RAG nas memórias salvas. Combina busca lexical (FTS5) com semantica (embeddings via " +
    "Ollama local, se disponivel). Retorna top-K memórias mais relevantes com snippet e score. " +
    "Use pra responder perguntas sobre contexto anterior ou achar fatos salvos.",
  inputSchema,
  execute: async (input) => {
    const store = getStore();
    const hits = await store.search({
      query: input.query,
      limit: input.limit,
      tag: input.tag,
      minScore: input.minScore,
    });
    return {
      query: input.query,
      count: hits.length,
      mode: store.embeddingsAvailable() ? "fts+embeddings" : "fts-only",
      embeddingsAvailable: store.embeddingsAvailable(),
      embeddingModel: store.embeddingModel(),
      hits: hits.map((h) => ({
        id: h.id,
        title: h.title,
        snippet: h.snippet,
        content: h.content,
        tags: h.tags,
        source: h.source,
        score: Number(h.score.toFixed(3)),
        signals: {
          fts: h.signals.fts !== null ? Number(h.signals.fts.toFixed(3)) : null,
          cosine: h.signals.cosine !== null ? Number(h.signals.cosine.toFixed(3)) : null,
        },
        createdAt: h.createdAt,
        updatedAt: h.updatedAt,
      })),
    };
  },
});