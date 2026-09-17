/**
 * finance:expense:summary — totaliza despesas por categoria em um período.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore } from "../store.js";

const inputSchema = z.object({
  from: z.string().optional().describe("ISO date (YYYY-MM-DD). Default: início do mês atual"),
  to: z.string().optional().describe("ISO date (YYYY-MM-DD). Default: hoje"),
});

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export const expenseSummaryTool: Tool<typeof inputSchema> = {
  name: "finance:expense:summary",
  description:
    "Soma despesas por categoria em um período. Útil pra 'quanto gastei esse mês em transporte?' ou 'total de despesas em setembro'.",
  inputSchema,
  execute: async (input) => {
    const db = getStore();
    const range = defaultRange();
    const from = input.from ?? range.from;
    const to = input.to ?? range.to;

    const rows = db
      .prepare(
        `SELECT category, SUM(amount) as total, COUNT(*) as count
         FROM expenses
         WHERE date >= ? AND date <= ?
         GROUP BY category
         ORDER BY total DESC`
      )
      .all(from, to) as { category: string; total: number; count: number }[];

    const grandTotal = rows.reduce((s, r) => s + r.total, 0);

    return {
      from,
      to,
      grandTotal,
      grandTotalFormatted: `R$ ${grandTotal.toFixed(2)}`,
      categories: rows.map((r) => ({
        category: r.category,
        total: r.total,
        count: r.count,
        formatted: `R$ ${r.total.toFixed(2)}`,
        percent: grandTotal > 0 ? ((r.total / grandTotal) * 100).toFixed(1) : "0.0",
      })),
    };
  },
};