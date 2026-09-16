/**
 * MemoryStore — SQLite + FTS5 + embeddings opcionais.
 *
 * Schema:
 *   memories (id, title, content, tags, source, embedding, created_at, updated_at, accessed_at)
 *   memories_fts (FTS5 virtual table espelhando memories)
 *
 * Por que FTS5 + embeddings:
 *   - FTS5 faz busca por tokens BM25 (excelente pra queries literais tipo "membro João").
 *   - Embeddings (cosine similarity) fazem busca semantica ("igreja" casa com "templo",
 *     "celebração", mesmo sem keyword exata).
 *   - Combinados: o score final = (fts_norm * 0.4) + (cosine_sim * 0.6), top-K.
 *   - Se nao tiver embeddings (sem Ollama), usa FTS5 puro (BM25).
 *
 * Storage: arquivo proprio `kairos-memory.db` no workspace dir (nao conflita com kairos.db
 * das conversas).
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { tryEmbed, hasEmbeddingModel } from "./embeddings.js";

export interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  source: "user" | "agent" | "import";
  embedding: number[] | null;
  createdAt: number;
  updatedAt: number;
  accessedAt: number | null;
}

export interface MemoryHit {
  id: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  createdAt: number;
  updatedAt: number;
  /** Score combinado (0..1). Quanto maior, melhor. */
  score: number;
  /** Quais sinais contribuíram (debug/UI). */
  signals: { fts: number | null; cosine: number | null };
  /** Trecho relevante do content (snippet). */
  snippet: string;
}

export class MemoryStore {
  private db: Database.Database;
  private embeddingsEnabled = false;
  private embModelName: string | null = null;

  constructor(workspaceDir: string) {
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }
    const dbPath = path.join(workspaceDir, "kairos-memory.db");
    const raw = new Database(dbPath);
    raw.pragma("journal_mode = WAL");
    raw.pragma("foreign_keys = ON");

