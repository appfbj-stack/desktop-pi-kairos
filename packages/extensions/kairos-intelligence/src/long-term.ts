/**
 * Long-term memory — L1 (identity) + L2 (playbooks) records.
 *
 * Adaptado de pi-persistent-intelligence + simplificado:
 *   - L1: identity (informacoes pessoais, preferencias firmes). Nunca auto-aplica.
 *   - L2: playbooks, decisoes de projeto, workflow preferences. Promovido a partir do inbox.
 *
 * Schema de MemoryRecord (JSONL):
 *   {
 *     id: string         - ex: "mem_20260916_a4f9"
 *     layer: "L1" | "L2"
 *     statement: string  - texto canonico da memoria
 *     tags: string[]
 *     confidence: number 0..1
 *     stability: "permanent" | "long_term" | "project" | "task" | "temporary"
 *     status: "active" | "deleted" | "superseded"
 *     source: { type, ref, cwd? }
 *     created_at: ISO string
 *     updated_at: ISO string
 *     superseded_by?: string
 *   }
 */

import { randomUUID } from "node:crypto";
import { appendJsonl, readJsonl, writeJsonlAtomic } from "./jsonl.js";
import { ensureMemoryDirs } from "./paths.js";

export type Layer = "L1" | "L2";
export type Stability = "permanent" | "long_term" | "project" | "task" | "temporary";
export type Status = "active" | "deleted" | "superseded";

export interface MemoryRecord {
  id: string;
  layer: Layer;
  statement: string;
  tags: string[];
  confidence: number;
  stability: Stability;
  status: Status;
  source: { type: "manual" | "inbox" | "import"; ref?: string; cwd?: string };
  created_at: string;
  updated_at: string;
  superseded_by?: string;
  notes?: string;
}

export function newId(layer: Layer): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${layer.toLowerCase()}-${ts}-${rand}`;
}

function pathFor(root: string, layer: Layer): string {
  const p = ensureMemoryDirs(root);
  return layer === "L1" ? p.memory.L1 : p.memory.L2;
}

export function listRecords(root: string, layer?: Layer): MemoryRecord[] {
  const layers: Layer[] = layer ? [layer] : ["L1", "L2"];
  const all: MemoryRecord[] = [];
  for (const l of layers) all.push(...readJsonl<MemoryRecord>(pathFor(root, l)));
  return all.filter((r) => r.status !== "deleted");
}

export function listActive(root: string): MemoryRecord[] {
  return listRecords(root).filter((r) => r.status === "active");
}

export function getRecord(root: string, id: string): MemoryRecord | null {
  return listRecords(root).find((r) => r.id === id) ?? null;
}

/** Adiciona record direto no L1 ou L2 (bypass inbox). Use com cuidado — vai pro canonico. */
export function appendRecord(
  root: string,
  layer: Layer,
  input: Omit<MemoryRecord, "id" | "layer" | "created_at" | "updated_at" | "status">
): MemoryRecord {
  const now = new Date().toISOString();
  const rec: MemoryRecord = {
    id: newId(layer),
    layer,
    status: "active",
    created_at: now,
    updated_at: now,
    ...input,
  };
  appendJsonl(pathFor(root, layer), rec);
  return rec;
}

/** Supersede um record: marca como superseded_by, nao deleta (audit). */
export function supersedeRecord(root: string, oldId: string, newId: string): void {
  const old = getRecord(root, oldId);
  if (!old) throw new Error(`Record nao encontrado: ${oldId}`);
  const updated = { ...old, status: "superseded" as const, superseded_by: newId, updated_at: new Date().toISOString() };
  const all = readJsonl<MemoryRecord>(pathFor(root, old.layer));
  const idx = all.findIndex((r) => r.id === oldId);
  if (idx < 0) return;
  all[idx] = updated;
  writeJsonlAtomic(pathFor(root, old.layer), all);
}

/** Soft-delete (mantem audit trail em tombstones). */
export function deleteRecord(root: string, id: string): void {
  const rec = getRecord(root, id);
  if (!rec) return;
  const updated = { ...rec, status: "deleted" as const, updated_at: new Date().toISOString() };
  const all = readJsonl<MemoryRecord>(pathFor(root, rec.layer));
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) return;
  all[idx] = updated;
  writeJsonlAtomic(pathFor(root, rec.layer), all);
  appendJsonl(ensureMemoryDirs(root).memory.tombstones, { id, deleted_at: updated.updated_at });
}

export function searchByTags(root: string, tags: string[]): MemoryRecord[] {
  const all = listActive(root);
  return all.filter((r) => tags.some((t) => r.tags.includes(t)));
}
