/**
 * IPC handlers — bridge entre renderer (UI) e main (Electron + Agent).
 *
 * Sprint 1.3: adicionado dialog:open-file e agent:attach.
 */

import { app, ipcMain, BrowserWindow, dialog, type IpcMainInvokeEvent } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getAgent,
  handleUserMessage,
  stopAgent,
  setProvider,
  getProvider,
  getDebugInfo,
  getStore,
} from "./agent-instance.js";
import { listOllamaModels, type AgentEvent, type ProviderConfig } from "@kairos/agent";
import { logger } from "@kairos/core";

function getWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".html", ".htm", ".yaml", ".yml",
  ".log", ".ini", ".conf", ".cfg", ".env", ".gitignore", ".mdx", ".tex", ".rst",
]);

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg",
]);

/** Determina o tipo de attachment baseado na extensão. */
export function classifyAttachment(ext: string): "text" | "image" | "binary" {
  const e = ext.toLowerCase();
  if (TEXT_EXTENSIONS.has(e)) return "text";
  if (IMAGE_EXTENSIONS.has(e)) return "image";
  return "binary";
}

/** Lê um arquivo e retorna o conteúdo. Texto = string. Imagem = base64 data URL. Binário = erro. */
export async function readAttachment(absPath: string): Promise<{
  name: string;
  size: number;
  type: "text" | "image";
  mime: string;
  content: string;
}> {
  const stat = await fs.stat(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const name = path.basename(absPath);
  const kind = classifyAttachment(ext);

  if (kind === "text") {
    const text = await fs.readFile(absPath, "utf-8");
    // Truncar arquivos muito grandes (proteção)
    const max = 500_000; // ~500KB de texto
    const content = text.length > max
      ? text.slice(0, max) + `\n\n[...truncado em ${max} caracteres de ${text.length}...]`
      : text;
    return { name, size: stat.size, type: "text", mime: "text/plain", content };
  }

  if (kind === "image") {
    const buf = await fs.readFile(absPath);
    const mime =
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
      : ext === ".svg" ? "image/svg+xml"
      : `image/${ext.slice(1)}`;
    const content = `data:${mime};base64,${buf.toString("base64")}`;
    // Não retornamos image muito grande via IPC (limite 4MB)
    if (content.length > 4_000_000) {
      throw new Error(`Imagem muito grande (${stat.size} bytes). Limite ~3MB encoded.`);
    }
    return { name, size: stat.size, type: "image", mime, content };
  }

  throw new Error(
    `Tipo de arquivo não suportado para anexar: ${ext}. Use tools específicas (sheets:read, docs:read, pdf:create, etc).`
  );
}

export function registerIpcHandlers(): void {
  // Health check
  ipcMain.handle("app:ping", async () => {
    return { ok: true, app: "Kairós Desktop Alves", version: "0.1.0" };
  });

  // Debug info
  ipcMain.handle("app:debug", async () => getDebugInfo());

  // Diálogo de arquivo (Sprint 1.3)
  ipcMain.handle("dialog:open-file", async (event) => {
    const win = getWindow(event);
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: "Anexar arquivo",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Texto/Planilha/Doc", extensions: [
          "txt", "md", "csv", "json", "xml", "html",
          "xlsx", "xls", "docx", "pdf",
        ]},
        { name: "Imagens", extensions: ["jpg", "jpeg", "png", "webp", "gif"] },
        { name: "Todos", extensions: ["*"] },
      ],
    });
    if (result.canceled) return { canceled: true as const, files: [] };
    const files = await Promise.all(
      result.filePaths.map(async (p) => {
        const s = await fs.stat(p);
        return { path: p, name: path.basename(p), size: s.size };
      })
    );
    return { canceled: false as const, files };
  });

  // Anexar (Sprint 1.3)
  ipcMain.handle("agent:attach", async (_event, paths: string[]) => {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new Error("paths deve ser array não-vazio");
    }
    const attachments = await Promise.all(paths.map(readAttachment));
    return attachments;
  });

  // Inicia sessão
  ipcMain.handle("agent:start", async (_event, sessionId: string) => {
    if (typeof sessionId !== "string" || !sessionId) {
      throw new Error("sessionId é obrigatório");
    }
    const agent = getAgent(sessionId);
    return {
      sessionId,
      toolCount: agent.tools.list().length,
      tools: agent.tools.list().map((t) => ({
        name: t.name,
        description: t.description,
        dangerous: t.dangerous ?? false,
      })),
    };
  });

  // ── Conversations (Sprint 1.4) ─────────────────────────────────

  ipcMain.handle("conversations:list", async () => {
    const store = getStore();
    return store.listConversations(100);
  });

  ipcMain.handle("conversations:create", async (_event, title?: string) => {
    const store = getStore();
    return store.createConversation(title);
  });

  ipcMain.handle(
    "conversations:get",
    async (_event, id: string) => {
      const store = getStore();
      const conv = store.getConversation(id);
      if (!conv) return null;
      const messages = store.listMessages(id);
      return { conversation: conv, messages };
    }
  );

  ipcMain.handle("conversations:delete", async (_event, id: string) => {
    const store = getStore();
    store.deleteConversation(id);
    return { ok: true };
  });

  ipcMain.handle(
    "conversations:rename",
    async (_event, id: string, title: string) => {
      const store = getStore();
      store.updateTitle(id, title);
      return { ok: true };
    }
  );

  // Envia mensagem — retorna stream de eventos
  ipcMain.handle(
    "agent:send",
    async (event, sessionId: string, userMessage: string, attachments?: { name: string; type: "text" | "image"; mime: string; content: string }[]) => {
      if (typeof userMessage !== "string") {
        throw new Error("userMessage inválido");
      }
      const win = getWindow(event);
      if (!win) {
        throw new Error("Window não encontrada");
      }

      // Monta mensagem com anexos
      let fullMessage = userMessage;
      if (attachments && attachments.length > 0) {
        const parts: string[] = [];
        for (const att of attachments) {
          if (att.type === "text") {
            parts.push(`[Anexo: ${att.name}]\n\`\`\`\n${att.content}\n\`\`\``);
          } else {
            // imagem — referencia nome, conteúdo vai como base64 abaixo
            parts.push(`[Imagem anexada: ${att.name}, ${att.mime}]`);
          }
        }
        if (userMessage) parts.unshift(userMessage);
        fullMessage = parts.join("\n\n");
      }

      logger.info({ sessionId, length: fullMessage.length, attachments: attachments?.length }, "Mensagem recebida");

      const channel = `agent:event:${sessionId}`;
      for await (const ev of handleUserMessage(sessionId, fullMessage)) {
        if (!win.isDestroyed()) {
          win.webContents.send(channel, ev);
        }
      }
      return { ok: true };
    }
  );

  // Para execução
  ipcMain.handle("agent:stop", async (_event, sessionId: string) => {
    stopAgent(sessionId);
    return { ok: true };
  });

  // Provider config
  ipcMain.handle("agent:provider:get", async () => getProvider());

  ipcMain.handle(
    "agent:provider:set",
    async (_event, next: ProviderConfig) => {
      if (!next || typeof next !== "object") {
        throw new Error("Provider inválido");
      }
      if (!next.provider || !next.modelId) {
        throw new Error("provider e modelId obrigatórios");
      }
      setProvider(next);
      return { ok: true, provider: getProvider() };
    }
  );

  // Ollama local — lista modelos baixados (Sprint 1.7+).
  // Se Ollama nao estiver rodando, retorna [] (sem throw).
  ipcMain.handle("agent:ollama:list-models", async (_event, baseUrl?: string) => {
    return listOllamaModels(baseUrl);
  });

  // Lista tools
  ipcMain.handle("agent:list-tools", async (_event, sessionId: string) => {
    const agent = getAgent(sessionId);
    return agent.tools.list().map((t) => ({
      name: t.name,
      description: t.description,
      dangerous: t.dangerous ?? false,
    }));
  });

  // ── Workspace (Sprint 1.14) — árvore de pastas onde o usuário organiza conteúdo ──

  function workspaceRoot(): string {
    return path.join(app.getPath("userData"), "kairos-workspace");
  }

  /** Converte path absoluto para path relativo ao workspaceRoot, com / como separador. */
  function toRelative(abs: string): string {
    const root = workspaceRoot();
    const rel = path.relative(root, abs).split(path.sep).join("/");
    return rel === "" ? "/" : rel;
  }

  /** Garante que absPath está dentro do workspace (anti-escape). */
  function ensureInside(absPath: string): string {
    const root = workspaceRoot();
    const normalized = path.resolve(absPath);
    const rootResolved = path.resolve(root);
    if (normalized !== rootResolved && !normalized.startsWith(rootResolved + path.sep)) {
      throw new Error(`Acesso negado: fora do workspace (${toRelative(normalized)})`);
    }
    return normalized;
  }

  ipcMain.handle("workspace:root", async () => {
    const root = workspaceRoot();
    await fs.mkdir(root, { recursive: true });
    return { root };
  });

  /** Lista entradas (pastas + arquivos) de um path relativo ao workspace. */
  ipcMain.handle("workspace:list", async (_event, relPath: string = "/") => {
    const root = workspaceRoot();
    await fs.mkdir(root, { recursive: true });
    const abs = ensureInside(path.join(root, relPath || "/"));
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (e) => {
        const full = path.join(abs, e.name);
        const stat = await fs.stat(full);
        return {
          name: e.name,
          path: toRelative(full),
          isDir: e.isDirectory(),
          size: e.isDirectory() ? 0 : stat.size,
          modifiedAt: stat.mtimeMs,
        };
      })
    );
    // Pastas primeiro, depois arquivos, ordem alfabética
    items.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
    return { root, current: toRelative(abs), items };
  });

  /** Cria pasta. relPath = path relativo completo incluindo o nome da nova pasta. */
  ipcMain.handle("workspace:mkdir", async (_event, relPath: string) => {
    if (!relPath || typeof relPath !== "string") throw new Error("path inválido");
    const root = workspaceRoot();
    await fs.mkdir(root, { recursive: true });
    const abs = ensureInside(path.join(root, relPath));
    await fs.mkdir(abs, { recursive: true });
    return { ok: true, path: toRelative(abs) };
  });

  /** Deleta arquivo ou pasta (recursive). */
  ipcMain.handle("workspace:delete", async (_event, relPath: string) => {
    if (!relPath || relPath === "/") throw new Error("Não pode deletar a raiz");
    const root = workspaceRoot();
    const abs = ensureInside(path.join(root, relPath));
    await fs.rm(abs, { recursive: true, force: true });
    return { ok: true, path: relPath };
  });

  /** Renomeia/move arquivo ou pasta. */
  ipcMain.handle("workspace:rename", async (_event, oldRel: string, newName: string) => {
    if (!oldRel || !newName || newName.includes("/") || newName.includes("\\")) {
      throw new Error("nome inválido");
    }
    const root = workspaceRoot();
    const oldAbs = ensureInside(path.join(root, oldRel));
    const newAbs = ensureInside(path.join(path.dirname(oldAbs), newName));
    await fs.rename(oldAbs, newAbs);
    return { ok: true, from: oldRel, to: toRelative(newAbs) };
  });

  /** Lê arquivo de texto. */
  ipcMain.handle("workspace:read-text", async (_event, relPath: string) => {
    const root = workspaceRoot();
    const abs = ensureInside(path.join(root, relPath));
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) throw new Error("É uma pasta, não arquivo");
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const TEXT_EXT = new Set([".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".yaml", ".yml", ".log", ".ini", ".conf", ".env", ".html", ".htm"]);
    if (!TEXT_EXT.has(ext)) {
      throw new Error(`Não é arquivo de texto (${ext}). Use anexar via chat pra binários.`);
    }
    const text = buf.toString("utf-8");
    return { path: relPath, name: path.basename(abs), size: stat.size, content: text };
  });

  /** Escreve arquivo de texto (cria ou sobrescreve). */
  ipcMain.handle("workspace:write-text", async (_event, relPath: string, content: string) => {
    if (!relPath || typeof content !== "string") throw new Error("path ou content inválido");
    const root = workspaceRoot();
    const abs = ensureInside(path.join(root, relPath));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf-8");
    const stat = await fs.stat(abs);
    return { ok: true, path: relPath, size: stat.size };
  });

  logger.info("IPC handlers registrados");
}

export type { AgentEvent };
