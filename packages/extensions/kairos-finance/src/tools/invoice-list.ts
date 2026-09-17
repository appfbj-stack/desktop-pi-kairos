/**
 * finance:invoice:list — lista faturas com filtros e aging.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore, agingBucket, type Invoice } from "../store.js";

const inputSchema = z.object({
  status: z
    .enum(["pending", "paid", "overdue", "cancelled", "all"])
    .default("all")
    .describe("Filtra por status"),
  from: z.string().optional().describe("ISO date. Filtra por due_date >= from"),
  to: z.string().optional().describe("ISO date. Filtra por due_date <= to"),
  client: z.string().optional().describe("Filtra por cliente (LIKE)"),
  limit: z.number().int().min(1).max(500).default(100),
});

export const invoiceListTool: Tool<typeof inputSchema> = {
  name: "finance:invoice:list",
  description:
    "Lista faturas com filtros. Aging automático: cada item vem com campo `aging` (a_vencer/vencido/pago).",
  inputSchema,
  execute: async (input) => {
    const db = getStore();
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (input.status !== "all") {
      clauses.push("status = ?");
      params.push(input.status);
    }
    if (input.from) {
      clauses.push("due_date >= ?");
      params.push(input.from);
    }
    if (input.to) {
      clauses.push("due_date <= ?");
      params.push(input.to);
    }
    if (input.client) {
      clauses.push("client LIKE ?");
      params.push(`%${input.client}%`);
    }
    params.push(input.limit);

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const items = db
      .prepare(`SELECT * FROM invoices ${where} ORDER BY due_date ASC LIMIT ?`)
      .all(...params) as Invoice[];

    const totalAmount = items.reduce((s, i) => s + i.amount, 0);

    return {
      count: items.length,
      totalAmount,
      totalFormatted: `R$ ${totalAmount.toFixed(2)}`,
      items: items.map((i) => ({
        ...i,
        aging: agingBucket(i.due_date, i.status),
      })),
    };
  },
};