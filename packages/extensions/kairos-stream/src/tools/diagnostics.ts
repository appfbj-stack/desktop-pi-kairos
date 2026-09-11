/**
 * stream:diagnostics — analisa logs do OBS pra detectar problemas de live.
 *
 * Lê %APPDATA%/obs-studio/logs/<último>.txt e parsea:
 *   - "Dropped frames" (encoding/congestion)
 *   - "Network congestion" (RTMP lento)
 *   - "Encoder lag" (CPU fraco)
 *   - "Reconnect" (instabilidade)
 *   - Avisos de plugin (StreamFX, VirtualCam, etc)
 *
 * Devolve sumário + lista de issues + recomendação em PT-BR.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import os from "node:os";
import { z } from "zod";
import type { Tool } from "@kairos/agent";

function logsDir(): string {
  return path.join(os.homedir(), "AppData", "Roaming", "obs-studio", "logs");
}

const inputSchema = z.object({
  /** Analisa últimas N linhas do log mais recente. */
  maxLines: z.number().int().min(100).max(50000).default(5000),
  /** Analisa um log específico pelo nome (ex: '2026-09-11 19-40-05.txt') */
  logFile: z.string().optional(),
});

interface Issue {
  type: string;
  severity: "info" | "warn" | "critical";
  count: number;
  examples: string[];
  recommendation?: string;
}

const PATTERNS: Array<{
  type: string;
  pattern: RegExp;
  severity: Issue["severity"];
  recommendation?: string;
}> = [
  {
    type: "Dropped frames (encoding)",
    pattern: /encoding lag|encoder.*overloaded/i,
    severity: "warn",
    recommendation: "CPU saturado. Troque pra encoder de hardware (NVENC/AMF) ou reduza preset pra 'veryfast'.",
  },
  {
    type: "Dropped frames (network)",
    pattern: /network congestion|network.*slow/i,
    severity: "critical",
    recommendation: "Upload saturado ou instável. Reduza bitrate em 30% ou teste conexão cabeada.",
  },
  {
    type: "Stream reconnect",
    pattern: /reconnect|disconnect|connection lost/i,
    severity: "critical",
    recommendation: "Live caiu. Checar internet, firewall e se a stream key ainda é válida.",
  },
  {
    type: "RTMP timeout",
    pattern: /rtmp.*timeout|rtmp.*failed/i,
    severity: "critical",
    recommendation: "Servidor da plataforma recusou conexão. Testar rede: stream:check-network.",
  },
  {
    type: "Audio sync issue",
    pattern: /audio.*sync|audio.*desync|av.*out.*sync/i,
    severity: "warn",
    recommendation: "Atraso de áudio detectado. Adicionar filtro 'Sync Offset' na fonte de áudio.",
  },
  {
    type: "Plugin error",
    pattern: /plugin.*error|dll.*failed|cannot load.*dll/i,
    severity: "warn",
    recommendation: "Algum plugin (StreamFX, VirtualCam, etc) falhou. Desabilite temporariamente pra testar.",
  },
  {
    type: "High CPU warning",
    pattern: /high.*cpu|performance.*degraded/i,
    severity: "warn",
    recommendation: "CPU acima do limite. Feche outros apps pesados (browser com abas, Discord, etc).",
  },
];

export const diagnosticsTool: Tool<typeof inputSchema> = {
  name: "stream:diagnostics",
  description:
    "Analisa logs do OBS Studio pra detectar problemas de live (dropped frames, network congestion, encoder lag, reconexão, erros de plugin).",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const dir = logsDir();
    if (!existsSync(dir)) {
      return { ok: false, message: `Pasta de logs não existe: ${dir}. Rode o OBS pelo menos uma vez.` };
    }

    let logPath: string | null = null;
    if (input.logFile) {
      logPath = path.join(dir, input.logFile);
      if (!existsSync(logPath)) {
        return { ok: false, message: `Log "${input.logFile}" não encontrado.` };
      }
    } else {
      const files = (await readdir(dir)).filter((f) => f.endsWith(".txt"));
      if (files.length === 0) return { ok: false, message: "Nenhum log encontrado em " + dir };

      // Pega o mais recente por mtime
      let bestMtime = 0;
      for (const f of files) {
        const p = path.join(dir, f);
        const s = await stat(p);
        if (s.mtimeMs > bestMtime) {
          bestMtime = s.mtimeMs;
          logPath = p;
        }
      }
    }

    if (!logPath) return { ok: false, message: "Não foi possível identificar log." };

    const txt = await readFile(logPath, "utf-8");
    const lines = txt.split(/\r?\n/);
    const tail = lines.slice(-input.maxLines).join("\n");

    const issues: Issue[] = [];
    for (const p of PATTERNS) {
      const matches = tail.match(new RegExp(p.pattern.source, "gi"));
      if (matches && matches.length > 0) {
        const examples: string[] = [];
        const lines2 = tail.split(/\r?\n/);
        for (const line of lines2) {
          if (p.pattern.test(line)) {
            examples.push(line.trim().slice(0, 250));
            if (examples.length >= 3) break;
          }
        }
        issues.push({
          type: p.type,
          severity: p.severity,
          count: matches.length,
          examples,
          recommendation: p.recommendation,
        });
      }
    }

    const summary = {
      logFile: path.basename(logPath),
      logSize: txt.length,
      analyzedLines: Math.min(input.maxLines, lines.length),
      totalIssues: issues.length,
      critical: issues.filter((i) => i.severity === "critical").length,
      warn: issues.filter((i) => i.severity === "warn").length,
    };

    const overallStatus =
      summary.critical > 0 ? "critical" : summary.warn > 0 ? "warn" : "ok";

    return {
      ok: true,
      overallStatus,
      summary,
      issues,
      message:
        overallStatus === "ok"
          ? "Sem problemas detectados no log analisado."
          : overallStatus === "critical"
            ? `Detectado(s) ${summary.critical} problema(s) crítico(s) — não recomendo sair pra live antes de resolver.`
            : `Detectado(s) ${summary.warn} aviso(s) — pode sair pra live, mas melhorar antes pra evitar problemas.`,
    };
  },
};
