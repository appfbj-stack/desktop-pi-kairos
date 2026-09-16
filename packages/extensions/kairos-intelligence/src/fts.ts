/**
 * FTS5 search index — portado de pi-persistent-intelligence/src/search/fts.ts
 * mas usando better-sqlite3 (Node) em vez de bun:sqlite.
 *
 * Indexa todos os MemoryRecord ativos por statement + tags.
 * Stemming via Porter (tokenize='porter unicode61').
 *
 * Sync: chamar syncFts(records) apos qualquer mutacao canonica (write,
 * curate, delete).
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureMemoryDirs } from "./paths.js";
import { listActive, type MemoryRecord } from "./long-term.js";

export interface FtsSearchResult {
  id: string;
  layer: "L1" | "L2";
  confidence: number;
  statement: string;
  tags: string[];
  score: number;
}

export class MemoryFtsIndex {
  private db: Database.Database | null = null;
  private available = false;

  constructor(root: string) {
    const dbPath = join(ensureMemoryDirs(root).search, "memory-fts.db");
    if (existsSync(dirname(dbPath))) mkdirSync(dirname(dbPath), { recursive: true });
    try {
      this.db = new Database(dbPath);
      this.db.pragma("journal_mode = WAL");
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          id UNINDEXED,
          layer UNINDEXED,
          confidence UNINDEXED,
          statement,
          tags,
          tokenize='porter unicode61 remove_diacritics 2'
        );
      `);
      this.available = true;
    } catch {
      this.db = null;
      this.available = false;
    }
  }

  get isAvailable(): boolean {
    return this.available;
  }

  /** Re-indexa tudo do zero. Rapido pra corpus pequeno. */
  sync(records: MemoryRecord[]): void {
    if (!this.db || !this.available) return;
    this.db.exec("DELETE FROM memory_fts;");
    const insert = this.db.prepare(
      "INSERT INTO memory_fts (id, layer, confidence, statement, tags) VALUES (?, ?, ?, ?, ?)"
    );
    const tx = this.db.transaction((recs: MemoryRecord[]) => {
      for (const r of recs) {
        if (r.status !== "active") continue;
        insert.run(r.id, r.layer, r.confidence, r.statement, r.tags.join(" "));
      }
    });
    tx(records);
  }

  /** BM25 keyword search. */
  search(query: string, limit = 20): FtsSearchResult[] {
    if (!this.db || !this.available || !query.trim()) return [];
    const cleaned = query.replace(/[^\p{L}\p{N}\s_-]/gu, " ").trim();
    const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) return [];
    const ftsQuery = tokens.map((t) => `${t}*`).join(" ");
    try {
      const rows = this.db
        .prepare(
          `SELECT id, layer, confidence, statement, tags, bm25(memory_fts) AS bm
           FROM memory_fts
           WHERE memory_fts MATCH ?
           ORDER BY bm ASC
           LIMIT ?`
        )
        .all(ftsQuery, limit) as Array<{
        id: string;
        layer: string;
        confidence: number;
        statement: string;
        tags: string;
        bm: number;
      }>;
      return rows.map((r) => ({
        id: r.id,
        layer: r.layer as "L1" | "L2",
        confidence: r.confidence,
        statement: r.statement,
        tags: r.tags.split(/\s+/).filter(Boolean),
        // Normaliza BM25: 1 / (1 + bm). Quanto menor bm, melhor. => [0..1]
        score: 1 / (1 + r.bm),
      }));
    } catch {
      return [];
    }
  }

  close(): void {
    if (this.db) this.db.close();
  }
}

/** Helper global: re-indexa todos os records ativos. */
export function syncFts(root: string, fts: MemoryFtsIndex): void {
  fts.sync(listActive(root));
}
