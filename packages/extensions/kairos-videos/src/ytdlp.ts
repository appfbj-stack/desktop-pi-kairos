/**
 * Wrapper do yt-dlp — busca e download de vídeos de referência.
 *
 * Por que yt-dlp: já vem instalado na máquina, funciona sem login no YouTube
 * e entende várias plataformas (YouTube, TikTok, Instagram, X, Vimeo...) quando
 * o usuário cola um link direto.
 *
 * AVISO DE USO: o material baixado é REFERÊNCIA (insumo para montar o vídeo
 * do Kairós por cima). Republicar o vídeo original não é permitido sem
 * autorização do autor.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeName } from "./config.js";

export interface YtDlpVideo {
  id: string;
  url: string;
  title: string;
  description: string;
  channel: string;
  channelUrl: string;
  durationSec: number | null;
  viewCount: number | null;
  likeCount: number | null;
  thumbnail: string | null;
  uploadDate: string | null;
  extractor: string;
}

export interface YtDlpRun {
  ok: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/** Caminhos onde o yt-dlp costuma ficar no Windows. */
function candidatePaths(): string[] {
  const out: string[] = [];
  const exe = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";

  if (process.env.YTDLP_PATH?.trim()) out.push(process.env.YTDLP_PATH.trim());

  // PATH
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir.trim()) continue;
    out.push(path.join(dir, exe));
    out.push(path.join(dir, "yt-dlp"));
  }

  // Instalações comuns do Python (Scripts)
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    "C:\\Program Files",
    "C:\\Program Files (x86)",
  ].filter(Boolean) as string[];

  for (const root of roots) {
    for (const pattern of [
      path.join(root, "Programs", "Python", "Python*", "Scripts", exe),
      path.join(root, "Python", "Python*", "Scripts", exe),
      path.join(root, "yt-dlp", exe),
    ]) {
      if (pattern.includes("*")) {
        // Expande o wildcard manualmente (o glob do fs não é padrão no Node antigo).
        const parent = pattern.slice(0, pattern.indexOf("*"));
        const rest = pattern.slice(pattern.indexOf("*") + 1);
        try {
          const base = path.dirname(parent);
          const leaf = path.basename(parent);
          const suffix = rest.slice(rest.indexOf(path.sep) + 1);
          if (!fs.existsSync(base)) continue;
          for (const dir of fs.readdirSync(base)) {
            if (dir.startsWith(leaf)) out.push(path.join(base, dir, suffix));
          }
        } catch {
          /* ignora */
        }
      } else {
        out.push(pattern);
      }
    }
  }

  return out;
}

let cachedBin: string | null = null;

/** Resolve o executável do yt-dlp (cacheado). */
export function resolveYtDlp(): string {
  if (cachedBin) return cachedBin;
  for (const candidate of candidatePaths()) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        cachedBin = candidate;
        return cachedBin;
      }
    } catch {
      /* ignora */
    }
  }
  throw new Error(
    "yt-dlp não encontrado. Instale com: pip install yt-dlp  (ou defina YTDLP_PATH com o caminho do executável).",
  );
}

/** Roda o yt-dlp e captura stdout/stderr. */
export function runYtDlp(args: string[], timeoutMs = 120_000): Promise<YtDlpRun> {
  const bin = resolveYtDlp();
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONWARNINGS: "ignore" },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* ignora */
      }
      reject(new Error(`yt-dlp excedeu ${Math.round(timeoutMs / 1000)}s e foi interrompido.`));
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Falha ao executar yt-dlp: ${err.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr, durationMs: Date.now() - started });
    });
  });
}

function mapVideo(raw: Record<string, unknown>): YtDlpVideo {
  const thumbnails = (raw.thumbnails as { url?: string }[] | undefined) || [];
  return {
    id: String(raw.id ?? ""),
    url: String(raw.webpage_url ?? raw.url ?? ""),
    title: String(raw.title ?? "(sem título)"),
    description: String(raw.description ?? ""),
    channel: String(raw.channel ?? raw.uploader ?? ""),
    channelUrl: String(raw.channel_url ?? raw.uploader_url ?? ""),
    durationSec: typeof raw.duration === "number" ? raw.duration : null,
    viewCount: typeof raw.view_count === "number" ? raw.view_count : null,
    likeCount: typeof raw.like_count === "number" ? raw.like_count : null,
    thumbnail: thumbnails.length ? String(thumbnails[thumbnails.length - 1]?.url ?? "") || null : null,
    uploadDate: raw.upload_date ? String(raw.upload_date) : null,
    extractor: String(raw.extractor_key ?? raw.extractor ?? ""),
  };
}

