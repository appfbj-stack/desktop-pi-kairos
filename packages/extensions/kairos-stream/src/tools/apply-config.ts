/**
 * stream:apply-config — APLICA configurações no OBS Studio.
 *
 * Escreve basic.ini (encoder, resolução, fps, bitrate, preset) e/ou
 * service.ini (server + stream key) com backup automático antes.
 *
 * Segurança: cria .trash do arquivo atual antes de sobrescrever, então
 * sempre dá pra reverter.
 *
 * IMPORTANTE: o OBS precisa estar FECHADO quando rodar essa tool — se
 * estiver aberto, ele vai sobrescrever a config quando sair.
 */

import { readFile, writeFile, copyFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import os from "node:os";
import { z } from "zod";
import type { Tool } from "@kairos/agent";

function obsRoot(): string {
  return path.join(os.homedir(), "AppData", "Roaming", "obs-studio", "basic");
}

function trashDir(): string {
  return path.join(os.homedir(), "AppData", "Roaming", "obs-studio", ".trash");
}

const inputSchema = z.object({
  profile: z.string().optional(),

  // basic.ini
  outputWidth: z.number().int().min(320).max(7680).optional(),
  outputHeight: z.number().int().min(240).max(4320).optional(),
  fps: z.number().int().min(10).max(120).optional(),
  bitrate: z.number().int().min(500).max(80000).optional(),
  encoder: z
    .enum([
      // x264 CPU
      "x264",
      // NVIDIA NVENC (H.264 / HEVC / AV1)
      "obs_nvenc_h264",
      "obs_nvenc_hevc",
      "obs_nvenc_av1",
      "obs_nvenc_h264_tex",
      "obs_nvenc_hevc_tex",
      "obs_nvenc_av1_tex",
      // AMD AMF
      "amd_amf_h264",
      "amd_amf_hevc",
      "amd_amf_av1",
      // Intel QuickSync
      "obs_qsv11_h264",
      "obs_qsv11_hevc",
      "obs_qsv11_av1",
      // Apple VT (não usado em PC mas pra completude)
      "obs_vt_h264",
      "obs_vt_hevc",
    ])
    .optional(),
  preset: z
    .enum([
      // x264
      "ultrafast",
      "superfast",
      "veryfast",
      "faster",
      "fast",
      "medium",
      "slow",
      "slower",
      "veryslow",
      // NVENC
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "max",
    ])
    .optional(),
  rateControl: z.enum(["CBR", "VBR", "ABR", "CQP", "VBR_TARGET", "CRF"]).optional(),

  // service.ini (streaming service)
  service: z
    .enum(["youtube", "twitch", "facebook", "x", "kick", "tiktok", "custom"])
    .optional(),
  server: z.string().optional(),
  streamKey: z.string().min(1).max(200).optional(),
});

function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    out[key] = val;
  }
  return out;
}

function serializeIni(rec: Record<string, string>): string {
  // Mantém ordem razoável — encoder/preset primeiro
  const priorityKeys = [
    "Encoder",
    "Preset",
    "RateControl",
    "Bitrate",
    "BaseCX",
    "BaseCY",
    "OutputCX",
    "OutputCY",
    "FPSNum",
    "FPSDen",
    "type",
    "server",
    "key",
  ];
  const lines: string[] = [];
  for (const k of priorityKeys) {
    if (k in rec) lines.push(`${k}=${rec[k]}`);
  }
  for (const [k, v] of Object.entries(rec)) {
    if (!priorityKeys.includes(k)) lines.push(`${k}=${v}`);
  }
  return lines.join("\r\n") + "\r\n";
}

