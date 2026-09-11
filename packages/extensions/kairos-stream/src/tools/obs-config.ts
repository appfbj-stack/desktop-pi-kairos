/**
 * stream:obs-config — lê a config atual do OBS Studio.
 *
 * Caminho padrão (Windows): %APPDATA%/obs-studio/basic/profiles/<profile>/<file>
 *
 * Arquivos relevantes:
 *   - basic/profiles/<profile>/basic.ini   (encoder, resolução, fps)
 *   - basic/profiles/<profile>/service.ini (config do serviço de streaming — YouTube, Twitch)
 *   - basic/profiles/<profile>/streamEncoder.json (preset do encoder)
 *
 * Lê tudo e devolve um resumo estruturado pra o LLM diagnosticar.
 *
 * Modo livre: SEM path whitelist — Pastor autorizou acesso total.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import os from "node:os";
import { z } from "zod";
import type { Tool } from "@kairos/agent";

function obsRoot(): string {
  return path.join(os.homedir(), "AppData", "Roaming", "obs-studio", "basic");
}

const inputSchema = z.object({
  /** Nome do profile (default = primeiro em ordem alfabética). */
  profile: z.string().optional(),
});

interface BasicIni {
  BaseCX: string;
  BaseCY: string;
  OutputCX: string;
  OutputCY: string;
  FPSNum: string;
  FPSDen: string;
  Bitrate: string;
  Preset: string;
  Encoder: string;
  RateControl: string;
}

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

function pickBasic(rec: Record<string, string>): BasicIni {
  return {
    BaseCX: rec.BaseCX ?? "?",
    BaseCY: rec.BaseCY ?? "?",
    OutputCX: rec.OutputCX ?? "?",
    OutputCY: rec.OutputCY ?? "?",
    FPSNum: rec.FPSNum ?? "?",
    FPSDen: rec.FPSDen ?? "?",
    Bitrate: rec.Bitrate ?? "?",
    Preset: rec.Preset ?? "?",
    Encoder: rec.Encoder ?? "?",
    RateControl: rec.RateControl ?? "?",
  };
}

export const obsConfigTool: Tool<typeof inputSchema> = {
  name: "stream:obs-config",
  description:
    "Lê a configuração atual do OBS Studio (basic.ini + service.ini) e devolve encoder, bitrate, resolução, FPS e serviço de streaming configurado.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const { profile } = input;
    const root = obsRoot();
    if (!existsSync(root)) {
      return {
        configured: false,
        message: `OBS Studio não inicializado ainda. Rode o OBS pelo menos uma vez pra criar ${root}`,
        expectedPath: root,
      };
    }

    const profilesDir = path.join(root, "profiles");
    let profiles: string[];
    try {
      profiles = (await readdir(profilesDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      profiles = [];
    }

    if (profiles.length === 0) {
      return {
        configured: false,
        message: "Nenhum profile encontrado em " + profilesDir,
        profilesDir,
      };
    }

    const chosen = profile && profiles.includes(profile) ? profile : profiles.sort()[0];
    const profileDir = path.join(profilesDir, chosen);
    const basicIniPath = path.join(profileDir, "basic.ini");
    const serviceIniPath = path.join(profileDir, "service.ini");

    const result: Record<string, unknown> = {
      configured: true,
      profile: chosen,
      allProfiles: profiles,
      profileDir,
    };

    try {
      const txt = await readFile(basicIniPath, "utf-8");
      const parsed = parseIni(txt);
      result.encoding = pickBasic(parsed);
    } catch (err) {
      result.encodingError = `Falha lendo basic.ini: ${(err as Error).message}`;
    }

    try {
      const txt = await readFile(serviceIniPath, "utf-8");
      const parsed = parseIni(txt);
      result.streamingService = {
        type: parsed.type ?? "(não configurado)",
        server: parsed.server ?? "",
        key: parsed.key ? `${parsed.key.slice(0, 8)}…(${parsed.key.length} chars)` : "(vazio)",
      };
    } catch (err) {
      result.streamingServiceError = `Falha lendo service.ini: ${(err as Error).message}`;
    }

    return result;
  },
};
