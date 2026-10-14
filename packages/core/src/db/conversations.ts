/**
 * Service de persistência de conversas.
 *
 * Casa direto com PRD §17 (kairos.db local) e §3 (histórico).
 *
 * Schema (criado pelo db/index.ts):
 *   conversations (id, created_at, updated_at, title)
 *   messages     (id, conversation_id, role, content, attachments, created_at)
 *
 * attachments: JSON serializado de { name, size, type, mime }[]
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface Conversation {
  id: string;
  clientId: string | null;
  createdAt: number;
  updatedAt: number;
  title: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  clientId: string | null;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  attachments: string | null; // JSON
  toolName: string | null;
  createdAt: number;
}

export interface AttachmentInput {
  name: string;
  size: number;
  type: "text" | "image";
  mime: string;
}

/** Retorna o tenant atual (null se deslogado). Lido de globalThis. */
function currentClientId(): string | null {
  return ((globalThis as any).__kairosClientId as string | null) ?? null;
}

export class ConversationStore {
  constructor(private db: Database.Database) {}

  // ── Conversations ────────────────────────────────────────────

  createConversation(title?: string): Conversation {
    const id = randomUUID();
    const now = Date.now();
    const clientId = currentClientId();
    this.db
      .prepare(
        "INSERT INTO conversations (id, client_id, created_at, updated_at, title) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, clientId, now, now, title ?? null);
    return { id, clientId, createdAt: now, updatedAt: now, title: title ?? null };
  }

  getConversation(id: string): Conversation | null {
    const row = this.db
      .prepare(
        "SELECT id, client_id as clientId, created_at as createdAt, updated_at as updatedAt, title FROM conversations WHERE id = ?"
      )
      .get(id) as
      | { id: string; clientId: string | null; createdAt: number; updatedAt: number; title: string | null }
      | undefined;
    return row ?? null;
  }

  /** Lista conversas DO TENANT ATUAL. Conversas sem client_id (legado) ficam ocultas. */
  listConversations(limit = 100): Conversation[] {
    const clientId = currentClientId();
    if (!clientId) return []; // sem tenant = sem nada
    return this.db
      .prepare(
        `SELECT id, client_id as clientId, created_at as createdAt, updated_at as updatedAt, title
         FROM conversations
         WHERE client_id = ?
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(clientId, limit) as Conversation[];
  }

  updateTitle(id: string, title: string): void {
    this.db
      .prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND client_id = ?")
      .run(title, Date.now(), id, currentClientId());
  }

  touch(id: string): void {
    this.db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ? AND client_id = ?").run(Date.now(), id, currentClientId());
  }

  deleteConversation(id: string): void {
    this.db.prepare("DELETE FROM conversations WHERE id = ? AND client_id = ?").run(id, currentClientId());
  }

  // ── Messages ────────────────────────────────────────────────

  addMessage(
    conversationId: string,
    role: Message["role"],
    content: string,
    options: { toolName?: string; attachments?: AttachmentInput[] } = {}
  ): Message {
    const id = randomUUID();
    const now = Date.now();
    const clientId = currentClientId();
    const attachments = options.attachments && options.attachments.length > 0
      ? JSON.stringify(options.attachments.map((a) => ({ name: a.name, size: a.size, type: a.type, mime: a.mime })))
      : null;
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, client_id, role, content, attachments, tool_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, conversationId, clientId, role, content, attachments, options.toolName ?? null, now);
    this.touch(conversationId);
    return {
      id,
      conversationId,
      clientId,
      role,
      content,
      attachments,
      toolName: options.toolName ?? null,
      createdAt: now,
    };
  }

  listMessages(conversationId: string, limit = 500): Message[] {
    const rows = this.db
      .prepare(
        `SELECT id, conversation_id as conversationId, client_id as clientId, role, content,
                attachments, tool_name as toolName, created_at as createdAt
         FROM messages
         WHERE conversation_id = ? AND client_id = ?
         ORDER BY created_at ASC
         LIMIT ?`
      )
      .all(conversationId, currentClientId(), limit) as Message[];
    return rows;
  }

  /** Lista todas as mensagens como histórico de chat (formato simples). */
  listChatHistory(conversationId: string): { role: "user" | "assistant"; content: string }[] {
    return this.listMessages(conversationId, 500)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  }
}
