/**
 * Provider configuration & Model factory.
 *
 * Lê a config do env (ou de um objeto ProviderConfig) e retorna um Model do
 * pi-ai pronto pra usar com `stream()` / `complete()`.
 *
 * Suporta:
 *   - anthropic       (ANTHROPIC_API_KEY)
 *   - openai          (OPENAI_API_KEY)
 *   - openrouter      (OPENROUTER_API_KEY)
 *   - minimax         (MINIMAX_API_KEY) — placeholder, Fase 2 com gateway Kairos
 *   - ollama          (local, http://localhost:11434/v1) — Sprint 1.7+
 *
 * Config via env:
 *   KAIROS_PROVIDER=openrouter
 *   KAIROS_MODEL=anthropic/claude-3.5-sonnet
 *   KAIROS_API_KEY=sk-...  (opcional, default = env do provider)
 *   KAIROS_OLLAMA_URL=http://localhost:11434/v1  (opcional, custom URL)
 */

import { type Api, type Model } from "@earendil-works/pi-ai";
import { getEnvApiKey } from "@earendil-works/pi-ai/compat";
import { getBuiltinModel, getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { z } from "zod";

export const KNOWN_PROVIDERS = [
  "anthropic",
  "openai",
  "openrouter",
  "minimax",
  "ollama",
] as const;

export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

export interface ProviderConfig {
  provider: KnownProvider | string;
  modelId: string;
  /** API key explícita. Se omitida, lê do env. */
  apiKey?: string;
  /** URL customizada pro provider (usado por ollama). */
  baseUrl?: string;
}

// Default = Nex N2.5 mini via OpenRouter (free, conciso, funciona em 2026-09).
// Histórico:
//   - 1.0: anthropic/claude-3.5-sonnet (placeholder, nao existia no catalogo)
//   - 1.5: nvidia/nemotron-120b (verboso, ignorava maxTokens)
//   - 1.6: meta-llama/llama-3.1-8b-instruct:free (rapido, mas REMOVIDO do OpenRouter em 2026-09)
//   - 1.13+: nex-agi/nex-n2.5-mini:free (atual, funciona p/ chat, tool calls lentas)
const DEFAULT_MODEL_ID = "nex-agi/nex-n2.5-mini:free";

// Default Ollama: localhost. Pode ser customizado via KAIROS_OLLAMA_URL.
const DEFAULT_OLLAMA_URL = "http://localhost:11434/v1";
// Ollama nao exige auth; usa-se essa string placeholder.
const OLLAMA_PLACEHOLDER_KEY = "ollama-local";

const envConfigSchema = z.object({
  provider: z.enum(KNOWN_PROVIDERS).default("openrouter"),
  modelId: z.string().default(DEFAULT_MODEL_ID),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

/** Lê config de env vars. */
export function readProviderConfigFromEnv(): ProviderConfig {
  const raw = {
    provider: process.env.KAIROS_PROVIDER,
    modelId: process.env.KAIROS_MODEL,
    apiKey: process.env.KAIROS_API_KEY,
    baseUrl: process.env.KAIROS_OLLAMA_URL,
  };
  // Ignora valores "placeholder" conhecidos do Sprint 1 (que nao existem no
  // catalogo do OpenRouter no pi-ai). Evita que o app fique travado num
  // modelId invalido herdado de uma env var antiga.
  const knownBrokenModelIds = new Set([
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3-5-sonnet",
  ]);
  const modelId = raw.modelId && !knownBrokenModelIds.has(raw.modelId)
    ? raw.modelId
    : DEFAULT_MODEL_ID;
  const parsed = envConfigSchema.parse({
    provider: raw.provider ?? "openrouter",
    modelId,
    apiKey: raw.apiKey,
    baseUrl: raw.baseUrl,
  });
  return parsed;
}

/** Retorna o Model do pi-ai para a config. */
export function buildModel(config: ProviderConfig): Model<Api> {
  const provider = config.provider as KnownProvider;
  if (!KNOWN_PROVIDERS.includes(provider)) {
    throw new Error(
      `Provider desconhecido: ${config.provider}. Suportados: ${KNOWN_PROVIDERS.join(", ")}`
    );
  }

  // Ollama: API OpenAI-compatível, entao usamos o provider openai do pi-ai
  // e sobrescrevemos o baseUrl pra apontar pro servidor local do Ollama.
  // O modelId é o nome exato do modelo baixado (ex: "qwen2.5:3b", "llama3.1:8b").
  //
  // IMPORTANTE: forçamos `api: "openai-completions"` (chat completions classico)
  // porque Ollama nao implementa a nova API "openai-responses" do OpenAI.
  // O template do openai no pi-ai vem com api="openai-responses" por default.
  if (provider === "ollama") {
    const baseUrl = config.baseUrl ?? DEFAULT_OLLAMA_URL;
    const openaiModels = getBuiltinModels("openai");
    if (openaiModels.length === 0) {
      throw new Error("Provider openai nao tem modelos disponiveis no pi-ai. Verifique a instalacao.");
    }
    const template = openaiModels[0];
    const ollamaModel: Model<Api> = {
      ...template,
      id: config.modelId,
      name: config.modelId,
      baseUrl,
      api: "openai-completions" as const, // <-- forca a API classica compativel com Ollama
      provider: "openai", // Ollama impersona OpenAI
      input: ["text"], // Ollama nao expoe multimodal de forma estavel ainda
    } as Model<Api>;
    return ollamaModel;
  }

  // Demais providers: lookup direto no catalogo do pi-ai.
  const model = getBuiltinModel(provider, config.modelId as never);
  if (!model) {
    const supported = getBuiltinModels(provider)
      .map((m) => m.id)
      .filter((id) => id.includes(":free"))
      .slice(0, 5)
      .join(", ");
    throw new Error(
      `Modelo "${config.modelId}" não encontrado no provider "${provider}". ` +
        `Sugestões (free): ${supported}. ` +
        `Defina KAIROS_MODEL=... ou troque no painel ⚙️.`
    );
  }
  return model as unknown as Model<Api>;
}

/** Retorna a API key: explícita > env específica do provider > env KAIROS_API_KEY. */
export function resolveApiKey(config: ProviderConfig): string | undefined {
  // Ollama nao exige auth real — usa placeholder pra satisfazer o SDK.
  if (config.provider === "ollama") return OLLAMA_PLACEHOLDER_KEY;
  if (config.apiKey) return config.apiKey;
  if (process.env.KAIROS_API_KEY) return process.env.KAIROS_API_KEY;
  return getEnvApiKey(config.provider);
}

/**
 * Lista modelos disponiveis no Ollama local.
 * Faz GET http://localhost:11434/api/tags e retorna [{ id, name, size, ... }].
 *
 * Retorna [] se Ollama nao estiver rodando ou der erro de rede — nesse caso
 * a UI mostra uma mensagem amigavel e o usuario pode escolher outro provider.
 */
export interface OllamaModelInfo {
  id: string;
  name: string;
  size: number;
  modified_at: string;
  family?: string;
  parameter_size?: string;
  quantization_level?: string;
}

export async function listOllamaModels(
  baseUrl?: string
): Promise<OllamaModelInfo[]> {
  const url = (baseUrl ?? DEFAULT_OLLAMA_URL).replace(/\/v1\/?$/, "");
  const endpoint = `${url}/api/tags`;
  try {
    const res = await fetch(endpoint, { method: "GET" });
    if (!res.ok) {
      throw new Error(`Ollama respondeu ${res.status}`);
    }
    const data = (await res.json()) as {
      models?: Array<{
        name: string;
        size: number;
        modified_at: string;
        details?: { family?: string; parameter_size?: string; quantization_level?: string };
      }>;
    };
    return (data.models ?? []).map((m) => ({
      id: m.name,
      name: m.name,
      size: m.size,
      modified_at: m.modified_at,
      family: m.details?.family,
      parameter_size: m.details?.parameter_size,
      quantization_level: m.details?.quantization_level,
    }));
  } catch (err) {
    // Nao joga — deixa a UI decidir o que mostrar.
    console.warn(`[ollama] falha ao listar modelos em ${endpoint}:`, err);
    return [];
  }
}
