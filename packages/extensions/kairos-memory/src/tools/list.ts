/**
 * memory:list — lista memórias com paginacao e filtro opcional por tag.
 *
 * Read-only. Ordenado por created_at DESC.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import type { MemoryStore } from "../store.js";

const inputSchema = z.object({
  tag: z
    .string()
    .optional()
    .describe("Filtra só memórias com essa tag (exact match)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(50)
    .describe("Máximo de memórias a retornar (default 50, max 200)."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Offset pra paginação (pula N primeiras)."),
});

export const listTool: (getStore: () => MemoryStore) => Tool<typeof inputSchema> = (getStore) => ({
  name: "memory:list",
  description:
    "Lista memórias salvas, ordenadas da mais recente pra mais antiga. Pode filtrar por tag. " +
    "Use pra revisar o que tá guardado ou pra auditar antes de deletar.",
  inputSchema,
  execute: async (input) => {
    const store = getStore();
    const memories = store.list({
      tag: input.tag,
      limit: input.limit,
      offset: input.offset,
    });
    return {
      total: store.count(),
      returned: memories.length,
      offset: input.offset,
      filter: input.tag ? { tag: input.tag } : null,
      memories: memories.map((m) => ({
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