async function backupFile(src: string, label: string): Promise<string | null> {
  if (!existsSync(src)) return null;
  await mkdir(trashDir(), { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(trashDir(), `${path.basename(src)}.${label}.${ts}`);
  await copyFile(src, dest);
  return dest;
}

export const applyConfigTool: Tool<typeof inputSchema> = {
  name: "stream:apply-config",
  description:
    "APLICA configurações no OBS Studio (encoder, resolução, FPS, bitrate, serviço de streaming + stream key). Cria backup automático antes de alterar. OBS DEVE estar fechado.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const root = obsRoot();
    if (!existsSync(root)) {
      return {
        ok: false,
        message: `OBS não inicializado. Rode o OBS pelo menos uma vez. Esperado: ${root}`,
      };
    }

    const profilesDir = path.join(root, "profiles");
    const profiles = (await readdir(profilesDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    if (profiles.length === 0) {
      return { ok: false, message: "Nenhum profile encontrado em " + profilesDir };
    }

    const chosen = input.profile && profiles.includes(input.profile) ? input.profile : profiles.sort()[0];
    const profileDir = path.join(profilesDir, chosen);
    const basicIniPath = path.join(profileDir, "basic.ini");
    const serviceIniPath = path.join(profileDir, "service.ini");

    // Carrega basic.ini atual
    let basicRec: Record<string, string> = {};
    try {
      const txt = await readFile(basicIniPath, "utf-8");
      basicRec = parseIni(txt);
    } catch (err) {
      return {
        ok: false,
        message: `Falha lendo basic.ini: ${(err as Error).message}`,
      };
    }

    const backups: string[] = [];
    const changes: Record<string, { from: string; to: string }> = {};

    // Aplica mudanças no basic.ini
    if (typeof input.outputWidth === "number") {
      const from = basicRec.OutputCX ?? "?";
      basicRec.OutputCX = String(input.outputWidth);
      basicRec.BaseCX = String(input.outputWidth);
      changes["OutputCX/BaseCX"] = { from, to: String(input.outputWidth) };
    }
    if (typeof input.outputHeight === "number") {
      const from = basicRec.OutputCY ?? "?";
      basicRec.OutputCY = String(input.outputHeight);
      basicRec.BaseCY = String(input.outputHeight);
      changes["OutputCY/BaseCY"] = { from, to: String(input.outputHeight) };
    }
    if (typeof input.fps === "number") {
      const from = basicRec.FPSNum ?? "?";
      basicRec.FPSNum = String(input.fps);
      basicRec.FPSDen = "1";
      changes["FPSNum/FPSDen"] = { from: `${from}/${basicRec.FPSDen ?? "?"}`, to: `${input.fps}/1` };
    }
    if (typeof input.bitrate === "number") {
      const from = basicRec.Bitrate ?? "?";
      basicRec.Bitrate = String(input.bitrate);
      changes["Bitrate"] = { from, to: String(input.bitrate) };
    }
    if (input.encoder) {
      const from = basicRec.Encoder ?? "?";
      basicRec.Encoder = input.encoder;
      changes["Encoder"] = { from, to: input.encoder };
    }
    if (input.preset) {
      const from = basicRec.Preset ?? "?";
      basicRec.Preset = input.preset;
      changes["Preset"] = { from, to: input.preset };
    }
    if (input.rateControl) {
      const from = basicRec.RateControl ?? "CBR";
      basicRec.RateControl = input.rateControl;
      changes["RateControl"] = { from, to: input.rateControl };
    }

    if (Object.keys(changes).length === 0) {
      return {
        ok: false,
        message: "Nenhuma mudança solicitada. Forneça pelo menos um campo (encoder, bitrate, fps, etc).",
        profile: chosen,
        profileDir,
      };
    }

    // service.ini
    let serviceRec: Record<string, string> | null = null;
    if (input.service || input.server || input.streamKey) {
      try {
        const txt = await readFile(serviceIniPath, "utf-8");
        serviceRec = parseIni(txt);
      } catch {
        serviceRec = {};
      }

      if (input.service === "youtube") {
        serviceRec["type"] = "rtmp_custom";
        serviceRec["server"] = "rtmp://a.rtmp.youtube.com/live2";
      } else if (input.service === "twitch") {
        serviceRec["type"] = "rtmp_custom";
        serviceRec["server"] = "rtmp://live.twitch.tv/app";
      } else if (input.service === "facebook") {
        serviceRec["type"] = "rtmp_custom";
        serviceRec["server"] = "rtmps://live-api-s.facebook.com:443/rtmp/";
      } else if (input.service === "x") {
        serviceRec["type"] = "rtmp_custom";
        serviceRec["server"] = "rtmp://ingest.pscp.tv:80/x/";
      } else if (input.service === "kick") {
        serviceRec["type"] = "rtmp_custom";
        serviceRec["server"] = "rtmp://ingest.kick.com/app";
      } else if (input.service === "tiktok") {
        serviceRec["type"] = "rtmp_custom";
        serviceRec["server"] = "rtmp://global-live.muscdn.com:443/live/";
      } else if (input.service === "custom" && input.server) {
        serviceRec["type"] = "rtmp_custom";
        serviceRec["server"] = input.server;
      }
      if (input.streamKey) {
        serviceRec["key"] = input.streamKey;
        changes["streamKey"] = { from: "(existente)", to: `${input.streamKey.length} chars` };
      }
    }

    // Backup antes de escrever
    const basicBackup = await backupFile(basicIniPath, "apply-config");
    if (basicBackup) backups.push(basicBackup);

    // Escreve basic.ini
    await writeFile(basicIniPath, serializeIni(basicRec), "utf-8");

    // Escreve service.ini se mudou
    if (serviceRec) {
      const serviceBackup = await backupFile(serviceIniPath, "apply-config");
      if (serviceBackup) backups.push(serviceBackup);
      await writeFile(serviceIniPath, serializeIni(serviceRec), "utf-8");
    }

    return {
      ok: true,
      profile: chosen,
      profileDir,
      backups,
      changes,
      warning: "OBS DEVE estar fechado — se estava aberto, feche antes de iniciar a live pra carregar a nova config.",
      message: `Config aplicada. ${Object.keys(changes).length} campo(s) alterado(s). Backups salvos em ${trashDir()}.`,
    };
  },
};
