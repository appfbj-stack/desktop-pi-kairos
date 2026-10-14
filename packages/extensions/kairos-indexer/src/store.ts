/**
 * Store do indexer — SQLite tables + CRUD básico.
 *
 * Schema:
 *   indexed_files    : metadados dos arquivos (path UNIQUE, size, mtime, mime, ext, preview, indexed_at)
 *   file_tags        : tags por arquivo (file_id FK, tag, source, confidence)
 *   folder_watches   : pastas configuradas pra escanear (path UNIQUE, recursive, last_scan_at, file_count, active)
 *
 * Funções principais:
 *   - upsertFile / getFileByPath / listFiles / deleteFile
 *   - addTag / getTagsForFile / listFilesByTag
 *   - addWatch / listWatches / updateWatch / removeWatch
 *   - getStats
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { logger } from "@kairos/core";

export interface IndexedFile {
  id: string;
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
  fileId: string;
  tag: string;
  source: "heuristic" | "ai" | "manual";
  confidence: number; // 0.0 - 1.0
}

export interface FolderWatch {
  id: string;
  path: string;
  recursive: number; // 0/1
  lastScanAt: number | null;
  fileCount: number;
  active: number; // 0/1
  createdAt: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS indexed_files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  mime TEXT,
  ext TEXT,
  preview TEXT,
  indexed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_path ON indexed_files(path);
CREATE INDEX IF NOT EXISTS idx_files_mtime ON indexed_files(mtime DESC);
CREATE INDEX IF NOT EXISTS idx_files_ext ON indexed_files(ext);
CREATE INDEX IF NOT EXISTS idx_files_mime ON indexed_files(mime);

CREATE TABLE IF NOT EXISTS file_tags (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'heuristic',
  confidence REAL NOT NULL DEFAULT 1.0,
  FOREIGN KEY (file_id) REFERENCES indexed_files(id) ON DELETE CASCADE,
  UNIQUE(file_id, tag, source)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON file_tags(tag);
CREATE INDEX IF NOT EXISTS idx_tags_file ON file_tags(file_id);

CREATE TABLE IF NOT EXISTS folder_watches (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  recursive INTEGER NOT NULL DEFAULT 1,
  last_scan_at INTEGER,
  file_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_watches_active ON folder_watches(active);
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

// =============================================================================
// indexed_files
// =============================================================================

/** Upsert por path. Retorna o registro. */
export function upsertFile(input: {
  path: string;
  size: number;
  mtime: number;
  mime?: string | null;
  ext?: string | null;
  preview?: string | null;
}): IndexedFile {
  const db = getDb();
  ensureSchema(db);
  const now = Date.now();
  const existing = db
    .prepare("SELECT id, indexed_at FROM indexed_files WHERE path = ?")
    .get(input.path) as { id: string; indexed_at: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE indexed_files
       SET size = ?, mtime = ?, mime = ?, ext = ?, preview = ?, indexed_at = ?
       WHERE path = ?`,
    ).run(
      input.size,
      input.mtime,
      input.mime ?? null,
      input.ext ?? null,
      input.preview ?? null,
      now,
      input.path,
    );
    return {
      id: existing.id,
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
    `INSERT INTO indexed_files (id, path, size, mtime, mime, ext, preview, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
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
  const row = db
    .prepare(
      `SELECT id, path, size, mtime, mime, ext, preview, indexed_at as indexedAt
       FROM indexed_files WHERE path = ?`,
    )
    .get(path) as IndexedFile | undefined;
  return row ?? null;
}

export function getFileById(id: string): IndexedFile | null {
  const db = getDb();
  ensureSchema(db);
  const row = db
    .prepare(
      `SELECT id, path, size, mtime, mime, ext, preview, indexed_at as indexedAt
       FROM indexed_files WHERE id = ?`,
    )
    .get(id) as IndexedFile | undefined;
  return row ?? null;
}

export function deleteFile(path: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const res = db.prepare("DELETE FROM indexed_files WHERE path = ?").run(path);
  return res.changes > 0;
}

export function deleteFileById(id: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const res = db.prepare("DELETE FROM indexed_files WHERE id = ?").run(id);
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
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const sortBy = options.sortBy ?? "mtime";
  const sortDir = options.sortDir ?? "desc";

  const wheres: string[] = [];
  const params: any[] = [];
  if (options.ext) {
    wheres.push("ext = ?");
    params.push(options.ext.toLowerCase());
  }
  if (options.mime) {
    wheres.push("mime LIKE ?");
    params.push(`${options.mime}%`);
  }
  const where = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

  const sql = `SELECT id, path, size, mtime, mime, ext, preview, indexed_at as indexedAt
               FROM indexed_files
               ${where}
               ORDER BY ${sortBy} ${sortDir.toUpperCase()}
               LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...params, limit, offset) as IndexedFile[];
}

/** Busca textual livre (path OU preview). */
export function searchFilesText(query: string, options: { limit?: number } = {}): IndexedFile[] {
  const db = getDb();
  ensureSchema(db);
  const term = `%${query.toLowerCase()}%`;
  const limit = options.limit ?? 50;
  return db
    .prepare(
      `SELECT id, path, size, mtime, mime, ext, preview, indexed_at as indexedAt
       FROM indexed_files
       WHERE LOWER(path) LIKE ? OR LOWER(IFNULL(preview, '')) LIKE ?
       ORDER BY mtime DESC
       LIMIT ?`,
    )
    .all(term, term, limit) as IndexedFile[];
}

// =============================================================================
// file_tags
// =============================================================================

export function addTag(input: {
  fileId: string;
  tag: string;
  source?: "heuristic" | "ai" | "manual";
  confidence?: number;
}): FileTag {
  const db = getDb();
  ensureSchema(db);
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
      fileId: input.fileId,
      tag,
      source,
      confidence,
    };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO file_tags (id, file_id, tag, source, confidence) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.fileId, tag, source, confidence);
  return { id, fileId: input.fileId, tag, source, confidence };
}

/** Substitui TODAS as tags heurísticas de um arquivo. */
export function replaceHeuristicTags(fileId: string, tags: string[]): number {
  const db = getDb();
  ensureSchema(db);
  const tx = db.transaction((fileId: string, tags: string[]) => {
    db.prepare(`DELETE FROM file_tags WHERE file_id = ? AND source = 'heuristic'`).run(fileId);
    const stmt = db.prepare(
      `INSERT INTO file_tags (id, file_id, tag, source, confidence) VALUES (?, ?, ?, 'heuristic', ?)`,
    );
    let count = 0;
    for (const t of tags) {
      const norm = t.toLowerCase().trim();
      if (!norm) continue;
      stmt.run(randomUUID(), fileId, norm, 1.0);
      count++;
    }
    return count;
  });
  return tx(fileId, tags);
}

export function getTagsForFile(fileId: string): FileTag[] {
  const db = getDb();
  ensureSchema(db);
  return db
    .prepare(
      `SELECT id, file_id as fileId, tag, source, confidence
       FROM file_tags WHERE file_id = ?
       ORDER BY source, confidence DESC, tag`,
    )
    .all(fileId) as FileTag[];
}

export function listFilesByTag(tag: string, options: { limit?: number } = {}): IndexedFile[] {
  const db = getDb();
  ensureSchema(db);
  const limit = options.limit ?? 50;
  const norm = tag.toLowerCase().trim();
  return db
    .prepare(
      `SELECT f.id, f.path, f.size, f.mtime, f.mime, f.ext, f.preview, f.indexed_at as indexedAt
       FROM indexed_files f
       INNER JOIN file_tags t ON t.file_id = f.id
       WHERE t.tag = ?
       ORDER BY f.mtime DESC
       LIMIT ?`,
    )
    .all(norm, limit) as IndexedFile[];
}

export function listAllTagsWithCounts(): { tag: string; count: number; source: string }[] {
  const db = getDb();
  ensureSchema(db);
  return db
    .prepare(
      `SELECT tag, COUNT(*) as count, source
       FROM file_tags
       GROUP BY tag, source
       ORDER BY count DESC, tag
       LIMIT 200`,
    )
    .all() as { tag: string; count: number; source: string }[];
}

export function removeTag(fileId: string, tag: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const res = db
    .prepare(`DELETE FROM file_tags WHERE file_id = ? AND tag = ?`)
    .run(fileId, tag.toLowerCase().trim());
  return res.changes > 0;
}

// =============================================================================
// folder_watches
// =============================================================================

export function addWatch(input: {
  path: string;
  recursive?: boolean;
}): FolderWatch {
  const db = getDb();
  ensureSchema(db);
  const recursive = input.recursive !== false ? 1 : 0;
  const existing = db
    .prepare("SELECT id, recursive, last_scan_at, file_count, active, created_at FROM folder_watches WHERE path = ?")
    .get(input.path) as
    | { id: string; recursive: number; last_scan_at: number | null; file_count: number; active: number; created_at: number }
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE folder_watches SET recursive = ?, active = 1 WHERE id = ?`,
    ).run(recursive, existing.id);
    logger.info({ path: input.path }, "indexer: watch reativado");
    return {
      id: existing.id,
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
    `INSERT INTO folder_watches (id, path, recursive, last_scan_at, file_count, active, created_at)
     VALUES (?, ?, ?, NULL, 0, 1, ?)`,
  ).run(id, input.path, recursive, now);
  logger.info({ path: input.path, recursive: !!recursive }, "indexer: watch adicionado");
  return {
    id,
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
  db.prepare(
    `UPDATE folder_watches SET last_scan_at = ?, file_count = ? WHERE id = ?`,
  ).run(Date.now(), fileCount, watchId);
}

export function listWatches(activeOnly = false): FolderWatch[] {
  const db = getDb();
  ensureSchema(db);
  if (activeOnly) {
    return db
      .prepare(
        `SELECT id, path, recursive, last_scan_at as lastScanAt, file_count as fileCount, active, created_at as createdAt
         FROM folder_watches WHERE active = 1
         ORDER BY created_at DESC`,
      )
      .all() as FolderWatch[];
  }
  return db
    .prepare(
      `SELECT id, path, recursive, last_scan_at as lastScanAt, file_count as fileCount, active, created_at as createdAt
       FROM folder_watches
       ORDER BY active DESC, created_at DESC`,
    )
    .all() as FolderWatch[];
}

export function removeWatch(path: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const res = db.prepare("DELETE FROM folder_watches WHERE path = ?").run(path);
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

  const totalFiles = (db.prepare("SELECT COUNT(*) as c FROM indexed_files").get() as { c: number }).c;
  const totalSize = (db.prepare("SELECT COALESCE(SUM(size), 0) as s FROM indexed_files").get() as { s: number }).s;
  const totalTags = (db.prepare("SELECT COUNT(*) as c FROM file_tags").get() as { c: number }).c;
  const totalWatches = (db.prepare("SELECT COUNT(*) as c FROM folder_watches WHERE active = 1").get() as { c: number }).c;

  const topExtensions = db
    .prepare(
      `SELECT ext, COUNT(*) as count FROM indexed_files
       WHERE ext IS NOT NULL AND ext != ''
       GROUP BY ext ORDER BY count DESC LIMIT 10`,
    )
    .all() as { ext: string; count: number }[];

  const topMimes = db
    .prepare(
      `SELECT mime, COUNT(*) as count FROM indexed_files
       WHERE mime IS NOT NULL
       GROUP BY mime ORDER BY count DESC LIMIT 10`,
    )
    .all() as { mime: string; count: number }[];

  const topTags = listAllTagsWithCounts().slice(0, 15);

  const recentFiles = db
    .prepare(
      `SELECT path, mtime, size FROM indexed_files
       ORDER BY mtime DESC LIMIT 10`,
    )
    .all() as { path: string; mtime: number; size: number }[];

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