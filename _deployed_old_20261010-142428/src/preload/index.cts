/**
 * Preload — expõe API segura pro renderer via contextBridge.
 *
 * Sprint 1.3: adicionado openFileDialog e attach.
 * Sprint 1.7: arquivo renomeado pra .cts (CommonJS) — tsc compila .mts sempre como ESM
 *             mesmo com module:commonjs. .cts garante output CJS.
 * Sprint 1.10: removido onPermissionRequest / respondPermission (modo livre auto-aprova
 *              no main; modal pode voltar em Sprint 2 se Pastor quiser).
 */

import { contextBridge, ipcRenderer } from "electron";
import type { AgentEvent, ProviderConfig } from "@kairos/agent";

export interface AttachmentSummary {
  name: string;
  size: number;
  path: string;
}

export interface Attachment {
  name: string;
  size: number;
  type: "text" | "image";
  mime: string;
  content: string;
}

// Sprint 1.10: removido onPermissionRequest / respondPermission (modo livre auto-aprova
// no main; modal pode voltar em Sprint 2 se Pastor quiser).

const api = {
  // Health
  ping: (): Promise<{ ok: boolean; app: string; version: string }> =>
    ipcRenderer.invoke("app:ping"),

  debug: (): Promise<unknown> => ipcRenderer.invoke("app:debug"),

  // File dialog (Sprint 1.3)
  openFileDialog: (): Promise<
    { canceled: true; files: [] } | { canceled: false; files: AttachmentSummary[] }
  > => ipcRenderer.invoke("dialog:open-file"),

  // Attach (Sprint 1.3)
  attach: (paths: string[]): Promise<Attachment[]> =>
    ipcRenderer.invoke("agent:attach", paths),

  // Sessão
  start: (
    sessionId: string
  ): Promise<{ sessionId: string; toolCount: number; tools: { name: string; description: string; dangerous: boolean }[] }> =>
    ipcRenderer.invoke("agent:start", sessionId),

  // Chat
  send: (
    sessionId: string,
    userMessage: string,
    attachments?: { name: string; type: "text" | "image"; mime: string; content: string }[]
  ): Promise<{ ok: true }> => ipcRenderer.invoke("agent:send", sessionId, userMessage, attachments),

  // Recebe eventos do agent
  onAgentEvent: (
    sessionId: string,
    cb: (event: AgentEvent) => void
  ): (() => void) => {
    const channel = `agent:event:${sessionId}`;
    const handler = (_e: unknown, event: AgentEvent) => cb(event);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.off(channel, handler);
  },

  stop: (sessionId: string): Promise<{ ok: true }> =>
    ipcRenderer.invoke("agent:stop", sessionId),

  // Provider config
  getProvider: (): Promise<ProviderConfig> =>
    ipcRenderer.invoke("agent:provider:get"),

  setProvider: (next: ProviderConfig): Promise<{ ok: true; provider: ProviderConfig }> =>
    ipcRenderer.invoke("agent:provider:set", next),

  // Lista modelos locais do Ollama (Sprint 1.7+).
  // Retorna [] se Ollama nao estiver rodando.
  listOllamaModels: (baseUrl?: string): Promise<
    { id: string; name: string; size: number; modified_at: string; family?: string; parameter_size?: string; quantization_level?: string }[]
  > => ipcRenderer.invoke("agent:ollama:list-models", baseUrl),

  // Tools
  listTools: (
    sessionId: string
  ): Promise<{ name: string; description: string; dangerous: boolean }[]> =>
    ipcRenderer.invoke("agent:list-tools", sessionId),

  // Conversations (Sprint 1.4)
  conversations: {
    list: (): Promise<
      { id: string; createdAt: number; updatedAt: number; title: string | null }[]
    > => ipcRenderer.invoke("conversations:list"),
    create: (title?: string): Promise<{ id: string; createdAt: number; updatedAt: number; title: string | null }> =>
      ipcRenderer.invoke("conversations:create", title),
    get: (
      id: string
    ): Promise<{
      conversation: { id: string; createdAt: number; updatedAt: number; title: string | null };
      messages: { id: string; role: string; content: string; attachments: string | null; toolName: string | null; createdAt: number }[];
    } | null> => ipcRenderer.invoke("conversations:get", id),
    delete: (id: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke("conversations:delete", id),
    rename: (id: string, title: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke("conversations:rename", id, title),
  },
};

contextBridge.exposeInMainWorld("kairos", api);

export type KairosAPI = typeof api;
