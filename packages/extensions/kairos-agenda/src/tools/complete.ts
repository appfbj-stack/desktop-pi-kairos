/**
 * agenda:complete — marca um compromisso como concluído.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore, nowIso, type AgendaItem } from "../store.js";

const inputSchema = z.object({
  id: z.number().int().positive().optional().describe("ID do item a concluir"),
  query: z
    .string()
    .optional()
    .describe("Texto pra buscar no título (se id não for conhecido)"),
});

export const completeTool: Tool<typeof inputSchema> = {
  name: "agenda:complete",
  description:
    "Marca um compromisso como concluído. Informe id (preferível) ou query pra buscar por título.",
  dangerous: false,
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
    } else if (input.query) {
      // LIKE simples — case-insensitive
      item = db
        .prepare(
          "SELECT * FROM agenda_items WHERE completed = 0 AND title LIKE ? ORDER BY datetime ASC LIMIT 1"
        )
        .get(`%${input.query}%`) as AgendaItem | undefined;
    }

    if (!item) {
      throw new Error("Item não encontrado (já concluído ou inexistente).");
    }

    const now = nowIso();
    db.prepare(
      "UPDATE agenda_items SET completed = 1, completed_at = ?, updated_at = ? WHERE id = ?"
    ).run(now, now, item.id);

    const updated = db
      .prepare("SELECT * FROM agenda_items WHERE id = ?")
      .get(item.id) as AgendaItem;

    return {
      ok: true,
      message: `✅ "${updated.title}" marcado como concluído.`,
      item: updated,
    };
  },
};