/**
 * Store de memória persistente (gentle-engram style).
 *
 * Schema (multi-tenant via client_id):
 *   business_context (id, client_id, key UNIQUE-per-tenant, value, category, importance, created_at, last_used_at, usage_count, source_session_id)
 *
 * Categorias: business, contact, preference, decision, task, other.
 * Importance: 1-5.
 *
 * Tenant atual vem de globalThis.__kairosClientId (setado pelo agent-instance no login).
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { logger } from "@kairos/core";

export type MemoryCategory = "business" | "contact" | "preference" | "decision" | "task" | "other";

export interface MemoryEntry {
  id: string;
  clientId: string | null;
  key: string;
  value: string;
  category: MemoryCategory;
  importance: number;
  createdAt: number;
  lastUsedAt: number;
  usageCount: number;
  sourceSessionId: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS business_context (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  importance INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  source_session_id TEXT,
  UNIQUE(client_id, key)
);
CREATE INDEX IF NOT EXISTS bizctx_key_idx ON business_context(key);
CREATE INDEX IF NOT EXISTS bizctx_cat_idx ON business_context(category);
CREATE INDEX IF NOT EXISTS bizctx_importance_idx ON business_context(importance DESC);
CREATE INDEX IF NOT EXISTS bizctx_lru_idx ON business_context(last_used_at DESC);
CREATE INDEX IF NOT EXISTS bizctx_client_idx ON business_context(client_id);
`;

let schemaReady = false;
function ensureSchema(db: Database.Database): void {
  if (schemaReady) return;
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  // migrations idempotentes (de tabelas pre-existentes)
  try { db.exec("ALTER TABLE business_context ADD COLUMN client_id TEXT"); } catch { /* já existe */ }
  // UNIQUE(client_id, key) precisa ser recriado pra incluir client_id.
  // Estratégia: dedup por (client_id, key) e dropar índice antigo.
  try {
    // Remove duplicatas: mantém o de maior last_used_at
    db.exec(`DELETE FROM business_context
             WHERE id NOT IN (
               SELECT MIN(id) FROM business_context
               GROUP BY COALESCE(client_id, ''), key
             )`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS bizctx_tenant_key ON business_context(COALESCE(client_id, ''), key)`);
    // Drop UNIQUE antiga se existir (sqlite < 3.36 não tem DROP CONSTRAINT)
    db.exec(`CREATE TABLE IF NOT EXISTS business_context__new (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      importance INTEGER NOT NULL DEFAULT 3,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      source_session_id TEXT
    )`);
    db.exec(`INSERT OR IGNORE INTO business_context__new
             SELECT id, client_id, key, value, category, importance, created_at, last_used_at, usage_count, source_session_id
             FROM business_context`);
    db.exec(`DROP TABLE business_context`);
    db.exec(`ALTER TABLE business_context__new RENAME TO business_context`);
    db.exec(`CREATE INDEX IF NOT EXISTS bizctx_tenant_key ON business_context(COALESCE(client_id, ''), key)`);
    db.exec(`CREATE INDEX IF NOT EXISTS bizctx_client_idx ON business_context(client_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS bizctx_cat_idx ON business_context(category)`);
    db.exec(`CREATE INDEX IF NOT EXISTS bizctx_importance_idx ON business_context(importance DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS bizctx_lru_idx ON business_context(last_used_at DESC)`);
  } catch { /* migração best-effort */ }
  schemaReady = true;
}

function getDb(): Database.Database {
  const db = (globalThis as any).__kairosDb;
  if (!db) throw new Error("DB não disponível. Kairos-core precisa estar inicializado.");
  return db as Database.Database;
}

function currentClientId(): string | null {
  return ((globalThis as any).__kairosClientId as string | null) ?? null;
}

/** Salva ou atualiza uma memória (upsert por client_id+key). */
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
  const cid = currentClientId();
  if (!cid) throw new Error("Sem tenant ativo (não logado)");

  // upsert por (client_id, key)
  const existing = db
    .prepare("SELECT id, created_at, usage_count, last_used_at FROM business_context WHERE client_id = ? AND key = ?")
    .get(cid, key) as { id: string; created_at: number; usage_count: number; last_used_at: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE business_context
       SET value = ?, category = ?, importance = ?, last_used_at = ?
       WHERE client_id = ? AND key = ?`,
    ).run(value, category, importance, now, cid, key);
    logger.info({ key, category, importance, clientId: cid }, "memory: atualizada");
    return {
      id: existing.id,
      clientId: cid,
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
    `INSERT INTO business_context (id, client_id, key, value, category, importance, created_at, last_used_at, usage_count, source_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(id, cid, key, value, category, importance, now, now, options.sourceSessionId ?? null);
  logger.info({ key, category, importance, clientId: cid }, "memory: criada");
  return { id, clientId: cid, key, value, category, importance, createdAt: now, lastUsedAt: now, usageCount: 0, sourceSessionId: options.sourceSessionId ?? null };
}

/** Recupera memórias por query (LIKE em key/value). Incrementa usage_count. */
export function recall(query: string, options: { category?: MemoryCategory; limit?: number } = {}): MemoryEntry[] {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return [];
  const limit = options.limit ?? 10;
  const term = `%${query.toLowerCase()}%`;

  let rows: any[];
  if (options.category) {
    rows = db
      .prepare(
        `SELECT id, client_id as clientId, key, value, category, importance, created_at as createdAt, last_used_at as lastUsedAt, usage_count as usageCount, source_session_id as sourceSessionId
         FROM business_context
         WHERE client_id = ? AND category = ? AND (LOWER(key) LIKE ? OR LOWER(value) LIKE ?)
         ORDER BY importance DESC, last_used_at DESC
         LIMIT ?`,
      )
      .all(cid, options.category, term, term, limit);
  } else {
    rows = db
      .prepare(
        `SELECT id, client_id as clientId, key, value, category, importance, created_at as createdAt, last_used_at as lastUsedAt, usage_count as usageCount, source_session_id as sourceSessionId
         FROM business_context
         WHERE client_id = ? AND (LOWER(key) LIKE ? OR LOWER(value) LIKE ?)
         ORDER BY importance DESC, last_used_at DESC
         LIMIT ?`,
      )
      .all(cid, term, term, limit);
  }

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

/** Lista todas as memórias do tenant atual. */
export function listAll(options: { category?: MemoryCategory; limit?: number } = {}): MemoryEntry[] {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return [];
  const limit = options.limit ?? 100;
  if (options.category) {
    return db
      .prepare(
        `SELECT id, client_id as clientId, key, value, category, importance, created_at as createdAt, last_used_at as lastUsedAt, usage_count as usageCount, source_session_id as sourceSessionId
         FROM business_context
         WHERE client_id = ? AND category = ?
         ORDER BY importance DESC, last_used_at DESC
         LIMIT ?`,
      )
      .all(cid, options.category, limit) as MemoryEntry[];
  }
  return db
    .prepare(
      `SELECT id, client_id as clientId, key, value, category, importance, created_at as createdAt, last_used_at as lastUsedAt, usage_count as usageCount, source_session_id as sourceSessionId
       FROM business_context
       WHERE client_id = ?
       ORDER BY importance DESC, last_used_at DESC
       LIMIT ?`,
    )
    .all(cid, limit) as MemoryEntry[];
}

/** Esquece (deleta) uma memória por key do tenant atual. */
export function forget(key: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return false;
  const res = db.prepare("DELETE FROM business_context WHERE client_id = ? AND key = ?").run(cid, key);
  if (res.changes > 0) logger.info({ key, clientId: cid }, "memory: removida");
  return res.changes > 0;
}

/** Conta total de memórias do tenant atual. */
export function count(): number {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return 0;
  const row = db.prepare("SELECT COUNT(*) as c FROM business_context WHERE client_id = ?").get(cid) as { c: number };
  return row.c;
}