/**
 * files:ingest_folder — lê uma pasta inteira e retorna árvore + conteúdo
 * dos arquivos pequenos. Pra árvores grandes, usa o LLM pra resumir
 * (auto-sumariza arquivos > maxInlineBytes).
 *
 * Pensado pra "aceitar uma pasta inteira" — o user arrasta uma pasta no
 * chat e o agente vê o que tem dentro (markdown leve).
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureAllowed } from "../safety.js";

const inputSchema = z.object({
  path: z.string().describe("Caminho absoluto da pasta"),
  recursive: z.boolean().default(true).describe("Listar recursivamente (subpastas)"),
  maxDepth: z.number().int().min(1).max(10).default(5).describe("Profundidade máxima"),
  maxFiles: z.number().int().min(1).max(200).default(50).describe("Máximo de arquivos a listar"),
  maxInlineBytes: z.number().int().min(100).max(1_000_000).default(50_000)
    .describe("Arquivos menores que isso são lidos inline. Maiores só mostram tamanho."),
  includeHidden: z.boolean().default(false).describe("Incluir arquivos/pastas ocultos"),
  extensions: z.array(z.string()).optional()
    .describe("Filtra extensões (sem ponto, lowercase). Ex: ['txt','md','csv']"),
});

interface FileEntry {
  path: string;
  relPath: string;
  size: number;
  isDirectory: boolean;
  content?: string; // só se < maxInlineBytes
  truncated?: boolean;
}

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff",
  ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".mov", ".avi",
  ".zip", ".tar", ".gz", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
]);

export const ingestFolderTool: Tool<typeof inputSchema> = {
  name: "files:ingest_folder",
  description:
    "Lê uma pasta inteira e retorna árvore + conteúdo. " +
    "Arquivos <50KB são lidos inline; maiores só mostram tamanho. " +
    "Use quando o cliente arrastar uma pasta ou quiser entender a estrutura de um projeto. " +
    "Respeita a whitelist de paths (mesma do files:read).",
  dangerous: false,
  inputSchema,
  execute: async (input) => {
    const params = input;
    const root = path.resolve(params.path);
    await ensureAllowed(root);

    let stat;
    try {
      stat = await fs.stat(root);
    } catch (e: any) {
      return `❌ Pasta não encontrada: ${root} (${e.code || e.message})`;
    }
    if (!stat.isDirectory()) {
      return `❌ Não é uma pasta: ${root}`;
    }

    const entries: FileEntry[] = [];
    const dirs: string[] = [root];
    let depth = 0;

    while (dirs.length > 0 && entries.length < params.maxFiles && depth < params.maxDepth) {
      const nextDirs: string[] = [];
      for (const dir of dirs) {
        let items;
        try {
          items = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const item of items) {
          if (!params.includeHidden && item.name.startsWith(".")) continue;
          if (params.extensions && params.extensions.length > 0) {
            const ext = path.extname(item.name).slice(1).toLowerCase();
            if (!item.isDirectory() && !params.extensions.includes(ext)) continue;
          }
          const full = path.join(dir, item.name);
          if (item.isDirectory()) {
            if (params.recursive && depth + 1 < params.maxDepth) nextDirs.push(full);
            continue;
          }
          if (entries.length >= params.maxFiles) break;
          try {
            const st = await fs.stat(full);
            const ext = path.extname(full).toLowerCase();
            const isBinary = BINARY_EXTENSIONS.has(ext);
            const entry: FileEntry = {
              path: full,
              relPath: path.relative(root, full),
              size: st.size,
              isDirectory: false,
            };
            if (!isBinary && st.size <= params.maxInlineBytes && st.size > 0) {
              try {
                const buf = await fs.readFile(full, "utf-8");
                entry.content = buf;
              } catch {
                // ignora
              }
            } else if (st.size > params.maxInlineBytes) {
              entry.truncated = true;
            }
            entries.push(entry);
          } catch {
            // pula
          }
        }
        if (entries.length >= params.maxFiles) break;
      }
      dirs.length = 0;
      dirs.push(...nextDirs);
      depth++;
    }

    // Saída: árvore + conteúdo inline
    const treeLines: string[] = [];
    treeLines.push(`# 📂 ${path.basename(root)}/`);
    treeLines.push("");
    // árvore resumida (só top-level + count de subpastas)
    const topLevel = entries.filter((e) => !e.relPath.includes(path.sep)).slice(0, 30);
    for (const e of topLevel) {
      const sizeKb = (e.size / 1024).toFixed(1);
      treeLines.push(`- \`${e.relPath}\` (${sizeKb} KB)${e.truncated ? " [truncado]" : ""}`);
    }
    if (entries.length > topLevel.length) {
      treeLines.push(`- ... +${entries.length - topLevel.length} mais`);
    }
    treeLines.push("");
    treeLines.push(`**Total**: ${entries.length} arquivos lidos, ${depth} níveis de profundidade.`);

    // Conteúdo inline
    const inline = entries.filter((e) => e.content && !e.truncated);
    if (inline.length > 0) {
      treeLines.push("");
      treeLines.push("## Conteúdo (até " + inline.length + " arquivos)");
      for (const e of inline) {
        treeLines.push("");
        treeLines.push(`### \`${e.relPath}\` (${e.content!.length} chars)`);
        treeLines.push("```");
        // Trunca a 5000 chars por arquivo pra não explodir
        treeLines.push(e.content!.slice(0, 5000) + (e.content!.length > 5000 ? "\n…(truncado)" : ""));
        treeLines.push("```");
      }
    }
    return treeLines.join("\n");
  },
};
