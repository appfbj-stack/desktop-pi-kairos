/**
 * finance:expense:list — lista despesas por período/categoria.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore, type Expense } from "../store.js";

const inputSchema = z.object({
  from: z.string().optional().describe("ISO date (YYYY-MM-DD). Início do período"),
  to: z.string().optional().describe("ISO date (YYYY-MM-DD). Fim do período"),
  category: z.string().optional().describe("Filtra por categoria exata"),
  vendor: z.string().optional().describe("Filtra por fornecedor (LIKE)"),
  limit: z.number().int().min(1).max(500).default(100),
});

export const expenseListTool: Tool<typeof inputSchema> = {
  name: "finance:expense:list",
  description: "Lista despesas. Filtros opcionais: período, categoria, fornecedor.",
  inputSchema,
  execute: async (input) => {
    const db = getStore();
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (input.from) {
      clauses.push("date >= ?");
      params.push(input.from);
    }
    if (input.to) {
      clauses.push("date <= ?");
      params.push(input.to);
    }
    if (input.category) {
      clauses.push("category = ?");
      params.push(input.category);
    }
    if (input.vendor) {
      clauses.push("vendor LIKE ?");
      params.push(`%${input.vendor}%`);
    }

    params.push(input.limit);

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const sql = `
      SELECT * FROM expenses
      ${where}
      ORDER BY date DESC, id DESC
      LIMIT ?
    `;
    const items = db.prepare(sql).all(...params) as Expense[];

    const total = items.reduce((sum, i) => sum + i.amount, 0);

    return {
      count: items.length,
      total,
      totalFormatted: `R$ ${total.toFixed(2)}`,
      items,
    };
  },
};