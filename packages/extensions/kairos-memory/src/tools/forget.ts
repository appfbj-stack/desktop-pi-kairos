/**
 * memory:forget — deleta memórias.
 *
 * Modos:
 *   - id:   deleta UMA memória específica
 *   - tag:  deleta TODAS com essa tag
 *   - all:  deleta TUDO (use com cuidado!)
 *
 * Sempre destrutivo — dangerous: true. Confirmação modal obrigatória.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import type { MemoryStore } from "../store.js";

const inputSchema = z
  .object({
    id: z.string().uuid().optional().describe("ID específico da memória a deletar."),
    tag: z
      .string()
      .optional()
      .describe("Deleta TODAS as memórias com essa tag (use com cuidado)."),
    all: z
      .boolean()
      .optional()
      .default(false)
      .describe("Se true, deleta TODAS as memórias. Requer confirmacao explicita."),
  })
  .refine((d) => d.id || d.tag || d.all, {
    message: "Forneca pelo menos um: id, tag, ou all=true",
  });

export const forgetTool: (getStore: () => MemoryStore) => Tool<typeof inputSchema> = (getStore) => ({
  name: "memory:forget",
  description:
    "Deleta memórias. Pode deletar UMA por id, TODAS com uma tag, ou TUDO (all=true). " +
    "Sempre destrutivo — use com cuidado. Pra revisar antes, use memory:list.",
  dangerous: true,
  inputSchema,
  execute: async (input) => {
    const store = getStore();
    const before = store.count();
    const result = store.forget({ id: input.id, tag: input.tag, all: input.all });
    return {
      ok: true,
      mode: input.id ? "id" : input.tag ? "tag" : "all",
      target: input.id ?? input.tag ?? "*",
      removed: result.removed,
      remaining: store.count(),
      before,
    };
  },
});