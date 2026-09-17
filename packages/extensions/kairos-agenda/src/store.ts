/**
 * Store singleton do kairos-agenda — SQLite local em <workspace>/kairos-agenda.db.
 *
 * Schema:
 *   id           INTEGER PK
 *   title        TEXT NOT NULL
 *   notes        TEXT
 *   datetime     TEXT NOT NULL (ISO 8601 UTC)
 *   category     TEXT (igreja, pessoal, trabalho, etc.)
 *   priority     INTEGER (0=normal, 1=alta, 2=urgente)
 *   completed    INTEGER (0/1)
 *   completed_at TEXT
 *   created_at   TEXT
 *   updated_at   TEXT
 */

import path from "node:path";
import Database from "better-sqlite3";

export interface AgendaItem {
  id: number;
  title: string;
  notes: string | null;
  datetime: string;
  category: string | null;
  priority: number;
  completed: 0 | 1;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agenda_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT,
  datetime TEXT NOT NULL,
  category TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agenda_datetime ON agenda_items(datetime);
CREATE INDEX IF NOT EXISTS idx_agenda_completed ON agenda_items(completed);
`;

let _db: Database.Database | null = null;
let _path: string | null = null;

/** Retorna o singleton do DB. Inicializa lazy na primeira chamada. */
export function getStore(): Database.Database {
  if (_db) return _db;

  const workspace = process.env.KAIROS_WORKSPACE_DIR;
  if (!workspace) {
    throw new Error(
      "KAIROS_WORKSPACE_DIR não definido. agent-instance.ts deve exportar a env antes de criar o Agent."
    );
  }

  _path = path.join(workspace, "kairos-agenda.db");
  _db = new Database(_path);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(SCHEMA);
  return _db;
}

/** Caminho do DB (para debug). */
export function getDbPath(): string {
  if (!_path) getStore();
  return _path!;
}

/** Fecha o singleton (testes/hot reload). */
export function closeStore(): void {
  if (_db) {
    _db.close();
    _db = null;
    _path = null;
  }
}

/** Agora em ISO 8601. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Valida e normaliza um datetime string → ISO 8601. Lança erro se inválido. */
export function parseDatetime(input: string): string {
  // Aceita: ISO 8601, "YYYY-MM-DD HH:MM", "YYYY-MM-DDTHH:MM:SSZ", etc.
  // LLM converte "amanhã 14h" → "2026-09-17T14:00:00".
  const trimmed = input.trim();
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new Error(
      `Datetime inválido: "${input}". Use ISO 8601 (ex: "2026-09-20T14:00:00" ou "2026-09-20 14:00").`
    );
  }
  return d.toISOString();
}