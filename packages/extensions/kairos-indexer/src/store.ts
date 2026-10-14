/**
 * Store do indexer — SQLite tables + CRUD básico (multi-tenant via client_id).
 *
 * Schema:
 *   indexed_files    : metadados dos arquivos (id, client_id, path, size, mtime, mime, ext, preview, indexed_at)
 *   file_tags        : tags por arquivo (id, client_id, file_id, tag, source, confidence)
 *   folder_watches   : pastas configuradas pra escanear (id, client_id, path, recursive, last_scan_at, file_count, active)
 *
 * Tenant atual vem de globalThis.__kairosClientId (setado pelo agent-instance no login).
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { logger } from "@kairos/core";

export interface IndexedFile {
  id: string;
  clientId: string | null;
  path: string;
  size: number;
  mtime: number;
  mime: string | null;
  ext: string | null;
  preview: string | null;
  indexedAt: number;
}

export interface FileTag {
  id: string;
  clientId: string | null;
  fileId: string;
  tag: string;
  source: "heuristic" | "ai" | "manual";
  confidence: number;
}

export interface FolderWatch {
  id: string;
  clientId: string | null;
  path: string;
  recursive: number;
  lastScanAt: number | null;
  fileCount: number;
  active: number;
  createdAt: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS indexed_files (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  path TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  mime TEXT,
  ext TEXT,
  preview TEXT,
  indexed_at INTEGER NOT NULL,
  UNIQUE(client_id, path)
);
CREATE INDEX IF NOT EXISTS idx_files_path ON indexed_files(path);
CREATE INDEX IF NOT EXISTS idx_files_mtime ON indexed_files(mtime DESC);
CREATE INDEX IF NOT EXISTS idx_files_ext ON indexed_files(ext);
CREATE INDEX IF NOT EXISTS idx_files_mime ON indexed_files(mime);
CREATE INDEX IF NOT EXISTS idx_files_client ON indexed_files(client_id);

CREATE TABLE IF NOT EXISTS file_tags (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  file_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'heuristic',
  confidence REAL NOT NULL DEFAULT 1.0,
  FOREIGN KEY (file_id) REFERENCES indexed_files(id) ON DELETE CASCADE,
  UNIQUE(file_id, tag, source)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON file_tags(tag);
CREATE INDEX IF NOT EXISTS idx_tags_file ON file_tags(file_id);
CREATE INDEX IF NOT EXISTS idx_tags_client ON file_tags(client_id);

CREATE TABLE IF NOT EXISTS folder_watches (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  path TEXT NOT NULL,
  recursive INTEGER NOT NULL DEFAULT 1,
  last_scan_at INTEGER,
  file_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(client_id, path)
);
CREATE INDEX IF NOT EXISTS idx_watches_active ON folder_watches(active);
CREATE INDEX IF NOT EXISTS idx_watches_client ON folder_watches(client_id);
`;

let schemaReady = false;
function ensureSchema(db: Database.Database): void {
  if (schemaReady) return;
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  // migrations idempotentes (de tabelas pre-existentes sem client_id)
  try { db.exec("ALTER TABLE indexed_files ADD COLUMN client_id TEXT"); } catch { /* já existe */ }
  try { db.exec("ALTER TABLE file_tags ADD COLUMN client_id TEXT"); } catch { /* já existe */ }
  try { db.exec("ALTER TABLE folder_watches ADD COLUMN client_id TEXT"); } catch { /* já existe */ }
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

// =============================================================================
// indexed_files
// =============================================================================

