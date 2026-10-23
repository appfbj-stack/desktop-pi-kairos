/**
 * videos:subtitles — gera o arquivo de legendas ASS (1080×1920) a partir de
 * um SRT ou de uma lista de falas.
 *
 * Por que ASS e não SRT: o ASS permite controle de posição, contorno e sombra,
 * que é o que fica bom em tela vertical (Shorts/Reels). O SRT convertido no
 * ffmpeg perde isso.
 *
 * IMPORTANTE: o caminho do arquivo de saída precisa ser passado ao ffmpeg com
 * escape de path Windows (ver escapeFfmpegPath em ffmpeg-utils.ts) — sem isso
 * o ffmpeg falha com "Error initializing a simple filtergraph".
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import fs from "node:fs";
import path from "node:path";
import { getVideosRoot, safeName, STAGES } from "../config.js";
import { assHeader, escapeAssText, srtTimeToSeconds, toAssTime } from "../ffmpeg-utils.js";

const cueSchema = z.object({
  start: z.number().describe("Início da fala em segundos."),
  end: z.number().describe("Fim da fala em segundos."),
  text: z.string().describe("Texto falado."),
});

const inputSchema = z.object({
  srt: z
    .string()
    .optional()
    .describe("Caminho de um arquivo .srt para converter. Alternativa a `cues`."),
  cues: z
    .array(cueSchema)
    .optional()
    .describe("Lista de falas com início/fim em segundos. Alternativa a `srt`."),
  width: z.number().default(1080).describe("Largura do vídeo final (padrão 1080)."),
  height: z.number().default(1920).describe("Altura do vídeo final (padrão 1920)."),
  fontSize: z.number().default(64).describe("Tamanho da fonte em pixels (proporcional à altura)."),
  output: z.string().optional().describe("Caminho do .ass de saída."),
  title: z.string().optional().describe("Nome do arquivo de saída (sem extensão)."),
});

export interface SubtitlesResult {
  output: string;
  cues: number;
  durationSec: number;
  width: number;
  height: number;
}

/** Lê um SRT e devolve as falas com tempos em segundos. */
function parseSrt(content: string): { start: number; end: number; text: string }[] {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const cues: { start: number; end: number; text: string }[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [rawStart, rawEnd] = timeLine.split("-->").map((s) => s.trim());
    if (!rawStart || !rawEnd) continue;
    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join("\n")
      .trim();
    if (!text) continue;
    cues.push({
      start: srtTimeToSeconds(rawStart),
      end: srtTimeToSeconds(rawEnd),
      text,
    });
  }
  return cues;
}

export const videosSubtitlesTool: Tool<typeof inputSchema> = {
  name: "videos:subtitles",
  description:
    "Gera legendas ASS para vídeo vertical 1080x1920 a partir de um SRT ou de uma lista de falas. Salva em 05_LEGENDAS. O arquivo gerado é o que o videos:compose queima na imagem.",
  dangerous: false,
  inputSchema,
  execute: async (input): Promise<SubtitlesResult> => {
    // Defaults aplicados aqui (e não só no schema) — a tool pode ser chamada
    // sem passar pelo parse do Zod, e `undefined` quebraria o cabeçalho ASS.
    const width = input.width ?? 1080;
    const height = input.height ?? 1920;

    let cues: { start: number; end: number; text: string }[] = [];

    if (input.srt) {
      if (!fs.existsSync(input.srt)) {
        throw new Error(`Arquivo SRT não encontrado: ${input.srt}`);
      }
      cues = parseSrt(fs.readFileSync(input.srt, "utf-8"));
    } else if (input.cues?.length) {
      cues = input.cues;
    } else {
      throw new Error("Informe `srt` (caminho do arquivo) ou `cues` (lista de falas).");
    }

    if (!cues.length) {
      throw new Error("Nenhuma fala encontrada para gerar legendas.");
    }

    cues.sort((a, b) => a.start - b.start);

    // Ajusta fonte à altura do vídeo (1080x1920 -> 64px).
    const fontSize = input.fontSize || Math.round((height / 1920) * 64);
    const header = assHeader(width, height, fontSize);

    const events = cues
      .map(
        (c) =>
          `Dialogue: 0,${toAssTime(c.start)},${toAssTime(c.end)},Default,,0,0,0,,${escapeAssText(c.text)}`,
      )
      .join("\n");

    const content = `${header}${events}\n`;

    let output = input.output?.trim();
    if (!output) {
      const dir = path.join(getVideosRoot(), STAGES.SUBTITLES);
      fs.mkdirSync(dir, { recursive: true });
      output = path.join(dir, `${safeName(input.title || "legendas")}.ass`);
    } else {
      fs.mkdirSync(path.dirname(output), { recursive: true });
    }
    fs.writeFileSync(output, content, "utf-8");

    const durationSec = Math.max(...cues.map((c) => c.end));

    return {
      output,
      cues: cues.length,
      durationSec: Number(durationSec.toFixed(2)),
      width,
      height,
    };
  },
};