/** Busca vídeos por termo (YouTube). Traz visualizações para filtrar "viral". */
export async function searchVideos(
  query: string,
  limit = 5,
  timeoutMs = 120_000,
): Promise<YtDlpVideo[]> {
  const n = Math.max(1, Math.min(20, limit));
  const run = await runYtDlp(
    [
      `--dump-json`,
      `--no-warnings`,
      `--skip-download`,
      `ytsearch${n}:${query}`,
    ],
    timeoutMs,
  );

  if (!run.ok && !run.stdout.trim()) {
    throw new Error(`Busca no YouTube falhou: ${run.stderr.split("\n").slice(-3).join(" ")}`);
  }

  const videos: YtDlpVideo[] = [];
  for (const line of run.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      videos.push(mapVideo(JSON.parse(trimmed) as Record<string, unknown>));
    } catch {
      /* linha inválida — ignora */
    }
  }
  return videos;
}

/** Metadados de uma URL específica (qualquer plataforma suportada pelo yt-dlp). */
export async function getVideoInfo(url: string, timeoutMs = 120_000): Promise<YtDlpVideo> {
  const run = await runYtDlp(["--dump-single-json", "--no-warnings", "--skip-download", url], timeoutMs);
  if (!run.ok) {
    throw new Error(
      `Não consegui ler o vídeo: ${run.stderr.split("\n").slice(-3).join(" ").trim() || url}`,
    );
  }
  const raw = JSON.parse(run.stdout) as Record<string, unknown>;
  return mapVideo(raw);
}

export interface DownloadResult {
  filePath: string;
  sizeBytes: number;
  title: string;
  durationSec: number | null;
}

/**
 * Baixa o vídeo em MP4 (melhor qualidade até 1080p) pra uma pasta de destino.
 * Usa o ffmpeg do sistema pra mesclar vídeo+áudio quando necessário.
 *
 * Detalhe importante: baixa com o nome pelo ID (`<id>.<ext>`) porque o título
 * pode conter quebra de linha — o yt-dlp imprime o path com `\r` no meio e
 * o arquivo em disco tem outro nome. Depois renomeia pra um nome legível,
 * sanitizado no Node.
 */
export async function downloadVideo(
  url: string,
  destDir: string,
  maxHeight = 1080,
  timeoutMs = 600_000,
): Promise<DownloadResult> {
  fs.mkdirSync(destDir, { recursive: true });

  // Nome temporário seguro (id do vídeo).
  const tempTemplate = path.join(destDir, "kairos_src_%(id)s.%(ext)s");

  const run = await runYtDlp(
    [
      "-f",
      `bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]/b`,
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "--no-warnings",
      "-o",
      tempTemplate,
      url,
    ],
    timeoutMs,
  );

  if (!run.ok) {
    throw new Error(
      `Download falhou: ${run.stderr.split("\n").slice(-4).join(" ").trim() || "sem retorno do yt-dlp"}`,
    );
  }

  // Descobre o arquivo pelo prefixo temporário (independente do que o yt-dlp imprimiu).
  const downloaded = fs
    .readdirSync(destDir)
    .filter((f) => f.startsWith("kairos_src_"))
    .map((f) => path.join(destDir, f))
    .filter((f) => fs.statSync(f).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

  if (!downloaded) {
    throw new Error(
      `Download terminou sem arquivo em ${destDir}. ${run.stderr.split("\n").slice(-3).join(" ").trim()}`,
    );
  }

  // Nome legível (sanitizado no Node — sem quebra de linha e sem caractere inválido).
  let info: YtDlpVideo | null = null;
  try {
    info = await getVideoInfo(url);
  } catch {
    /* segue com o nome temporário */
  }

  let finalPath = downloaded;
  if (info?.title) {
    const clean = safeName(info.title);
    const candidate = path.join(destDir, `${clean}.mp4`);
    if (candidate !== downloaded) {
      try {
        if (fs.existsSync(candidate)) fs.rmSync(candidate, { force: true });
        fs.renameSync(downloaded, candidate);
        finalPath = candidate;
      } catch {
        /* mantém o nome temporário se o rename falhar */
      }
    }
  }

  const stat = fs.statSync(finalPath);
  return {
    filePath: finalPath,
    sizeBytes: stat.size,
    title: path.basename(finalPath).replace(/\.[^.]+$/, ""),
    durationSec: info?.durationSec ?? null,
  };
}

/** Pasta de fontes (material de referência) dentro de um projeto. */
export function sourcesDir(root: string, project?: string | null): string {
  const base = project?.trim()
    ? path.join(root, project.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-"))
    : root;
  return path.join(base, "_fontes");
}

/** Home do usuário — usado em mensagens de erro legíveis. */
export function homeDir(): string {
  return os.homedir();
}
