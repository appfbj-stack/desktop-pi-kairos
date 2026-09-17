/**
 * agenda:remove — remove um compromisso.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore, type AgendaItem } from "../store.js";

const inputSchema = z.object({
  id: z.number().int().positive().optional().describe("ID do item a remover"),
  query: z
    .string()
    .optional()
    .describe("Texto pra buscar no título (se id não for conhecido)"),
  force: z
    .boolean()
    .default(false)
    .describe("Se true, remove sem confirmação (modo 'tudo liberado')"),
});

export const removeTool: Tool<typeof inputSchema> = {
  name: "agenda:remove",
  description:
    "Remove um compromisso da agenda. Informe id ou query. Destrutivo (no modo livre, force=true pula confirmação).",
  inputSchema,
  execute: async (input) => {
    if (!input.id && !input.query) {
      throw new Error("Informe id ou query.");
    }
    const db = getStore();
    let item: AgendaItem | undefined;

    if (input.id) {
      item = db
        .prepare("SELECT * FROM agenda_items WHERE id = ?")
        .get(input.id) as AgendaItem | undefined;
    } else {
      item = db
        .prepare(
          "SELECT * FROM agenda_items WHERE title LIKE ? ORDER BY datetime ASC LIMIT 1"
        )
        .get(`%${input.query}%`) as AgendaItem | undefined;
    }

    if (!item) {
      throw new Error("Item não encontrado.");
    }

    db.prepare("DELETE FROM agenda_items WHERE id = ?").run(item.id);

    return {
      ok: true,
      message: `🗑️ "${item.title}" removido.`,
      removedId: item.id,
    };
  },
};