/**
 * Search — hybrid FTS (BM25) + embeddings (cosine).
 *
 * 3 modos:
 *   - keyword: soh FTS5 BM25 (instant, offline, sem deps)
 *   - semantic: soh embeddings (requer Ollama rodando)
 *   - deep: FTS + embeddings combinados (default)
 *
 * Score combinado no modo deep: fts_norm*0.4 + cosine*0.6.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MemoryFtsIndex, type FtsSearchResult, syncFts } from "./fts.js";
import { listActive, type MemoryRecord } from "./long-term.js";
import { ensureMemoryDirs } from "./paths.js";
import { hasEmbeddingModel, tryEmbed } from "./embeddings.js";
import { bufferToFloatArray, cosine, floatArrayToBuffer } from "./cosine.js";

export type SearchMode = "keyword" | "semantic" | "deep";

export interface HybridSearchResult {
  id: string;
  layer: "L1" | "L2";
  statement: string;
  tags: string[];
  confidence: number;
  score: number;
  signals: { fts: number | null; cosine: number | null };
  matched: MemoryRecord | null;
}

/** Wrapper de embeddings persistidos (BLOB) em SQLite proprio. */
class EmbeddingStore {
  private db: Database.Database | null = null;
  private available = false;

  constructor(root: string) {
    const path = join(ensureMemoryDirs(root).search, "embeddings.db");
    if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
    try {
      this.db = new Database(path);
      this.db.pragma("journal_mode = WAL");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS embeddings (
          id TEXT PRIMARY KEY,
          embedding BLOB NOT NULL,
          model TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      this.available = true;
    } catch {
      this.db = null;
      this.available = false;
    }
  }

  get isAvailable(): boolean { return this.available; }

  put(id: string, vec: number[], model: string): void {
    if (!this.available || !this.db) return;
    this.db.prepare(
      "INSERT OR REPLACE INTO embeddings (id, embedding, model, updated_at) VALUES (?, ?, ?, ?)"
    ).run(id, floatArrayToBuffer(vec), model, Date.now());
  }

  get(id: string): { vec: number[]; model: string } | null {
    if (!this.available || !this.db) return null;
    const row = this.db
      .prepare("SELECT embedding, model FROM embeddings WHERE id = ?")
      .get(id) as { embedding: Buffer; model: string } | undefined;
    if (!row) return null;
    return { vec: bufferToFloatArray(row.embedding), model: row.model };
  }

  all(): Array<{ id: string; vec: number[] }> {
    if (!this.available || !this.db) return [];
    const rows = this.db
      .prepare("SELECT id, embedding FROM embeddings")
      .all() as Array<{ id: string; embedding: Buffer }>;
    return rows.map((r) => ({ id: r.id, vec: bufferToFloatArray(r.embedding) }));
  }

  delete(id: string): void {
    if (!this.available || !this.db) return;
    this.db.prepare("DELETE FROM embeddings WHERE id = ?").run(id);
  }

  close(): void {
    if (this.available && this.db) this.db.close();
  }
}

export class IntelligenceSearch {
  private fts: MemoryFtsIndex;
  private embeddings: EmbeddingStore;
  private embeddingsAvailable = false;
  private embeddingModelName: string | null = null;

  constructor(private readonly root: string) {
    this.fts = new MemoryFtsIndex(root);
    this.embeddings = new EmbeddingStore(root);
    // Probe Ollama em background
    void this.probeEmbeddings();
    // Sync inicial
    this.sync();
  }

  private async probeEmbeddings(): Promise<void> {
    const has = await hasEmbeddingModel();
    if (has) {
      this.embeddingsAvailable = true;
      this.embeddingModelName = "nomic-embed-text";
    }
  }

  embeddingsAvailableNow(): boolean {
    return this.embeddingsAvailable;
  }

  embeddingModel(): string | null {
    return this.embeddingModelName;
  }

  /** Re-indexa FTS a partir dos records canonicos. */
  sync(): void {
    this.fts.sync(listActive(this.root));
  }

  /** Gera embedding pra um record (se Ollama tiver modelo) e persiste. */
  async ensureEmbedding(rec: MemoryRecord): Promise<void> {
    if (!this.embeddingsAvailable) return;
    if (this.embeddings.get(rec.id)) return; // ja tem
    const vec = await tryEmbed(rec.statement);
    if (vec) this.embeddings.put(rec.id, vec, this.embeddingModelName ?? "nomic-embed-text");
  }

  async ensureAllEmbeddings(): Promise<{ updated: number }> {
    if (!this.embeddingsAvailable) return { updated: 0 };
    let updated = 0;
    for (const rec of listActive(this.root)) {
      if (!this.embeddings.get(rec.id)) {
        const vec = await tryEmbed(rec.statement);
        if (vec) {
          this.embeddings.put(rec.id, vec, this.embeddingModelName ?? "nomic-embed-text");
          updated++;
        }
      }
    }
    return { updated };
  }

  async search(opts: {
    query: string;
    mode?: SearchMode;
    limit?: number;
    layer?: "L1" | "L2";
    minScore?: number;
  }): Promise<HybridSearchResult[]> {
    const mode: SearchMode = opts.mode ?? "deep";
    const limit = Math.min(opts.limit ?? 8, 50);
    const minScore = opts.minScore ?? 0;
    const query = opts.query.trim();
    if (!query) return [];

    let ftsResults: FtsSearchResult[] = [];
    let cosineScores = new Map<string, number>();

    // 1. FTS
    if (mode === "keyword" || mode === "deep") {
      ftsResults = this.fts.search(query, limit * 3);
      if (opts.layer) ftsResults = ftsResults.filter((r) => r.layer === opts.layer);
    }

    // 2. Semantic
    let queryVec: number[] | null = null;
    if (mode === "semantic" || mode === "deep") {
      if (this.embeddingsAvailable) queryVec = await tryEmbed(query);
      if (queryVec) {
        for (const { id, vec } of this.embeddings.all()) {
          cosineScores.set(id, cosine(queryVec, vec));
        }
      }
    }

    // 3. Combina
    const candidates = new Map<string, { fts: number; cos: number; source: "fts" | "cosine" | "both" }>();
    for (const r of ftsResults) {
      candidates.set(r.id, { fts: r.score, cos: cosineScores.get(r.id) ?? 0, source: "fts" });
    }
    for (const [id, cos] of cosineScores) {
      const existing = candidates.get(id);
      if (existing) {
        candidates.set(id, { ...existing, cos, source: "both" });
      } else if (mode === "semantic") {
        candidates.set(id, { fts: 0, cos, source: "cosine" });
      }
    }

    // Busca o MemoryRecord completo pra cada hit
    const activeRecords = new Map(listActive(this.root).map((r) => [r.id, r]));
    const out: HybridSearchResult[] = [];
    for (const [id, c] of candidates) {
      const rec = activeRecords.get(id);
      if (!rec) continue;
      if (opts.layer && rec.layer !== opts.layer) continue;
      const score = mode === "keyword" ? c.fts : mode === "semantic" ? c.cos : c.fts * 0.4 + c.cos * 0.6;
      if (score < minScore) continue;
      out.push({
        id,
        layer: rec.layer,
        statement: rec.statement,
        tags: rec.tags,
        confidence: rec.confidence,
        score,
        signals: { fts: c.fts > 0 ? c.fts : null, cosine: c.cos > 0 ? c.cos : null },
        matched: rec,
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  close(): void {
    this.fts.close();
    this.embeddings.close();
  }
}

/** Re-export pra tools. */
export { syncFts };
