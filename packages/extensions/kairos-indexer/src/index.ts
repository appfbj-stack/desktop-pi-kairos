/**
 * kairos-indexer — extensão de indexação automática + tagging heurístico.
 *
 * Tools:
 *   - indexer_scan_folder        : escaneia uma pasta, indexa tudo
 *   - indexer_search             : busca por tag/keyword/ext
 *   - indexer_auto_tag_file      : re-tagging heurístico
 *   - indexer_get_stats          : estatísticas do índice
 *   - indexer_add_folder_watch   : adiciona pasta
 *   - indexer_list_watches       : lista pastas
 *   - indexer_remove_watch       : remove pasta
 *   - indexer_scan_all_watches   : escaneia tudo
 *   - indexer_add_manual_tag     : tag manual em arquivo
 *
 * Schema SQLite:
 *   - indexed_files(path UNIQUE, size, mtime, mime, ext, preview, indexed_at)
 *   - file_tags(file_id FK, tag, source, confidence)
 *   - folder_watches(path UNIQUE, recursive, last_scan_at, file_count, active)
 *
 * AI-tag (via LLM/embeddings) é TODO. Heurística cobre ~80% dos casos.
 */

import type { Extension } from "@kairos/agent";
import { allTools } from "./tools.js";
import { logger } from "@kairos/core";

logger.info("indexer: extension loaded (tools: scan/search/tag/stats/watch + manual_tag)");

const extension: Extension = {
  name: "kairos-indexer",
  version: "0.1.0",
  description:
    "Indexação automática de pastas + tagging heurístico. Encontre qualquer arquivo instantaneamente.",
  tools: allTools,
};

export default extension;
export { allTools } from "./tools.js";
export * from "./store.js";
export * from "./scanner.js";
export * from "./tagger.js";