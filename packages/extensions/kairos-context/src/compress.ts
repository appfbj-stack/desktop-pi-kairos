/**
 * Compressão de histórico (billion-context style).
 *
 * Estratégia: mantém últimas N mensagens completas, resume as antigas em 1 sumário.
 * Salva o sumário no DB pra não resumir de novo a cada chamada.
 *
 * Economia típica: 5x menos tokens quando histórico > 50 mensagens.
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { logger } from "@kairos/core";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
}

export interface CompressionResult {
  /** Mensagens completas (últimas N) */
  recent: ChatMessage[];
  /** Sumário das mensagens antigas (vazio se nada pra resumir) */
  summary: string;
  /** Total de mensagens comprimidas (pra debug) */
  compressedCount: number;
  /** Total de mensagens completas (pra debug) */
  recentCount: number;
  /** Total estimado de tokens (chars/4) */
  estimatedTokens: number;
}

/** Heurística simples de contagem de tokens (~4 chars/token PT-BR/en). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Schema da tabela summaries. Criada on-demand. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  compressed_count INTEGER NOT NULL,
  start_message_id TEXT,
  end_message_id TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(conversation_id)
);
CREATE INDEX IF NOT EXISTS summaries_conv_idx ON conversation_summaries(conversation_id);
`;

let schemaReady = false;
function ensureSchema(db: Database.Database): void {
  if (schemaReady) return;
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  schemaReady = true;
}

/**
 * Versão síncrona que retorna o histórico já comprimido.
 * NÃO chama o LLM — só lê do DB e combina o sumário salvo com as últimas N mensagens.
 *
 * O sumário é criado/atualizado por uma chamada separada (resumirMensagensAntigas) que
 * o agent-loop faz quando detecta que o histórico passou do limite.
 */
export function getCompressedHistory(
  db: Database.Database,
  conversationId: string,
  options: { keepRecent?: number; maxTokens?: number } = {},
): CompressionResult {
  ensureSchema(db);
  const keepRecent = options.keepRecent ?? 20;
  const maxTokens = options.maxTokens ?? 8000;

  // Pega todas as mensagens user/assistant
  const all = db
    .prepare(
      `SELECT id, role, content, created_at as createdAt
       FROM messages
       WHERE conversation_id = ? AND role IN ('user', 'assistant')
       ORDER BY created_at ASC`,
    )
    .all(conversationId) as Array<{ id: string; role: string; content: string; createdAt: number }>;

  if (all.length === 0) {
    return { recent: [], summary: "", compressedCount: 0, recentCount: 0, estimatedTokens: 0 };
  }

  // Pega sumário salvo (se existir)
  const sumRow = db
    .prepare(
      `SELECT summary, compressed_count as compressedCount, end_message_id as endMessageId
       FROM conversation_summaries WHERE conversation_id = ?`,
    )
    .get(conversationId) as
    | { summary: string; compressedCount: number; endMessageId: string | null }
    | undefined;

  // Filtra mensagens: se tem sumário, ignora as que foram comprimidas
  let candidates = all;
  let existingSummary = "";
  let compressedCount = 0;
  if (sumRow && sumRow.endMessageId) {
    const endIdx = all.findIndex((m) => m.id === sumRow.endMessageId);
    if (endIdx >= 0) {
      candidates = all.slice(endIdx + 1);
      existingSummary = sumRow.summary;
      compressedCount = sumRow.compressedCount;
    }
  }

  // Mantém apenas as últimas keepRecent
  const recent = candidates.slice(-keepRecent);
  const toCompress = candidates.slice(0, Math.max(0, candidates.length - keepRecent));

  // Se tem mensagens pra comprimir e o tamanho total > maxTokens, força compressão
  const totalText = recent.map((m) => m.content).join("") + existingSummary;
  const estimatedTokens = estimateTokens(totalText);

  // Se nada pra comprimir, retorna como está
  if (toCompress.length === 0) {
    return {
      recent: recent.map((m) => ({ role: m.role as "user" | "assistant", content: m.content, createdAt: m.createdAt })),
      summary: existingSummary,
      compressedCount,
      recentCount: recent.length,
      estimatedTokens,
    };
  }

  // Se ainda tá dentro do limite, retorna sem comprimir
  if (estimatedTokens <= maxTokens) {
    return {
      recent: candidates.map((m) => ({ role: m.role as "user" | "assistant", content: m.content, createdAt: m.createdAt })),
      summary: "",
      compressedCount: 0,
      recentCount: candidates.length,
      estimatedTokens,
    };
  }

  return {
    recent: recent.map((m) => ({ role: m.role as "user" | "assistant", content: m.content, createdAt: m.createdAt })),
    summary: existingSummary,
    compressedCount: compressedCount + toCompress.length,
    recentCount: recent.length,
    estimatedTokens: estimateTokens(recent.map((m) => m.content).join("") + existingSummary),
  };
}

/** Salva/atualiza o sumário de uma conversa. */
export function saveSummary(
  db: Database.Database,
  conversationId: string,
  summary: string,
  compressedCount: number,
  endMessageId: string,
): void {
  ensureSchema(db);
  const now = Date.now();
  db.prepare(
    `INSERT INTO conversation_summaries (id, conversation_id, summary, compressed_count, end_message_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       summary = excluded.summary,
       compressed_count = excluded.compressed_count,
       end_message_id = excluded.end_message_id,
       created_at = excluded.created_at`,
  ).run(randomUUID(), conversationId, summary, compressedCount, endMessageId, now);
  logger.info({ conversationId, compressedCount, summaryLen: summary.length }, "context: summary saved");
}

/** Conta quantas mensagens "user/assistant" tem no total (sem compressão). */
export function countMessages(db: Database.Database, conversationId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM messages
       WHERE conversation_id = ? AND role IN ('user', 'assistant')`,
    )
    .get(conversationId) as { c: number };
  return row.c;
}
