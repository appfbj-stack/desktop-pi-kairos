/**
 * memory:bootstrap — auto-inject de contexto relevante.
 *
 * Chamado pelo agente no inicio de cada turno/sessao. Combina:
 *   - Daily log de hoje (sempre)
 *   - Scratchpad com itens abertos (sempre)
 *   - Inbox pendente (sempre)
 *   - Top-K memoria canonica relevante (se query/prompt fornecido)
 *
 * Retorna markdown pronto pra ser prependado no system prompt do LLM.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { readDailyLog, todayString, buildDailyDigest } from "../daily.js";
import { listScratchpadItems } from "../scratchpad.js";
import { listPending } from "../inbox.js";
import type { IntelligenceSearch } from "../search.js";

const inputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe("Query pra buscar memoria canonica relevante (top-K). Omitir = sem RAG."),
  topK: z.number().int().min(1).max(10).optional().default(5),
  maxChars: z.number().int().min(500).max(20000).optional().default(6000),
});

export const bootstrapTool: (
  root: () => string,
  searchRef: () => IntelligenceSearch
) => Tool<typeof inputSchema> = (root, searchRef) => ({
  name: "memory:bootstrap",
  description:
    "Auto-inject de contexto persistente do Kairós. " +
    "Retorna markdown pronto pra ser prependado no system prompt. " +
    "Inclui daily log de hoje, scratchpad aberto, inbox pendente, e (se query fornecida) " +
    "top-K memoria canonica relevante. Chame sempre no inicio de uma sessao nova.",
  inputSchema,
  execute: async (input) => {
    const r = root();
    const search = searchRef();

    // Daily digest
    const daily = readDailyLog(r, todayString());
    const dailyDigest = buildDailyDigest(daily, 2000);

    // Scratchpad aberto
    const scratchpad = listScratchpadItems(r).filter((i) => !i.done);

    // Inbox pendente
    const inbox = listPending(r);

    // RAG (se query)
    let ragHits: Awaited<ReturnType<IntelligenceSearch["search"]>> = [];
    if (input.query && input.query.trim()) {
      try {
        ragHits = await search.search({ query: input.query, mode: "deep", limit: input.topK });
      } catch {
        ragHits = [];
      }
    }

    const sections: Array<{ label: string; content: string }> = [];

    if (ragHits.length > 0) {
      sections.push({
        label: "## Memória relevante (RAG)",
        content: ragHits
          .map((h) => `- [${h.layer}, conf ${h.confidence.toFixed(2)}, score ${h.score.toFixed(2)}] ${h.statement}`)
          .join("\n"),
      });
    }

    if (inbox.length > 0) {
      sections.push({
        label: "## Inbox pendente (precisa ratificação)",
        content: inbox
          .slice(0, 5)
          .map((c) => `- [${c.proposed_layer}] ${c.text}${c.tags.length ? ` _(${c.tags.join(", ")})_` : ""}`)
          .join("\n"),
      });
    }

    if (scratchpad.length > 0) {
      sections.push({
        label: "## Scratchpad (tarefas em aberto)",
        content: scratchpad.map((s) => `- [ ] ${s.text}`).join("\n"),
      });
    }

    if (dailyDigest) {
      sections.push({
        label: `## Daily log (${todayString()})`,
        content: dailyDigest,
      });
    }

    // Junta com budget cap
    const total = sections.reduce((acc, s) => acc + s.content.length + s.label.length + 4, 0);
    let final = sections.map((s) => `${s.label}\n${s.content}`).join("\n\n");
    if (final.length > input.maxChars) {
      final = final.slice(0, input.maxChars - 20) + "\n\n... (truncated)";
    }

    return {
      ok: true,
      today: todayString(),
      sections_included: sections.length,
      total_chars: final.length,
      hits: ragHits.length,
      pending_candidates: inbox.length,
      open_scratchpad: scratchpad.length,
      markdown: final || "(sem contexto persistente relevante)",
      _budget: { total_untrimmed: total, max: input.maxChars },
    };
  },
});
