/**
 * agenda:add — adiciona um compromisso na agenda.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { getStore, nowIso, parseDatetime, type AgendaItem } from "../store.js";

const inputSchema = z.object({
  title: z.string().min(1).max(200).describe("Título do compromisso"),
  datetime: z
    .string()
    .describe(
      "Data e hora em ISO 8601 (ex: '2026-09-20T14:00:00' ou '2026-09-20 14:00'). Converta linguagem natural antes de chamar."
    ),
  notes: z.string().max(2000).optional().describe("Observações opcionais"),
  category: z
    .string()
    .max(50)
    .optional()
    .describe("Categoria (ex: 'igreja', 'pessoal', 'trabalho', 'família')"),
  priority: z
    .number()
    .int()
    .min(0)
    .max(2)
    .default(0)
    .describe("0=normal, 1=alta, 2=urgente"),
});

export const addTool: Tool<typeof inputSchema> = {
  name: "agenda:add",
  description:
    "Adiciona um compromisso na agenda do usuário. OBRIGATÓRIO: converta qualquer data em linguagem natural para ISO 8601 antes de chamar (ex: 'amanhã 14h' → '2026-09-17T14:00:00').",
  dangerous: false,
  inputSchema,
  execute: async (input) => {
    const db = getStore();
    const isoDatetime = parseDatetime(input.datetime);
    const now = nowIso();

    const stmt = db.prepare(
      `INSERT INTO agenda_items (title, notes, datetime, category, priority, completed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    );
    const result = stmt.run(
      input.title,
      input.notes ?? null,
      isoDatetime,
      input.category ?? null,
      input.priority,
      now,
      now
    );

    const item = db
      .prepare("SELECT * FROM agenda_items WHERE id = ?")
      .get(result.lastInsertRowid) as AgendaItem;

    return {
      ok: true,
      message: `Compromisso "${item.title}" adicionado para ${new Date(item.datetime).toLocaleString("pt-BR")}.`,
      item,
    };
  },
};