/**
 * memory:read — le conteudo da memoria persistente.
 *
 * target=long_term: retorna a projection MEMORY.md (Markdown rendered).
 * target=daily: retorna o log de hoje.
 * target=scratchpad: retorna checklist.
 * target=inbox: retorna candidates pendentes (JSON).
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { readDailyLog, todayString } from "../daily.js";
import { listScratchpadItems } from "../scratchpad.js";
import { listPending, listCandidates } from "../inbox.js";
import { renderMemory } from "../store.js";

const inputSchema = z.object({
  target: z
    .enum(["long_term", "daily", "scratchpad", "inbox"])
    .describe(
      "O que ler: long_term (MEMORY.md renderizado), daily (log de hoje), " +
        "scratchpad (checklist atual), inbox (candidates pendentes)."
    ),
  date: z.string().optional().describe("Data especifica pra daily (YYYY-MM-DD). Default: hoje."),
  status: z.enum(["new", "all"]).optional().default("new").describe("Filtro inbox."),
});

export const memoryReadTool: (root: () => string) => Tool<typeof inputSchema> = (root) => ({
  name: "memory:read",
  description:
    "Le conteudo da memoria persistente do Kairós. " +
    "Use pra revisar o que o agente ja sabe sobre o usuario antes de fazer suposicoes, " +
    "ou pra auditar o scratchpad/inbox.",
  inputSchema,
  execute: async (input) => {
    const r = root();
    if (input.target === "long_term") {
      const markdown = renderMemory(r);
      return {
        ok: true,
        target: "long_term",
        markdown,
      };
    }
    if (input.target === "daily") {
      const date = input.date ?? todayString();
      const content = readDailyLog(r, date);
      return {
        ok: true,
        target: "daily",
        date,
        content: content || "(empty)",
      };
    }
    if (input.target === "scratchpad") {
      const items = listScratchpadItems(r);
      return {
        ok: true,
        target: "scratchpad",
        items: items.map((i) => ({ done: i.done, text: i.text })),
        markdown: items.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`).join("\n") || "(empty)",
      };
    }
    if (input.target === "inbox") {
      const list = input.status === "new" ? listPending(r) : listCandidates(r);
      return {
        ok: true,
        target: "inbox",
        count: list.length,
        candidates: list,
      };
    }
    return { ok: false, error: "target desconhecido" };
  },
});
