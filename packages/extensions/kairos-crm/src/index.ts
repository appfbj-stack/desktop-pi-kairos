/**
 * kairos-crm — extensão de CRM embutido.
 *
 * Gerencia clientes, fornecedores, leads e parceiros do usuário final.
 * Inclui histórico de interações (ligações, zaps, emails, presencial).
 *
 * Tools:
 *   - crm_add_contact
 *   - crm_list_contacts
 *   - crm_get_contact
 *   - crm_update_contact
 *   - crm_delete_contact
 *   - crm_log_interaction
 *
 * Schema:
 *   crm_contacts (id, name, type, email, phone, company, role, notes, tags, last_contact_at, ...)
 *   crm_interactions (id, contact_id, channel, summary, next_step, created_at)
 */

import type { Extension } from "@kairos/agent";
import { allTools } from "./tools.js";
import { logger } from "@kairos/core";

logger.info("crm: extension loaded (6 tools: add/list/get/update/delete/log)");

const extension: Extension = {
  name: "kairos-crm",
  version: "0.1.0",
  description: "CRM embutido — clientes, fornecedores, leads, parceiros com histórico de interações.",
  tools: allTools,
};

export default extension;
export { allTools } from "./tools.js";
export * from "./store.js";
