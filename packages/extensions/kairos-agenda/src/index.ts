/**
 * kairos-agenda — extensão de agenda pessoal do Kairós.
 *
 * Tools expostas (namespace "agenda:*"):
 *   - agenda:add       adiciona compromisso (title, datetime ISO 8601, notes, category, priority)
 *   - agenda:list      lista por período (today/tomorrow/week/month/all/custom)
 *   - agenda:complete  marca como concluído (id | query)
 *   - agenda:remove    remove (id | query)
 *
 * Storage: <workspace>/kairos-agenda.db (SQLite local, persistente).
 * env: KAIROS_WORKSPACE_DIR setada por agent-instance.ts.
 */

import { z } from "zod";
import type { Extension, Tool } from "@kairos/agent";
import { addTool } from "./tools/add.js";
import { listTool } from "./tools/list.js";
import { completeTool } from "./tools/complete.js";
import { removeTool } from "./tools/remove.js";

const extension: Extension = {
  name: "kairos-agenda",
  version: "0.1.0",
  description:
    "Agenda pessoal persistente do Kairós. Adiciona, lista, conclui e remove compromissos. " +
    "Storage local em SQLite. Use ISO 8601 para datetimes (converta linguagem natural antes de chamar).",
  tools: [addTool, listTool, completeTool, removeTool] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };