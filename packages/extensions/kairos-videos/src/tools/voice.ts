/**
 * videos:voice — narração do vídeo.
 *
 * Dois modos:
 *   mode "list"     → lista as vozes disponíveis (filtra por idioma, ex.: "portuguese")
 *   mode "generate" → gera o MP3 da narração via MiniMax TTS
 *
 * Observação importante (verificado 2026-10-23): o catálogo de vozes da
 * MiniMax NÃO tem campo "language". O idioma é inferido pelo voice_id
 * (ex.: "Portuguese_SentimentalLady") ou pela descrição. São 73 vozes PT-BR.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import fs from "node:fs";
import path from "node:path";
import { listVoices, MiniMaxError, synthesizeSpeech } from "../minimax.js";
import { getVideosRoot, loadVideosConfig, safeName, STAGES } from "../config.js";

const inputSchema = z.object({
  mode: z
    .enum(["list", "generate"])
    .default("generate")
    .describe("'list' mostra as vozes disponíveis; 'generate' cria o áudio da narração."),
  text: z
    .string()
    .optional()
    .describe("Texto da narração (modo generate). Se omitir, usa o texto puro do roteiro."),
  voiceId: z
    .string()
    .optional()
    .describe("voice_id da MiniMax (modo generate). Se omitir, usa a voz preferida ou a primeira PT-BR."),
  language: z
    .string()
    .default("portuguese")
    .describe("Filtro de idioma no modo list (ex.: 'portuguese', 'english')."),
  speed: z.number().default(1.0).describe("Velocidade da fala (0.5 a 2.0)."),
  pitch: z.number().default(0).describe("Tom da voz (-12 a 12)."),
  volume: z.number().default(1.0).describe("Volume (0 a 10)."),
  model: z.string().default("speech-02-hd").describe("Modelo TTS (speech-02-hd ou speech-02-turbo)."),
  output: z
    .string()
    .optional()
    .describe("Caminho do MP3 de saída. Se omitir, salva em 04_ROTEIROS da raiz configurada."),
  title: z.string().optional().describe("Nome do arquivo de saída (sem extensão)."),
});

export interface VoiceListResult {
  mode: "list";
  total: number;
  voices: { voiceId: string; name: string; description: string }[];
  preferredVoiceId: string | null;
}

export interface VoiceGenerateResult {
  mode: "generate";
  output: string;
  bytes: number;
  voiceId: string;
  model: string;
  characters: number;
  estimatedCostUsd: number;
}

export const videosVoiceTool: Tool<typeof inputSchema> = {
  name: "videos:voice",
  description:
    "Narração do vídeo: lista as vozes MiniMax disponíveis (73 em PT-BR) ou gera o MP3 da narração. Use 'speech-02-turbo' para economizar (~US$ 0,03/30s) e 'speech-02-hd' para melhor qualidade (~US$ 0,05/30s).",
  dangerous: false,
  inputSchema,
  execute: async (input, ctx): Promise<VoiceListResult | VoiceGenerateResult> => {
    const cfg = loadVideosConfig();

    if (input.mode === "list") {
      const voices = await listVoices({ language: input.language, signal: ctx.abortSignal });
      return {
        mode: "list",
        total: voices.length,
        voices: voices.slice(0, 100),
        preferredVoiceId: cfg.preferredVoiceId,
      };
    }

    const text = (input.text ?? "").trim();
    if (!text) {
      throw new Error(
        "Informe o texto da narração em `text` (use a seção NARRACAO_COMPLETA do roteiro).",
      );
    }

    // Voz: explícita > preferida > primeira PT-BR > fallback genérico.
    let voiceId = input.voiceId?.trim() || cfg.preferredVoiceId || "";
    if (!voiceId) {
      const ptbr = await listVoices({ language: "portuguese", signal: ctx.abortSignal });
      voiceId = ptbr[0]?.voiceId ?? "male-qn-qingse";
    }

    let result;
    try {
      result = await synthesizeSpeech(text, {
        voiceId,
        model: input.model,
        speed: input.speed,
        pitch: input.pitch,
        volume: input.volume,
        signal: ctx.abortSignal,
      });
    } catch (err) {
      if (err instanceof MiniMaxError) {
        throw new Error(`Falha na narração (${err.kind}): ${err.message}`);
      }
      throw err;
    }

    let output = input.output?.trim();
    if (!output) {
      const dir = path.join(getVideosRoot(), STAGES.SCRIPTS);
      fs.mkdirSync(dir, { recursive: true });
      output = path.join(dir, `${safeName(input.title || "narracao")}.mp3`);
    } else {
      fs.mkdirSync(path.dirname(output), { recursive: true });
    }
    fs.writeFileSync(output, result.audio);

    // speech-02-hd = US$ 100/1M chars; speech-02-turbo = US$ 60/1M chars.
    const ratePerMillion = input.model.includes("turbo") ? 60 : 100;

    return {
      mode: "generate",
      output,
      bytes: result.bytes,
      voiceId: result.voiceId,
      model: input.model,
      characters: text.length,
      estimatedCostUsd: Number(((text.length / 1_000_000) * ratePerMillion).toFixed(4)),
    };
  },
};
