/**
 * memory:recall — recupera uma memória específica por id OU as N mais recentes.
 *
 * Read-only. Não marca accessed_at (oposto de get() interno).
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import type { MemoryStore } from "../store.js";

const inputSchema = z.object({
  id: z
    .string()
    .uuid()
    .optional()
    .describe("ID específico da memória (UUID). Se omitido, retorna as mais recentes."),
  recent: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe("Se id nao for passado, retorna essas N memorias mais recentes (default 5)."),
});

export const recallTool: (getStore: () => MemoryStore) => Tool<typeof inputSchema> = (getStore) => ({
  name: "memory:recall",
  description:
    "Recupera uma memória específica por id, ou lista as N mais recentes se id for omitido. " +
    "Use pra verificar se uma memória existe ou pra revisar as últimas anotações.",
  inputSchema,
  execute: async (input) => {
    const store = getStore();
    if (input.id) {
      const mem = store.get(input.id);
      if (!mem) return { found: false, id: input.id };
      return { found: true, memory: mem };
    }
    const list = store.list({ limit: input.recent });
    return {
      found: list.length > 0,
      count: list.length,
      memories: list.map((m) => ({
        id: m.id,
        title: m.title,
        content: m.content,
        tags: m.tags,
        source: m.source,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        accessedAt: m.accessedAt,
      })),
    };
  },
});