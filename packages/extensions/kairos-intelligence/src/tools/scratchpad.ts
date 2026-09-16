/**
 * scratchpad — gerencia checklist de tarefas em aberto.
 *
 * action=add: adiciona item
 * action=done: marca como concluido
 * action=undo: reverte conclusao
 * action=clear_done: remove todos os concluidos
 * action=list: lista atual (default)
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import {
  addScratchpadItem,
  clearDoneScratchpadItems,
  listScratchpadItems,
  markScratchpadDone,
  markScratchpadUndone,
} from "../scratchpad.js";

const inputSchema = z.object({
  action: z
    .enum(["add", "done", "undo", "clear_done", "list"])
    .default("list")
    .describe("Acao no scratchpad."),
  text: z.string().optional().describe("Texto do item (add) ou substring pra match (done/undo)."),
});

export const scratchpadTool: (root: () => string) => Tool<typeof inputSchema> = (root) => ({
  name: "scratchpad",
  description:
    "Gerencia o checklist do scratchpad do Kairós. " +
    "Aparece no auto-inject no inicio de cada sessao. " +
    "Use pra anotar tarefas em aberto, TODO, lembretes.",
  inputSchema,
  execute: async (input) => {
    const r = root();
    try {
      if (input.action === "add") {
        if (!input.text) throw new Error("text obrigatorio pra action=add");
        addScratchpadItem(r, input.text);
      } else if (input.action === "done") {
        if (!input.text) throw new Error("text obrigatorio pra action=done");
        markScratchpadDone(r, input.text);
      } else if (input.action === "undo") {
        if (!input.text) throw new Error("text obrigatorio pra action=undo");
        markScratchpadUndone(r, input.text);
      } else if (input.action === "clear_done") {
        clearDoneScratchpadItems(r);
      }
      const items = listScratchpadItems(r);
      return {
        ok: true,
        action: input.action,
        count: items.length,
        open: items.filter((i) => !i.done).length,
        markdown: items.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`).join("\n") || "(empty)",
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
});
