/**
 * Embeddings — Ollama local (zero custo, offline).
 *
 * Mesmo padrao de kairos-memory/src/embeddings.ts. Probe automatico de
 * modelos de embed (nomic-embed-text preferido, all-minilm como fallback).
 */

const OLLAMA_BASE = process.env.KAIROS_OLLAMA_URL ?? "http://localhost:11434";

const EMBED_MODEL_CANDIDATES = [
  "nomic-embed-text",
  "all-minilm",
  "mxbai-embed-large",
  "snowflake-arctic-embed",
];

let cachedAvailableModel: string | null = null;
let probeDone = false;

export async function hasEmbeddingModel(): Promise<boolean> {
  if (probeDone) return cachedAvailableModel !== null;
  probeDone = true;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return false;
    const data = (await r.json()) as { models?: Array<{ name: string }> };
    const names = new Set((data.models ?? []).map((m) => m.name.toLowerCase()));
    for (const cand of EMBED_MODEL_CANDIDATES) {
      if (names.has(cand) || names.has(`${cand}:latest`)) {
        cachedAvailableModel = cand;
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function tryEmbed(text: string): Promise<number[] | null> {
  if (!cachedAvailableModel) {
    const has = await hasEmbeddingModel();
    if (!has) return null;
  }
  const model = cachedAvailableModel!;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const data = (await r.json()) as { embedding?: number[] };
    return data.embedding ?? null;
  } catch {
    return null;
  }
}
