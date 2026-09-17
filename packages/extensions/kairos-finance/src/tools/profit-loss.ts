/**
 * finance:profit-loss — DRE simples (receitas de invoices pagas - despesas).
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore } from "../store.js";

const inputSchema = z.object({
  from: z.string().optional().describe("ISO date. Default: início do mês atual"),
  to: z.string().optional().describe("ISO date. Default: hoje"),
});

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export const profitLossTool: Tool<typeof inputSchema> = {
  name: "finance:profit-loss",
  description:
    "Calcula lucro/prejuízo no período: soma faturas PAGAS (receita) - soma despesas. Mostra também breakdown por categoria.",
  inputSchema,
  execute: async (input) => {
    const db = getStore();
    const range = defaultRange();
    const from = input.from ?? range.from;
    const to = input.to ?? range.to;

    const revRow = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
         FROM invoices
         WHERE status = 'paid' AND paid_date >= ? AND paid_date <= ?`
      )
      .get(from, to) as { total: number; count: number };

    const expByCat = db
      .prepare(
        `SELECT category, SUM(amount) as total
         FROM expenses
         WHERE date >= ? AND date <= ?
         GROUP BY category ORDER BY total DESC`
      )
      .all(from, to) as { category: string; total: number }[];

    const totalExpenses = expByCat.reduce((s, r) => s + r.total, 0);
    const revenue = revRow.total;
    const profit = revenue - totalExpenses;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "0.0";

    return {
      from,
      to,
      revenue: {
        total: revenue,
        invoiceCount: revRow.count,
        formatted: `R$ ${revenue.toFixed(2)}`,
      },
      expenses: {
        total: totalExpenses,
        formatted: `R$ ${totalExpenses.toFixed(2)}`,
        byCategory: expByCat.map((r) => ({
          category: r.category,
          total: r.total,
          formatted: `R$ ${r.total.toFixed(2)}`,
        })),
      },
      profit,
      profitFormatted: `R$ ${profit.toFixed(2)}`,
      marginPercent: margin,
      profitable: profit > 0,
      message:
        profit >= 0
          ? `📈 Lucro de R$ ${profit.toFixed(2)} (margem ${margin}%) no período.`
          : `📉 Prejuízo de R$ ${Math.abs(profit).toFixed(2)} no período.`,
    };
  },
};