/**
 * finance:status — snapshot rápido: totais do mês + faturas vencidas.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore } from "../store.js";

const inputSchema = z.object({});

function firstOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export const statusTool: Tool<typeof inputSchema> = {
  name: "finance:status",
  description:
    "Mostra um snapshot rápido: total de despesas do mês, total a receber (faturas pendentes), e quantas vencidas.",
  inputSchema,
  execute: async () => {
    const db = getStore();
    const from = firstOfMonth();
    const to = todayDate();

    const exp = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
         FROM expenses WHERE date >= ? AND date <= ?`
      )
      .get(from, to) as { total: number; count: number };

    const pend = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
         FROM invoices WHERE status = 'pending'`
      )
      .get() as { total: number; count: number };

    const overdue = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
         FROM invoices WHERE status = 'pending' AND due_date < ?`
      )
      .get(to) as { total: number; count: number };

    return {
      monthRange: { from, to },
      expensesMonth: {
        total: exp.total,
        count: exp.count,
        formatted: `R$ ${exp.total.toFixed(2)}`,
      },
      pendingInvoices: {
        total: pend.total,
        count: pend.count,
        formatted: `R$ ${pend.total.toFixed(2)}`,
      },
      overdueInvoices: {
        total: overdue.total,
        count: overdue.count,
        formatted: `R$ ${overdue.total.toFixed(2)}`,
      },
    };
  },
};