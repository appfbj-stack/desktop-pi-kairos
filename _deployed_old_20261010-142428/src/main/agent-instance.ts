/**
 * Agent singleton — gerencia o Agent do Kairós no main process.
 *
 * Sprint 1.4: persistência de conversas no SQLite.
 * Cada sessão tem uma Conversation única. Mensagens são salvas após o user
 * enviar e após cada resposta do agent. Histórico é carregado quando o user
 * retoma uma conversa.
 *
 * Sprint 1.5: hook de permissões injeta IPC roundtrip com o renderer para
 * mostrar modal de confirmação bonito quando uma tool destrutiva é chamada.
 */

import path from "node:path";
import os from "node:os";
import { app } from "electron";
import {
  Agent,
  type AgentEvent,
  readProviderConfigFromEnv,
  buildModel,
  registerExtension,
  type ProviderConfig,
} from "@kairos/agent";
import { loadProviderConfig, saveProviderConfig } from "./config-store.js";
import kairosStream from "@kairos/extension-stream";
import kairosVideo from "@kairos/extension-video";
import kairosFiles from "@kairos/extension-files";
import kairosSpreadsheets from "@kairos/extension-spreadsheets";
import kairosPdfCreate from "@kairos/extension-pdf-create";
import kairosDocuments from "@kairos/extension-documents";
import kairosImages from "@kairos/extension-images";
import kairosIntelligence from "@kairos/extension-intelligence";
import kairosAgenda from "@kairos/extension-agenda";
import kairosOcr from "@kairos/extension-ocr";
import kairosFinance from "@kairos/extension-finance";
import kairosResearch from "@kairos/extension-research";
import kairosMarketing from "@kairos/extension-marketing";
import { openDatabase, ConversationStore, logger, type KairósDB } from "@kairos/core";

interface AgentEntry {
  agent: Agent;
  store: ConversationStore;
  db: KairósDB;
}

let entry: AgentEntry | null = null;
let currentSessionId: string | null = null;
let provider: ProviderConfig = readProviderConfigFromEnv();
let providerInitialized = false;

function workspaceDir(): string {
  return path.join(app.getPath("userData"), "kairos-workspace");
}

/** Seta env var uma vez no startup pra extensions descobrirem o workspace. */
function exportWorkspaceEnv(): void {
  const dir = workspaceDir();
  if (process.env.KAIROS_WORKSPACE_DIR !== dir) {
    process.env.KAIROS_WORKSPACE_DIR = dir;
    logger.info({ workspace: dir }, "KAIROS_WORKSPACE_DIR exportado");
  }
}

/** Garante DB aberto e store disponível. */
function ensureStore(): { db: KairósDB; store: ConversationStore } {
  const workspace = workspaceDir();
  const db = openDatabase(workspace);
  return { db, store: new ConversationStore(db.raw) };
}

/** Cria (ou retorna) o Agent. Idempotente. */
export function getAgent(sessionId: string): Agent {
  if (entry && currentSessionId === sessionId) return entry.agent;

  exportWorkspaceEnv();

  logger.info({ sessionId, provider }, "Criando Agent");

  const { db, store } = ensureStore();

  // Cria a conversa se não existe
  if (!store.getConversation(sessionId)) {
    store.createConversation(sessionId);
    logger.info({ sessionId }, "Conversa criada");
  }

  const agent = new Agent(sessionId, {
    provider,
    model: buildModel(provider),
    workspaceDir: workspaceDir(),
    enabledExtensions: [
      "kairos-files",
      "kairos-spreadsheets",
      "kairos-pdf-create",
      "kairos-documents",
      "kairos-images",
      "kairos-stream",
      "kairos-video",
      "kairos-intelligence",
      "kairos-agenda",
      "kairos-ocr",
      "kairos-finance",
      "kairos-research",
      "kairos-marketing",
    ],
    locale: "pt-BR",
  });

  registerExtension(agent.tools, kairosFiles);
  registerExtension(agent.tools, kairosSpreadsheets);
  registerExtension(agent.tools, kairosPdfCreate);
  registerExtension(agent.tools, kairosDocuments);
  registerExtension(agent.tools, kairosImages);
  registerExtension(agent.tools, kairosStream);
  registerExtension(agent.tools, kairosVideo);
  registerExtension(agent.tools, kairosIntelligence);
  registerExtension(agent.tools, kairosAgenda);
  registerExtension(agent.tools, kairosOcr);
  registerExtension(agent.tools, kairosFinance);
  registerExtension(agent.tools, kairosResearch);
  registerExtension(agent.tools, kairosMarketing);

  // Modo "tudo liberado" — Pastor autorizou todas as acoes.
  // Auto-aprova qualquer tool destrutiva sem pedir confirmacao.
  agent.permissions.setHook(async (req) => {
    logger.info({ tool: req.tool }, "[permissions] auto-aprovado (modo livre)");
    return true;
  });

  entry = { agent, store, db };
  currentSessionId = sessionId;
  return agent;
}

