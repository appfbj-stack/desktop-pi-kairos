/**
 * Scanner — percorre uma pasta recursivamente, indexa arquivos.
 *
 * Pontos importantes:
 *  - Respeita `recursive` (default true)
 *  - Ignora paths perigosos: node_modules, .git, $RECYCLE.BIN, System Volume Information
 *  - Limite de profundidade (default 12)
 *  - Limite de arquivos (default 50.000) — pra não estourar memória
 *  - Captura metadados via fs.stat + MIME via mmmagic-like fallback (extensão)
 *  - Extrai preview de arquivos texto
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "@kairos/core";
import { upsertFile, replaceHeuristicTags, updateWatchAfterScan } from "./store.js";
import { tagFile, extractPreview } from "./tagger.js";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  ".idea",
  ".vscode",
  ".next",
  ".cache",
  "dist",
  "build",
  "out",
  "target",
  "$RECYCLE.BIN",
  "System Volume Information",
  ".Trash",
  "Thumbs.db",
]);

const IGNORED_PREFIX = [".__", "~$", "._"];

/** Decide MIME básico baseado em extensão. Sem dep externa. */
function guessMime(ext: string | null): string | null {
  if (!ext) return null;
  const e = ext.toLowerCase().replace(/^\./, "");
  const map: Record<string, string> = {
    pdf: "application/pdf",
    json: "application/json",
    xml: "application/xml",
    zip: "application/zip",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript",
    jsx: "text/javascript",
    ts: "text/typescript",
    tsx: "text/typescript",
    py: "text/x-python",
    rb: "text/x-ruby",
    java: "text/x-java",
    c: "text/x-c",
    cpp: "text/x-c++",
    h: "text/x-c",
    yaml: "text/yaml",
    yml: "text/yaml",
    sql: "text/x-sql",
    sh: "text/x-shellscript",
    log: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/mp4",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return map[e] ?? null;
}

export interface ScanOptions {
  recursive?: boolean;
  maxDepth?: number;
  maxFiles?: number;
  /** Extrair preview de arquivos texto (default true). */
  extractPreview?: boolean;
}

export interface ScanResult {
  rootPath: string;
  filesScanned: number;
  filesIndexed: number;
  filesSkipped: number;
  tagsApplied: number;
  durationMs: number;
  errors: { path: string; err: string }[];
}

/** Escaneia uma pasta e indexa tudo. */
export function scanFolder(rootPath: string, options: ScanOptions = {}): ScanResult {
  const startedAt = Date.now();
  const recursive = options.recursive !== false;
  const maxDepth = options.maxDepth ?? 12;
  const maxFiles = options.maxFiles ?? 50_000;
  const doPreview = options.extractPreview !== false;

  const result: ScanResult = {
    rootPath,
    filesScanned: 0,
    filesIndexed: 0,
    filesSkipped: 0,
    tagsApplied: 0,
    durationMs: 0,
    errors: [],
  };

  if (!fs.existsSync(rootPath)) {
    result.errors.push({ path: rootPath, err: "diretório não existe" });
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const stack: { dir: string; depth: number }[] = [{ dir: rootPath, depth: 0 }];

  while (stack.length > 0 && result.filesScanned < maxFiles) {
    const { dir, depth } = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      result.errors.push({ path: dir, err: `readdir: ${String(err)}` });
      continue;
    }

    for (const entry of entries) {
      if (result.filesScanned >= maxFiles) break;

      const name = entry.name;
      if (IGNORED_DIRS.has(name)) continue;
      if (IGNORED_PREFIX.some((p) => name.startsWith(p))) continue;

      const fullPath = path.join(dir, name);

      if (entry.isDirectory()) {
        if (recursive && depth < maxDepth) {
          stack.push({ dir: fullPath, depth: depth + 1 });
        } else {
          result.filesSkipped++;
        }
        continue;
      }

      if (!entry.isFile()) {
        // symlinks, sockets, etc — skip
        result.filesSkipped++;
        continue;
      }

      result.filesScanned++;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch (err) {
        result.errors.push({ path: fullPath, err: `stat: ${String(err)}` });
        continue;
      }

      // Pula arquivos vazios
      if (stat.size === 0) {
        result.filesSkipped++;
        continue;
      }

      const ext = path.extname(name).toLowerCase().replace(/^\./, "") || null;
      const mime = guessMime(ext);
      const preview = doPreview ? extractPreview(fullPath, ext, stat.size) : null;

      try {
        const file = upsertFile({
          path: fullPath,
          size: stat.size,
          mtime: Math.floor(stat.mtimeMs),
          mime,
          ext,
          preview,
        });

        // upsertFile retorna null se não há tenant ativo
        if (!file) {
          result.errors.push({ path: fullPath, err: "sem tenant ativo (não logado)" });
          continue;
        }

        const tags = tagFile({ path: fullPath, ext, mime });
        if (tags.length > 0) {
          replaceHeuristicTags(file.id, tags);
          result.tagsApplied += tags.length;
        }
        result.filesIndexed++;
      } catch (err) {
        result.errors.push({ path: fullPath, err: `upsert: ${String(err)}` });
      }
    }
  }

  result.durationMs = Date.now() - startedAt;
  logger.info(
    {
      rootPath,
      filesScanned: result.filesScanned,
      filesIndexed: result.filesIndexed,
      tagsApplied: result.tagsApplied,
      durationMs: result.durationMs,
      errors: result.errors.length,
    },
    "indexer: scan completo",
  );
  return result;
}

/** Escaneia todas as pastas configuradas (ativas). Retorna array de results. */
export function scanAllWatches(): ScanResult[] {
  const { listWatches } = require("./store.js") as typeof import("./store.js");
  const watches = listWatches(true);
  const results: ScanResult[] = [];
  for (const w of watches) {
    const result = scanFolder(w.path, { recursive: !!w.recursive });
    updateWatchAfterScan(w.id, result.filesIndexed);
    results.push(result);
  }
  return results;
}