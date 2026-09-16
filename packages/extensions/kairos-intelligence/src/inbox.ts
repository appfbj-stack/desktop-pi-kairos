/**
 * Inbox — candidates aguardando ratificacao.
 *
 * Quando o usuario/escritor pede pra escrever algo em long_term, vai pra inbox primeiro.
 * Depois o usuario (via memory_curate tool) promove cada candidato pra L1 ou L2,
 * ou deleta. Isso da uma camada de governanca antes do canonico.
 *
 * Adaptado de pi-persistent-intelligence/src/inbox.ts (versao simplificada —
 * sem memory-worth scoring, sem evidence; soh candidate-first review).
 */

import { appendJsonl, readJsonl, writeJsonlAtomic } from "./jsonl.js";
import { ensureMemoryDirs } from "./paths.js";
import type { Layer } from "./long-term.js";

export type CandidateStatus = "new" | "approved" | "rejected" | "promoted";

export interface Candidate {
  id: string;
  created_at: string;
  text: string;
  tags: string[];
  proposed_layer: Layer;
  confidence: number;
  source: { type: "user" | "agent" | "import"; ref?: string; cwd?: string };
  status: CandidateStatus;
  promoted_to?: string;        // ID do MemoryRecord apos promocao
  notes?: string;
}

export function listCandidates(root: string): Candidate[] {
  return readJsonl<Candidate>(ensureMemoryDirs(root).inbox.captured);
}

export function appendCandidate(root: string, candidate: Candidate): void {
  appendJsonl(ensureMemoryDirs(root).inbox.captured, candidate);
}

export function updateCandidate(root: string, id: string, patch: Partial<Candidate>): Candidate | null {
  const all = listCandidates(root);
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const updated: Candidate = { ...all[idx]!, ...patch };
  all[idx] = updated;
  writeJsonlAtomic(ensureMemoryDirs(root).inbox.captured, all);
  return updated;
}

export function getCandidate(root: string, id: string): Candidate | null {
  return listCandidates(root).find((c) => c.id === id) ?? null;
}

export function listPending(root: string): Candidate[] {
  return listCandidates(root).filter((c) => c.status === "new");
}

export function newCandidateId(): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6);
  return `cap-${ts}-${rand}`;
}
