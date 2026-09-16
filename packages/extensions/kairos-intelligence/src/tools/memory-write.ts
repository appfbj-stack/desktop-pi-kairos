/**
 * memory:write — append-only write to PI memory.
 *
 * target=daily: append direto no daily log de hoje (Markdown). Contexto de sessao.
 * target=long_term: cria candidate no inbox (aguarda ratificacao via memory_curate).
 * target=identity: idem long_term mas flagged como L1 (nao auto-aplica).
 *
 * IMPORTANT: long_term nunca vai direto pro canonico. Vai pro inbox primeiro.
 * Isso evita que lixo semantico ou instrucoes momentaneas poluam a memoria duravel.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { appendDailyLog, todayString } from "../daily.js";
import { appendCandidate, newCandidateId } from "../inbox.js";
import { syncFts } from "../fts.js";
import { renderMemory } from "../store.js";
import type { IntelligenceSearch } from "../search.js";
import type { Layer } from "../long-term.js";
import { MemoryFtsIndex } from "../fts.js";

const inputSchema = z.object({
  target: z
    .enum(["daily", "long_term", "identity"])
    .describe(
      "Onde gravar: 'daily' = log de hoje (Markdown, contexto de sessao). " +
        "'long_term' = playbook/decisao duravel, vai pro inbox pra ratificacao. " +
        "'identity' = info pessoal/preferencia firme (L1), tambem vai pro inbox."
    ),
  content: z
    .string()
    .min(1)
    .describe("Texto a ser salvo. Sem markdown pesado — frase declarativa."),
  tags: z.array(z.string()).optional().default([]).describe("Tags pra categorizar."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.7)
    .describe("Confianca inicial (0..1). Long-term items podem ser ajustados depois."),
});

export const memoryWriteTool: (
  root: () => string,
  searchRef: () => IntelligenceSearch
) => Tool<typeof inputSchema> = (root, searchRef) => ({
  name: "memory:write",
  description:
    "Salva na memoria persistente do Kairós. " +
    "target='daily' grava direto no log de hoje (contexto de sessao). " +
    "target='long_term' ou 'identity' cria um candidate que aparece no inbox pra ratificacao " +
    "(use memory:curate pra promover a L1/L2 depois). " +
    "Use pra anotar decisoes, preferencias, fatos recorrentes, contexto de projetos.",
  dangerous: true,
  inputSchema,
  execute: async (input) => {
    const r = root();
    const search = searchRef();
    if (input.target === "daily") {
      appendDailyLog(r, todayString(), `<!-- ${new Date().toISOString()} -->\n${input.content}`);
      return {
        ok: true,
        target: "daily",
        date: todayString(),
        hint: "Appended to daily log. Visivel no auto-inject da proxima sessao.",
      };
    }

    const layer: Layer = input.target === "identity" ? "L1" : "L2";
    const candidate = {
      id: newCandidateId(),
      created_at: new Date().toISOString(),
      text: input.content,
      tags: input.tags,
      proposed_layer: layer,
      confidence: input.confidence,
      source: { type: "agent" as const, cwd: process.cwd() },
      status: "new" as const,
    };
    appendCandidate(r, candidate);
    return {
      ok: true,
      target: input.target,
      candidate_id: candidate.id,
      proposed_layer: layer,
      hint: `Candidate criado no inbox. Use memory:curate para promover a ${layer} ou deletar.`,
    };
  },
});
