/**
 * SQLite wrapper — kairos.db local.
 *
 * Schema (Sprint 1.4):
 *   conversations (id, created_at, updated_at, title)
 *   messages     (id, conversation_id, role, content, attachments, tool_name, created_at)
 *   settings     (key, value)
 *   logs         (id, level, message, context, created_at)
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export interface KairósDB {
  raw: Database.Database;
  close: () => void;
}

export function openDatabase(workspaceDir: string): KairósDB {
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }
  const dbPath = path.join(workspaceDir, "kairos.db");
  const raw = new Database(dbPath);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");

  // Schema
  raw.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      title TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      client_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT,
      tool_name TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      context TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id);
    CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(client_id);
  `);

  // Migrations idempotentes — ADD COLUMN em tabelas pre-existentes.
  try { raw.exec(`ALTER TABLE conversations ADD COLUMN client_id TEXT`); } catch { /* coluna já existe */ }
  try { raw.exec(`ALTER TABLE messages ADD COLUMN client_id TEXT`); } catch { /* coluna já existe */ }

  return {
    raw,
    close: () => raw.close(),
  };
}
