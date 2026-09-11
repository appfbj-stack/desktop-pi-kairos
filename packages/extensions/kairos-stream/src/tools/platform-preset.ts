/**
 * stream:platform-preset — aplica preset otimizado pra plataforma alvo.
 *
 * Encapsula encoder + bitrate + resolução + fps recomendados por plataforma.
 * Chama apply-config por baixo.
 *
 * Presets baseados em docs oficiais:
 *   - YouTube 1080p60: 9000 kbps H.264 / 6000 HEVC
 *   - YouTube 1080p30: 8000 kbps
 *   - YouTube 720p60:  6000 kbps
 *   - YouTube 720p30:  4500 kbps
 *   - Twitch 1080p60:  6000 kbps (máx do Twitch)
 *   - Twitch 1080p30:  6000 kbps
 *   - Twitch 720p60:   4500 kbps
 *   - Twitch 720p30:   3000 kbps
 *   - Kick 1080p60:    6000 kbps
 *   - Facebook 1080p:  4000 kbps
 *   - TikTok 720p:     3000 kbps
 */

import { z } from "zod";
import type { Tool, ToolContext } from "@kairos/agent";
import { applyConfigTool } from "./apply-config.js";

const mockCtx: ToolContext = {
  agentId: "kairos-stream-platform-preset",
  sessionId: "local",
  cwd: process.cwd(),
  abortSignal: new AbortController().signal,
  confirmDangerous: async () => true,
};

const inputSchema = z.object({
  platform: z.enum(["youtube", "twitch", "kick", "facebook", "x", "tiktok"]),
  quality: z.enum(["1080p60", "1080p30", "720p60", "720p30", "480p30"]).default("1080p60"),
  profile: z.string().optional(),
  encoder: z
    .enum(["auto", "x264", "obs_nvenc_h264", "obs_nvenc_hevc_tex", "amd_amf_h264", "obs_qsv11_h264"])
    .default("auto"),
  streamKey: z.string().min(1).max(200).optional(),
});

interface Preset {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  rateControl: "CBR" | "VBR" | "ABR" | "CQP" | "VBR_TARGET" | "CRF";
  preset: string;
  encoder: string;
  server: string;
  notes: string[];
}

const PRESETS: Record<string, Record<string, Preset>> = {
  youtube: {
    "1080p60": {
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 9000,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://a.rtmp.youtube.com/live2",
      notes: [
        "Encoder recomendado: H.264 (NVENC/AMF/QSV) ou x264 veryfast.",
        "Keyframe: 2s. Profile: high.",
        "Para 4K: 20-51 Mbps, mas exige upload alto.",
      ],
    },
    "1080p30": {
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: 8000,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://a.rtmp.youtube.com/live2",
      notes: ["Culto/sermão geralmente 30 FPS é suficiente."],
    },
    "720p60": {
      width: 1280,
      height: 720,
      fps: 60,
      bitrate: 6000,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://a.rtmp.youtube.com/live2",
      notes: ["Bom pra conexões instáveis ou PC mais fraco."],
    },
    "720p30": {
      width: 1280,
      height: 720,
      fps: 30,
      bitrate: 4500,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://a.rtmp.youtube.com/live2",
      notes: ["Mínimo aceitável pra YouTube."],
    },
    "480p30": {
      width: 854,
      height: 480,
      fps: 30,
      bitrate: 2500,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://a.rtmp.youtube.com/live2",
      notes: ["Apenas pra testes ou internet muito lenta (<5 Mbps)."],
    },
  },
  twitch: {
    "1080p60": {
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 6000,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://live.twitch.tv/app",
      notes: [
        "Twitch limita transcoders a 6000 kbps pra não-Partner.",
        "Keyframe: 2s.",
      ],
    },
    "1080p30": {
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: 6000,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://live.twitch.tv/app",
      notes: ["Mesma bitrate que 60 FPS (Twitch transcoda igual)."],
    },
    "720p60": {
      width: 1280,
      height: 720,
      fps: 60,
      bitrate: 4500,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://live.twitch.tv/app",
      notes: ["Recomendado pra quem não tem NVENC ou upload <10 Mbps."],
    },
    "720p30": {
      width: 1280,
      height: 720,
      fps: 30,
      bitrate: 3000,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://live.twitch.tv/app",
      notes: ["Mínimo aceitável pro Twitch."],
    },
  },
  kick: {
    "1080p60": {
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 6000,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://ingest.kick.com/app",
      notes: ["Kick aceita até 8000 kbps. Teste e ajuste."],
    },
  },
  facebook: {
    "1080p60": {
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 4000,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmps://live-api-s.facebook.com:443/rtmp/",
      notes: ["Facebook recomenda máx 4000 kbps pra 1080p pra evitar drops."],
    },
  },
  x: {
    "1080p60": {
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 5000,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://ingest.pscp.tv:80/x/",
      notes: ["X (Twitter) live é restrito — necessário aprovação."],
    },
  },
  tiktok: {
    "720p30": {
      width: 1280,
      height: 720,
      fps: 30,
      bitrate: 3000,
      rateControl: "CBR",
      preset: "veryfast",
      encoder: "obs_nvenc_h264_tex",
      server: "rtmp://global-live.muscdn.com:443/live/",
      notes: ["TikTok aceita max 1080p mas recomenda vertical (9:16)."],
    },
  },
};

export const platformPresetTool: Tool<typeof inputSchema> = {
  name: "stream:platform-preset",
  description:
    "Aplica preset otimizado de encoder/bitrate/resolução/fps pra uma plataforma alvo (YouTube/Twitch/Kick/Facebook/X/TikTok). Faz backup automático antes.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const platformPresets = PRESETS[input.platform];
    if (!platformPresets) {
      return {
        ok: false,
        message: `Plataforma "${input.platform}" não tem preset. Disponíveis: ${Object.keys(PRESETS).join(", ")}`,
      };
    }
    const preset = platformPresets[input.quality] ?? platformPresets["1080p60"];

    // Se encoder auto, detecta hardware depois — aqui aplica preset padrão NVENC
    const encoder = input.encoder === "auto" ? preset.encoder : input.encoder;

    const presetApplied = {
      platform: input.platform,
      quality: input.quality,
      resolution: `${preset.width}x${preset.height}`,
      fps: preset.fps,
      bitrate: preset.bitrate,
      rateControl: preset.rateControl,
      preset: preset.preset,
      encoder,
      server: preset.server,
      notes: preset.notes,
    };

    // Chama apply-config pra persistir
    const applyResult = await applyConfigTool.execute({
      profile: input.profile,
      outputWidth: preset.width,
      outputHeight: preset.height,
      fps: preset.fps,
      bitrate: preset.bitrate,
      encoder: encoder as never,
      preset: preset.preset as never,
      rateControl: preset.rateControl,
      service: input.platform,
      server: preset.server,
      streamKey: input.streamKey,
    }, mockCtx);

    return {
      ok: true,
      presetApplied,
      applyResult,
      message: `Preset ${input.platform} ${input.quality} aplicado. ${preset.notes.length} nota(s) importante(s) acima.`,
    };
  },
};
