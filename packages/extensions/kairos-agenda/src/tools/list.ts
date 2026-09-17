/**
 * agenda:list — lista compromissos por período.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore, type AgendaItem } from "../store.js";

const inputSchema = z.object({
  range: z
    .enum(["today", "tomorrow", "week", "month", "all", "custom"])
    .default("week")
    .describe("Período: today, tomorrow, week (7 dias), month (30 dias), all, custom"),
  from: z
    .string()
    .optional()
    .describe("ISO 8601. Obrigatório se range=custom. Início do intervalo (inclusivo)."),
  to: z
    .string()
    .optional()
    .describe("ISO 8601. Obrigatório se range=custom. Fim do intervalo (inclusivo)."),
  includeCompleted: z
    .boolean()
    .default(false)
    .describe("Se true, inclui itens já concluídos"),
  category: z.string().optional().describe("Filtra por categoria exata"),
  limit: z.number().int().min(1).max(500).default(100),
});

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function rangeBounds(range: string): { from: string; to: string } {
  const now = new Date();
  switch (range) {
    case "today":
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    case "tomorrow": {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      return { from: startOfDay(t).toISOString(), to: endOfDay(t).toISOString() };
    }
    case "week": {
      const w = new Date(now);
      w.setDate(w.getDate() + 7);
      return { from: now.toISOString(), to: endOfDay(w).toISOString() };
    }
    case "month": {
      const m = new Date(now);
      m.setDate(m.getDate() + 30);
      return { from: now.toISOString(), to: endOfDay(m).toISOString() };
    }
    case "all":
      return { from: "1970-01-01T00:00:00Z", to: "2999-12-31T23:59:59Z" };
    default:
      throw new Error(`range inválido: ${range}`);
  }
}

export const listTool: Tool<typeof inputSchema> = {
  name: "agenda:list",
  description:
    "Lista compromissos da agenda. Use range=today pra hoje, week pra próximos 7 dias, etc. Retorna ordenado por data crescente.",
  dangerous: false,
  inputSchema,
  execute: async (input) => {
    const db = getStore();
    let fromIso: string;
    let toIso: string;

    if (input.range === "custom") {
      if (!input.from || !input.to) {
        throw new Error("range=custom precisa de from e to (ISO 8601).");
      }
      fromIso = input.from;
      toIso = input.to;
    } else {
      const bounds = rangeBounds(input.range);
      fromIso = bounds.from;
      toIso = bounds.to;
    }

    const clauses: string[] = ["datetime >= ?", "datetime <= ?"];
    const params: unknown[] = [fromIso, toIso];

    if (!input.includeCompleted) clauses.push("completed = 0");
    if (input.category) {
      clauses.push("category = ?");
      params.push(input.category);
    }

    params.push(input.limit);

    const sql = `
      SELECT * FROM agenda_items
      WHERE ${clauses.join(" AND ")}
      ORDER BY datetime ASC
      LIMIT ?
    `;
    const items = db.prepare(sql).all(...params) as AgendaItem[];

    return {
      count: items.length,
      range: input.range,
      from: fromIso,
      to: toIso,
      items: items.map((i) => ({
        ...i,
        // human-readable pra UI
        datetimeLocal: new Date(i.datetime).toLocaleString("pt-BR"),
      })),
    };
  },
};