/** Upsert por (client_id, path). Retorna o registro. */
export function upsertFile(input: {
  path: string;
  size: number;
  mtime: number;
  mime?: string | null;
  ext?: string | null;
  preview?: string | null;
}): IndexedFile | null {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return null; // sem tenant = não indexa
  const now = Date.now();
  const existing = db
    .prepare("SELECT id, indexed_at FROM indexed_files WHERE client_id = ? AND path = ?")
    .get(cid, input.path) as { id: string; indexed_at: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE indexed_files
       SET size = ?, mtime = ?, mime = ?, ext = ?, preview = ?, indexed_at = ?
       WHERE client_id = ? AND path = ?`,
    ).run(
      input.size,
      input.mtime,
      input.mime ?? null,
      input.ext ?? null,
      input.preview ?? null,
      now,
      cid,
      input.path,
    );
    return {
      id: existing.id,
      clientId: cid,
      path: input.path,
      size: input.size,
      mtime: input.mtime,
      mime: input.mime ?? null,
      ext: input.ext ?? null,
      preview: input.preview ?? null,
      indexedAt: now,
    };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO indexed_files (id, client_id, path, size, mtime, mime, ext, preview, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    cid,
    input.path,
    input.size,
    input.mtime,
    input.mime ?? null,
    input.ext ?? null,
    input.preview ?? null,
    now,
  );
  return {
    id,
    clientId: cid,
    path: input.path,
    size: input.size,
    mtime: input.mtime,
    mime: input.mime ?? null,
    ext: input.ext ?? null,
    preview: input.preview ?? null,
    indexedAt: now,
  };
}

export function getFileByPath(path: string): IndexedFile | null {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return null;
  const row = db
    .prepare(
      `SELECT id, client_id as clientId, path, size, mtime, mime, ext, preview, indexed_at as indexedAt
       FROM indexed_files WHERE client_id = ? AND path = ?`,
    )
    .get(cid, path) as IndexedFile | undefined;
  return row ?? null;
}

export function getFileById(id: string): IndexedFile | null {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return null;
  const row = db
    .prepare(
      `SELECT id, client_id as clientId, path, size, mtime, mime, ext, preview, indexed_at as indexedAt
       FROM indexed_files WHERE client_id = ? AND id = ?`,
    )
    .get(cid, id) as IndexedFile | undefined;
  return row ?? null;
}

export function deleteFile(path: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return false;
  const res = db.prepare("DELETE FROM indexed_files WHERE client_id = ? AND path = ?").run(cid, path);
  return res.changes > 0;
}

export function deleteFileById(id: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return false;
  const res = db.prepare("DELETE FROM indexed_files WHERE client_id = ? AND id = ?").run(cid, id);
  return res.changes > 0;
}

export function listFiles(options: {
  limit?: number;
  offset?: number;
  ext?: string;
  mime?: string;
  sortBy?: "mtime" | "size" | "indexed_at" | "path";
  sortDir?: "asc" | "desc";
} = {}): IndexedFile[] {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return [];
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const sortBy = options.sortBy ?? "mtime";
  const sortDir = options.sortDir ?? "desc";

  const wheres: string[] = ["client_id = ?"];
  const params: any[] = [cid];
  if (options.ext) {
    wheres.push("ext = ?");
    params.push(options.ext.toLowerCase());
  }
  if (options.mime) {
    wheres.push("mime LIKE ?");
    params.push(`${options.mime}%`);
  }
  const where = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

  const sql = `SELECT id, client_id as clientId, path, size, mtime, mime, ext, preview, indexed_at as indexedAt
               FROM indexed_files
               ${where}
               ORDER BY ${sortBy} ${sortDir.toUpperCase()}
               LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...params, limit, offset) as IndexedFile[];
}

/** Busca textual livre (path OU preview) do tenant atual. */
export function searchFilesText(query: string, options: { limit?: number } = {}): IndexedFile[] {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return [];
  const term = `%${query.toLowerCase()}%`;
  const limit = options.limit ?? 50;
  return db
    .prepare(
      `SELECT id, client_id as clientId, path, size, mtime, mime, ext, preview, indexed_at as indexedAt
       FROM indexed_files
       WHERE client_id = ? AND (LOWER(path) LIKE ? OR LOWER(IFNULL(preview, '')) LIKE ?)
       ORDER BY mtime DESC
       LIMIT ?`,
    )
    .all(cid, term, term, limit) as IndexedFile[];
}

// =============================================================================
// file_tags
// =============================================================================

