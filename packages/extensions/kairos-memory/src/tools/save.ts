/**
 * memory:save — salva uma memória persistente.
 *
 * O agente usa pra anotar fatos importantes entre conversas:
 *   - Preferências do usuário
 *   - Decisões tomadas em projetos
 *   - Contexto recorrente (ex: "igreja tem 1 sede + 15 congregações")
 *   - Pessoas, eventos, datas
 *
 * Schema: title (curto), content (corpo), tags (categorização), source (origem).
 *
 * Embeddings: gerados em background se Ollama tiver modelo de embed (nomic-embed-text).
 * Sem Ollama, o item é salvo só com FTS5 (BM25 continua funcionando pra queries literais).
 *
 * dangerous: true — salvar não é destrutivo mas pode poluir a base se chamado em loop.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import type { MemoryStore } from "../store.js";

const inputSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(200)
    .describe("Título curto e descritivo da memória (ex: 'Membro João Silva - líder de louvor')"),
  content: z
    .string()
    .min(1)
    .describe(
      "Conteúdo completo da memória. Seja detalhado — esse texto é o que vai ser lembrado depois."
    ),
  tags: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "Tags pra categorizar (ex: ['membro', 'louvor', 'sede']). Útil pra listar/forget por categoria."
    ),
  source: z
    .enum(["user", "agent", "import"])
    .optional()
    .default("agent")
    .describe(
      "Origem da memória: 'user' = o usuário pediu pra salvar, 'agent' = o agente decidiu por conta própria, 'import' = importado de fora."
    ),
});

export const saveTool: (getStore: () => MemoryStore) => Tool<typeof inputSchema> = (getStore) => ({
  name: "memory:save",
  description:
    "Salva uma memória persistente pra ser lembrada em conversas futuras. Use pra anotar fatos " +
    "importantes do usuário, decisões, preferências, ou qualquer contexto recorrente. O título é " +
    "curto e descritivo; o content é o corpo completo. Tags ajudam a organizar por categoria.",
  dangerous: true,
  inputSchema,
  execute: async (input) => {
    const store = getStore();
    const mem = await store.save({
      title: input.title,
      content: input.content,
      tags: input.tags,
      source: input.source,
    });
    const total = store.count();
    return {
      ok: true,
      id: mem.id,
      title: mem.title,
      tags: mem.tags,
      hasEmbedding: mem.embedding !== null,
      embeddingsAvailable: store.embeddingsAvailable(),
      totalMemories: total,
      hint:
        total === 1
          ? "Primeira memória salva. Ela vai aparecer em futuras buscas automaticamente."
          : `Total de ${total} memórias salvas.`,
    };
  },
});