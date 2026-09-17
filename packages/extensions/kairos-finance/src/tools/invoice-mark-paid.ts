/**
 * finance:invoice:mark-paid — marca uma fatura como paga.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore, nowIso, type Invoice } from "../store.js";

const inputSchema = z.object({
  id: z.number().int().positive().describe("ID da fatura"),
  paid_date: z
    .string()
    .optional()
    .describe("Data do pagamento (YYYY-MM-DD). Default: hoje"),
});

export const invoiceMarkPaidTool: Tool<typeof inputSchema> = {
  name: "finance:invoice:mark-paid",
  description: "Marca uma fatura como paga.",
  inputSchema,
  execute: async (input) => {
    const db = getStore();
    const existing = db
      .prepare("SELECT * FROM invoices WHERE id = ?")
      .get(input.id) as Invoice | undefined;
    if (!existing) throw new Error(`Fatura ${input.id} não encontrada.`);
    if (existing.status === "paid") {
      return { ok: true, message: `Fatura ${input.id} já estava paga.`, item: existing };
    }

    const paidDate = input.paid_date ?? new Date().toISOString().slice(0, 10);
    db.prepare(
      "UPDATE invoices SET status = 'paid', paid_date = ? WHERE id = ?"
    ).run(paidDate, input.id);

    const updated = db
      .prepare("SELECT * FROM invoices WHERE id = ?")
      .get(input.id) as Invoice;

    return {
      ok: true,
      message: `✅ Fatura ${input.id} de "${updated.client}" marcada como paga em ${paidDate}.`,
      item: updated,
    };
  },
};