/**
 * Helper de Ollama — endpoint HTTP local (default http://127.0.0.1:11434).
 *
 * Usado por Vision, RAG (embeddings) e Whisper (transcription).
 *
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import { logger } from "@kairos/core";

const DEFAULT_OLLAMA = "http://127.0.0.1:11434";

export function getOllamaUrl(): string {
  return process.env.OLLAMA_HOST?.trim() || DEFAULT_OLLAMA;
}

export interface OllamaStatus {
  available: boolean;
  url: string;
  version?: string;
  models?: string[];
  error?: string;
}

/** Checa se Ollama tá rodando e retorna lista de modelos instalados. */
export async function checkOllama(): Promise<OllamaStatus> {
  const url = getOllamaUrl();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${url}/api/tags`, { signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) {
      return { available: false, url, error: `Ollama ${r.status}` };
    }
    const data = (await r.json()) as { models?: Array<{ name: string }> };
    return {
      available: true,
      url,
      models: (data.models ?? []).map((m) => m.name),
    };
  } catch (e: any) {
    return { available: false, url, error: e.message?.slice(0, 100) };
  }
}

export interface VisionRequest {
  model: string;
  prompt: string;
  imageBase64: string;
}

export interface VisionResponse {
  description: string;
  model: string;
  durationMs: number;
}

/** Chama Ollama generate com imagem (vision). */
export async function ollamaVision(req: VisionRequest): Promise<VisionResponse> {
  const url = getOllamaUrl();
  const t0 = Date.now();
  const r = await fetch(`${url}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: req.model,
      prompt: req.prompt,
      images: [req.imageBase64],
      stream: false,
      options: { temperature: 0.2 },
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Ollama vision ${r.status}: ${text.slice(0, 300)}`);
  }
  const data = (await r.json()) as { response: string };
  return { description: (data.response || "").trim(), model: req.model, durationMs: Date.now() - t0 };
}

export interface EmbeddingRequest {
  model: string;
  text: string | string[];
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
}

/** Gera embeddings via Ollama. */
export async function ollamaEmbeddings(req: EmbeddingRequest): Promise<EmbeddingResponse> {
  const url = getOllamaUrl();
  const r = await fetch(`${url}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: req.model, prompt: req.text }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Ollama embeddings ${r.status}: ${text.slice(0, 300)}`);
  }
  const data = (await r.json()) as { embedding?: number[]; embeddings?: Array<{ embedding: number[] }> };
  if (data.embeddings) {
    return { embeddings: data.embeddings.map((e) => e.embedding), model: req.model };
  }
  if (data.embedding) {
    return { embeddings: [data.embedding], model: req.model };
  }
  throw new Error("Ollama não retornou embeddings");
}

export interface WhisperRequest {
  model: string;
  audioBase64: string;
  language?: string; // ISO-639-1 (ex: 'pt', 'en')
}

export interface WhisperResponse {
  text: string;
  model: string;
  language?: string;
}

/** Transcreve áudio via Ollama (/api/transcribe, nativo desde Ollama 0.4+). */
export async function ollamaTranscribe(req: WhisperRequest): Promise<WhisperResponse> {
  const url = getOllamaUrl();
  const r = await fetch(`${url}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: req.model,
      audio: req.audioBase64,
      ...(req.language ? { language: req.language } : {}),
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Ollama transcribe ${r.status}: ${text.slice(0, 300)}`);
  }
  const data = (await r.json()) as { text: string; language?: string };
  return { text: (data.text || "").trim(), model: req.model, language: data.language };
}

export function pickModel(available: string[], preferred: string[]): string | null {
  for (const p of preferred) {
    const found = available.find((m) => m.toLowerCase().includes(p.toLowerCase()));
    if (found) return found;
  }
  return null;
}

export async function logStatus(): Promise<void> {
  const status = await checkOllama();
  if (status.available) {
    logger.info({ url: status.url, modelCount: status.models?.length }, "local-ai: ollama OK");
  } else {
    logger.warn({ url: status.url, error: status.error }, "local-ai: ollama indisponível (instale em https://ollama.com e rode `ollama serve`)");
  }
}
