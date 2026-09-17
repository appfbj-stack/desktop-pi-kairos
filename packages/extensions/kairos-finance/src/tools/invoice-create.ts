/**
 * finance:invoice:create — cria uma fatura (a receber).
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore, nowIso, todayDate, type Invoice } from "../store.js";

const inputSchema = z.object({
  client: z.string().min(1).describe("Nome do cliente"),
  amount: z.number().positive().describe("Valor em reais"),
  due_date: z.string().describe("Data de vencimento (YYYY-MM-DD)"),
  description: z.string().optional().describe("Descrição / número da fatura"),
  issue_date: z
    .string()
    .optional()
    .describe("Data de emissão (YYYY-MM-DD). Default: hoje"),
});

export const invoiceCreateTool: Tool<typeof inputSchema> = {
  name: "finance:invoice:create",
  description:
    "Cria uma fatura a receber. Status inicial 'pending'. Use após fechar serviço ou vender algo.",
  inputSchema,
  execute: async (input) => {
    const db = getStore();
    const issue = input.issue_date ?? todayDate();
    const now = nowIso();

    const result = db
      .prepare(
        `INSERT INTO invoices (client, amount, description, issue_date, due_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`
      )
      .run(input.client, input.amount, input.description ?? null, issue, input.due_date, now);

    const item = db
      .prepare("SELECT * FROM invoices WHERE id = ?")
      .get(result.lastInsertRowid) as Invoice;

    return {
      ok: true,
      message: `📄 Fatura de R$ ${item.amount.toFixed(2)} para "${item.client}" criada (vence ${item.due_date}).`,
      item,
    };
  },
};