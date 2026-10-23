/**
 * Helpers de ffmpeg para o Kairós Vídeos IA.
 *
 * ACHADO CRÍTICO (validado 2026-10-23, Windows):
 *   O filtro `ass=`/`subtitles=` do ffmpeg falha com
 *   "Error initializing a simple filtergraph" quando o path do arquivo de
 *   legenda contém a letra do drive sem escape (ex.: `C:/Users/...`).
 *   A forma que FUNCIONA é escapar o dois-pontos e usar barra normal:
 *     `ass='C\:/Users/ferna/Videos/legenda.ass'`
 *   Sem esse escape, o app empacotado (ffmpeg-static 6.1.1) não renderiza legenda.
 */

import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/** Caminho do ffmpeg empacotado no bundle do app. */
export function ffmpegBinary(): string {
  return (ffmpegPath as unknown as string) || "ffmpeg";
}

/**
 * Escapa um path para uso dentro de um filtro do ffmpeg no Windows.
 *
 * `C:\Users\ferna\Videos\legenda.ass` -> `C\:/Users/ferna/Videos/legenda.ass`
 */
export function escapeFfmpegPath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/**
 * Escapa texto para o filtro `drawtext`.
 * O drawtext usa seu próprio parser: `:` e `\` e `%` são especiais.
 */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

export interface FfmpegResult {
  ok: boolean;
  code: number | null;
  stderr: string;
  durationMs: number;
}

/** Executa o ffmpeg com os argumentos informados. */
export function runFfmpeg(args: string[], signal?: AbortSignal): Promise<FfmpegResult> {
  const bin = ffmpegBinary();
  const startedAt = Date.now();

  return new Promise<FfmpegResult>((resolve, reject) => {
    const proc = spawn(bin, args, { windowsHide: true });

    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      // mantém buffer pequeno
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });

    const onAbort = () => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    proc.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error(`Não foi possível executar o ffmpeg (${bin}): ${err.message}`));
    });

    proc.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      const durationMs = Date.now() - startedAt;
      if (code === 0) {
        resolve({ ok: true, code, stderr, durationMs });
      } else {
        const tail = stderr.split("\n").slice(-8).join("\n");
        reject(new Error(`ffmpeg falhou (código ${code}).\n${tail}`));
      }
    });
  });
}

/**
 * Monta o filtro de conversão para 9:16.
 * `mode: "cover"` preenche e corta (recomendado para tela gravada);
 * `mode: "contain"` encaixa sem cortar (mostra barras).
 */
export function buildFitFilter(
  width: number,
  height: number,
  mode: "cover" | "contain" = "cover",
): string {
  if (mode === "contain") {
    return (
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`
    );
  }
  return (
    `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
    `crop=${width}:${height},setsar=1`
  );
}

/** Header padrão do arquivo ASS para 1080×1920. */
export function assHeader(width: number, height: number, fontSize = 64): string {
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,4,2,2,60,60,120,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    "",
  ].join("\n");
}

/** Converte segundos em timestamp ASS (H:MM:SS.cc). */
export function toAssTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
}

/** Converte timestamp SRT (00:00:00,000) em segundos. */
export function srtTimeToSeconds(stamp: string): number {
  const clean = stamp.trim().replace(",", ".");
  const parts = clean.split(":").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0;
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

/** Escapa caracteres especiais do ASS dentro do texto da legenda. */
export function escapeAssText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\r?\n/g, "\\N");
}
