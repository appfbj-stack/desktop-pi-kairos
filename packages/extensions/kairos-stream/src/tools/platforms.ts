/**
 * stream:platforms — lista URLs RTMP/RTMPS das principais plataformas.
 *
 * Útil pra Pastor que quer transmitir pra várias redes ao mesmo tempo
 * (multistream) ou migrar entre plataformas.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";

interface Platform {
  name: string;
  category: "video" | "social";
  ingestServer: string;
  keyFormat: string;
  keyHint: string;
  maxBitrateKbps1080p: number;
  requiresAuth: boolean;
}

const PLATFORMS: Platform[] = [
  {
    name: "YouTube Live",
    category: "video",
    ingestServer: "rtmp://a.rtmp.youtube.com/live2",
    keyFormat: "24 chars alfanum (ex: abcd-1234-efgh-5678-ijkl)",
    keyHint: "https://studio.youtube.com → Go Live → Stream settings → Copiar chave",
    maxBitrateKbps1080p: 9000,
    requiresAuth: true,
  },
  {
    name: "Twitch",
    category: "video",
    ingestServer: "rtmp://live.twitch.tv/app",
    keyFormat: "string hexadecimal (após ?)",
    keyHint: "https://dashboard.twitch.tv → Stream Key (botão Copy)",
    maxBitrateKbps1080p: 6000,
    requiresAuth: true,
  },
  {
    name: "Facebook Live",
    category: "social",
    ingestServer: "rtmps://live-api-s.facebook.com:443/rtmp/",
    keyFormat: "fb_stream_id + persistent key (ex: FB-1234-...)",
    keyHint: "https://www.facebook.com/live/create → Go Live → Use Stream Key",
    maxBitrateKbps1080p: 4000,
    requiresAuth: true,
  },
  {
    name: "Instagram Live",
    category: "social",
    ingestServer: "rtmps://live-api-s.facebook.com:443/rtmp/ (mesmo que Facebook)",
    keyFormat: "mesma chave Facebook Live",
    keyHint: "Só consegue transmitir pelo app mobile OU pelo Creator Studio",
    maxBitrateKbps1080p: 4000,
    requiresAuth: true,
  },
  {
    name: "X / Twitter Live",
    category: "social",
    ingestServer: "rtmp://ingest.pscp.tv:80/x/" + "{stream_key}",
    keyFormat: "string na URL do stream",
    keyHint: "https://studio.x.com/produce/live → Create live stream",
    maxBitrateKbps1080p: 5000,
    requiresAuth: true,
  },
  {
    name: "LinkedIn Live",
    category: "social",
    ingestServer: "rtmps://1-rtmps.linkedin.com:443/live",
    keyFormat: "string alfanum longa",
    keyHint: "https://www.linkedin.com/admin/live → Create event → Stream Key",
    maxBitrateKbps1080p: 4000,
    requiresAuth: true,
  },
  {
    name: "TikTok Live",
    category: "social",
    ingestServer: "rtmps://push-rtmp-f5-va01.tiktokcdn-global.live-iad01.facialb.net:443/live/",
    keyFormat: "string longa",
    keyHint: "https://www.tiktok.com/studio → Go Live → Server URL + Stream Key",
    maxBitrateKbps1080p: 4000,
    requiresAuth: true,
  },
  {
    name: "Kick",
    category: "video",
    ingestServer: "rtmp://ingest.kick.com/app",
    keyFormat: "string na URL",
    keyHint: "https://kick.com/dashboard/settings/stream",
    maxBitrateKbps1080p: 8000,
    requiresAuth: true,
  },
];

const inputSchema = z.object({
  /** Filtra por categoria (video: Twitch/YouTube/Kick; social: FB/IG/X/LinkedIn/TikTok). */
  category: z.enum(["all", "video", "social"]).default("all"),
  /** Mostra só a que Pastor mencionou pelo nome (case-insensitive). */
  only: z.string().optional(),
});

export const platformsTool: Tool<typeof inputSchema> = {
  name: "stream:platforms",
  description:
    "Lista URLs de ingest (RTMP/RTMPS) das principais plataformas de live. Útil pra configurar OBS pra transmitir ou pra migrar entre plataformas.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const category = input.category ?? "all";
    const only = input.only?.toLowerCase();
    let list = PLATFORMS;
    if (category !== "all") list = list.filter((p) => p.category === category);
    if (only) list = list.filter((p) => p.name.toLowerCase().includes(only));
    return { count: list.length, platforms: list };
  },
};
