/**
 * stream:audio — gerencia configuração de áudio do OBS.
 *
 * Lê/ajusta:
 *   - SampleRate (44.1kHz / 48kHz)
 *   - ChannelSetup (stereo / mono)
 *   - MeterDecayRate
 *   - Suppress (mute do mic desktop por padrão)
 *   - Audio devices (mic, desktop audio) via basic/scenes/*.json settings
 *
 * Mostra também info dos devices reais de áudio do Windows (via PowerShell).
 */

import { readFile, readdir, writeFile, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "@kairos/agent";

const exec = promisify(execFile);

function obsRoot(): string {
  return path.join(os.homedir(), "AppData", "Roaming", "obs-studio", "basic");
}

function trashDir(): string {
  return path.join(os.homedir(), "AppData", "Roaming", "obs-studio", ".trash");
}

const inputSchema = z.object({
  profile: z.string().optional(),
  // Para aplicar
  sampleRate: z.enum(["44.1khz", "48khz"]).optional(),
  channelSetup: z.enum(["stereo", "mono"]).optional(),
  meterDecayRate: z.number().min(0).max(1000).optional(),
  suppress: z.boolean().optional(),
  dryRun: z.boolean().default(false),
});

function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

function serializeIni(rec: Record<string, string>): string {
  return (
    Object.entries(rec)
      .map(([k, v]) => `${k}=${v}`)
      .join("\r\n") + "\r\n"
  );
}

async function listWindowsAudioDevices(): Promise<{ playback: string[]; recording: string[] }> {
  try {
    const ps = `
$play = (Get-CimInstance -ClassName Win32_SoundDevice -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Caption) | Sort-Object -Unique;
$rec = Get-WmiObject -Class Win32_SoundDevice -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' } | Select-Object -ExpandProperty Caption;
[PSCustomObject]@{ Playback = ($play -join '|'); Recording = ($rec -join '|') } | ConvertTo-Json
`;
    const { stdout } = await exec(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { timeout: 8000 },
    );
    const parsed = JSON.parse(stdout.trim());
    return {
      playback: parsed.Playback ? parsed.Playback.split("|") : [],
      recording: parsed.Recording ? parsed.Recording.split("|") : [],
    };
  } catch (err) {
    return { playback: [], recording: [`(falha: ${(err as Error).message})`] };
  }
}

export const audioTool: Tool<typeof inputSchema> = {
  name: "stream:audio",
  description:
    "Gerencia configuração de áudio do OBS Studio: sample rate (44.1/48 kHz), stereo/mono, decay meter, suppress. Lista também os devices reais de áudio do Windows.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const root = obsRoot();
    if (!existsSync(root)) {
      return { ok: false, message: `OBS não inicializado. Esperado: ${root}` };
    }

    const profilesDir = path.join(root, "profiles");
    let profiles: string[];
    try {
      profiles = (await readdir(profilesDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return { ok: false, message: "profiles dir não existe" };
    }
    if (profiles.length === 0) return { ok: false, message: "Nenhum profile encontrado" };

    const chosen = input.profile && profiles.includes(input.profile) ? input.profile : profiles.sort()[0];
    const profileDir = path.join(profilesDir, chosen);
    const basicIniPath = path.join(profileDir, "basic.ini");

    let basicRec: Record<string, string> = {};
    try {
      const txt = await readFile(basicIniPath, "utf-8");
      basicRec = parseIni(txt);
    } catch (err) {
      return { ok: false, message: `Falha lendo basic.ini: ${(err as Error).message}` };
    }

    const current = {
      sampleRate: basicRec.SampleRate ?? "?",
      channelSetup: basicRec.ChannelSetup ?? "stereo",
      meterDecayRate: basicRec.MeterDecayRate ?? "60",
      suppress: basicRec.Suppress ?? "0",
    };

    const changes: Record<string, { from: string; to: string }> = {};

    if (input.sampleRate) {
      changes.sampleRate = { from: current.sampleRate, to: input.sampleRate };
      basicRec.SampleRate = input.sampleRate;
    }
    if (input.channelSetup) {
      changes.channelSetup = { from: current.channelSetup, to: input.channelSetup };
      basicRec.ChannelSetup = input.channelSetup;
    }
    if (typeof input.meterDecayRate === "number") {
      changes.meterDecayRate = { from: current.meterDecayRate, to: String(input.meterDecayRate) };
      basicRec.MeterDecayRate = String(input.meterDecayRate);
    }
    if (typeof input.suppress === "boolean") {
      changes.suppress = { from: current.suppress, to: input.suppress ? "1" : "0" };
      basicRec.Suppress = input.suppress ? "1" : "0";
    }

    if (Object.keys(changes).length > 0 && !input.dryRun) {
      await mkdir(trashDir(), { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const backup = path.join(trashDir(), `basic.ini.audio.${ts}`);
      await copyFile(basicIniPath, backup);
      await writeFile(basicIniPath, serializeIni(basicRec), "utf-8");
    }

    const windowsDevices = await listWindowsAudioDevices();

    return {
      ok: true,
      profile: chosen,
      current: Object.keys(changes).length === 0 ? current : {
        ...current,
        ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])),
      },
      applied: Object.keys(changes).length,
      changes: input.dryRun ? [] : Object.entries(changes).map(([k, v]) => `${k}: ${v.from} → ${v.to}`),
      dryRun: input.dryRun,
      windowsDevices,
      recommendation:
        "Para live, use 48kHz stereo (SampleRate=48khz, ChannelSetup=stereo). É o padrão de YouTube/Twitch e evita conversão desnecessária.",
    };
  },
};