    raw.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL CHECK(source IN ('user','agent','import')),
        embedding BLOB,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        accessed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        title, content, tags,
        content='memories',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );

      -- Triggers pra manter FTS sincronizado
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
        VALUES('delete', old.rowid, old.title, old.content, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
        VALUES('delete', old.rowid, old.title, old.content, old.tags);
        INSERT INTO memories_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
      END;
    `);

    this.db = raw;
    // Probe Ollama em background (nao bloqueia construtor)
    void this.probeEmbeddings();
  }

  /** Tenta detectar Ollama com modelo de embedding. Nao bloqueia. */
  private async probeEmbeddings(): Promise<void> {
    const has = await hasEmbeddingModel();
    if (has) {
      this.embeddingsEnabled = true;
      this.embModelName = "nomic-embed-text";
    }
  }

  embeddingsAvailable(): boolean {
    return this.embeddingsEnabled;
  }

  embeddingModel(): string | null {
    return this.embModelName;
  }

  // ── CRUD ───────────────────────────────────────────────────────

  /** Async pra permitir gerar embedding sem bloquear o construtor. */
  async save(input: {
    title: string;
    content: string;
    tags?: string[];
    source?: "user" | "agent" | "import";
  }): Promise<Memory> {
    const id = randomUUID();
    const now = Date.now();
    const tags = input.tags ?? [];
    const source = input.source ?? "agent";
    const tagsJson = JSON.stringify(tags);

    // Embedding (se disponivel)
    let embedding: Buffer | null = null;
    if (this.embeddingsEnabled) {
      const text = `${input.title}\n\n${input.content}`;
      const vec = await tryEmbed(text);
      if (vec) embedding = floatArrayToBuffer(vec);
    }

    this.db
      .prepare(
        `INSERT INTO memories (id, title, content, tags, source, embedding, created_at, updated_at, accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(id, input.title, input.content, tagsJson, source, embedding, now, now);

    return this.get(id)!;
  }

  get(id: string): Memory | null {
    const row = this.db
      .prepare(
        `SELECT id, title, content, tags, source, embedding,
                created_at as createdAt, updated_at as updatedAt, accessed_at as accessedAt
         FROM memories WHERE id = ?`
      )
      .get(id) as RawMemory | undefined;
    if (!row) return null;
    this.touch(id);
    return toMemory(row);
  }

  /** Lista memorias com paginacao. Filtra por tag opcional. */
  list(opts: { tag?: string; limit?: number; offset?: number } = {}): Memory[] {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    let sql: string;
    let params: unknown[];
    if (opts.tag) {
      sql = `SELECT id, title, content, tags, source, embedding,
                    created_at as createdAt, updated_at as updatedAt, accessed_at as accessedAt
             FROM memories
             WHERE EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)
             ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params = [opts.tag, limit, offset];
    } else {
      sql = `SELECT id, title, content, tags, source, embedding,
                    created_at as createdAt, updated_at as updatedAt, accessed_at as accessedAt
             FROM memories
             ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params = [limit, offset];
    }
    const rows = this.db.prepare(sql).all(...params) as RawMemory[];
    return rows.map(toMemory);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as n FROM memories").get() as { n: number };
    return row.n;
  }

  /** Esquecer (deletar) por id, ou todas com tag, ou todas. dangerous. */
  forget(opts: { id?: string; tag?: string; all?: boolean }): { removed: number } {
    if (opts.id) {
      const r = this.db.prepare("DELETE FROM memories WHERE id = ?").run(opts.id);
      return { removed: r.changes };
    }
    if (opts.tag) {
      const r = this.db
        .prepare(
          `DELETE FROM memories
           WHERE EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)`
        )
        .run(opts.tag);
      return { removed: r.changes };
    }
    if (opts.all) {
      const r = this.db.prepare("DELETE FROM memories").run();
      return { removed: r.changes };
    }
    return { removed: 0 };
  }

  /** RAG search: combina FTS5 (BM25) + cosine similarity. Async (pode gerar query embedding). */
  async search(opts: {
    query: string;
    limit?: number;
    tag?: string;
    minScore?: number;
  }): Promise<MemoryHit[]> {
    const limit = Math.min(opts.limit ?? 8, 50);
    const minScore = opts.minScore ?? 0.0;
    const query = opts.query.trim();
    if (!query) return [];

    // FTS5 retorna rows ordenadas por BM25. bm25 menor = melhor match.
    // Normalizamos pra [0..1] com 1/(1+bm). Empirico: bm25 tipico em [0..20].
    const ftsRows = this.db
      .prepare(
        `SELECT m.id, m.title, m.content, m.tags, m.source,
                m.created_at as createdAt, m.updated_at as updatedAt,
                bm25(memories_fts) AS bm,
                snippet(memories_fts, 1, '»', '«', '…', 32) AS snip
         FROM memories_fts
         JOIN memories m ON m.rowid = memories_fts.rowid
         WHERE memories_fts MATCH ?
           ${opts.tag ? "AND EXISTS (SELECT 1 FROM json_each(m.tags) WHERE value = ?)" : ""}
         ORDER BY bm ASC
         LIMIT ?`
      )
      .all(
        ...(opts.tag ? [ftsQuery(query), opts.tag, limit * 3] : [ftsQuery(query), limit * 3])
      ) as FtsRow[];

    const ftsScores = new Map<string, { fts: number; row: FtsRow }>();
    for (const row of ftsRows) {
      ftsScores.set(row.id, { fts: 1 / (1 + row.bm), row });
    }

    // Embeddings: se Ollama ta ativo, computa query embedding + cosine.
    const cosineScores = new Map<string, number>();
    let queryVec: number[] | null = null;
    if (this.embeddingsEnabled) {
      queryVec = await tryEmbed(query);
    }
    if (queryVec) {
      const all = this.db
        .prepare(
          `SELECT id, embedding FROM memories WHERE embedding IS NOT NULL
           ${opts.tag ? "AND EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)" : ""}`
        )
        .all(...(opts.tag ? [opts.tag] : [])) as Array<{ id: string; embedding: Buffer }>;
      for (const row of all) {
        const vec = bufferToFloatArray(row.embedding);
        cosineScores.set(row.id, cosine(queryVec, vec));
      }
    }
    const hasEmb = queryVec !== null;

    // Combina: FTS-only OU FTS+cosine.
    const candidates = new Map<string, { fts: number; cos: number; row: FtsRow | null }>();
    for (const [id, { fts, row }] of ftsScores) {
      candidates.set(id, { fts, cos: cosineScores.get(id) ?? 0, row });
    }
    for (const [id, cos] of cosineScores) {
      if (!candidates.has(id)) candidates.set(id, { fts: 0, cos, row: null });
    }

    const hits: MemoryHit[] = [];
    for (const [id, c] of candidates) {
      const score = hasEmb ? c.fts * 0.4 + c.cos * 0.6 : c.fts;
      if (score < minScore) continue;

      let mem: FtsRow | PureRow | null = c.row;
      if (!mem) {
        const fetched = this.db
          .prepare(
            `SELECT id, title, content, tags, source,
                    created_at as createdAt, updated_at as updatedAt
             FROM memories WHERE id = ?`
          )
          .get(id) as PureRow | undefined;
        if (!fetched) continue;
        mem = { ...fetched, snip: snippetOf(fetched.content, 160) };
      }

      hits.push({
        id: mem.id,
        title: mem.title,
        content: mem.content,
        tags: safeParseTags(mem.tags),
        source: mem.source,
        createdAt: mem.createdAt,
        updatedAt: mem.updatedAt,
        score,
        signals: { fts: c.fts > 0 ? c.fts : null, cosine: c.cos > 0 ? c.cos : null },
        snippet: mem.snip,
      });
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  /** Marca memoria como acessada (LRU-ish). */
  private touch(id: string): void {
    this.db.prepare("UPDATE memories SET accessed_at = ? WHERE id = ?").run(Date.now(), id);
  }

  close(): void {
    this.db.close();
  }
}

interface RawMemory {
  id: string;
  title: string;
  content: string;
  tags: string;
  source: string;
  embedding: Buffer | null;
  createdAt: number;
  updatedAt: number;
  accessedAt: number | null;
}

/** Linha retornada pelo JOIN com FTS5 — tem bm e snip. */
interface FtsRow {
  id: string;
  title: string;
  content: string;
  tags: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  bm: number;
  snip: string;
}

/** Linha retornada pelo SELECT direto — só tem os campos da tabela. */
interface PureRow {
  id: string;
  title: string;
  content: string;
  tags: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  snip: string;
}

function safeParseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toMemory(row: RawMemory): Memory {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: safeParseTags(row.tags),
    source: row.source as Memory["source"],
    embedding: row.embedding ? bufferToFloatArray(row.embedding) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    accessedAt: row.accessedAt,
  };
}

// ── Helpers de embedding ─────────────────────────────────────────

function floatArrayToBuffer(arr: number[]): Buffer {
  const buf = Buffer.alloc(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i] ?? 0, i * 4);
  return buf;
}

function bufferToFloatArray(buf: Buffer): number[] {
  if (!buf || buf.length === 0) return [];
  const n = Math.floor(buf.length / 4);
  const arr = new Array<number>(n);
  for (let i = 0; i < n; i++) arr[i] = buf.readFloatLE(i * 4);
  return arr;
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── Helpers de query ─────────────────────────────────────────────

/** Sanitiza query pra FTS5: remove pontuação e adiciona prefix-match nos tokens. */
function ftsQuery(q: string): string {
  const cleaned = q.replace(/[^\p{L}\p{N}\s_-]/gu, " ").trim();
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return q;
  return tokens.map((t) => `${t}*`).join(" ");
}

function snippetOf(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}