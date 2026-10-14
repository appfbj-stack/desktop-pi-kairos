/**
 * Tools de IA 100% local (via Ollama).
 *
 *   - vision_describe     : descreve/responde pergunta sobre uma imagem local
 *   - rag_index_path      : indexa um arquivo (gera embeddings e salva)
 *   - rag_index_workspace : indexa workspace inteiro (extensões filtradas)
 *   - rag_search          : top-k chunks mais similares à query
 *   - rag_list_indexed    : lista arquivos indexados
 *   - rag_clear           : remove chunks (de um source ou tudo)
 *   - transcribe_audio    : transcreve áudio local (Whisper)
 *
 * Dependência: Ollama rodando em http://127.0.0.1:11434
 *   Instale em: https://ollama.com
 *   Baixe modelos: ollama pull moondream  (vision)
 *                  ollama pull nomic-embed-text  (embeddings, 137M)
 *                  ollama pull whisper  (transcription, Ollama 0.4+)
 *
 * Sem Ollama, as tools retornam erro amigável.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { logger } from "@kairos/core";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  checkOllama,
  ollamaVision,
  ollamaEmbeddings,
  ollamaTranscribe,
  pickModel,
  getOllamaUrl,
} from "./ollama.js";
import {
  addChunks,
  clearBySource,
  clearAll,
  listSources,
  countChunks,
  searchSimilar,
  chunkText,
} from "./rag-store.js";

// =============================================================================
// 0. local_ai_status
// =============================================================================

const StatusInput = z.object({});

export const localAiStatus: Tool = {
  name: "local_ai_status",
  description:
    "Mostra status do Ollama local: URL, modelos instalados, quantos chunks RAG indexados. " +
    "Use primeiro pra confirmar que Ollama tá rodando antes de chamar as outras tools.",
  inputSchema: StatusInput,
  execute: async () => {
    const status = await checkOllama();
    if (!status.available) {
      return [
        `❌ Ollama indisponível em ${status.url}`,
        `Erro: ${status.error || "não foi possível conectar"}`,
        ``,
        `Instale em: https://ollama.com/download`,
        `Depois rode: ollama serve`,
        `E baixe os modelos:`,
        `  ollama pull moondream           (vision, 1.7B)`,
        `  ollama pull nomic-embed-text    (embeddings, 137M)`,
        `  ollama pull whisper             (transcription)`,
      ].join("\n");
    }
    const chunks = countChunks();
    return [
      `✅ Ollama rodando em ${status.url}`,
      `Modelos instalados: ${status.models?.length ?? 0}`,
      ...(status.models ?? []).slice(0, 10).map((m) => `  - ${m}`),
      ``,
      `RAG: ${chunks} chunks indexados em ${listSources().length} arquivos`,
      ``,
      `Sugestões:`,
      `  - Vision: ${pickModel(status.models ?? [], ["moondream", "llava", "llama3.2-vision", "vision"]) ?? "nenhum modelo vision instalado"}`,
      `  - Embeddings: ${pickModel(status.models ?? [], ["nomic-embed", "mxbai-embed", "all-minilm", "embed"]) ?? "nenhum modelo de embedding instalado"}`,
      `  - Whisper: ${pickModel(status.models ?? [], ["whisper"]) ?? "nenhum modelo whisper instalado"}`,
    ].join("\n");
  },
};

// =============================================================================
// 1. vision_describe
// =============================================================================

const VisionInput = z.object({
  imagePath: z.string().describe("Path absoluto da imagem (PNG, JPG, JPEG, WEBP, GIF)"),
  question: z
    .string()
    .default("Descreva esta imagem em detalhes.")
    .describe("Pergunta ou instrução sobre a imagem. Default: 'Descreva esta imagem em detalhes.'"),
  model: z.string().optional().describe("Modelo vision (default: detecta automaticamente via Ollama)"),
});

const VISION_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);

export const visionDescribe: Tool = {
  name: "vision_describe",
  description:
    "Descreve uma imagem local usando um modelo vision rodando LOCALMENTE via Ollama. " +
    "Sem enviar nada pra nuvem — ideal pra documentos confidenciais, prints, fotos de produto. " +
    "Modelos suportados: moondream (1.7B, rápido), llava (7B, melhor), llama3.2-vision (11B, melhor ainda). " +
    "Pode receber uma 'question' específica (ex: 'qual o número da nota fiscal?').",
  inputSchema: VisionInput,
  execute: async (input) => {
    const { imagePath, question, model } = VisionInput.parse(input);
    const ext = path.extname(imagePath).toLowerCase();
    if (!VISION_EXT.has(ext)) {
      return `❌ Formato não suportado: ${ext}. Use PNG/JPG/JPEG/WEBP/GIF.`;
    }
    const status = await checkOllama();
    if (!status.available) {
      return `❌ Ollama indisponível. Rode 'ollama serve' e 'ollama pull moondream'.`;
    }
    const useModel = model ?? pickModel(status.models ?? [], ["moondream", "llava", "llama3.2-vision", "vision"]);
    if (!useModel) {
      return `❌ Nenhum modelo vision instalado em Ollama. Rode 'ollama pull moondream'.`;
    }
    const buf = await fs.readFile(imagePath);
    const base64 = buf.toString("base64");
    const t0 = Date.now();
    const result = await ollamaVision({ model: useModel, prompt: question, imageBase64: base64 });
    logger.info({ model: useModel, image: imagePath, ms: result.durationMs }, "vision: OK");
    return `**[${useModel}]** (${result.durationMs}ms)\n\n${result.description}`;
  },
};

// =============================================================================
// 2-5. RAG
// =============================================================================

const EmbedModelInput = z.object({});

const DEFAULT_EMBED_MODEL = "nomic-embed-text";

async function getEmbedModel(): Promise<string | null> {
  const status = await checkOllama();
  if (!status.available) return null;
  return pickModel(status.models ?? [], ["nomic-embed", "mxbai-embed", "all-minilm", "embed"]) ?? DEFAULT_EMBED_MODEL;
}

const IndexPathInput = z.object({
  path: z.string().describe("Path absoluto do arquivo pra indexar"),
  chunkSize: z.number().int().min(100).max(4000).default(800).describe("Tamanho do chunk (chars)"),
  chunkOverlap: z.number().int().min(0).max(500).default(100).describe("Overlap entre chunks"),
  skipIfExists: z.boolean().default(true).describe("Pula se já indexado (compara mtime)"),
});

export const ragIndexPath: Tool = {
  name: "rag_index_path",
  description:
    "Indexa um arquivo texto no RAG local: lê o conteúdo, divide em chunks, gera embeddings via Ollama e salva no SQLite. " +
    "Depois fica disponível via rag_search. " +
    "Suporta txt/md/csv/json/code files. Pra PDFs, use kairos-ocr ou kairos-pdf-create antes.",
  inputSchema: IndexPathInput,
  execute: async (input) => {
    const { path: filePath, chunkSize, chunkOverlap, skipIfExists } = IndexPathInput.parse(input);
    const status = await checkOllama();
    if (!status.available) return "❌ Ollama indisponível. Rode 'ollama serve'.";
    const model = await getEmbedModel();
    if (!model) return "❌ Nenhum modelo de embedding. Rode 'ollama pull nomic-embed-text'.";

    let text: string;
    try {
      text = await fs.readFile(filePath, "utf-8");
    } catch (e: any) {
      return `❌ Não foi possível ler ${filePath}: ${e.message}`;
    }
    if (!text.trim()) return `❌ Arquivo vazio: ${filePath}`;

    if (skipIfExists) {
      const existing = listSources().find((s) => s.sourcePath === filePath);
      if (existing) return `⏭️ Já indexado (${existing.chunkCount} chunks). Use skipIfExists=false pra reindexar.`;
    }

    // Limpa versão antiga
    clearBySource(filePath);

    const chunks = chunkText(text, chunkSize, chunkOverlap);
    if (chunks.length === 0) return `❌ Nenhum chunk gerado de ${filePath}`;

    // Gera embeddings em batch
    const emb = await ollamaEmbeddings({ model, text: chunks });
    if (emb.embeddings.length !== chunks.length) {
      return `❌ Embeddings retornados (${emb.embeddings.length}) não batem com chunks (${chunks.length})`;
    }

    const inserted = addChunks(
      chunks.map((c, i) => ({
        sourcePath: filePath,
        chunkIndex: i,
        content: c,
        embedding: new Float32Array(emb.embeddings[i]),
      })),
    );
    return `✅ Indexado: **${filePath}** → ${inserted} chunks (modelo: ${model})`;
  },
};

const IndexWorkspaceInput = z.object({
  dir: z.string().optional().describe("Diretório (default: workspace)"),
  extensions: z.array(z.string()).optional().describe("Filtra extensões (sem ponto, lowercase). Ex: ['txt','md','csv']"),
  maxFiles: z.number().int().min(1).max(2000).default(200).describe("Máximo de arquivos a indexar"),
  maxBytesPerFile: z.number().int().min(1000).max(5_000_000).default(500_000).describe("Tamanho máximo por arquivo"),
});

export const ragIndexWorkspace: Tool = {
  name: "rag_index_workspace",
  description:
    "Indexa uma pasta (default: workspace do Kairós) inteira. " +
    "Útil pra primeira indexação ou pra reindexar tudo de uma vez. " +
    "Pode demorar — processa cada arquivo sequencialmente.",
  inputSchema: IndexWorkspaceInput,
  execute: async (input) => {
    const { dir, extensions, maxFiles, maxBytesPerFile } = IndexWorkspaceInput.parse(input);
    const targetDir = dir || (globalThis as any).__kairosWorkspaceDir;
    if (!targetDir) return "❌ Sem diretório (defina dir ou inicialize o workspace).";
    const status = await checkOllama();
    if (!status.available) return "❌ Ollama indisponível.";
    const model = await getEmbedModel();
    if (!model) return "❌ Nenhum modelo de embedding.";

    // Coleta arquivos
    const files: string[] = [];
    async function walk(dir: string, depth: number) {
      if (depth > 5 || files.length >= maxFiles) return;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (files.length >= maxFiles) return;
        if (e.name.startsWith(".")) continue;
        if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full, depth + 1);
        else {
          if (extensions && extensions.length > 0) {
            const ext = path.extname(e.name).slice(1).toLowerCase();
            if (!extensions.includes(ext)) continue;
          }
          try {
            const st = await fs.stat(full);
            if (st.size > maxBytesPerFile) continue;
            if (st.size === 0) continue;
            files.push(full);
          } catch {
            // pula
          }
        }
      }
    }
    await walk(targetDir, 0);

    if (files.length === 0) return `Nenhum arquivo encontrado em ${targetDir} com os filtros.`;

    // Indexa cada um
    let ok = 0, fail = 0;
    const results: string[] = [];
    for (const f of files) {
      try {
        const text = await fs.readFile(f, "utf-8");
        if (!text.trim()) continue;
        clearBySource(f);
        const chunks = chunkText(text, 800, 100);
        const emb = await ollamaEmbeddings({ model, text: chunks });
        addChunks(
          chunks.map((c, i) => ({
            sourcePath: f,
            chunkIndex: i,
            content: c,
            embedding: new Float32Array(emb.embeddings[i] ?? []),
          })),
        );
        ok++;
        results.push(`✅ ${path.relative(targetDir, f)} (${chunks.length} chunks)`);
      } catch (e: any) {
        fail++;
        results.push(`❌ ${path.relative(targetDir, f)}: ${e.message?.slice(0, 100)}`);
      }
    }
    return `**Indexação completa:** ${ok} OK, ${fail} falhas (de ${files.length} arquivos).\n\n` + results.join("\n");
  },
};

const SearchInput = z.object({
  query: z.string().min(2).describe("Busca em linguagem natural"),
  topK: z.number().int().min(1).max(20).default(5).describe("Quantos resultados retornar"),
  minScore: z.number().min(0).max(1).default(0.3).describe("Score mínimo (0..1). Default 0.3 = similaridade razoável."),
});

export const ragSearch: Tool = {
  name: "rag_search",
  description:
    "Busca semântica nos arquivos indexados. Retorna os chunks mais similares à query com score. " +
    "Use pra encontrar informação específica em muitos arquivos sem precisar ler um por um. " +
    "Se rag_index_workspace não foi rodado antes, retorna vazio.",
  inputSchema: SearchInput,
  execute: async (input) => {
    const { query, topK, minScore } = SearchInput.parse(input);
    const status = await checkOllama();
    if (!status.available) return "❌ Ollama indisponível.";
    const model = await getEmbedModel();
    if (!model) return "❌ Nenhum modelo de embedding.";
    if (countChunks() === 0) return "❌ RAG vazio. Rode rag_index_workspace ou rag_index_path primeiro.";

    const emb = await ollamaEmbeddings({ model, text: query });
    const results = searchSimilar(new Float32Array(emb.embeddings[0]), topK * 2);
    const filtered = results.filter((r) => r.score >= minScore).slice(0, topK);

    if (filtered.length === 0) {
      return `Nenhum chunk acima do score mínimo (${minScore}) pra "${query}". Tente rag_search com minScore=0.2 ou refine a query.`;
    }
    return filtered
      .map((r, i) => {
        const preview = r.chunk.content.length > 400
          ? r.chunk.content.slice(0, 400) + "…"
          : r.chunk.content;
        return [
          `${i + 1}. **[${(r.score * 100).toFixed(0)}%]** ${path.basename(r.chunk.sourcePath)} (chunk ${r.chunk.chunkIndex})`,
          `   ${preview}`,
          `   _ID: \`${r.chunk.id}\`_`,
        ].join("\n");
      })
      .join("\n\n");
  },
};

const ListIndexedInput = z.object({});

export const ragListIndexed: Tool = {
  name: "rag_list_indexed",
  description: "Lista os arquivos indexados no RAG com número de chunks cada.",
  inputSchema: ListIndexedInput,
  execute: async () => {
    const sources = listSources();
    if (sources.length === 0) return "RAG vazio. Use rag_index_workspace pra começar.";
    const total = countChunks();
    return `**${sources.length} arquivos indexados (${total} chunks):**\n\n` +
      sources
        .map((s, i) => `${i + 1}. \`${s.sourcePath}\` — ${s.chunkCount} chunks (${new Date(s.createdAt).toLocaleDateString("pt-BR")})`)
        .join("\n");
  },
};

const ClearInput = z.object({
  sourcePath: z.string().optional().describe("Path específico (default: limpa TUDO)"),
});

export const ragClear: Tool = {
  name: "rag_clear",
  description: "Remove chunks do RAG. Passe sourcePath pra remover só um arquivo. Sem parâmetro, limpa TUDO (irreversível).",
  inputSchema: ClearInput,
  execute: async (input) => {
    const { sourcePath } = ClearInput.parse(input);
    if (sourcePath) {
      const n = clearBySource(sourcePath);
      return `🗑️ Removidos ${n} chunks de ${sourcePath}`;
    }
    const n = clearAll();
    return `🗑️ RAG limpo: ${n} chunks removidos.`;
  },
};

// =============================================================================
// 6. transcribe_audio
// =============================================================================

const TranscribeInput = z.object({
  audioPath: z.string().describe("Path absoluto do arquivo de áudio (wav, mp3, m4a, ogg, flac)"),
  language: z.string().optional().describe("Código do idioma (pt, en, es, etc). Default: auto-detect"),
  model: z.string().optional().describe("Modelo Whisper (default: detecta do Ollama)"),
});

const AUDIO_EXT = new Set([".wav", ".mp3", ".m4a", ".ogg", ".flac", ".opus", ".webm"]);

export const transcribeAudio: Tool = {
  name: "transcribe_audio",
  description:
    "Transcreve um arquivo de áudio local usando Whisper via Ollama. " +
    "Sem mandar áudio pra OpenAI — ideal pra reuniões confidenciais, atendimentos, etc. " +
    "Modelos suportados: whisper (Ollama 0.4+). " +
    "Retorna texto + idioma detectado.",
  inputSchema: TranscribeInput,
  execute: async (input) => {
    const { audioPath, language, model } = TranscribeInput.parse(input);
    const ext = path.extname(audioPath).toLowerCase();
    if (!AUDIO_EXT.has(ext)) {
      return `❌ Formato não suportado: ${ext}. Use wav/mp3/m4a/ogg/flac/opus/webm.`;
    }
    const status = await checkOllama();
    if (!status.available) return "❌ Ollama indisponível.";
    const useModel = model ?? pickModel(status.models ?? [], ["whisper"]);
    if (!useModel) {
      return "❌ Modelo whisper não instalado em Ollama. Rode 'ollama pull whisper' (Ollama 0.4+).";
    }
    const buf = await fs.readFile(audioPath);
    const base64 = buf.toString("base64");
    const result = await ollamaTranscribe({ model: useModel, audioBase64: base64, language });
    return `**[${useModel}]** ${result.language ? `(${result.language})` : ""}\n\n${result.text}`;
  },
};

export const allTools: Tool[] = [
  localAiStatus,
  visionDescribe,
  ragIndexPath,
  ragIndexWorkspace,
  ragSearch,
  ragListIndexed,
  ragClear,
  transcribeAudio,
];
