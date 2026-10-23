/**
 * Cliente MiniMax (mínimo) para o Kairós Vídeos IA.
 *
 * Usa o provider config que o app já expõe via globalThis.__kairosProviderConfig
 * (definido em apps/electron/src/main/agent-instance.ts) — assim não duplicamos
 * configuração nem guardamos chave nova.
 *
 * Recursos usados:
 *   - /v1/chat/completions  → roteiro a partir da descrição das telas
 *   - /v1/t2a_v2            → narração (TTS)
 *   - /v1/get_voice         → catálogo de vozes (PT-BR)
 *
 * IMPORTANTE (verificado em 2026-10-23):
 *   - Chave de LLM NÃO habilita geração de vídeo/avatar (cota separada, erro 2067)
 *   - Clonagem de voz depende do plano (erro 2061 quando o plano não suporta)
 *   - O campo "language" não existe no catálogo de vozes; o idioma é inferido
 *     pelo voice_id (ex.: "Portuguese_SentimentalLady")
 */

const DEFAULT_BASE_URL = "https://api.minimax.io";

export interface MiniMaxConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Lê o provider config global (chave nunca é logada). */
export function getMiniMaxConfig(): MiniMaxConfig {
  const cfg = (globalThis as any).__kairosProviderConfig as
    | { provider?: string; modelId?: string; apiKey?: string; baseUrl?: string }
    | undefined;

  const apiKey =
    cfg?.apiKey?.trim() ||
    process.env.MINIMAX_API_KEY?.trim() ||
    process.env.KAIROS_API_KEY?.trim() ||
    "";

  const baseUrl = (cfg?.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = cfg?.modelId?.trim() || "MiniMax-M3";

  return { apiKey, baseUrl, model };
}

export class MiniMaxError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly kind: string,
  ) {
    super(message);
    this.name = "MiniMaxError";
  }
}

/** Traduz o base_resp da MiniMax em erro legível. */
async function raiseApiError(res: Response, payload: any): Promise<never> {
  const base = payload?.base_resp ?? {};
  const code = typeof base.status_code === "number" ? base.status_code : null;
  const msg = base.status_msg || `HTTP ${res.status}`;

  let kind = "desconhecido";
  let hint = "";

  if (code === 2067) {
    kind = "cota_esgotada";
    hint =
      " A cota de tokens do plano MiniMax acabou. Geração de vídeo/avatar fica bloqueada, " +
      "mas TTS (narração) e texto continuam funcionando. Recarregue o plano no painel MiniMax.";
  } else if (code === 2061) {
    kind = "plano_sem_suporte";
    hint =
      " O plano atual não suporta este recurso (clonagem de voz). " +
      "Use narração por IA com uma voz da lista ou importe sua própria gravação.";
  } else if (code === 2013) {
    kind = "parametros_invalidos";
    hint = " Verifique os parâmetros enviados (modelo, prompt, resolução).";
  } else if (res.status === 401) {
    kind = "nao_autorizado";
    hint = " Verifique a chave da API nas Configurações do app.";
  } else if (res.status === 429) {
    kind = "rate_limit";
    hint = " Muitas requisições em pouco tempo. Aguarde alguns segundos.";
  }

  throw new MiniMaxError(`MiniMax: ${msg}.${hint}`, code, kind);
}

async function post(
  endpoint: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<any> {
  const { apiKey, baseUrl } = getMiniMaxConfig();
  if (!apiKey) {
    throw new MiniMaxError(
      "Chave da MiniMax não configurada. Abra as Configurações do app e informe a chave.",
      null,
      "sem_chave",
    );
  }

  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  const text = await res.text();
  let payload: any = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }

  if (!res.ok) {
    await raiseApiError(res, payload);
  }

  const base = payload?.base_resp;
  if (base && typeof base.status_code === "number" && base.status_code !== 0) {
    await raiseApiError(res, payload);
  }

  return payload;
}

/** Chat completion (usado para gerar roteiro). Retorna o texto. */
export async function chatCompletion(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { model?: string; maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const cfg = getMiniMaxConfig();
  const payload = await post(
    "/v1/chat/completions",
    {
      model: opts.model || cfg.model,
      messages,
      max_tokens: opts.maxTokens ?? 1200,
      temperature: opts.temperature ?? 0.4,
    },
    opts.signal,
  );

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new MiniMaxError(
      "MiniMax devolveu resposta vazia ao pedir o roteiro.",
      null,
      "resposta_vazia",
    );
  }
  return content.trim();
}

export interface VoiceInfo {
  voiceId: string;
  name: string;
  description: string;
}

/** Lista as vozes disponíveis, filtrando opcionalmente por idioma. */
export async function listVoices(opts: { language?: string; signal?: AbortSignal } = {}): Promise<VoiceInfo[]> {
  const payload = await post("/v1/get_voice", { voice_type: "all" }, opts.signal);
  const raw: any[] = payload?.system_voice ?? [];

  const voices: VoiceInfo[] = raw.map((v) => ({
    voiceId: String(v.voice_id ?? ""),
    name: String(v.voice_name ?? v.voice_id ?? ""),
    description: Array.isArray(v.description) ? v.description.join(" ") : String(v.description ?? ""),
  }));

  const wanted = opts.language?.trim().toLowerCase();
  if (!wanted) return voices;

  // O catálogo NÃO tem campo "language" — o idioma vem do voice_id/description.
  return voices.filter(
    (v) =>
      v.voiceId.toLowerCase().includes(wanted) ||
      v.description.toLowerCase().includes(wanted),
  );
}

export interface TtsOptions {
  voiceId?: string;
  model?: string;
  speed?: number;
  volume?: number;
  pitch?: number;
  format?: "mp3" | "wav" | "pcm";
  sampleRate?: number;
  signal?: AbortSignal;
}

export interface TtsResult {
  audio: Buffer;
  format: string;
  bytes: number;
  voiceId: string;
}

/** Gera narração em MP3 via MiniMax TTS. */
export async function synthesizeSpeech(text: string, opts: TtsOptions = {}): Promise<TtsResult> {
  const cfg = getMiniMaxConfig();
  const voiceId = opts.voiceId?.trim() || "male-qn-qingse";
  const format = opts.format ?? "mp3";

  const payload = await post(
    "/v1/t2a_v2",
    {
      model: opts.model || "speech-02-hd",
      text,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: opts.speed ?? 1.0,
        vol: opts.volume ?? 1.0,
        pitch: opts.pitch ?? 0,
      },
      audio_setting: {
        sample_rate: opts.sampleRate ?? 32000,
        bitrate: 128000,
        format,
        channel: 1,
      },
    },
    opts.signal,
  );

  const hex = payload?.data?.audio;
  if (typeof hex !== "string" || !hex) {
    throw new MiniMaxError(
      "MiniMax não devolveu áudio. Verifique se a cota do plano tem saldo.",
      null,
      "sem_audio",
    );
  }

  return {
    audio: Buffer.from(hex, "hex"),
    format: String(payload?.data?.format ?? format),
    bytes: hex.length / 2,
    voiceId,
  };
}
