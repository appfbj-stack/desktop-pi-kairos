/**
 * Store de memória persistente (gentle-engram style).
 *
 * Schema:
 *   business_context (id, key UNIQUE, value, category, importance, created_at, last_used_at, usage_count, source_session_id)
 *
 * Categorias pré-definidas:
 *   - business    : sobre o negócio do cliente (segmento, tamanho, etc)
 *   - contact     : pessoas, emails, telefones
 *   - preference  : preferências de trabalho (formato, idioma)
 *   - decision    : decisões tomadas (ex: "usar Postgres")
 *   - task        : tarefas pendentes ou concluídas
 *   - other       : qualquer outro contexto
 *
 * Importance: 1 (baixa) a 5 (crítica)
 *
 * Quando o user chama `recall`, conta usage_count e atualiza last_used_at
 * (LRU implícito — entradas velhas e não-usadas podem ser limpas depois).
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { logger } from "@kairos/core";

export type MemoryCategory = "business" | "contact" | "preference" | "decision" | "task" | "other";

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  category: MemoryCategory;
  importance: number; // 1-5
  createdAt: number;
  lastUsedAt: number;
  usageCount: number;
  sourceSessionId: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS business_context (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  importance INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  source_session_id TEXT
);
CREATE INDEX IF NOT EXISTS bizctx_key_idx ON business_context(key);
CREATE INDEX IF NOT EXISTS bizctx_cat_idx ON business_context(category);
CREATE INDEX IF NOT EXISTS bizctx_importance_idx ON business_context(importance DESC);
CREATE INDEX IF NOT EXISTS bizctx_lru_idx ON business_context(last_used_at DESC);
`;

let schemaReady = false;
function ensureSchema(db: Database.Database): void {
  if (schemaReady) return;
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  schemaReady = true;
}

function getDb(): Database.Database {
  const db = (globalThis as any).__kairosDb;
  if (!db) throw new Error("DB não disponível. Kairos-core precisa estar inicializado.");
  return db as Database.Database;
}

/** Salva ou atualiza uma memória (upsert por key). */
export function remember(
  key: string,
  value: string,
  options: { category?: MemoryCategory; importance?: number; sourceSessionId?: string } = {},
): MemoryEntry {
  const db = getDb();
  ensureSchema(db);
  const now = Date.now();
  const category = options.category ?? "other";
  const importance = Math.max(1, Math.min(5, options.importance ?? 3));

  // upsert: se já existe, atualiza value/category/importance e reseta last_used_at
  const existing = db
    .prepare("SELECT id, created_at, usage_count, last_used_at FROM business_context WHERE key = ?")
    .get(key) as { id: string; created_at: number; usage_count: number; last_used_at: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE business_context
       SET value = ?, category = ?, importance = ?, last_used_at = ?
       WHERE key = ?`,
    ).run(value, category, importance, now, key);
    logger.info({ key, category, importance }, "memory: atualizada");
    return {
      id: existing.id,
      key,
      value,
      category,
      importance,
      createdAt: existing.created_at,
      lastUsedAt: now,
      usageCount: existing.usage_count,
      sourceSessionId: options.sourceSessionId ?? null,
    };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO business_context (id, key, value, category, importance, created_at, last_used_at, usage_count, source_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(id, key, value, category, importance, now, now, options.sourceSessionId ?? null);
  logger.info({ key, category, importance }, "memory: criada");
  return { id, key, value, category, importance, createdAt: now, lastUsedAt: now, usageCount: 0, sourceSessionId: options.sourceSessionId ?? null };
}

/** Recupera memórias por key ou query (LIKE em key/value). Incrementa usage_count. */
export function recall(query: string, options: { category?: MemoryCategory; limit?: number } = {}): MemoryEntry[] {
  const db = getDb();
  ensureSchema(db);
  const limit = options.limit ?? 10;
  const term = `%${query.toLowerCase()}%`;

  let rows: any[];
  if (options.category) {
    rows = db
      .prepare(
        `SELECT id, key, value, category, importance, created_at as createdAt, last_used_at as lastUsedAt, usage_count as usageCount, source_session_id as sourceSessionId
         FROM business_context
         WHERE category = ? AND (LOWER(key) LIKE ? OR LOWER(value) LIKE ?)
         ORDER BY importance DESC, last_used_at DESC
         LIMIT ?`,
      )
      .all(options.category, term, term, limit);
  } else {
    rows = db
      .prepare(
        `SELECT id, key, value, category, importance, created_at as createdAt, last_used_at as lastUsedAt, usage_count as usageCount, source_session_id as sourceSessionId
         FROM business_context
         WHERE LOWER(key) LIKE ? OR LOWER(value) LIKE ?
         ORDER BY importance DESC, last_used_at DESC
         LIMIT ?`,
      )
      .all(term, term, limit);
  }

  // Incrementa usage_count + last_used_at pra LRU
  if (rows.length > 0) {
    const now = Date.now();
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(
      `UPDATE business_context
       SET usage_count = usage_count + 1, last_used_at = ?
       WHERE id IN (${placeholders})`,
    ).run(now, ...ids);
  }
  return rows as MemoryEntry[];
}

/** Lista todas as memórias, ordenadas por importance + LRU. */
export function listAll(options: { category?: MemoryCategory; limit?: number } = {}): MemoryEntry[] {
  const db = getDb();
  ensureSchema(db);
  const limit = options.limit ?? 100;
  if (options.category) {
    return db
      .prepare(
        `SELECT id, key, value, category, importance, created_at as createdAt, last_used_at as lastUsedAt, usage_count as usageCount, source_session_id as sourceSessionId
         FROM business_context
         WHERE category = ?
         ORDER BY importance DESC, last_used_at DESC
         LIMIT ?`,
      )
      .all(options.category, limit) as MemoryEntry[];
  }
  return db
    .prepare(
      `SELECT id, key, value, category, importance, created_at as createdAt, last_used_at as lastUsedAt, usage_count as usageCount, source_session_id as sourceSessionId
       FROM business_context
       ORDER BY importance DESC, last_used_at DESC
       LIMIT ?`,
    )
    .all(limit) as MemoryEntry[];
}

/** Esquece (deleta) uma memória por key. */
export function forget(key: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const res = db.prepare("DELETE FROM business_context WHERE key = ?").run(key);
  if (res.changes > 0) logger.info({ key }, "memory: removida");
  return res.changes > 0;
}

/** Conta total de memórias. */
export function count(): number {
  const db = getDb();
  ensureSchema(db);
  const row = db.prepare("SELECT COUNT(*) as c FROM business_context").get() as { c: number };
  return row.c;
}