/** Retorna store de conversas. */
export function getStore(): ConversationStore {
  if (!entry) ensureStore();
  return ensureStore().store;
}

/** Carrega histórico de mensagens de uma conversa. */
export function loadHistory(sessionId: string): { role: "user" | "assistant"; content: string }[] {
  return getStore().listChatHistory(sessionId);
}

/** Processa uma mensagem do user, persistindo cada AgentEvent. */
export async function* handleUserMessage(
  sessionId: string,
  userMessage: string,
  attachments: { name: string; size: number; type: "text" | "image"; mime: string }[] = []
): AsyncIterable<AgentEvent> {
  const a = getAgent(sessionId);
  const store = getStore();

  // Persiste mensagem do user
  store.addMessage(sessionId, "user", userMessage, { attachments });

  // Carrega histórico e processa
  const history = store.listChatHistory(sessionId).slice(0, -1); // -1 = última (a que acabamos de salvar)

  // Buffer de mensagens assistant pendentes pra salvar junto
  let assistantText = "";
  const toolMessages: { role: "tool"; content: string; toolName: string }[] = [];
  const userMsgForLlm = attachments.length > 0
    ? `${userMessage}\n\n[${attachments.length} anexo(s): ${attachments.map((a) => `${a.name} (${a.type})`).join(", ")}]`
    : userMessage;

  for await (const ev of a.handle(userMsgForLlm, { initialMessages: history })) {
    // Acumula texto do assistant e tools
    switch (ev.type) {
      case "message":
        assistantText += ev.content;
        break;
      case "tool:result":
        toolMessages.push({
          role: "tool",
          content: typeof ev.output === "string" ? ev.output : JSON.stringify(ev.output),
          toolName: ev.tool,
        });
        break;
      case "done":
        // Persiste assistant text + tool messages
        if (assistantText.trim()) {
          store.addMessage(sessionId, "assistant", assistantText.trim());
        }
        for (const tm of toolMessages) {
          store.addMessage(sessionId, "tool", tm.content, { toolName: tm.toolName });
        }
        break;
      case "error":
        // Persiste erro como system
        store.addMessage(sessionId, "system", `Erro: ${ev.message}`);
        break;
    }
    yield ev;
  }
}

/** Pede cancelamento. */
export function stopAgent(sessionId: string): void {
  const a = getAgent(sessionId);
  a.stop();
}

/** Carrega provider config (env vars + override do disco). Chamar no app.whenReady. */
export async function initProvider(): Promise<void> {
  if (providerInitialized) return;
  const loaded = await loadProviderConfig();
  provider = loaded;
  // Re-exporta env vars baseadas no que foi carregado
  if (loaded.apiKey) process.env.KAIROS_API_KEY = loaded.apiKey;
  if (loaded.provider) process.env.KAIROS_PROVIDER = loaded.provider;
  if (loaded.modelId) process.env.KAIROS_MODEL = loaded.modelId;
  if (loaded.baseUrl) process.env.KAIROS_OLLAMA_URL = loaded.baseUrl;
  providerInitialized = true;
  logger.info({ provider: loaded.provider, model: loaded.modelId }, "Provider inicializado");
}

/** Atualiza o provider em runtime e persiste no disco. */
export async function setProvider(next: ProviderConfig): Promise<void> {
  provider = next;
  // Invalida entry pra forçar recriação do Agent com novo model
  entry = null;
  currentSessionId = null;
  // Atualiza env vars também (algumas extensions podem ler direto)
  if (next.apiKey) process.env.KAIROS_API_KEY = next.apiKey;
  if (next.provider) process.env.KAIROS_PROVIDER = next.provider;
  if (next.modelId) process.env.KAIROS_MODEL = next.modelId;
  if (next.baseUrl) process.env.KAIROS_OLLAMA_URL = next.baseUrl;
  // Persiste no disco pra sobreviver a reinício
  try {
    await saveProviderConfig(next);
  } catch (err) {
    logger.warn({ err: String(err) }, "não foi possível persistir provider config");
  }
  logger.info({ provider: next.provider, model: next.modelId }, "Provider atualizado");
}

export function getProvider(): ProviderConfig {
  return provider;
}

/** Retorna config + flag de onboarding. Usado pelo renderer pra saber se mostra wizard. */
export function getProviderStatus(): { provider: ProviderConfig; hasApiKey: boolean; isFirstLaunch: boolean } {
  return {
    provider,
    hasApiKey: !!provider.apiKey && provider.apiKey.length > 0,
    isFirstLaunch: !provider.apiKey || provider.apiKey.length === 0,
  };
}

export function getDebugInfo() {
  return {
    provider,
    userData: app.getPath("userData"),
    workspace: workspaceDir(),
    cwd: process.cwd(),
    username: os.userInfo().username,
    platform: process.platform,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
    toolCount: entry?.agent.tools.list().length ?? 0,
    currentSessionId,
  };
}
