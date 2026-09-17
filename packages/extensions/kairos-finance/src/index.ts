/**
 * kairos-finance — extensão financeira pessoal do Kairós.
 *
 * Tools expostas (namespace "finance:*"):
 *   - finance:expense:add        registra despesa
 *   - finance:expense:list       lista despesas com filtros
 *   - finance:expense:summary    soma por categoria (período)
 *   - finance:invoice:create     cria fatura a receber
 *   - finance:invoice:list       lista faturas com aging
 *   - finance:invoice:mark-paid  marca como paga
 *   - finance:profit-loss        DRE: receitas - despesas
 *   - finance:status             snapshot rápido do mês
 *
 * Storage: <workspace>/kairos-finance.db (SQLite local, persistente).
 *
 * Inspirado em openaccountant/skills (44 SKILL.md files) — apenas subset mais
 * usado por pessoa física / MEI / pequeno negócio. Sem cloud, sem sync.
 */

import { z } from "zod";
import type { Extension, Tool } from "@kairos/agent";
import { expenseAddTool } from "./tools/expense-add.js";
import { expenseListTool } from "./tools/expense-list.js";
import { expenseSummaryTool } from "./tools/expense-summary.js";
import { invoiceCreateTool } from "./tools/invoice-create.js";
import { invoiceListTool } from "./tools/invoice-list.js";
import { invoiceMarkPaidTool } from "./tools/invoice-mark-paid.js";
import { profitLossTool } from "./tools/profit-loss.js";
import { statusTool } from "./tools/status.js";

const extension: Extension = {
  name: "kairos-finance",
  version: "0.1.0",
  description:
    "Finanças pessoais do Kairós: despesas, faturas, P&L, aging. Persistente em SQLite. " +
    "Subset do openaccountant/skills adaptado para Electron desktop.",
  tools: [
    expenseAddTool,
    expenseListTool,
    expenseSummaryTool,
    invoiceCreateTool,
    invoiceListTool,
    invoiceMarkPaidTool,
    profitLossTool,
    statusTool,
  ] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };