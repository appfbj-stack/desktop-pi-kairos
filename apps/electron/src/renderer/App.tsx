/**
 * Kairós Desktop Alves — chat UI redesenhado.
 *
 * Sprint 1.9: visual profissional com markdown, hover actions, tool cards, empty state.
 * Sprint 1.4-1.8: provider mutavel, persistencia, permission modal, ollama, etc.
 * v0.4+: Settings reformulado — toggle BYOK vs MiniMax bundled, sem expor campos confusos.
 */

import { useEffect, useRef, useState } from "react";
import type { AgentEvent, ProviderConfig } from "@kairos/agent";
import type { Message as DbMessage } from "@kairos/core";
import type { Attachment } from "../preload/index.mjs";
import { MessageBubble, type BubbleMessage } from "./components/MessageBubble";
import { InputBar } from "./components/InputBar";
import { EmptyState } from "./components/EmptyState";
import { TypingIndicator } from "./components/TypingIndicator";
import { Markdown } from "./components/Markdown";
import type { ToolCall } from "./components/ToolCallCard";
import { WorkspacePanel } from "./components/WorkspacePanel";
import { WorkspacePicker } from "./components/WorkspacePicker";
import { Onboarding } from "./components/Onboarding";
import { SettingsPanel } from "./components/SettingsPanel";

interface Conversation {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string | null;
}

const SESSION_ID = "session-" + Date.now();
const PROVIDER_COLORS: Record<string, string> = {
  openrouter: "from-blue-500 to-purple-500",
  ollama: "from-emerald-500 to-green-500",
  openai: "from-green-500 to-emerald-500",
  anthropic: "from-orange-500 to-amber-500",
  minimax: "from-slate-500 to-slate-700",
};

function providerColor(provider: string): string {
  return PROVIDER_COLORS[provider] ?? "from-slate-500 to-slate-700";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * Sprint 1.17: SidebarPromptsPanel — card com prompts rápidos que injetam no input do chat.
 *
 * Usado nas tabs "Agenda" e "Finanças". Não chama tool diretamente — coloca o texto no draft
 * e o usuário revisa/envia. Vantagem: zero IPC novo, modelo decide a tool certa na hora.
 */
function SidebarPromptsPanel({
  title,
  icon,
  accent,
  intro,
  prompts,
  onPick,
}: {
  title: string;
  icon: string;
  accent: "emerald" | "amber";
  intro: string;
  prompts: { icon: string; label: string; prompt: string }[];
  onPick: (prompt: string) => void;
}) {
  const accentColor = accent === "emerald" ? "text-emerald-400" : "text-amber-400";
  const accentBg = accent === "emerald" ? "hover:bg-emerald-900/20" : "hover:bg-amber-900/20";
  const accentBorder = accent === "emerald" ? "border-emerald-500/30" : "border-amber-500/30";
  return (
    <>
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h2 className={`text-sm font-semibold ${accentColor}`}>{title}</h2>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{intro}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {prompts.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(p.prompt)}
            className={`mb-1 w-full rounded-lg border border-transparent ${accentBg} px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:border-current hover:${accentBorder}`}
          >
            <span className="mr-2">{p.icon}</span>
            <span className="text-slate-200">{p.label}</span>
          </button>
        ))}
      </div>
      <div className="border-t border-slate-800 px-3 py-2 text-[10px] text-slate-600">
        <p>{prompts.length} ações rápidas · clique pra enviar ao chat</p>
      </div>
    </>
  );
}

