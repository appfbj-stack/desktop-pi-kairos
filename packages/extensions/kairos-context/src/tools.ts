/**
 * Tools de compressão de contexto (billion-context).
 *
 * 1. compress_history — resume mensagens antigas em sumário
 * 2. context_stats — mostra quanto da janela tá ocupada
 *
 * O agent-loop também pode usar getCompressedHistory() diretamente pra montar
 * o histórico enviado pro LLM (automático, sem tool call).
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { logger } from "@kairos/core";
import {
  estimateTokens,
  getCompressedHistory,
  saveSummary,
  countMessages,
  type ChatMessage,
} from "./compress.js";

/** Helper: pega o DB do agent via global injection (definido pelo agent-instance). */
function getDb(): any {
  const db = (globalThis as any).__kairosDb;
  if (!db) {
    throw new Error("DB não disponível. Kairos-core precisa estar inicializado.");
  }
  return db;
}

/** Helper: pega o ID da conversa ativa do agent. */
function getConversationId(): string | null {
  return (globalThis as any).__kairosConversationId ?? null;
}

// =============================================================================
// 1. context_stats — quantas mensagens e tokens o histórico tem
// =============================================================================

const StatsInput = z.object({});

export const contextStats: Tool = {
  name: "context_stats",
  description:
    "Mostra estatisticas do historico da conversa atual: total de mensagens, mensagens comprimidas, " +
    "tamanho do sumario e estimativa de tokens. Use pra decidir se precisa chamar compress_history.",
  inputSchema: StatsInput,
  execute: async () => {
    const db = getDb();
    const convId = getConversationId();
    if (!convId) return "❌ Nenhuma conversa ativa.";
    const total = countMessages(db, convId);
    const compressed = getCompressedHistory(db, convId);
    const fullText = JSON.stringify(compressed);
    return [
      `**Contexto da conversa atual**`,
      `- Total de mensagens (user+assistant): ${total}`,
      `- Mensagens comprimidas em sumario: ${compressed.compressedCount}`,
      `- Mensagens recentes (completas): ${compressed.recentCount}`,
      `- Tamanho do sumario: ${compressed.summary.length} chars (~${estimateTokens(compressed.summary)} tokens)`,
      `- Tamanho total recente: ${fullText.length} chars (~${estimateTokens(fullText)} tokens)`,
    ].join("\n");
  },
};

// =============================================================================
// 2. compress_history — resume mensagens antigas (o LLM gera o sumario)
// =============================================================================

const CompressInput = z.object({
  /** Quantas mensagens recentes manter completas (default 20). */
  keepRecent: z.number().int().min(2).max(100).default(20)
    .describe("Quantas mensagens recentes manter SEM compressao (default 20)"),
  /** Limite de tokens do historico enviado pro LLM. Se passar, dispara compressao. */
  maxTokens: z.number().int().min(500).max(128000).default(8000)
    .describe("Limite de tokens do historico (default 8000). Apos compressao o total deve ficar abaixo."),
});

export const compressHistory: Tool = {
  name: "compress_history",
  description:
    "Resume mensagens antigas do historico em 1 sumario compacto. Mantem as ultimas N mensagens " +
    "completas e substitui o resto por 1 sumario. Salva no DB pra nao resumir de novo. " +
    "Economiza ~5x tokens quando o historico cresce. Use quando context_stats mostrar >8000 tokens.",
  inputSchema: CompressInput,
  execute: async (input) => {
    const db = getDb();
    const convId = getConversationId();
    if (!convId) return "❌ Nenhuma conversa ativa.";
    const { keepRecent, maxTokens } = CompressInput.parse(input);

    // 1) Pega estado atual
    const before = getCompressedHistory(db, convId, { keepRecent, maxTokens });
    const all = db
      .prepare(
        `SELECT id, role, content, created_at as createdAt
         FROM messages
         WHERE conversation_id = ? AND role IN ('user', 'assistant')
         ORDER BY created_at ASC`,
      )
      .all(convId) as Array<{ id: string; role: string; content: string; createdAt: number }>;

    // 2) Calcula janela: tudo menos as últimas keepRecent
    const endIdx = all.length - keepRecent;
    if (endIdx <= 0) {
      return "Historico pequeno demais pra comprimir. Nenhuma acao tomada.";
    }
    const toCompress = all.slice(0, endIdx);
    const lastToCompress = toCompress[toCompress.length - 1];

    // 3) Gera sumário via LLM (usando o agent loop recursivamente seria ruim — usa provider direto)
    // Aqui delegamos ao modelo: o LLM recebe as mensagens a resumir e devolve o sumário.
    // Como esta é uma tool, ela NAO pode chamar o loop. Solução: o caller (modelo) faz
    // a chamada e passa o sumário como param. Mas pra ficar auto-suficiente, vamos usar
    // o provider diretamente via OpenAI-compatible.
    return await compressViaProvider(convId, toCompress, lastToCompress.id, before);
  },
};

async function compressViaProvider(
  conversationId: string,
  messages: Array<{ role: string; content: string; createdAt: number }>,
  endMessageId: string,
  before: { compressedCount: number; summary: string; recentCount: number },
): Promise<string> {
  // Pega provider config direto dos globals (definido pelo agent-instance.ts).
  // Fallback: provider MiniMax bundled.
  const cfg = (globalThis as any).__kairosProviderConfig ?? {
    provider: "minimax",
    modelId: "MiniMax-M3",
  };
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  if (!apiKey) {
    return "❌ API key nao configurada. Defina OPENAI_API_KEY no .env.";
  }

  // Texto a resumir
  const conversationText = messages
    .map((m) => `[${new Date(m.createdAt).toISOString().slice(0, 16)}] ${m.role}: ${m.content}`)
    .join("\n\n");

  // Monta request OpenAI-compatible
  const baseUrl = cfg.baseUrl || "https://api.MiniMax.io/v1";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.modelId || "MiniMax-M3",
      messages: [
        {
          role: "system",
          content:
            "Voce resume conversas em PT-BR. Mantenha fatos, decisoes, numeros, nomes proprios, URLs e tarefas pendentes. " +
            "Descarte cumprimentos e redundancia. Formato: 1 paragrafo continuo, max 800 palavras. " +
            "Comece com '[Resumo ate DD/MM HH:MM]'.",
        },
        { role: "user", content: `Resuma esta conversa:\n\n${conversationText}` },
      ],
      max_tokens: 1500,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return `❌ Erro no LLM: ${res.status} ${text.slice(0, 200)}`;
  }
  const data = await res.json();
  const summary = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!summary) return "❌ LLM devolveu sumario vazio.";

  // Combina com sumário anterior (se existir)
  const finalSummary = before.summary
    ? `${before.summary}\n\n---\n\n${summary}`
    : summary;

  // Salva
  const db = getDb();
  saveSummary(db, conversationId, finalSummary, before.compressedCount + messages.length, endMessageId);

  logger.info(
    { conversationId, compressedCount: messages.length, summaryLen: finalSummary.length },
    "context: compressed",
  );

  return [
    `✅ Historico comprimido.`,
    `- ${messages.length} mensagens resumidas`,
    `- Sumario agora tem ${finalSummary.length} chars (~${estimateTokens(finalSummary)} tokens)`,
    `- Proxima chamada do LLM usara: [sumario] + ultimas ${before.recentCount} mensagens`,
  ].join("\n");
}

export const allTools: Tool[] = [contextStats, compressHistory];
