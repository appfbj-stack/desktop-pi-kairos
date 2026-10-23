/**
 * videos:source — busca e baixa vídeos de referência (virais) para usar de
 * insumo na montagem do vídeo do Kairós.
 *
 * Três modos:
 *   search   — pesquisa por termo e devolve a lista (título, views, duração,
 *              canal, link) pra você escolher qual usar.
 *   info     — metadados de um link específico.
 *   download — baixa o vídeo escolhido em MP4 na pasta de fontes do projeto.
 *
 * O material baixado é REFERÊNCIA: serve de base para o Kairós montar por cima
 * (narração + legendas + CTA). Republicar o vídeo original exige autorização
 * do autor — a tool nunca publica em nenhuma rede social.
 *
 * Busca: YouTube (via yt-dlp, sem login).
 * Link direto: qualquer plataforma que o yt-dlp suporte (YouTube, TikTok,
 * Instagram, X, Vimeo...) — cole o link e use o modo "download".
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import fs from "node:fs";
import path from "node:path";
import { getVideosRoot, safeName } from "../config.js";
import {
  downloadVideo,
  getVideoInfo,
  searchVideos,
  sourcesDir,
  type YtDlpVideo,
} from "../ytdlp.js";

const inputSchema = z.object({
  mode: z
    .enum(["search", "download", "info"])
    .default("search")
    .describe("'search' pesquisa por termo; 'info' lê um link; 'download' baixa o vídeo."),
  query: z
    .string()
    .optional()
    .describe("Termo de busca (modo search). Ex.: 'kairos crm', 'automação pastoral'."),
  url: z
    .string()
    .optional()
    .describe("Link do vídeo (modos info e download). Ex.: https://www.youtube.com/watch?v=..."),
  limit: z
    .number()
    .default(5)
    .describe("Quantos resultados trazer na busca (1-20, padrão 5)."),
  project: z
    .string()
    .optional()
    .describe("Nome do projeto — as fontes vão para <projeto>/_fontes/."),
  root: z
    .string()
    .optional()
    .describe("Raiz base dos vídeos. Se omitir, usa a configurada."),
  minViews: z
    .number()
    .optional()
    .describe("Só mostra vídeos com pelo menos N visualizações (filtro de viral)."),
  maxDurationSec: z
    .number()
    .optional()
    .describe("Só mostra vídeos com até N segundos (ex.: 60 para Shorts)."),
  maxHeight: z
    .number()
    .default(1080)
    .describe("Altura máxima no download (padrão 1080)."),
});

export interface SourceSearchItem {
  title: string;
  url: string;
  channel: string;
  durationSec: number | null;
  viewCount: number | null;
  likeCount: number | null;
  thumbnail: string | null;
  uploadDate: string | null;
  durationLabel: string;
}

export interface SourceResult {
  mode: "search" | "download" | "info";
  root: string;
  sourcesDir: string;
  results: SourceSearchItem[];
  downloaded?: {
    filePath: string;
    sizeBytes: number;
    title: string;
  };
  usageNote: string;
}

const USAGE_NOTE =
  "Material de referência para montar o vídeo do Kairós por cima. Republicar o vídeo original exige autorização do autor. Nada é publicado automaticamente.";

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "?";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function toItem(video: YtDlpVideo): SourceSearchItem {
  return {
    title: video.title,
    url: video.url,
    channel: video.channel,
    durationSec: video.durationSec,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    thumbnail: video.thumbnail,
    uploadDate: video.uploadDate,
    durationLabel: formatDuration(video.durationSec),
  };
}

export const videosSourceTool: Tool<typeof inputSchema> = {
  name: "videos:source",
  description:
    "Busca vídeos virais de referência (YouTube Shorts/Reels e afins) e baixa o escolhido como insumo para montar o vídeo do Kairós por cima. Use 'search' para achar, 'download' para trazer o arquivo. O material é referência — não é republicado nem publicado automaticamente.",
  dangerous: true,
  inputSchema,
  execute: async (input): Promise<SourceResult> => {
    const mode = input.mode ?? "search";
    const root = input.root?.trim() ? path.resolve(input.root.trim()) : getVideosRoot();
    const project = input.project?.trim() ? safeName(input.project.trim()) : null;
    const destDir = sourcesDir(root, project);

    // ---------------- SEARCH ------------------------------------------------
    if (mode === "search") {
      const query = input.query?.trim();
      if (!query) {
        throw new Error("Modo search exige o parâmetro `query` (o que você quer procurar).");
      }
      const limit = Math.max(1, Math.min(20, input.limit ?? 5));
      const videos = await searchVideos(query, limit);

      const minViews = input.minViews;
      const maxDuration = input.maxDurationSec;
      const filtered = videos.filter((v) => {
        if (minViews != null && (v.viewCount ?? 0) < minViews) return false;
        if (maxDuration != null && (v.durationSec ?? 0) > maxDuration) return false;
        return true;
      });

      return {
        mode,
        root,
        sourcesDir: destDir,
        results: filtered.map(toItem),
        usageNote: USAGE_NOTE,
      };
    }

    // ---------------- INFO --------------------------------------------------
    if (mode === "info") {
      const url = input.url?.trim();
      if (!url) {
        throw new Error("Modo info exige o parâmetro `url` (link do vídeo).");
      }
      const video = await getVideoInfo(url);
      return {
        mode,
        root,
        sourcesDir: destDir,
        results: [toItem(video)],
        usageNote: USAGE_NOTE,
      };
    }

    // ---------------- DOWNLOAD ----------------------------------------------
    const url = input.url?.trim();
    if (!url) {
      throw new Error("Modo download exige o parâmetro `url` (link do vídeo escolhido).");
    }

    fs.mkdirSync(destDir, { recursive: true });
    const maxHeight = Math.max(240, Math.min(2160, input.maxHeight ?? 1080));
    const dl = await downloadVideo(url, destDir, maxHeight);

    return {
      mode,
      root,
      sourcesDir: destDir,
      results: [],
      downloaded: {
        filePath: dl.filePath,
        sizeBytes: dl.sizeBytes,
        title: dl.title,
      },
      usageNote: USAGE_NOTE,
    };
  },
};