export function App() {
  const [sessionId, setSessionId] = useState<string>(SESSION_ID);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<BubbleMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    { name: string; size: number; path: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [provider, setProviderState] = useState<ProviderConfig | null>(null);
  const [toolCount, setToolCount] = useState(0);
  const [appVersion, setAppVersion] = useState<string>("…");
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"conversations" | "workspace" | "agenda" | "finance">("conversations");
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (typeof window !== "undefined" && (localStorage.getItem("kairos:theme") as "dark" | "light")) || "dark";
  });
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    return (typeof window !== "undefined" && localStorage.getItem("kairos:tts") === "1") || false;
  });

  // Auto-update (Sprint 1.20)
  const [updateState, setUpdateState] = useState<
    | { phase: "idle" }
    | { phase: "available"; version: string }
    | { phase: "downloading"; percent: number; transferred: number; total: number; bytesPerSecond: number }
    | { phase: "downloaded"; version: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<
    { id: string; name: string; size: number; modified_at: string; family?: string; parameter_size?: string; quantization_level?: string }[]
  >([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);

  // Modelos do provider atual (OpenRouter/Anthropic/OpenAI/MiniMax) — Sprint 1.20
  const [modelCatalog, setModelCatalog] = useState<
    { id: string; name: string; context?: number; tier?: "free" | "paid"; description?: string }[]
  >([]);
  const [modelCatalogLoading, setModelCatalogLoading] = useState(false);
  const [modelCatalogError, setModelCatalogError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [showModelModal, setShowModelModal] = useState(false);

  // Onboarding desabilitado no v0.2.0 — chave MiniMax do Pastor vem embarcada.
  // (Deixa o componente Onboarding.tsx no código caso queira reativar no futuro.)
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(false);

  // Usage / trial (Sprint 1.20+)
  const [usage, setUsage] = useState<{
    used: number;
    limit: number;
    remaining: number;
    blocked: boolean;
    firstUseAt: number;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function handleListOllama() {
    setOllamaLoading(true);
    try {
      const models = await window.kairos.listOllamaModels();
      setOllamaModels(models);
    } catch (err) {
      console.error("[ollama] failed to list models:", err);
    } finally {
      setOllamaLoading(false);
    }
  }

  async function handleListModels() {
    if (!provider) return;
    setModelCatalogLoading(true);
    setModelCatalogError(null);
    setModelSearch("");
    setShowModelModal(true);
    try {
      const result = await window.kairos.listModels(provider.provider, provider.apiKey);
      setModelCatalog(result.models);
      if (result.error) {
        setModelCatalogError(result.error);
      }
    } catch (err) {
      setModelCatalogError(String(err));
    } finally {
      setModelCatalogLoading(false);
    }
  }

  function handlePickModel(id: string) {
    if (!provider) return;
    handleProviderChange({ ...provider, modelId: id });
    setShowModelModal(false);
  }

  // Init
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    try {
      localStorage.setItem("kairos:theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("kairos:tts", ttsEnabled ? "1" : "0");
    } catch {}
  }, [ttsEnabled]);

  // Auto-fala a última resposta do assistente quando termina (evento "done")
  const lastSpokenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ttsEnabled) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (last.toolCall) return;
    if (lastSpokenIdRef.current === last.id) return;
    // Fala só quando busy=false (já terminou) e conteúdo > 0
    if (busy) return;
    const text = last.content?.trim();
    if (!text) return;
    lastSpokenIdRef.current = last.id;
    try {
      const u = (window as any).speechSynthesis;
      if (!u) return;
      u.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "pt-BR";
      utter.rate = 1.05;
      utter.pitch = 1.0;
      u.speak(utter);
    } catch {}
  }, [messages, busy, ttsEnabled]);

  // Drag & drop
  useEffect(() => {
    function onDragOver(e: DragEvent) {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        setDragOver(true);
      }
    }
    function onDragLeave(e: DragEvent) {
      if (e.relatedTarget === null) setDragOver(false);
    }
    function onDrop(e: DragEvent) {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      const items = files.map((f) => {
        const p = window.kairosPath?.fromFile(f) ?? "";
        return { name: f.name, size: f.size, path: p };
      }).filter((f) => f.path);
      if (items.length === 0) return;
      setPendingAttachments((prev) => [...prev, ...items]);
    }
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // Init
  useEffect(() => {
    void (async () => {
      // Sprint 1.20: checa se precisa onboarding (sem chave API configurada)
      const status = await window.kairos!.getProviderStatus();
      if (status.isFirstLaunch) {
        setNeedsOnboarding(true);
        return; // Espera o Onboarding terminar
      }
      setNeedsOnboarding(false);
      const p = status.provider;
      setProviderState(p);
      // Pega versão real do app (do package.json no app.asar)
      try {
        const v = await window.kairos!.update.getVersion();
        setAppVersion(v.version);
      } catch {}
      const convs = await window.kairos!.conversations.list();
      setConversations(convs);
      let currentConv = convs[0];
      if (!currentConv) {
        currentConv = await window.kairos!.conversations.create("Nova conversa");
        setConversations([currentConv]);
      }
      setSessionId(currentConv.id);
      const session = await window.kairos!.start(currentConv.id);
      setToolCount(session.toolCount);
      const data = await window.kairos!.conversations.get(currentConv.id);
      if (data) {
        setMessages(
          data.messages.map((m: DbMessage) => ({
            id: m.id,
            role: m.role as BubbleMessage["role"],
            content: m.content,
            toolName: m.toolName ?? undefined,
            attachments: m.attachments ? (JSON.parse(m.attachments) as { name: string; size: number }[]) : undefined,
            ts: m.createdAt,
          }))
        );
      }
      addSystemMessage(
        `Kairós pronto. ${session.toolCount} tools. Provider: ${p.provider} / ${p.modelId}.`
      );
    })();
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe a agent events
  useEffect(() => {
    const off = window.kairos!.onAgentEvent(sessionId, (event: AgentEvent) => {
      handleAgentEvent(event);
    });
    return () => off();
  }, [sessionId]);

  // Usage / trial (Sprint 1.20+)
  useEffect(() => {
    const k = window.kairos;
    if (!k) return;
    void k.usage.get().then(setUsage);
    const off = k.usage.onUpdate(setUsage);
    return off;
  }, []);

  // Auto-update listeners (Sprint 1.20)
  useEffect(() => {
    const k = window.kairos;
    if (!k) return;
    const offAvail = k.update.onAvailable((info: { version: string; releaseDate?: string }) => {
      setUpdateState({ phase: "available", version: info.version });
    });
    const offProg = k.update.onProgress((p: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => {
      setUpdateState({
        phase: "downloading",
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
        bytesPerSecond: p.bytesPerSecond,
      });
    });
    const offDown = k.update.onDownloaded((info: { version: string; releaseDate?: string }) => {
      setUpdateState({ phase: "downloaded", version: info.version });
    });
    const offStatus = k.update.onStatus((s: { phase: string; message?: string; current?: string; percent?: number }) => {
      if (s.phase === "error" && s.message) {
        setUpdateState({ phase: "error", message: s.message });
      }
    });
    return () => {
      offAvail();
      offProg();
      offDown();
      offStatus();
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function addSystemMessage(content: string) {
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "system", content, ts: Date.now() },
    ]);
  }

  function handleAgentEvent(event: AgentEvent) {
    setMessages((m) => {
      const last = m[m.length - 1];
      switch (event.type) {
        case "message": {
          // Append delta to last assistant message, ou cria nova
          if (last && last.role === "assistant" && !last.toolCall) {
            const updated = [...m];
            updated[updated.length - 1] = { ...last, content: last.content + event.content };
            return updated;
          }
          return [
            ...m,
            { id: crypto.randomUUID(), role: "assistant", content: event.content, ts: Date.now() },
          ];
        }
        case "tool:call": {
          const call: ToolCall = {
            name: event.tool,
            args: event.input,
            pending: true,
          };
          return [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "tool",
              content: `🔧 ${event.tool}`,
              toolName: event.tool,
              toolCall: call,
              ts: Date.now(),
            },
          ];
        }
        case "tool:result": {
          // Atualiza a tool card anterior com o resultado
          const idx = [...m].reverse().findIndex((x) => x.role === "tool" && x.toolName === event.tool && x.toolCall?.pending);
          if (idx === -1) return m;
          const realIdx = m.length - 1 - idx;
          const updated = [...m];
          const prev = updated[realIdx];
          if (prev && prev.toolCall) {
            updated[realIdx] = {
              ...prev,
              toolCall: {
                ...prev.toolCall,
                pending: false,
                result: event.output,
                durationMs: event.durationMs,
                isError: typeof event.output === "string" && event.output.startsWith("Erro:"),
              },
            };
          }
          return updated;
        }
        case "progress":
          return m;
        case "permission:request":
          return m;
        case "done":
          setBusy(false);
          return m;
        case "error":
          setBusy(false);
          return [
            ...m,
            { id: crypto.randomUUID(), role: "system", content: `❌ ${event.message}`, ts: Date.now() },
          ];
      }
    });
  }

  async function handleNewConversation() {
    const conv = await window.kairos!.conversations.create("Nova conversa");
    setConversations((cs) => [conv, ...cs]);
    setSessionId(conv.id);
    setMessages([]);
  }

  async function handleSwitchConversation(id: string) {
    if (busy) return;
    setSessionId(id);
    const data = await window.kairos!.conversations.get(id);
    if (data) {
      setMessages(
        data.messages.map((m: DbMessage) => ({
          id: m.id,
          role: m.role as BubbleMessage["role"],
          content: m.content,
          toolName: m.toolName ?? undefined,
          attachments: m.attachments ? (JSON.parse(m.attachments) as { name: string; size: number }[]) : undefined,
          ts: m.createdAt,
        }))
      );
    }
  }

  async function handleDeleteConversation(id: string) {
    if (!window.confirm("Excluir esta conversa?")) return;
    await window.kairos!.conversations.delete(id);
    setConversations((cs) => cs.filter((c) => c.id !== id));
    if (id === sessionId && conversations.length > 1) {
      const next = conversations.find((c) => c.id !== id);
      if (next) await handleSwitchConversation(next.id);
    }
  }

  async function handleAttach() {
    if (busy) return;
    const result = await window.kairos!.openFileDialog();
    if (result.canceled) return;
    setPendingAttachments((prev) => [...prev, ...result.files]);
  }

  async function handleAttachFolder() {
    if (busy) return;
    const result = await window.kairos!.openFolderDialog();
    if (result.canceled) return;
    // Anexa o caminho da pasta como attachment (o LLM usa files:ingest_folder depois)
    setPendingAttachments((prev) => [
      ...prev,
      { name: "📁 " + result.folder.name, size: 0, path: result.folder.path },
    ]);
    // Mensagem automática no input pra LLM saber o que fazer
    setDraft((d) => d ? `${d}\n` : "Analise esta pasta: ");
  }

  /** Drag-and-drop handler — converte Files (de drop) em paths via webUtils */
  async function handleDroppedPaths(paths: string[]) {
    if (busy || paths.length === 0) return;
    const items = paths.map((p) => ({
      name: p.split(/[\\/]/).pop() || p,
      size: 0,
      path: p,
    }));
    setPendingAttachments((prev) => [...prev, ...items]);
  }

  async function handleAttachFromWorkspace(item: { name: string; size: number; path: string }) {
    if (busy) return;
    // Converte path relativo do workspace pra path absoluto
    const { root } = await window.kairos!.workspace.root();
    const absPath = `${root}/${item.path}`.replace(/\/+/g, "/").replace(/^\//, "");
    // Normaliza separador pra SO nativo
    const normalized = absPath.replace(/\//g, "\\");
    setPendingAttachments((prev) => [
      ...prev,
      { name: item.name, size: item.size, path: normalized },
    ]);
  }

  function removePendingAttachment(idx: number) {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSend() {
    const text = draft.trim();
    if ((!text && pendingAttachments.length === 0) || busy) return;
    setDraft("");
    setBusy(true);

    let attachments: Attachment[] = [];
    if (pendingAttachments.length > 0) {
      try {
        attachments = await window.kairos!.attach(pendingAttachments.map((a) => a.path));
      } catch (err) {
        addSystemMessage(`Erro lendo anexos: ${err instanceof Error ? err.message : String(err)}`);
        setBusy(false);
        return;
      }
    }

    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: text || "(anexo)",
        attachments: pendingAttachments.map((a) => ({ name: a.name, size: a.size })),
        ts: Date.now(),
      },
    ]);
    setPendingAttachments([]);

    try {
      await window.kairos!.send(sessionId, text, attachments);
      const convs = await window.kairos!.conversations.list();
      setConversations(convs);
    } catch (err) {
      addSystemMessage(`Erro: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  async function handleStop() {
    await window.kairos!.stop(sessionId);
  }

  function buildMarkdownExport(): string {
    const head = `# ${conversations.find((c) => c.id === sessionId)?.title ?? "Conversa"}\n\n_${new Date().toLocaleString("pt-BR")}_\n\n`;
    const body = messages
      .filter((m) => m.role !== "tool" && m.role !== "system")
      .map((m) => {
        const tag = m.role === "user" ? "**Você**" : "**Kairós**";
        const atts = m.attachments?.length
          ? `\n*[anexos: ${m.attachments.map((a) => a.name).join(", ")}]*`
          : "";
        return `${tag} (${new Date(m.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}):\n\n${m.content}${atts}\n`;
      })
      .join("\n---\n\n");
    return head + body;
  }

  async function handleExportConversation() {
    const md = buildMarkdownExport();
    const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    const defaultName = `conversa-${ts}.md`;
    // Salva direto no workspace (sem prompt — rápido)
    try {
      await window.kairos!.workspace.writeText(`/exports/${defaultName}`, md);
      addSystemMessage(`📥 Conversa exportada para workspace:exports/${defaultName}`);
    } catch (err) {
      addSystemMessage(`Erro exportando: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleSaveAsNote(m: BubbleMessage) {
    if (m.role === "tool" || m.role === "system") return;
    const ts = new Date(m.ts).toISOString().slice(0, 16).replace(/[T:]/g, "-");
    const safeName = (m.content.slice(0, 30).replace(/[\\/:*?"<>|]/g, "").trim() || "nota").slice(0, 30);
    const fname = `${safeName}-${ts}.md`;
    const md = `# ${safeName}\n\n_${new Date(m.ts).toLocaleString("pt-BR")}_\n\n${m.content}\n`;
    try {
      await window.kairos!.workspace.writeText(`/notes/${fname}`, md);
      addSystemMessage(`💾 Nota salva em workspace:notes/${fname}`);
    } catch (err) {
      addSystemMessage(`Erro salvando nota: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleProviderChange(next: ProviderConfig) {
    await window.kairos!.setProvider(next);
    setProviderState(next);
  }

  // Chamado pelo Onboarding quando termina. Salva config, atualiza estado, força re-init.
  async function handleOnboardingComplete(next: ProviderConfig) {
    await handleProviderChange(next);
    setNeedsOnboarding(false);
    // Re-dispara init: pega conversas, inicia sessão
    void (async () => {
      const convs = await window.kairos!.conversations.list();
      setConversations(convs);
      let currentConv = convs[0];
      if (!currentConv) {
        currentConv = await window.kairos!.conversations.create("Nova conversa");
        setConversations([currentConv]);
      }
      setSessionId(currentConv.id);
      const session = await window.kairos!.start(currentConv.id);
      setToolCount(session.toolCount);
      addSystemMessage(
        `Kairós pronto. ${session.toolCount} tools. Provider: ${next.provider} / ${next.modelId}.`
      );
    })();
  }

  // Onboarding: primeira tela se não tem chave
  if (needsOnboarding === null) {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-500">Carregando…</div>;
  }
  if (needsOnboarding === true) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="relative flex w-72 flex-col border-r border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold text-sm shadow-md">K</div>
            <h1 className="text-sm font-semibold">Kairós</h1>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-900/40">
            <button
              type="button"
              onClick={() => setSidebarTab("conversations")}
              className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
                sidebarTab === "conversations"
                  ? "border-b-2 border-emerald-500 text-emerald-300"
                  : "border-b-2 border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              💬 Conversas
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab("workspace")}
              className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
                sidebarTab === "workspace"
                  ? "border-b-2 border-emerald-500 text-emerald-300"
                  : "border-b-2 border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              📁 Workspace
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab("agenda")}
              className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
                sidebarTab === "agenda"
                  ? "border-b-2 border-emerald-500 text-emerald-300"
                  : "border-b-2 border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              📅 Agenda
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab("finance")}
              className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
                sidebarTab === "finance"
                  ? "border-b-2 border-emerald-500 text-emerald-300"
                  : "border-b-2 border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              💸 Finanç.
            </button>
          </div>

          {sidebarTab === "conversations" ? (
            <>
              <div className="border-b border-slate-800 px-3 py-2">
                <button
                  type="button"
                  onClick={handleNewConversation}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  + Nova conversa
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {conversations.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 italic">Nenhuma conversa</p>
                ) : (
                  conversations.map((c) => (
                    <div
                      key={c.id}
                      className={`group flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors ${
                        c.id === sessionId
                          ? "bg-slate-800/80 border-l-2 border-emerald-500"
                          : "hover:bg-slate-900 border-l-2 border-transparent"
                      }`}
                      onClick={() => void handleSwitchConversation(c.id)}
                    >
                      <div className="flex-1 truncate">
                        <p className="truncate text-slate-200">{c.title ?? "Sem título"}</p>
                        <p className="text-[10px] text-slate-500">
                          {new Date(c.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteConversation(c.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity text-sm"
                        aria-label="Excluir"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-slate-800 px-3 py-2 text-[10px] text-slate-600">
                <p>{toolCount} tools · v{appVersion}</p>
              </div>
            </>
          ) : sidebarTab === "workspace" ? (
            <WorkspacePanel
              onOpenFile={(relPath, content, name) => {
                const msg = `Lendo o arquivo "${name}" (workspace:${relPath}):\n\n\`\`\`\n${content}\n\`\`\``;
                setDraft(msg);
                setSidebarTab("conversations");
                // foca o input — hack leve
                setTimeout(() => {
                  const ta = document.querySelector<HTMLTextAreaElement>("textarea");
                  ta?.focus();
                }, 50);
              }}
            />
          ) : sidebarTab === "agenda" ? (
            <SidebarPromptsPanel
              title="Agenda"
              icon="📅"
              accent="emerald"
              intro="Compromissos com data/hora. Fale naturalmente — ele converte pra ISO."
              prompts={[
                { icon: "📋", label: "O que tenho pra hoje?", prompt: "O que tenho na agenda pra hoje?" },
                { icon: "🔜", label: "Próximos 7 dias", prompt: "Liste meus próximos compromissos da semana" },
                { icon: "✅", label: "Marcar concluído", prompt: "Marque como concluído o compromisso mais recente" },
                { icon: "➕", label: "Adicionar", prompt: "Adicione um compromisso novo: " },
                { icon: "📆", label: "Tudo pendente", prompt: "Liste todos os meus compromissos pendentes" },
              ]}
              onPick={(p) => {
                setDraft(p);
                setSidebarTab("conversations");
                setTimeout(() => {
                  const ta = document.querySelector<HTMLTextAreaElement>("textarea");
                  ta?.focus();
                }, 50);
              }}
            />
          ) : (
            <SidebarPromptsPanel
              title="Finanças"
              icon="💸"
              accent="amber"
              intro="Despesas, faturas e P&L. Persistente local em SQLite."
              prompts={[
                { icon: "📊", label: "Quanto gastei esse mês?", prompt: "Quanto gastei esse mês?" },
                { icon: "🗂️", label: "Por categoria", prompt: "Mostre o total de despesas por categoria esse mês" },
                { icon: "📈", label: "Lucro do mês", prompt: "Qual meu lucro esse mês?" },
                { icon: "⏰", label: "Faturas vencidas", prompt: "Liste as faturas vencidas" },
                { icon: "💰", label: "A receber", prompt: "Quanto tenho a receber?" },
              ]}
              onPick={(p) => {
                setDraft(p);
                setSidebarTab("conversations");
                setTimeout(() => {
                  const ta = document.querySelector<HTMLTextAreaElement>("textarea");
                  ta?.focus();
                }, 50);
              }}
            />
          )}
        </aside>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
            {provider && (
              <>
                <div className={`h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br ${providerColor(provider.provider)} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
                  {provider.provider === "ollama" ? "🦙" : provider.provider[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {provider.modelId}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {provider.provider} · {toolCount} tools
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleExportConversation}
              disabled={messages.length === 0}
              className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40 transition-colors"
              aria-label="Exportar conversa como .md"
              title="Exportar conversa como .md"
            >
              📥
            </button>
            <button
              type="button"
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={`rounded-md p-2 transition-colors ${
                ttsEnabled ? "bg-emerald-700/40 text-emerald-300" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`}
              aria-label="Alternar voz (TTS)"
              title={ttsEnabled ? "Voz ligada (clique p/desligar)" : "Voz desligada (clique p/ligar)"}
            >
              {ttsEnabled ? "🔊" : "🔈"}
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              aria-label="Alternar tema"
              title={theme === "dark" ? "Tema escuro (clique p/claro)" : "Tema claro (clique p/escuro)"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`rounded-md p-2 transition-colors ${
                showSettings ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`}
              aria-label="Configurações"
            >
              ⚙️
            </button>
          </div>
        </header>

        {/* Update banner (Sprint 1.20) — aparece quando há update available/downloading/downloaded */}
        {updateState.phase === "available" && (
          <div className="border-b border-blue-800/40 bg-blue-950/40 px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-blue-200">
              <span>🆕</span>
              <span>
                Versão <strong>v{updateState.version}</strong> disponível
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await window.kairos!.update.download();
                }}
                className="rounded-md bg-blue-600 hover:bg-blue-500 px-3 py-1 text-xs font-semibold text-white"
              >
                Baixar agora
              </button>
              <button
                type="button"
                onClick={() => setUpdateState({ phase: "idle" })}
                className="rounded-md px-2 py-1 text-xs text-blue-300 hover:bg-blue-900/30"
                aria-label="Dispensar"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {updateState.phase === "downloading" && (
          <div className="border-b border-blue-800/40 bg-blue-950/40 px-4 py-2">
            <div className="flex items-center justify-between text-xs text-blue-200 mb-1">
              <span>⏬ Baixando atualização…</span>
              <span>
                {updateState.percent.toFixed(0)}% · {formatSize(updateState.transferred)} / {formatSize(updateState.total)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-blue-950">
              <div
                className="h-full bg-blue-400 transition-all"
                style={{ width: `${Math.min(100, updateState.percent)}%` }}
              />
            </div>
          </div>
        )}
        {updateState.phase === "downloaded" && (
          <div className="border-b border-emerald-800/40 bg-emerald-950/40 px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-emerald-200">
              <span>✅</span>
              <span>
                v{updateState.version} baixada — reinicie para aplicar
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await window.kairos!.update.install();
                }}
                className="rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-xs font-semibold text-white"
              >
                Reiniciar agora
              </button>
              <button
                type="button"
                onClick={() => setUpdateState({ phase: "idle" })}
                className="rounded-md px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30"
                aria-label="Depois"
                title="Será instalado quando fechar o app"
              >
                Depois
              </button>
            </div>
          </div>
        )}
        {updateState.phase === "error" && (
          <div className="border-b border-amber-800/40 bg-amber-950/40 px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-amber-200">
              <span>⚠️</span>
              <span>Erro ao atualizar: {updateState.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setUpdateState({ phase: "idle" })}
              className="rounded-md px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/30"
            >
              ✕
            </button>
          </div>
        )}

        {/* Trial banner (Sprint 1.20+) — mostra uso restante */}
        {usage && !usage.blocked && usage.remaining <= 5 && (
          <div className="border-b border-amber-800/40 bg-amber-950/40 px-4 py-1.5 text-center text-[11px] text-amber-200">
            ⏳ Você tem <strong>{usage.remaining}</strong> mensagem{usage.remaining !== 1 ? "s" : ""} grátis restante{usage.remaining !== 1 ? "s" : ""}.
            Após isso, renove sua licença.
          </div>
        )}
        {usage && usage.blocked && (
          <div className="border-b border-red-800/40 bg-red-950/40 px-4 py-2 text-center text-sm text-red-200">
            🛑 Trial acabou. Entre em contato para renovar a licença.
          </div>
        )}

        {/* Settings Panel — v0.4+: BYOK toggle, nada de campos confusos */}
        {showSettings && provider && (
          <SettingsPanel
            provider={provider}
            onProviderChange={async (next) => {
              await handleProviderChange(next);
            }}
            onClose={() => setShowSettings(false)}
            onListModels={handleListModels}
            onListOllama={handleListOllama}
            ollamaModels={ollamaModels}
            ollamaLoading={ollamaLoading}
            modelCatalog={modelCatalog}
            modelCatalogLoading={modelCatalogLoading}
            modelCatalogError={modelCatalogError}
            onPickModel={handlePickModel}
          />
        )}

        {/* Conversation */}
        <main className="relative flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState toolCount={toolCount} onPick={(p) => setDraft(p)} />
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-6">
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} onSaveAsNote={handleSaveAsNote} />
              ))}
              {busy && messages[messages.length - 1]?.role !== "assistant" && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-emerald-500/10 backdrop-blur-sm border-2 border-dashed border-emerald-500 m-4 rounded-2xl">
              <div className="rounded-xl bg-slate-900 px-6 py-3 text-center shadow-2xl">
                <p className="text-3xl">📎</p>
                <p className="mt-1 text-sm font-semibold text-emerald-300">Solte os arquivos aqui</p>
                <p className="text-[10px] text-slate-400">vão ser anexados ao chat</p>
              </div>
            </div>
          )}
        </main>

        {/* Pending attachments */}
        {pendingAttachments.length > 0 && (
          <div className="border-t border-slate-800 bg-slate-950/80 px-4 py-2 backdrop-blur">
            <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
              {pendingAttachments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-xs"
                >
                  <span>📎 {a.name}</span>
                  <span className="text-slate-500">({formatSize(a.size)})</span>
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(i)}
                    className="text-slate-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <InputBar
          value={draft}
          onChange={setDraft}
          onSend={() => void handleSend()}
          onStop={() => void handleStop()}
          busy={busy}
          disabled={usage?.blocked}
          onAttach={() => void handleAttach()}
          onAttachFolder={() => void handleAttachFolder()}
          onAttachWorkspace={() => setShowWorkspacePicker(true)}
          onDropPaths={(paths) => void handleDroppedPaths(paths)}
          voiceProps={{
            onTranscript: (text) => setDraft(text),
            onAutoSend: (text) => {
              setDraft(text);
              setTimeout(() => void handleSend(), 50);
            },
          }}
          usage={usage}
        />
      </div>

      {/* Workspace picker modal */}
      {showWorkspacePicker && (
        <WorkspacePicker
          onAttach={(item) => void handleAttachFromWorkspace(item)}
          onClose={() => setShowWorkspacePicker(false)}
        />
      )}

      {/* Model catalog modal (Sprint 1.20) — escolhe modelo do provider */}
      {showModelModal && provider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Modelos do {provider.provider}
                </h3>
                <p className="text-[10px] text-slate-500">
                  {modelCatalogLoading
                    ? "Buscando..."
                    : `${modelCatalog.length} modelos • clique pra selecionar`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModelModal(false)}
                className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="border-b border-slate-800 px-4 py-2">
              <input
                type="text"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="🔍 Filtrar por nome (ex: llama, gpt, gemma, free...)"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {modelCatalogLoading && (
                <p className="py-8 text-center text-sm text-slate-500">Carregando modelos...</p>
              )}
              {modelCatalogError && !modelCatalogLoading && (
                <div className="rounded-md border border-amber-700/40 bg-amber-950/40 p-3 text-xs text-amber-200">
                  ⚠️ {modelCatalogError}
                  {modelCatalog.length === 0 && (
                    <p className="mt-1 text-amber-300/80">
                      Dica: confira se a API Key está correta e se o provider está online.
                    </p>
                  )}
                </div>
              )}
              {!modelCatalogLoading &&
                (() => {
                  const filtered = modelCatalog.filter(
                    (m) =>
                      m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
                      m.name.toLowerCase().includes(modelSearch.toLowerCase())
                  );
                  if (filtered.length === 0 && modelCatalog.length > 0) {
                    return (
                      <p className="py-8 text-center text-sm text-slate-500">
                        Nenhum modelo combina com "{modelSearch}"
                      </p>
                    );
                  }
                  return (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {filtered.map((m) => {
                        const selected = provider.modelId === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handlePickModel(m.id)}
                            className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                              selected
                                ? "border-emerald-500 bg-emerald-900/30"
                                : "border-slate-700 bg-slate-800 hover:border-slate-500 hover:bg-slate-750"
                            }`}
                          >
                            <div className="flex w-full items-center justify-between gap-2">
                              <span className="truncate font-mono text-xs text-slate-200">
                                {m.id}
                              </span>
                              {m.tier === "free" && (
                                <span className="rounded-full bg-emerald-900/40 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                                  FREE
                                </span>
                              )}
                            </div>
                            {m.name !== m.id && (
                              <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">
                                {m.name}
                              </p>
                            )}
                            {m.context && (
                              <p className="mt-1 text-[10px] text-slate-500">
                                ctx {(m.context / 1000).toFixed(0)}k
                              </p>
                            )}
                            {m.description && (
                              <p className="mt-1 line-clamp-2 text-[10px] text-slate-500">
                                {m.description}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
