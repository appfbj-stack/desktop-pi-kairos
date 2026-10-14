/**
 * Tools do CRM embutido.
 *
 *   - crm_add_contact       : cadastra cliente/fornecedor/lead/parceiro
 *   - crm_list_contacts     : lista (com filtro type/query)
 *   - crm_get_contact       : detalhe + últimas interações
 *   - crm_update_contact    : atualiza campos
 *   - crm_delete_contact    : remove (cascade em interações)
 *   - crm_log_interaction   : registra contato/observação
 *
 * O agente é encorajado a chamar automaticamente quando o user fala de pessoas,
 * ou proativamente ao final de uma conversa de follow-up.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import {
  addContact,
  listContacts,
  getContact,
  updateContact,
  deleteContact,
  logInteraction,
  listInteractions,
  countContacts,
  type ContactType,
} from "./store.js";

const TYPES = ["cliente", "fornecedor", "lead", "parceiro", "outro"] as const;
const CHANNELS = ["whatsapp", "email", "telefone", "presencial", "outro"] as const;

// =============================================================================
// 1. crm_add_contact
// =============================================================================

const AddInput = z.object({
  name: z.string().min(2).max(120).describe("Nome completo da pessoa"),
  type: z.enum(TYPES).default("cliente").describe("Tipo do contato"),
  email: z.string().email().optional().describe("E-mail"),
  phone: z.string().max(40).optional().describe("Telefone (qualquer formato)"),
  company: z.string().max(120).optional().describe("Empresa"),
  role: z.string().max(120).optional().describe("Cargo / função"),
  notes: z.string().max(2000).optional().describe("Observações livres"),
  tags: z.array(z.string()).optional().describe("Tags livres (ex: ['VIP','inadimplente'])"),
});

export const crmAddContact: Tool = {
  name: "crm_add_contact",
  description:
    "Cadastra um contato no CRM. Tipos: cliente, fornecedor, lead, parceiro, outro. " +
    "Use quando o cliente mencionar uma pessoa nova, ou proativamente ao conhecer clientes/fornecedores. " +
    "Retorna o ID do contato criado pra futuras referências.",
  inputSchema: AddInput,
  execute: async (input) => {
    const data = AddInput.parse(input);
    const contact = addContact({
      name: data.name,
      type: data.type as ContactType,
      email: data.email ?? null,
      phone: data.phone ?? null,
      company: data.company ?? null,
      role: data.role ?? null,
      notes: data.notes ?? null,
      tags: data.tags ? JSON.stringify(data.tags) : null,
    });
    return `✅ Contato cadastrado: **${contact.name}** (${contact.type}) — ID: \`${contact.id}\``;
  },
};

// =============================================================================
// 2. crm_list_contacts
// =============================================================================

const ListInput = z.object({
  type: z.enum(TYPES).optional().describe("Filtrar por tipo"),
  query: z.string().optional().describe("Busca por nome, empresa ou email"),
  limit: z.number().int().min(1).max(500).default(100).describe("Máximo de resultados"),
});

export const crmListContacts: Tool = {
  name: "crm_list_contacts",
  description:
    "Lista contatos do CRM. Pode filtrar por tipo (cliente, lead, etc) e/ou buscar por nome/empresa/email. " +
    "Ordenado alfabeticamente. Use pra revisar a base de clientes antes de ações em massa.",
  inputSchema: ListInput,
  execute: async (input) => {
    const { type, query, limit } = ListInput.parse(input);
    const contacts = listContacts({ type: type as ContactType | undefined, query, limit });
    const total = countContacts();
    if (contacts.length === 0) {
      return type
        ? `Nenhum contato do tipo "${type}". Total: ${total}.`
        : query
          ? `Nenhum contato encontrado pra "${query}". Total: ${total}.`
          : "Nenhum contato cadastrado. Use crm_add_contact pra começar.";
    }
    const header = `**${contacts.length} de ${total} contatos**${type ? ` (${type})` : ""}${query ? ` matching "${query}"` : ""}`;
    const list = contacts
      .map((c, i) => {
        const last = c.lastContactAt ? new Date(c.lastContactAt).toLocaleDateString("pt-BR") : "nunca";
        return [
          `${i + 1}. **${c.name}** [${c.type}]${c.company ? ` — ${c.company}` : ""}`,
          `   ${[c.email, c.phone, c.role].filter(Boolean).join(" · ") || "(sem contato)"}`,
          `   Último contato: ${last} · ID: \`${c.id}\``,
        ].join("\n");
      })
      .join("\n");
    return `${header}\n\n${list}`;
  },
};

// =============================================================================
// 3. crm_get_contact
// =============================================================================

const GetInput = z.object({
  id: z.string().describe("ID do contato (UUID)"),
  includeInteractions: z.boolean().default(true).describe("Incluir histórico de interações"),
});

export const crmGetContact: Tool = {
  name: "crm_get_contact",
  description:
    "Retorna o detalhe completo de um contato + últimas interações. Use antes de ligar/enviar mensagem.",
  inputSchema: GetInput,
  execute: async (input) => {
    const { id, includeInteractions } = GetInput.parse(input);
    const c = getContact(id);
    if (!c) return `❌ Contato não encontrado: ${id}`;
    const lines = [
      `**${c.name}** [${c.type}]`,
      c.company ? `Empresa: ${c.company}` : null,
      c.role ? `Cargo: ${c.role}` : null,
      c.email ? `E-mail: ${c.email}` : null,
      c.phone ? `Telefone: ${c.phone}` : null,
      c.notes ? `Notas: ${c.notes}` : null,
      c.lastContactAt ? `Último contato: ${new Date(c.lastContactAt).toLocaleString("pt-BR")}` : "Sem contatos registrados",
      c.tags ? `Tags: ${c.tags}` : null,
    ].filter(Boolean) as string[];
    if (includeInteractions) {
      const ints = listInteractions(id, 10);
      if (ints.length > 0) {
        lines.push("", `**Últimas ${ints.length} interações:**`);
        for (const i of ints) {
          lines.push(
            `- [${new Date(i.createdAt).toLocaleDateString("pt-BR")}] **${i.channel}**: ${i.summary}` +
              (i.nextStep ? ` _(próximo: ${i.nextStep})_` : ""),
          );
        }
      } else {
        lines.push("", "_Nenhuma interação registrada ainda._");
      }
    }
    return lines.join("\n");
  },
};

// =============================================================================
// 4. crm_update_contact
// =============================================================================

const UpdateInput = z.object({
  id: z.string().describe("ID do contato"),
  name: z.string().min(2).max(120).optional(),
  type: z.enum(TYPES).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  company: z.string().max(120).optional(),
  role: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
  markContactedNow: z.boolean().optional()
    .describe("Se true, atualiza last_contact_at pra agora (use quando acabou de falar com a pessoa)"),
});

export const crmUpdateContact: Tool = {
  name: "crm_update_contact",
  description:
    "Atualiza campos de um contato existente. " +
    "Passe só os campos que quer mudar. " +
    "Use markContactedNow=true pra registrar que acabou de falar com essa pessoa.",
  inputSchema: UpdateInput,
  execute: async (input) => {
    const data = UpdateInput.parse(input);
    const patch: any = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.type !== undefined) patch.type = data.type;
    if (data.email !== undefined) patch.email = data.email;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.company !== undefined) patch.company = data.company;
    if (data.role !== undefined) patch.role = data.role;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.tags !== undefined) patch.tags = JSON.stringify(data.tags);
    if (data.markContactedNow) patch.lastContactAt = Date.now();
    const updated = updateContact(data.id, patch);
    if (!updated) return `❌ Contato não encontrado: ${data.id}`;
    return `✅ Contato atualizado: **${updated.name}**`;
  },
};

// =============================================================================
// 5. crm_delete_contact
// =============================================================================

const DeleteInput = z.object({
  id: z.string().describe("ID do contato a remover"),
});

export const crmDeleteContact: Tool = {
  name: "crm_delete_contact",
  description: "Remove um contato (cascade em interações). ATENÇÃO: irreversível.",
  inputSchema: DeleteInput,
  execute: async (input) => {
    const { id } = DeleteInput.parse(input);
    const ok = deleteContact(id);
    return ok ? `🗑️ Contato removido: ${id}` : `❌ Contato não encontrado: ${id}`;
  },
};

// =============================================================================
// 6. crm_log_interaction
// =============================================================================

const LogInput = z.object({
  contactId: z.string().describe("ID do contato"),
  channel: z.enum(CHANNELS).describe("Canal da interação"),
  summary: z.string().min(2).max(2000).describe("Resumo do que foi conversado/decidido"),
  nextStep: z.string().max(500).optional().describe("Próximo passo combinado"),
});

export const crmLogInteraction: Tool = {
  name: "crm_log_interaction",
  description:
    "Registra uma interação com um contato (ligação, zap, email, presencial). " +
    "Atualiza automaticamente last_contact_at. " +
    "Use sempre que o cliente falar sobre uma conversa/contato com alguém.",
  inputSchema: LogInput,
  execute: async (input) => {
    const data = LogInput.parse(input);
    try {
      const i = logInteraction(data.contactId, {
        channel: data.channel,
        summary: data.summary,
        nextStep: data.nextStep,
      });
      return `✅ Interação registrada em ${new Date(i.createdAt).toLocaleString("pt-BR")}`;
    } catch (e: any) {
      return `❌ Erro: ${e.message}`;
    }
  },
};

export const allTools: Tool[] = [
  crmAddContact,
  crmListContacts,
  crmGetContact,
  crmUpdateContact,
  crmDeleteContact,
  crmLogInteraction,
];
