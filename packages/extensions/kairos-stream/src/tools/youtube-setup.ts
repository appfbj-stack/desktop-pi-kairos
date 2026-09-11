/**
 * stream:youtube-setup — calcula config recomendada pro YouTube Live.
 *
 * YouTube Live RTMP: rtmp://a.rtmp.youtube.com/live2
 * Chave: 24 chars (alfanum), obtida em https://studio.youtube.com → Go Live → Stream settings
 *
 * Bitrate recomendado pelo YouTube:
 *   - 1080p60: 9.000 kbps CBR, keyframe 4s
 *   - 1080p30: 6.000 kbps CBR, keyframe 4s
 *   - 720p60:  6.000 kbps CBR, keyframe 4s
 *   - 720p30:  4.500 kbps CBR, keyframe 4s
 *   - 480p30:  1.500 kbps CBR
 *
 * Safe upload: (uploadMedido * 0.75) = margem pra flutuação.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";

const RESOLUTIONS = {
  "1080p60": { width: 1920, height: 1080, fps: 60, bitrateKbps: 9000 },
  "1080p30": { width: 1920, height: 1080, fps: 30, bitrateKbps: 6000 },
  "720p60": { width: 1280, height: 720, fps: 60, bitrateKbps: 6000 },
  "720p30": { width: 1280, height: 720, fps: 30, bitrateKbps: 4500 },
  "480p30": { width: 854, height: 480, fps: 30, bitrateKbps: 1500 },
} as const;

type Quality = keyof typeof RESOLUTIONS;

const inputSchema = z.object({
  /** Upload medido pelo usuário em Mbps (resultado do speedtest). */
  uploadMbps: z.number().positive(),
  /** Qualidade desejada (default: auto — escolhe a melhor pro upload). */
  quality: z.enum(["1080p60", "1080p30", "720p60", "720p30", "480p30", "auto"]).default("auto"),
  /** Stream key do YouTube (24 chars alfanum). Validada mas não exibida completa. */
  streamKey: z.string().min(10),
});

function pickAuto(uploadMbps: number): Quality {
  // Margem de 75% pra upload (YouTube + flutuação).
  const safeKbps = uploadMbps * 1000 * 0.75;
  if (safeKbps >= 9000) return "1080p60";
  if (safeKbps >= 6000) return "1080p30";
  if (safeKbps >= 4500) return "720p30";
  if (safeKbps >= 1500) return "480p30";
  return "480p30"; // ainda abaixo do ideal
}

function validateKey(key: string): { valid: boolean; reason?: string } {
  if (key.length !== 24) return { valid: false, reason: `Stream key do YouTube tem 24 chars (recebido: ${key.length})` };
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return { valid: false, reason: "Stream key tem caracteres inválidos" };
  return { valid: true };
}

export const youtubeSetupTool: Tool<typeof inputSchema> = {
  name: "stream:youtube-setup",
  description:
    "Calcula encoder, bitrate, resolução e chave de stream recomendados pro YouTube Live, com base no upload medido.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const uploadMbps = input.uploadMbps;
    const quality = input.quality ?? "auto";
    const streamKey = input.streamKey;
    const safeKbps = uploadMbps * 1000 * 0.75;
    const chosen: Quality = quality === "auto" ? pickAuto(uploadMbps) : quality;
    const cfg = RESOLUTIONS[chosen];

    const keyCheck = validateKey(streamKey);

    const encoderRec = safeKbps >= cfg.bitrateKbps
      ? (process.platform === "win32"
          ? "NVENC (H.264) — NVIDIA / AMF (AMD) / QSV (Intel)"
          : "x264 com preset veryfast")
      : "x264 com preset veryfast (CPU, já que GPU não dá conta)";

    return {
      youtube: {
        server: "rtmp://a.rtmp.youtube.com/live2",
        streamKeyPreview: `${streamKey.slice(0, 6)}…${streamKey.slice(-4)} (${streamKey.length} chars)`,
        streamKeyValid: keyCheck.valid,
        streamKeyWarning: keyCheck.reason,
      },
      video: {
        resolution: `${cfg.width}x${cfg.height}`,
        fps: cfg.fps,
        keyframeIntervalSec: 4,
      },
      encoder: {
        recommended: encoderRec,
        rateControl: "CBR",
        bitrateKbps: cfg.bitrateKbps,
        maxBitrateKbps: cfg.bitrateKbps,
        bufferSizeKbps: cfg.bitrateKbps * 2,
        preset: "veryfast (x264) ou Quality (NVENC)",
      },
      audio: {
        codec: "AAC",
        bitrateKbps: 160,
        sampleRateHz: 44100,
        channels: 2,
      },
      network: {
        uploadMedido: uploadMbps,
        uploadSeguroEstimadoKbps: Math.round(safeKbps),
        margem: "25% sobre o bitrate alvo",
      },
      obsSteps: [
        "OBS → Configurações → Saída → Modo: Avançado",
        `Saída → aba Streaming → Encoder: ${encoderRec}`,
        `Bitrate de vídeo: ${cfg.bitrateKbps} kbps`,
        `Bitrate de áudio: 160 kbps`,
        "Aba Saída → Gravando: desmarcar (só streaming)",
        "OBS → Configurações → Vídeo → Resolução de saída: " + `${cfg.width}x${cfg.height}` + `, FPS: ${cfg.fps}`,
        "OBS → Configurações → Stream → Tipo: YouTube / YouTube RTMPS → Conectar conta OU colar chave manualmente",
        "Botão 'Iniciar transmissão'",
      ],
    };
  },
};
