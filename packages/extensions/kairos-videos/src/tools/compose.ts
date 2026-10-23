/**
 * videos:compose — monta o vídeo vertical final.
 *
 * Pipeline:
 *   entrada (16:9 ou qualquer)  ──scale/crop──▶  1080×1920
 *   narração (mp3/wav)          ─────────────▶  mixagem de áudio
 *   legendas (.ass)             ─────────────▶  queimadas na imagem
 *   CTA (texto)                 ─────────────▶  queimado na imagem
 *
 * Usa o ffmpeg empacotado no app (ffmpeg-static), com suporte a GPU (NVENC)
 * quando disponível. O path da legenda é escapado para Windows — sem isso o
 * ffmpeg falha (ver escapeFfmpegPath).
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import fs from "node:fs";
import path from "node:path";
import { getVideosRoot, safeName, STAGES } from "../config.js";
import {
  buildFitFilter,
  escapeDrawtext,
  escapeFfmpegPath,
  runFfmpeg,
} from "../ffmpeg-utils.js";

const inputSchema = z.object({
  input: z.string().describe("Caminho do vídeo de entrada (a gravação de tela)."),
  output: z.string().optional().describe("Caminho do MP4 final. Se omitir, salva em 01_PARA_REVISAR."),
  audio: z
    .string()
    .optional()
    .describe("Caminho da narração (mp3/wav). Se omitir, o vídeo fica sem áudio."),
  subtitles: z.string().optional().describe("Caminho do .ass com as legendas. Se omitir, sem legenda."),
  cta: z.string().optional().describe("Texto da chamada para ação queimado no fim do vídeo."),
  width: z.number().default(1080).describe("Largura final (padrão 1080)."),
  height: z.number().default(1920).describe("Altura final (padrão 1920)."),
  fit: z
    .enum(["cover", "contain"])
    .default("cover")
    .describe("'cover' preenche e corta (padrão para tela gravada); 'contain' encaixa sem cortar."),
  useGpu: z
    .boolean()
    .default(true)
    .describe("Usa NVENC (GPU) quando disponível. Se falhar, cai para libx264."),
  crf: z.number().default(23).describe("Qualidade (menor = melhor). 18-28 é razoável."),
  fps: z.number().default(30).describe("Quadros por segundo."),
  title: z.string().optional().describe("Nome do arquivo de saída (sem extensão)."),
});

export interface ComposeResult {
  output: string;
  sizeBytes: number;
  width: number;
  height: number;
  hasAudio: boolean;
  hasSubtitles: boolean;
  hasCta: boolean;
  encoder: string;
  renderMs: number;
  warnings: string[];
}

export const videosComposeTool: Tool<typeof inputSchema> = {
  name: "videos:compose",
  description:
    "Monta o vídeo vertical final (1080x1920) a partir da gravação de tela, da narração e das legendas. Salva em 01_PARA_REVISAR para sua aprovação. Não publica em nenhuma rede social.",
  dangerous: true,
  inputSchema,
  execute: async (input, ctx): Promise<ComposeResult> => {
    // Defaults aplicados aqui (e não só no schema) porque a tool pode ser
    // chamada direto, sem passar pelo parse do Zod — e um `undefined` aqui
    // geraria um filtro inválido (scale=undefined:1920) e o ffmpeg falharia.
    const width = input.width ?? 1080;
    const height = input.height ?? 1920;
    const fit = input.fit ?? "cover";
    const fps = input.fps ?? 30;
    const crf = input.crf ?? 23;
    const useGpu = input.useGpu ?? true;

    if (!fs.existsSync(input.input)) {
      throw new Error(`Vídeo de entrada não encontrado: ${input.input}`);
    }
    if (input.audio && !fs.existsSync(input.audio)) {
      throw new Error(`Narração não encontrada: ${input.audio}`);
    }
    if (input.subtitles && !fs.existsSync(input.subtitles)) {
      throw new Error(`Arquivo de legendas não encontrado: ${input.subtitles}`);
    }

    let output = input.output?.trim();
    if (!output) {
      const dir = path.join(getVideosRoot(), STAGES.REVIEW);
      fs.mkdirSync(dir, { recursive: true });
      output = path.join(dir, `${safeName(input.title || "video")}.mp4`);
    } else {
      fs.mkdirSync(path.dirname(output), { recursive: true });
    }

    const warnings: string[] = [];

    // ---- Monta o filtro de vídeo -------------------------------------------
    const filters: string[] = [buildFitFilter(width, height, fit)];

    if (input.subtitles) {
      // Path com escape de Windows — SEM isso o ffmpeg falha ao abrir o .ass.
      filters.push(`ass='${escapeFfmpegPath(path.resolve(input.subtitles))}'`);
    }

    if (input.cta) {
      const fontFile =
        process.env.WINDIR
          ? `${process.env.WINDIR}\\Fonts\\arialbd.ttf`
          : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
      if (fs.existsSync(fontFile)) {
        filters.push(
          `drawtext=fontfile='${escapeFfmpegPath(fontFile)}':` +
            `text='${escapeDrawtext(input.cta)}':` +
            `fontcolor=white:fontsize=${Math.round((height / 1920) * 56)}:` +
            `box=1:boxcolor=black@0.55:boxborderw=24:` +
            `x=(w-text_w)/2:y=h-text_h-${Math.round((height / 1920) * 140)}`,
        );
      } else {
        warnings.push("Fonte de sistema não encontrada — CTA não foi aplicado.");
      }
    }

    const videoFilter = filters.join(",");

    // ---- Argumentos --------------------------------------------------------
    const args: string[] = ["-y", "-i", input.input];
    if (input.audio) args.push("-i", input.audio);

    args.push("-vf", videoFilter);
    args.push("-r", String(fps));
    args.push("-pix_fmt", "yuv420p");
    args.push("-movflags", "+faststart");

    if (input.audio) {
      args.push("-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "160k", "-ar", "48000");
    } else {
      args.push("-an");
    }

    // ---- Encoder (GPU com fallback) ----------------------------------------
    let encoder = "libx264";
    const gpuArgs = [
      ...args,
      "-c:v", "h264_nvenc", "-preset", "p4", "-cq", String(crf),
      "-b:v", "0",
      output,
    ];

    if (useGpu) {
      try {
        const gpu = await runFfmpeg(gpuArgs, ctx.abortSignal);
        if (gpu.ok) {
          const stat = fs.statSync(output);
          return {
            output,
            sizeBytes: stat.size,
            width,
            height,
            hasAudio: Boolean(input.audio),
            hasSubtitles: Boolean(input.subtitles),
            hasCta: Boolean(input.cta),
            encoder: "h264_nvenc",
            renderMs: gpu.durationMs,
            warnings,
          };
        }
        warnings.push("GPU (NVENC) indisponível — renderizado com libx264.");
      } catch (err) {
        warnings.push(
          `GPU (NVENC) falhou (${(err as Error).message.split("\n")[0]}) — usando libx264.`,
        );
      }
    }

    const cpuArgs = [...args, "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), output];
    const cpu = await runFfmpeg(cpuArgs, ctx.abortSignal);
    if (!cpu.ok) {
      throw new Error(`Falha na montagem: ${cpu.stderr.split("\n").slice(-5).join("\n")}`);
    }

    const stat = fs.statSync(output);
    return {
      output,
      sizeBytes: stat.size,
      width,
      height,
      hasAudio: Boolean(input.audio),
      hasSubtitles: Boolean(input.subtitles),
      hasCta: Boolean(input.cta),
      encoder: "libx264",
      renderMs: cpu.durationMs,
      warnings,
    };
  },
};
