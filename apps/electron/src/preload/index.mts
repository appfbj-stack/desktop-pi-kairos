/**
 * Preload — expõe API segura pro renderer via contextBridge.
 *
 * Sprint 1.3: adicionado openFileDialog e attach.
 * Sprint 1.5: adicionado onPermissionRequest e respondPermission (modal).
 */

import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AgentEvent, ProviderConfig } from "@kairos/agent";

export interface LicenseStatus {
  allowed: boolean;
  blocked: boolean;
  plan: "FREE" | "BASIC" | "PRO" | "ULTRA" | "ENTERPRISE" | "UNKNOWN";
  usageLimit: number;
  usageUsed: number;
  remaining: number;
  reason: string | null;
  currentPeriodEnd: string | null;
  renewUrl: string;
  source: "server" | "cache" | "local-fallback";
  cachedAt?: number;
}

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

/** Pedido de permissão enviado do main → renderer (Sprint 1.5). */
export interface PermissionRequest {
  requestId: string;
  tool: string;
  prompt: string;
  input: unknown;
}

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

  // Provider status (config + hasApiKey + isFirstLaunch) — Sprint 1.20
  getProviderStatus: (): Promise<{ provider: ProviderConfig; hasApiKey: boolean; isFirstLaunch: boolean }> =>
    ipcRenderer.invoke("agent:provider:status"),

  setProvider: (next: ProviderConfig): Promise<{ ok: true; provider: ProviderConfig }> =>
    ipcRenderer.invoke("agent:provider:set", next),

  // Lista modelos locais do Ollama (Sprint 1.7+).
  // Retorna [] se Ollama nao estiver rodando.
  listOllamaModels: (baseUrl?: string): Promise<
    { id: string; name: string; size: number; modified_at: string; family?: string; parameter_size?: string; quantization_level?: string }[]
  > => ipcRenderer.invoke("agent:ollama:list-models", baseUrl),

  // Lista modelos disponíveis no provider (OpenRouter/Anthropic/OpenAI/MiniMax).
  // Sprint 1.20: usado pelo modal "Ver modelos" no Settings.
  listModels: (
    provider: string,
    apiKey: string | undefined
  ): Promise<{
    models: { id: string; name: string; context?: number; tier?: "free" | "paid"; description?: string }[];
    error?: string;
  }> => ipcRenderer.invoke("agent:list-models", provider, apiKey),

  // Tools
  listTools: (
    sessionId: string
  ): Promise<{ name: string; description: string; dangerous: boolean }[]> =>
    ipcRenderer.invoke("agent:list-tools", sessionId),

  // Permissions (Sprint 1.5) — modal de confirmação
  onPermissionRequest: (
    cb: (req: PermissionRequest) => void
  ): (() => void) => {
    const handler = (_e: unknown, req: PermissionRequest) => cb(req);
    ipcRenderer.on("permission:request", handler);
    return () => ipcRenderer.off("permission:request", handler);
  },

  respondPermission: (
    requestId: string,
    approved: boolean
  ): Promise<{ ok: true }> =>
    ipcRenderer.invoke("permission:response", requestId, approved),

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

  // Workspace (Sprint 1.14) — árvore de pastas
  workspace: {
    root: (): Promise<{ root: string }> => ipcRenderer.invoke("workspace:root"),
    list: (relPath?: string): Promise<{
      root: string;
      current: string;
      items: { name: string; path: string; isDir: boolean; size: number; modifiedAt: number }[];
    }> => ipcRenderer.invoke("workspace:list", relPath),
    mkdir: (relPath: string): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke("workspace:mkdir", relPath),
    delete: (relPath: string): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke("workspace:delete", relPath),
    rename: (oldRel: string, newName: string): Promise<{ ok: true; from: string; to: string }> =>
      ipcRenderer.invoke("workspace:rename", oldRel, newName),
    readText: (relPath: string): Promise<{ path: string; name: string; size: number; content: string }> =>
      ipcRenderer.invoke("workspace:read-text", relPath),
    writeText: (relPath: string, content: string): Promise<{ ok: true; path: string; size: number }> =>
      ipcRenderer.invoke("workspace:write-text", relPath, content),
  },

  // Usage / trial (Sprint 1.20+)
  usage: {
    get: (): Promise<{ used: number; limit: number; remaining: number; blocked: boolean; firstUseAt: number }> =>
      ipcRenderer.invoke("app:usage:get"),
    reset: (): Promise<{ used: number; limit: number; remaining: number; blocked: boolean; firstUseAt: number }> =>
      ipcRenderer.invoke("app:usage:reset"),
    onUpdate: (cb: (status: { used: number; limit: number; remaining: number; blocked: boolean; firstUseAt: number }) => void): (() => void) => {
      const h = (_e: unknown, s: { used: number; limit: number; remaining: number; blocked: boolean; firstUseAt: number }) => cb(s);
      ipcRenderer.on("usage:updated", h);
      return () => ipcRenderer.off("usage:updated", h);
    },
  },

  // License server-side (Sprint v0.3.0+)
  license: {
    installation: (): Promise<{ id: string; createdAt: number; productName: string }> =>
      ipcRenderer.invoke("app:installation:info"),
    status: (): Promise<LicenseStatus> => ipcRenderer.invoke("app:license:status"),
    refresh: (): Promise<LicenseStatus> => ipcRenderer.invoke("app:license:refresh"),
    onUpdate: (cb: (status: LicenseStatus) => void): (() => void) => {
      const h = (_e: unknown, s: LicenseStatus) => cb(s);
      ipcRenderer.on("license:updated", h);
      return () => ipcRenderer.off("license:updated", h);
    },
    onBlocked: (cb: (status: LicenseStatus) => void): (() => void) => {
      const h = (_e: unknown, s: LicenseStatus) => cb(s);
      ipcRenderer.on("license:blocked", h);
      return () => ipcRenderer.off("license:blocked", h);
    },
  },

  // Máscara da chave API (Settings exibe)
  getMaskedApiKey: (): Promise<{ masked: string }> =>
    ipcRenderer.invoke("app:api-key:masked"),

  // Auto-update (Sprint 1.20)
  update: {
    /** Dispara verificação manual. Retorna null se falhar. */
    check: (): Promise<unknown> => ipcRenderer.invoke("update:check"),
    /** Baixa a versão encontrada. */
    download: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke("update:download"),
    /** Sai e instala. */
    install: (): Promise<void> => ipcRenderer.invoke("update:install"),
    /** Versão atual do app. */
    getVersion: (): Promise<{ version: string }> =>
      ipcRenderer.invoke("app:version"),
    onAvailable: (
      cb: (info: { version: string; releaseDate?: string }) => void
    ): (() => void) => {
      const h = (_e: unknown, i: { version: string; releaseDate?: string }) => cb(i);
      ipcRenderer.on("update:available", h);
      return () => ipcRenderer.off("update:available", h);
    },
    onDownloaded: (
      cb: (info: { version: string; releaseDate?: string }) => void
    ): (() => void) => {
      const h = (_e: unknown, i: { version: string; releaseDate?: string }) => cb(i);
      ipcRenderer.on("update:downloaded", h);
      return () => ipcRenderer.off("update:downloaded", h);
    },
    onStatus: (
      cb: (status: { phase: string; message?: string; current?: string; percent?: number }) => void
    ): (() => void) => {
      const h = (_e: unknown, s: { phase: string; message?: string; current?: string; percent?: number }) => cb(s);
      ipcRenderer.on("update:status", h);
      return () => ipcRenderer.off("update:status", h);
    },
    onProgress: (
      cb: (p: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => void
    ): (() => void) => {
      const h = (_e: unknown, p: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => cb(p);
      ipcRenderer.on("update:download-progress", h);
      return () => ipcRenderer.off("update:download-progress", h);
    },
  },
};

contextBridge.exposeInMainWorld("kairos", api);

/** Recupera path absoluto de um File (drag-and-drop). Electron 32+ removeu File.path. */
contextBridge.exposeInMainWorld("kairosPath", {
  fromFile: (file: File): string => webUtils.getPathForFile(file),
});

export type KairosAPI = typeof api;