export function addTag(input: {
  fileId: string;
  tag: string;
  source?: "heuristic" | "ai" | "manual";
  confidence?: number;
}): FileTag | null {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return null;
  const source = input.source ?? "heuristic";
  const confidence = Math.max(0, Math.min(1, input.confidence ?? 1.0));
  const tag = input.tag.toLowerCase().trim();
  if (!tag) throw new Error("tag vazia");

  const existing = db
    .prepare("SELECT id FROM file_tags WHERE file_id = ? AND tag = ? AND source = ?")
    .get(input.fileId, tag, source) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE file_tags SET confidence = ? WHERE id = ?`,
    ).run(confidence, existing.id);
    return {
      id: existing.id,
      clientId: cid,
      fileId: input.fileId,
      tag,
      source,
      confidence,
    };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO file_tags (id, client_id, file_id, tag, source, confidence) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, cid, input.fileId, tag, source, confidence);
  return { id, clientId: cid, fileId: input.fileId, tag, source, confidence };
}

/** Substitui TODAS as tags heurísticas de um arquivo do tenant atual. */
export function replaceHeuristicTags(fileId: string, tags: string[]): number {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return 0;
  const tx = db.transaction((fileId: string, tags: string[]) => {
    db.prepare(`DELETE FROM file_tags WHERE file_id = ? AND source = 'heuristic'`).run(fileId);
    const stmt = db.prepare(
      `INSERT INTO file_tags (id, client_id, file_id, tag, source, confidence) VALUES (?, ?, ?, 'heuristic', ?)`,
    );
    let count = 0;
    for (const t of tags) {
      const norm = t.toLowerCase().trim();
      if (!norm) continue;
      stmt.run(randomUUID(), cid, fileId, norm, 1.0);
      count++;
    }
    return count;
  });
  return tx(fileId, tags);
}

export function getTagsForFile(fileId: string): FileTag[] {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return [];
  return db
    .prepare(
      `SELECT id, client_id as clientId, file_id as fileId, tag, source, confidence
       FROM file_tags WHERE client_id = ? AND file_id = ?
       ORDER BY source, confidence DESC, tag`,
    )
    .all(cid, fileId) as FileTag[];
}

export function listFilesByTag(tag: string, options: { limit?: number } = {}): IndexedFile[] {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return [];
  const limit = options.limit ?? 50;
  const norm = tag.toLowerCase().trim();
  return db
    .prepare(
      `SELECT f.id, f.client_id as clientId, f.path, f.size, f.mtime, f.mime, f.ext, f.preview, f.indexed_at as indexedAt
       FROM indexed_files f
       INNER JOIN file_tags t ON t.file_id = f.id
       WHERE f.client_id = ? AND t.tag = ?
       ORDER BY f.mtime DESC
       LIMIT ?`,
    )
    .all(cid, norm, limit) as IndexedFile[];
}

export function listAllTagsWithCounts(): { tag: string; count: number; source: string }[] {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return [];
  return db
    .prepare(
      `SELECT tag, COUNT(*) as count, source
       FROM file_tags WHERE client_id = ?
       GROUP BY tag, source
       ORDER BY count DESC, tag
       LIMIT 200`,
    )
    .all(cid) as { tag: string; count: number; source: string }[];
}

export function removeTag(fileId: string, tag: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return false;
  const res = db
    .prepare(`DELETE FROM file_tags WHERE client_id = ? AND file_id = ? AND tag = ?`)
    .run(cid, fileId, tag.toLowerCase().trim());
  return res.changes > 0;
}

// =============================================================================
// folder_watches
// =============================================================================

export function addWatch(input: {
  path: string;
  recursive?: boolean;
}): FolderWatch | null {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return null;
  const recursive = input.recursive !== false ? 1 : 0;
  const existing = db
    .prepare("SELECT id, recursive, last_scan_at, file_count, active, created_at FROM folder_watches WHERE client_id = ? AND path = ?")
    .get(cid, input.path) as
    | { id: string; recursive: number; last_scan_at: number | null; file_count: number; active: number; created_at: number }
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE folder_watches SET recursive = ?, active = 1 WHERE id = ?`,
    ).run(recursive, existing.id);
    logger.info({ path: input.path, clientId: cid }, "indexer: watch reativado");
    return {
      id: existing.id,
      clientId: cid,
      path: input.path,
      recursive,
      lastScanAt: existing.last_scan_at,
      fileCount: existing.file_count,
      active: 1,
      createdAt: existing.created_at,
    };
  }

  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO folder_watches (id, client_id, path, recursive, last_scan_at, file_count, active, created_at)
     VALUES (?, ?, ?, ?, NULL, 0, 1, ?)`,
  ).run(id, cid, input.path, recursive, now);
  logger.info({ path: input.path, recursive: !!recursive, clientId: cid }, "indexer: watch adicionado");
  return {
    id,
    clientId: cid,
    path: input.path,
    recursive,
    lastScanAt: null,
    fileCount: 0,
    active: 1,
    createdAt: now,
  };
}

export function updateWatchAfterScan(watchId: string, fileCount: number): void {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return;
  db.prepare(
    `UPDATE folder_watches SET last_scan_at = ?, file_count = ? WHERE id = ? AND client_id = ?`,
  ).run(Date.now(), fileCount, watchId, cid);
}

export function listWatches(activeOnly = false): FolderWatch[] {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return [];
  if (activeOnly) {
    return db
      .prepare(
        `SELECT id, client_id as clientId, path, recursive, last_scan_at as lastScanAt, file_count as fileCount, active, created_at as createdAt
         FROM folder_watches WHERE client_id = ? AND active = 1
         ORDER BY created_at DESC`,
      )
      .all(cid) as FolderWatch[];
  }
  return db
    .prepare(
      `SELECT id, client_id as clientId, path, recursive, last_scan_at as lastScanAt, file_count as fileCount, active, created_at as createdAt
       FROM folder_watches WHERE client_id = ?
       ORDER BY active DESC, created_at DESC`,
    )
    .all(cid) as FolderWatch[];
}

export function removeWatch(path: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return false;
  const res = db.prepare("DELETE FROM folder_watches WHERE client_id = ? AND path = ?").run(cid, path);
  return res.changes > 0;
}

// =============================================================================
// Stats
// =============================================================================

export function getStats(): {
  totalFiles: number;
  totalSize: number;
  totalTags: number;
  totalWatches: number;
  topExtensions: { ext: string; count: number }[];
  topMimes: { mime: string; count: number }[];
  topTags: { tag: string; count: number; source: string }[];
  recentFiles: { path: string; mtime: number; size: number }[];
} {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) {
    return {
      totalFiles: 0, totalSize: 0, totalTags: 0, totalWatches: 0,
      topExtensions: [], topMimes: [], topTags: [], recentFiles: [],
    };
  }

  const totalFiles = (db.prepare("SELECT COUNT(*) as c FROM indexed_files WHERE client_id = ?").get(cid) as { c: number }).c;
  const totalSize = (db.prepare("SELECT COALESCE(SUM(size), 0) as s FROM indexed_files WHERE client_id = ?").get(cid) as { s: number }).s;
  const totalTags = (db.prepare("SELECT COUNT(*) as c FROM file_tags WHERE client_id = ?").get(cid) as { c: number }).c;
  const totalWatches = (db.prepare("SELECT COUNT(*) as c FROM folder_watches WHERE client_id = ? AND active = 1").get(cid) as { c: number }).c;

  const topExtensions = db
    .prepare(
      `SELECT ext, COUNT(*) as count FROM indexed_files
       WHERE client_id = ? AND ext IS NOT NULL AND ext != ''
       GROUP BY ext ORDER BY count DESC LIMIT 10`,
    )
    .all(cid) as { ext: string; count: number }[];

  const topMimes = db
    .prepare(
      `SELECT mime, COUNT(*) as count FROM indexed_files
       WHERE client_id = ? AND mime IS NOT NULL
       GROUP BY mime ORDER BY count DESC LIMIT 10`,
    )
    .all(cid) as { mime: string; count: number }[];

  const topTags = listAllTagsWithCounts().slice(0, 15);

  const recentFiles = db
    .prepare(
      `SELECT path, mtime, size FROM indexed_files
       WHERE client_id = ? ORDER BY mtime DESC LIMIT 10`,
    )
    .all(cid) as { path: string; mtime: number; size: number }[];

  return {
    totalFiles,
    totalSize,
    totalTags,
    totalWatches,
    topExtensions,
    topMimes,
    topTags,
    recentFiles,
  };
}