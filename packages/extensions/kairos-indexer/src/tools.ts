/**
 * Tools do kairos-indexer.
 *
 *   - indexer_scan_folder        : escaneia uma pasta e indexa
 *   - indexer_search             : busca por tag/keyword/ext
 *   - indexer_auto_tag_file      : re-tagging heurístico
 *   - indexer_get_stats          : estatísticas do índice
 *   - indexer_add_folder_watch   : adiciona pasta pra scan
 *   - indexer_list_watches       : lista pastas configuradas
 *   - indexer_remove_watch       : remove pasta
 *   - indexer_scan_all_watches   : escaneia todas as pastas configuradas
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { logger } from "@kairos/core";
import {
  upsertFile,
  getFileByPath,
  getFileById,
  getTagsForFile,
  listFilesByTag,
  listAllTagsWithCounts,
  searchFilesText,
  listFiles,
  addTag,
  removeTag,
  addWatch,
  listWatches,
  removeWatch,
  getStats,
  replaceHeuristicTags,
} from "./store.js";
import { scanFolder, scanAllWatches } from "./scanner.js";
import { tagFile, extractPreview } from "./tagger.js";
import * as fs from "node:fs";
import * as path from "node:path";

// =============================================================================
// 1. indexer_scan_folder
// =============================================================================

const ScanFolderInput = z.object({
  path: z
    .string()
    .min(1)
    .describe("Caminho absoluto da pasta a escanear (ex: 'C:\\Users\\fernando\\Documents' ou '/home/user/docs')"),
  recursive: z.boolean().default(true).describe("Buscar em subpastas (default true)"),
  maxDepth: z.number().int().min(1).max(20).default(12).describe("Profundidade máxima"),
  maxFiles: z.number().int().min(10).max(200_000).default(50_000).describe("Limite de arquivos"),
  extractPreview: z.boolean().default(true).describe("Tentar extrair preview de arquivos texto"),
});

export const indexerScanFolder: Tool = {
  name: "indexer_scan_folder",
  description:
    "Escaneia uma pasta recursivamente e indexa todos os arquivos. Extrai metadados (size, mtime, mime, extensão), preview de arquivos texto, e atribui tags heurísticas (document, image, invoice, contract, etc). " +
    "Use pra construir índice local de uma pasta do cliente. Pastas node_modules/.git são ignoradas.",
  inputSchema: ScanFolderInput,
  execute: async (input) => {
    const { path: p, recursive, maxDepth, maxFiles, extractPreview } = ScanFolderInput.parse(input);
    if (!path.isAbsolute(p)) {
      return `❌ O caminho precisa ser absoluto: \`${p}\``;
    }
    if (!fs.existsSync(p)) {
      return `❌ Pasta não existe: \`${p}\``;
    }
    const stat = fs.statSync(p);
    if (!stat.isDirectory()) {
      return `❌ Não é diretório: \`${p}\``;
    }
    const result = scanFolder(p, { recursive, maxDepth, maxFiles, extractPreview });
    const errLine = result.errors.length > 0 ? `\n⚠️ ${result.errors.length} erros (veja logs)` : "";
    return (
      `✅ Scan completo em \`${p}\`\n\n` +
      `- Arquivos escaneados: **${result.filesScanned}**\n` +
      `- Indexados/atualizados: **${result.filesIndexed}**\n` +
      `- Ignorados: ${result.filesSkipped}\n` +
      `- Tags aplicadas: **${result.tagsApplied}**\n` +
      `- Duração: ${result.durationMs}ms\n` +
      `- Erros: ${result.errors.length}${errLine}\n\n` +
      `Use \`indexer_search\` pra encontrar arquivos agora.`
    );
  },
};

// =============================================================================
// 2. indexer_search
// =============================================================================

const SearchInput = z.object({
  query: z.string().optional().describe("Busca textual livre em path ou preview"),
  tag: z.string().optional().describe("Filtrar por tag exata (ex: 'invoice', 'document', 'image')"),
  ext: z.string().optional().describe("Filtrar por extensão (ex: 'pdf', 'jpg')"),
  mime: z.string().optional().describe("Filtrar por MIME (ex: 'image/', 'application/pdf')"),
  limit: z.number().int().min(1).max(500).default(30).describe("Máximo de resultados"),
});

export const indexerSearch: Tool = {
  name: "indexer_search",
  description:
    "Busca no índice por texto livre (path/preview), tag, extensão ou MIME. Combina filtros. " +
    "Retorna arquivos com tags. Use pra localizar qualquer coisa indexada.",
  inputSchema: SearchInput,
  execute: async (input) => {
    const { query, tag, ext, mime, limit } = SearchInput.parse(input);

    if (tag) {
      const files = listFilesByTag(tag, { limit });
      return formatResults(files, `tag="${tag}"`);
    }

    if (ext || mime) {
      const files = listFiles({ ext, mime, limit });
      return formatResults(files, `${ext ? `ext=${ext}` : ""}${mime ? ` mime=${mime}` : ""}`);
    }

    if (query) {
      const files = searchFilesText(query, { limit });
      return formatResults(files, `query="${query}"`);
    }

    return "⚠️ Forneça pelo menos `query`, `tag`, `ext` ou `mime`.";
  },
};

function formatResults(files: ReturnType<typeof listFiles>, filter: string): string {
  if (files.length === 0) return `🔍 Nenhum arquivo encontrado (${filter}).`;
  const header = `🔍 **${files.length} resultado(s)**(${filter})`;
  const items = files.slice(0, 50).map((f, i) => {
    const sizeMB = (f.size / 1_048_576).toFixed(2);
    const tags = getTagsForFile(f.id);
    const tagList = tags.length > 0 ? ` [${tags.map((t) => t.tag).join(", ")}]` : "";
    const date = new Date(f.mtime).toISOString().slice(0, 10);
    return `${i + 1}. \`${f.path}\`\n   ${sizeMB}MB · ${date}${tagList}`;
  });
  return `${header}\n\n${items.join("\n\n")}${files.length > 50 ? `\n\n... +${files.length - 50} mais` : ""}`;
}

// =============================================================================
// 3. indexer_auto_tag_file
// =============================================================================

const AutoTagInput = z.object({
  path: z.string().describe("Caminho do arquivo (absoluto) pra re-tagging"),
});

export const indexerAutoTagFile: Tool = {
  name: "indexer_auto_tag_file",
  description:
    "Re-calcula tags heurísticas de um arquivo indexado. Use quando o cliente pedir categorização de um arquivo específico.",
  inputSchema: AutoTagInput,
  execute: async (input) => {
    const { path: p } = AutoTagInput.parse(input);
    const file = getFileByPath(p);
    if (!file) return `❌ Arquivo não indexado: \`${p}\`. Rode indexer_scan_folder primeiro.`;
    const tags = tagFile({ path: file.path, ext: file.ext, mime: file.mime });
    replaceHeuristicTags(file.id, tags);
    return `✅ Arquivo \`${file.path}\` re-tageado com ${tags.length} tags:\n- ${tags.map((t) => `\`${t}\``).join(", ")}`;
  },
};

// =============================================================================
// 4. indexer_get_stats
// =============================================================================

const StatsInput = z.object({
  top: z.number().int().min(1).max(50).default(15).describe("Quantos itens top mostrar"),
});

export const indexerGetStats: Tool = {
  name: "indexer_get_stats",
  description:
    "Mostra estatísticas do índice: total de arquivos, tamanho total, top extensões, top MIME types, top tags, arquivos recentes.",
  inputSchema: StatsInput,
  execute: async () => {
    const s = getStats();
    const sizeGB = (s.totalSize / 1_073_741_824).toFixed(2);
    const extList = s.topExtensions.slice(0, 10).map((e) => `  - ${e.ext}: ${e.count}`).join("\n");
    const mimeList = s.topMimes.slice(0, 8).map((m) => `  - ${m.mime}: ${m.count}`).join("\n");
    const tagList = s.topTags.slice(0, 15).map((t) => `  - ${t.tag} (${t.source}): ${t.count}`).join("\n");
    const recentList = s.recentFiles
      .slice(0, 10)
      .map((f) => {
        const d = new Date(f.mtime).toISOString().slice(0, 10);
        const mb = (f.size / 1_048_576).toFixed(2);
        return `  - ${d} · ${mb}MB · \`${f.path}\``;
      })
      .join("\n");
    return (
      `📊 **Estatísticas do Índice**\n\n` +
      `- Arquivos indexados: **${s.totalFiles}**\n` +
      `- Tamanho total: ${sizeGB} GB\n` +
      `- Tags aplicadas: ${s.totalTags}\n` +
      `- Pastas monitoradas: ${s.totalWatches}\n\n` +
      `**Top extensões:**\n${extList || "  (nenhuma)"}\n\n` +
      `**Top MIME types:**\n${mimeList || "  (nenhum)"}\n\n` +
      `**Top tags:**\n${tagList || "  (nenhuma)"}\n\n` +
      `**Arquivos recentes:**\n${recentList || "  (nenhum)"}`
    );
  },
};

// =============================================================================
// 5. indexer_add_folder_watch
// =============================================================================

const AddWatchInput = z.object({
  path: z.string().describe("Caminho absoluto da pasta"),
  recursive: z.boolean().default(true).describe("Escanear recursivamente"),
});

export const indexerAddFolderWatch: Tool = {
  name: "indexer_add_folder_watch",
  description:
    "Adiciona uma pasta ao índice. Pode ser escaneada sob demanda com indexer_scan_folder ou em batch com indexer_scan_all_watches. " +
    "Use pra pastas de cliente que você quer sempre disponíveis (Downloads, Documents, Dropbox, etc).",
  inputSchema: AddWatchInput,
  execute: async (input) => {
    const { path: p, recursive } = AddWatchInput.parse(input);
    if (!path.isAbsolute(p)) return `❌ Caminho precisa ser absoluto: \`${p}\``;
    if (!fs.existsSync(p)) return `❌ Pasta não existe: \`${p}\``;
    const watch = addWatch({ path: p, recursive });
    return `✅ Pasta adicionada ao índice:\n- \`${watch.path}\` (recursivo: ${!!watch.recursive})\n\nUse \`indexer_scan_folder\` com este path pra indexar agora.`;
  },
};

// =============================================================================
// 6. indexer_list_watches
// =============================================================================

const ListWatchesInput = z.object({
  activeOnly: z.boolean().default(false).describe("Mostrar só pastas ativas"),
});

export const indexerListWatches: Tool = {
  name: "indexer_list_watches",
  description: "Lista pastas configuradas no índice.",
  inputSchema: ListWatchesInput,
  execute: async (input) => {
    const { activeOnly } = ListWatchesInput.parse(input);
    const watches = listWatches(activeOnly);
    if (watches.length === 0) {
      return `Nenhuma pasta ${activeOnly ? "ativa " : ""}configurada. Use \`indexer_add_folder_watch\` pra adicionar.`;
    }
    const items = watches.map((w, i) => {
      const last = w.lastScanAt ? new Date(w.lastScanAt).toISOString().slice(0, 16).replace("T", " ") : "nunca";
      const status = w.active ? "🟢" : "⚪";
      return `${i + 1}. ${status} \`${w.path}\` (rec:${!!w.recursive}, ${w.fileCount} arquivos, último scan: ${last})`;
    });
    return `**${watches.length} pasta(s) ${activeOnly ? "ativa(s)" : ""}configurada(s):**\n\n${items.join("\n")}`;
  },
};

// =============================================================================
// 7. indexer_remove_watch
// =============================================================================

const RemoveWatchInput = z.object({
  path: z.string().describe("Caminho da pasta a remover"),
});

export const indexerRemoveWatch: Tool = {
  name: "indexer_remove_watch",
  description: "Remove uma pasta do índice (não deleta arquivos, só para de monitorar).",
  inputSchema: RemoveWatchInput,
  execute: async (input) => {
    const { path: p } = RemoveWatchInput.parse(input);
    const ok = removeWatch(p);
    return ok ? `🗑️ Pasta removida do índice: \`${p}\`` : `❌ Pasta não estava configurada: \`${p}\``;
  },
};

// =============================================================================
// 8. indexer_scan_all_watches
// =============================================================================

const ScanAllInput = z.object({});

export const indexerScanAllWatches: Tool = {
  name: "indexer_scan_all_watches",
  description:
    "Escaneia TODAS as pastas configuradas (ativas) em sequência. Use pra atualizar o índice inteiro de uma vez.",
  inputSchema: ScanAllInput,
  execute: async () => {
    const results = scanAllWatches();
    if (results.length === 0) {
      return `Nenhuma pasta configurada. Use \`indexer_add_folder_watch\` primeiro.`;
    }
    const total = results.reduce(
      (acc, r) => ({
        filesScanned: acc.filesScanned + r.filesScanned,
        filesIndexed: acc.filesIndexed + r.filesIndexed,
        tagsApplied: acc.tagsApplied + r.tagsApplied,
        durationMs: acc.durationMs + r.durationMs,
      }),
      { filesScanned: 0, filesIndexed: 0, tagsApplied: 0, durationMs: 0 },
    );
    const details = results
      .map((r) => `- \`${r.rootPath}\`: ${r.filesIndexed} arquivos, ${r.tagsApplied} tags, ${r.durationMs}ms`)
      .join("\n");
    return (
      `✅ Scan completo de ${results.length} pasta(s)\n\n` +
      `**Totais:**\n` +
      `- Arquivos escaneados: **${total.filesScanned}**\n` +
      `- Indexados: **${total.filesIndexed}**\n` +
      `- Tags aplicadas: **${total.tagsApplied}**\n` +
      `- Duração total: ${total.durationMs}ms\n\n` +
      `**Por pasta:**\n${details}`
    );
  },
};

// =============================================================================
// 9. indexer_add_manual_tag (utility)
// =============================================================================

const AddManualTagInput = z.object({
  path: z.string().describe("Caminho do arquivo"),
  tag: z.string().min(1).max(40).describe("Tag a adicionar (ex: 'urgente', 'cliente-vip')"),
});

export const indexerAddManualTag: Tool = {
  name: "indexer_add_manual_tag",
  description: "Adiciona uma tag manual a um arquivo indexado. Tags manuais não são sobrescritas pelo auto-tagging.",
  inputSchema: AddManualTagInput,
  execute: async (input) => {
    const { path: p, tag } = AddManualTagInput.parse(input);
    const file = getFileByPath(p);
    if (!file) return `❌ Arquivo não indexado: \`${p}\``;
    addTag({ fileId: file.id, tag, source: "manual", confidence: 1.0 });
    return `✅ Tag manual \`${tag.toLowerCase()}\` adicionada a \`${p}\``;
  },
};

export const allTools: Tool[] = [
  indexerScanFolder,
  indexerSearch,
  indexerAutoTagFile,
  indexerGetStats,
  indexerAddFolderWatch,
  indexerListWatches,
  indexerRemoveWatch,
  indexerScanAllWatches,
  indexerAddManualTag,
];