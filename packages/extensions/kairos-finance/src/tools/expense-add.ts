/**
 * finance:expense:add — registra uma despesa.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore, nowIso, type Expense } from "../store.js";

const inputSchema = z.object({
  amount: z.number().positive().describe("Valor em reais (ex: 49.90)"),
  category: z
    .string()
    .min(1)
    .describe("Categoria (ex: 'alimentação', 'transporte', 'material', 'serviços')"),
  date: z
    .string()
    .optional()
    .describe("Data ISO (YYYY-MM-DD). Default: hoje"),
  vendor: z.string().optional().describe("Fornecedor / onde comprou"),
  notes: z.string().optional().describe("Observações"),
  payment_method: z
    .enum(["dinheiro", "pix", "cartao_credito", "cartao_debito", "boleto", "transferencia", "outro"])
    .optional()
    .describe("Forma de pagamento"),
});

export const expenseAddTool: Tool<typeof inputSchema> = {
  name: "finance:expense:add",
  description:
    "Registra uma despesa. Use ao adicionar nota fiscal, recibo ou gasto avulso. " +
    "Converta valores em linguagem natural para número (ex: 'quarenta e nove e noventa' → 49.90).",
  inputSchema,
  execute: async (input) => {
    const db = getStore();
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    const now = nowIso();

    const result = db
      .prepare(
        `INSERT INTO expenses (date, amount, category, vendor, notes, payment_method, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        date,
        input.amount,
        input.category,
        input.vendor ?? null,
        input.notes ?? null,
        input.payment_method ?? null,
        now
      );

    const item = db
      .prepare("SELECT * FROM expenses WHERE id = ?")
      .get(result.lastInsertRowid) as Expense;

    return {
      ok: true,
      message: `💸 Despesa de R$ ${item.amount.toFixed(2)} em "${item.category}" registrada.`,
      item,
    };
  },
};