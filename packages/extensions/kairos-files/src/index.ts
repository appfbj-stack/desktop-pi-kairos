/**
 * kairos-files — extensão de file system do Kairós.
 *
 * Tools expostas (casa direto com PRD §6):
 *   - files:mkdir   — criar pasta
 *   - files:list    — listar diretório (recursivo opcional)
 *   - files:read    — ler arquivo texto
 *   - files:write   — escrever arquivo (com proteção de overwrite)
 *   - files:delete  — excluir (sempre destrutivo)
 *   - files:move    — mover/renomear
 *   - files:search  — buscar por nome
 *
 * Segurança:
 *   - TODA tool passa por `safety.ts` (whitelist de paths)
 *   - Tools destrutivas têm flag `dangerous: true` → pi-nolo pede confirmação
 *   - Whitelist default: HOME, Desktop, Documents, Downloads, Pictures, Videos, Music, cwd
 *   - Customizável via env KAIROS_ALLOWED_PATHS (separado por `;`)
 */

import type { Extension, Tool } from "@kairos/agent";
import { z } from "zod";
import { mkdirTool } from "./tools/mkdir.js";
import { listTool } from "./tools/list.js";
import { readTool } from "./tools/read.js";
import { writeTool } from "./tools/write.js";
import { deleteTool } from "./tools/delete.js";
import { moveTool } from "./tools/move.js";
import { searchTool } from "./tools/search.js";
import { ingestFolderTool } from "./tools/ingest.js";

const extension: Extension = {
  name: "kairos-files",
  version: "0.1.0",
  description:
    "Operações de file system com whitelist de paths. Cria, lê, escreve, move, exclui, procura e ingere arquivos/pastas.",
  tools: [
    mkdirTool,
    listTool,
    readTool,
    writeTool,
    deleteTool,
    moveTool,
    searchTool,
    ingestFolderTool,
  ] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };
