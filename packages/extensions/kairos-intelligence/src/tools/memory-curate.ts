/**
 * memory:curate — promote/reject inbox candidates.
 *
 * Acoes:
 *   - list: lista candidates pendentes
 *   - promote: promove a L1 ou L2 (canonical)
 *   - reject: deleta o candidate (sem ir pro canonico)
 *   - supersede: marca um record antigo como superseded_by um novo
 *
 * Promoted records entram no canonico (JSONL) e sao indexados pelo FTS.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { listPending, updateCandidate } from "../inbox.js";
import {
  appendRecord,
  supersedeRecord,
  type Layer,
} from "../long-term.js";
import { MemoryFtsIndex, syncFts } from "../fts.js";
import { renderMemory } from "../store.js";

const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
  }),
  z.object({
    action: z.literal("promote"),
    candidate_id: z.string().describe("ID do candidate no inbox."),
    layer: z.enum(["L1", "L2"]).describe("Camada canonica: L1 (identity) ou L2 (playbook)."),
    confidence: z.number().min(0).max(1).optional(),
    notes: z.string().optional(),
    supersedes: z.string().optional().describe("ID de MemoryRecord a marcar como superseded."),
  }),
  z.object({
    action: z.literal("reject"),
    candidate_id: z.string(),
    reason: z.string().optional(),
  }),
]);

export const memoryCurateTool: (root: () => string) => Tool<typeof inputSchema> = (root) => ({
  name: "memory:curate",
  description:
    "Curadoria do inbox de memoria. Promove candidates a L1/L2 (canonical), " +
    "rejeita, ou supersede records antigos. Roda depois de memory:write target=long_term. " +
    "Sempre revise antes de promover — eh a unica barreira contra lixo semantico.",
  dangerous: true,
  inputSchema,
  execute: async (input) => {
    const r = root();
    if (input.action === "list") {
      const list = listPending(r);
      return {
        ok: true,
        count: list.length,
        candidates: list,
      };
    }
    if (input.action === "reject") {
      const updated = updateCandidate(r, input.candidate_id, {
        status: "rejected",
        notes: input.reason,
      });
      if (!updated) return { ok: false, error: "candidate nao encontrado" };
      return { ok: true, action: "reject", candidate_id: input.candidate_id };
    }
    // promote
    const list = listPending(r);
    const candidate = list.find((c) => c.id === input.candidate_id);
    if (!candidate) return { ok: false, error: "candidate nao encontrado no inbox" };

    const layer: Layer = input.layer;
    const rec = appendRecord(r, layer, {
      statement: candidate.text,
      tags: candidate.tags,
      confidence: input.confidence ?? candidate.confidence,
      stability: layer === "L1" ? "permanent" : "long_term",
      source: { type: "inbox", ref: candidate.id, cwd: process.cwd() },
      notes: input.notes,
    });
    if (input.supersedes) {
      try {
        supersedeRecord(r, input.supersedes, rec.id);
      } catch {
        // supersede eh opcional; falha aqui nao aborta a promocao
      }
    }
    updateCandidate(r, candidate.id, { status: "promoted", promoted_to: rec.id });
    syncFts(r, new MemoryFtsIndex(r));
    renderMemory(r);
    void MemoryFtsIndex; // garante import usado

    return {
      ok: true,
      action: "promote",
      candidate_id: candidate.id,
      promoted_to: rec.id,
      layer: rec.layer,
    };
  },
});
