/**
 * Tools de memória persistente.
 *
 *   - remember_business_context   : salva um fato (chave/valor/categoria)
 *   - recall_business_context     : busca fatos por query (LIKE)
 *   - list_business_context       : lista tudo (ou filtrado por categoria)
 *   - forget_business_context     : remove um fato por chave
 *
 * Use quando o user fala sobre o próprio negócio, contatos, decisões, preferências.
 * O agente também é encorajado a chamar isso automaticamente em mensagens relevantes.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { logger } from "@kairos/core";
import { remember, recall, listAll, forget, count, type MemoryCategory } from "./store.js";

const CATEGORIES = ["business", "contact", "preference", "decision", "task", "other"] as const;

// =============================================================================
// 1. remember_business_context
// =============================================================================

const RememberInput = z.object({
  key: z
    .string()
    .min(2)
    .max(80)
    .describe("Chave única e descritiva. Use dot notation: 'cliente.padaria.nome', 'preco.pao_frances', etc"),
  value: z.string().min(1).max(2000).describe("O fato a lembrar (texto livre, max 2000 chars)"),
  category: z
    .enum(CATEGORIES)
    .default("business")
    .describe("business=info do negócio, contact=pessoa/contato, preference=preferência do user, decision=decisão tomada, task=tarefa, other=outro"),
  importance: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(3)
    .describe("1=baixa, 3=média, 5=crítica (não esquecer). Use 5 só pra coisas que SEMPRE importam."),
});

export const rememberBusinessContext: Tool = {
  name: "remember_business_context",
  description:
    "Salva um fato importante sobre o negócio do cliente, contatos, preferências, decisões ou tarefas. " +
    "Persiste cross-session — fica disponível em todas as conversas futuras. " +
    "Use SEMPRE que o cliente falar algo importante (nome do negócio, segmento, clientes recorrentes, decisões). " +
    "Se a chave já existir, atualiza o valor (não duplica).",
  inputSchema: RememberInput,
  execute: async (input) => {
    const { key, value, category, importance } = RememberInput.parse(input);
    const sid = (globalThis as any).__kairosConversationId ?? null;
    const entry = remember(key, value, { category, importance: importance as number, sourceSessionId: sid });
    return `✅ Memória salva: \`${entry.key}\` (${category}, importância ${importance})\n  Valor: ${value.slice(0, 200)}${value.length > 200 ? "..." : ""}`;
  },
};

// =============================================================================
// 2. recall_business_context
// =============================================================================

const RecallInput = z.object({
  query: z.string().min(1).max(200).describe("Palavras-chave pra buscar (ex: 'padaria', 'preço', 'cliente João')"),
  category: z.enum(CATEGORIES).optional().describe("Filtrar por categoria"),
  limit: z.number().int().min(1).max(50).default(10).describe("Máximo de resultados"),
});

export const recallBusinessContext: Tool = {
  name: "recall_business_context",
  description:
    "Busca memórias salvas anteriormente. Retorna fatos relevantes com chave, valor, categoria e importance. " +
    "Use pra lembrar do contexto do cliente no início de uma conversa, ou quando o cliente mencionar algo que pode estar salvo. " +
    "Incrementa usage_count automaticamente (LRU).",
  inputSchema: RecallInput,
  execute: async (input) => {
    const { query, category, limit } = RecallInput.parse(input);
    const results = recall(query, { category: category as MemoryCategory | undefined, limit });
    if (results.length === 0) return `Nenhuma memória encontrada pra "${query}".`;
    return results
      .map((m, i) => {
        const age = Math.round((Date.now() - m.createdAt) / 86_400_000);
        const lastUsed = Math.round((Date.now() - m.lastUsedAt) / 86_400_000);
        return `${i + 1}. **${m.key}** [${m.category}, imp.${m.importance}, usado ${m.usageCount}x]\n   ${m.value}\n   _criado há ${age}d, último uso há ${lastUsed}d_`;
      })
      .join("\n\n");
  },
};

// =============================================================================
// 3. list_business_context
// =============================================================================

const ListInput = z.object({
  category: z.enum(CATEGORIES).optional().describe("Filtrar por categoria"),
  limit: z.number().int().min(1).max(500).default(50).describe("Máximo de entradas"),
});

export const listBusinessContext: Tool = {
  name: "list_business_context",
  description:
    "Lista todas as memórias salvas (ou filtradas por categoria). " +
    "Ordenadas por importance DESC + last_used_at DESC. " +
    "Use pra revisar o que o agente sabe sobre o cliente.",
  inputSchema: ListInput,
  execute: async (input) => {
    const { category, limit } = ListInput.parse(input);
    const all = listAll({ category: category as MemoryCategory | undefined, limit });
    const total = count();
    if (all.length === 0) {
      return category
        ? `Nenhuma memória na categoria "${category}". Total de memórias: ${total}.`
        : "Nenhuma memória salva ainda. Use remember_business_context pra começar.";
    }
    const header = `**${all.length} de ${total} memórias**${category ? ` (categoria: ${category})` : ""}`;
    const list = all
      .map((m, i) => `${i + 1}. **${m.key}** [${m.category}, imp.${m.importance}]\n   ${m.value.slice(0, 200)}${m.value.length > 200 ? "..." : ""}`)
      .join("\n\n");
    return `${header}\n\n${list}`;
  },
};

// =============================================================================
// 4. forget_business_context
// =============================================================================

const ForgetInput = z.object({
  key: z.string().min(1).describe("Chave exata a remover"),
});

export const forgetBusinessContext: Tool = {
  name: "forget_business_context",
  description:
    "Remove uma memória por chave. Use quando o cliente pedir pra esquecer algo ou quando uma info ficou desatualizada. " +
    "ATENÇÃO: irreversível (não tem undo).",
  inputSchema: ForgetInput,
  execute: async (input) => {
    const { key } = ForgetInput.parse(input);
    const ok = forget(key);
    return ok ? `🗑️ Memória removida: \`${key}\`` : `❌ Nenhuma memória com essa chave: \`${key}\``;
  },
};

export const allTools: Tool[] = [
  rememberBusinessContext,
  recallBusinessContext,
  listBusinessContext,
  forgetBusinessContext,
];
