/**
 * Models catalog — busca lista de modelos disponíveis por provider.
 *
 * Sprint 1.20: UI Settings ganhou botão "Ver modelos" que abre modal
 * com cards. Usuário escolhe em vez de digitar nome de modelo.
 *
 * OpenRouter: GET https://openrouter.ai/api/v1/models (grátis, sem consumir credits)
 * Anthropic: GET https://api.anthropic.com/v1/models (precisa chave)
 * OpenAI:    GET https://api.openai.com/v1/models (precisa chave)
 * Ollama:    já tem listOllamaModels via agent:ollama:list-models
 *
 * Em caso de erro, retorna array vazio (UI mostra fallback "digite manualmente").
 */

import { logger } from "@kairos/core";

export interface ModelInfo {
  id: string;
  name: string;
  context?: number;
  /** "free" | "paid" — heurística simples pra destacar free models */
  tier?: "free" | "paid";
  /** Descrição curta (opcional, do provider) */
  description?: string;
}

interface OpenRouterModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { max_completion_tokens?: number };
  architecture?: { modality?: string };
}

interface OpenRouterListResponse {
  data?: OpenRouterModel[];
}

export async function listModels(
  provider: string,
  apiKey: string | undefined
): Promise<{ models: ModelInfo[]; error?: string }> {
  if (!apiKey && provider !== "ollama") {
    return { models: [], error: "API key necessária" };
  }

  try {
    switch (provider) {
      case "openrouter":
        return await listOpenRouterModels(apiKey!);
      case "openai":
        return await listOpenAILikeModels("https://api.openai.com/v1/models", apiKey!);
      case "anthropic":
        return await listAnthropicModels(apiKey!);
      case "minimax":
        // MiniMax tem /v1/models (OpenAI-compat). Lista modelos do catálogo.
        return await listOpenAILikeModels("https://api.minimax.io/v1/models", apiKey!);
      case "ollama":
        return { models: [], error: "Use o botão 🔄 ao lado de Ollama" };
      default:
        return { models: [], error: `Provider ${provider} não suporta listagem automática` };
    }
  } catch (err) {
    logger.warn({ provider, err: String(err) }, "falha ao listar modelos");
    return { models: [], error: String(err) };
  }
}

async function listOpenRouterModels(apiKey: string): Promise<{ models: ModelInfo[]; error?: string }> {
  const resp = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    return { models: [], error: `OpenRouter ${resp.status} ${resp.statusText}` };
  }
  const body = (await resp.json()) as OpenRouterListResponse;
  const data = body.data ?? [];
  const models: ModelInfo[] = data.map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    context: m.context_length ?? m.top_provider?.max_completion_tokens,
    tier: m.id.endsWith(":free") ? "free" : "paid",
    description: m.description?.slice(0, 200),
  }));
  // Ordena: free primeiro, depois alfabético
  models.sort((a, b) => {
    if (a.tier === "free" && b.tier !== "free") return -1;
    if (b.tier === "free" && a.tier !== "free") return 1;
    return a.id.localeCompare(b.id);
  });
  return { models };
}

async function listOpenAILikeModels(
  url: string,
  apiKey: string
): Promise<{ models: ModelInfo[]; error?: string }> {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!resp.ok) {
    return { models: [], error: `HTTP ${resp.status} ${resp.statusText}` };
  }
  const body = (await resp.json()) as { data?: { id: string }[] };
  const models: ModelInfo[] = (body.data ?? []).map((m) => ({
    id: m.id,
    name: m.id,
    tier: m.id.endsWith(":free") ? "free" : "paid",
  }));
  return { models };
}

async function listAnthropicModels(apiKey: string): Promise<{ models: ModelInfo[]; error?: string }> {
  const resp = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!resp.ok) {
    return { models: [], error: `Anthropic ${resp.status}` };
  }
  const body = (await resp.json()) as { data?: { id: string; display_name?: string }[] };
  const models: ModelInfo[] = (body.data ?? []).map((m) => ({
    id: m.id,
    name: m.display_name ?? m.id,
    tier: "paid",
  }));
  return { models };
}
