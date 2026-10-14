/**
 * RAG store — vetor de embeddings persistido em SQLite.
 *
 * Schema:
 *   rag_chunks (id, source_path, chunk_index, content, embedding BLOB, created_at)
 *
 * Embeddings são serializados como Float32Array → Buffer.
 * Busca por cosine similarity em memória (top-k).
 *
 * Escala: até ~50k chunks (~5k arquivos médios) roda liso.
 * Pra escala maior, swap pra sqlite-vss ou ChromaDB.
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { logger } from "@kairos/core";

export interface RagChunk {
  id: string;
  sourcePath: string;
  chunkIndex: number;
  content: string;
  embedding: Float32Array;
  createdAt: number;
}

export interface RagSearchResult {
  chunk: RagChunk;
  score: number; // 0..1
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rag_source_idx ON rag_chunks(source_path);
CREATE INDEX IF NOT EXISTS rag_created_idx ON rag_chunks(created_at DESC);
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

function serializeEmbedding(emb: Float32Array): Buffer {
  return Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength);
}
function deserializeEmbedding(buf: Buffer): Float32Array {
  // Cópia porque o buffer do SQLite pode ser reutilizado
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength).slice();
}

export function addChunks(chunks: Array<Omit<RagChunk, "id" | "createdAt">>): number {
  const db = getDb();
  ensureSchema(db);
  const now = Date.now();
  const insert = db.prepare(
    `INSERT INTO rag_chunks (id, source_path, chunk_index, content, embedding, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction((items: typeof chunks) => {
    let count = 0;
    for (const c of items) {
      insert.run(randomUUID(), c.sourcePath, c.chunkIndex, c.content, serializeEmbedding(c.embedding), now);
      count++;
    }
    return count;
  });
  const inserted = tx(chunks);
  logger.info({ inserted, files: new Set(chunks.map((c) => c.sourcePath)).size }, "rag: chunks adicionados");
  return inserted;
}

export function clearBySource(sourcePath: string): number {
  const db = getDb();
  ensureSchema(db);
  const res = db.prepare("DELETE FROM rag_chunks WHERE source_path = ?").run(sourcePath);
  return res.changes;
}

export function clearAll(): number {
  const db = getDb();
  ensureSchema(db);
  const res = db.prepare("DELETE FROM rag_chunks").run();
  return res.changes;
}

export function listSources(): Array<{ sourcePath: string; chunkCount: number; createdAt: number }> {
  const db = getDb();
  ensureSchema(db);
  return db
    .prepare(
      `SELECT source_path as sourcePath, COUNT(*) as chunkCount, MIN(created_at) as createdAt
       FROM rag_chunks
       GROUP BY source_path
       ORDER BY created_at DESC`,
    )
    .all() as any;
}

export function getAllChunks(): RagChunk[] {
  const db = getDb();
  ensureSchema(db);
  const rows = db
    .prepare(
      `SELECT id, source_path as sourcePath, chunk_index as chunkIndex, content, embedding, created_at as createdAt
       FROM rag_chunks`,
    )
    .all() as any[];
  return rows.map((r) => ({
    ...r,
    embedding: deserializeEmbedding(r.embedding),
  }));
}

export function countChunks(): number {
  const db = getDb();
  ensureSchema(db);
  const row = db.prepare("SELECT COUNT(*) as c FROM rag_chunks").get() as { c: number };
  return row.c;
}

/** Cosine similarity entre 2 vetores. */
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

/** Top-k mais similares à query. */
export function searchSimilar(queryEmbedding: Float32Array, topK = 5): RagSearchResult[] {
  const all = getAllChunks();
  const scored: RagSearchResult[] = all.map((c) => ({
    chunk: c,
    score: cosine(queryEmbedding, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// =============================================================================
// Chunker simples — divide texto em janelas de ~500 chars com overlap
// =============================================================================

export function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  const chunks: string[] = [];
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= chunkSize) return [clean];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + chunkSize, clean.length);
    chunks.push(clean.slice(i, end));
    if (end >= clean.length) break;
    i = end - overlap;
  }
  return chunks;
}
