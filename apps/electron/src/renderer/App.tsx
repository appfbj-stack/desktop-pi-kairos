/**
 * Kairós Desktop Alves — chat UI redesenhado.
 *
 * Sprint 1.9: visual profissional com markdown, hover actions, tool cards, empty state.
 * Sprint 1.4-1.8: provider mutavel, persistencia, permission modal, ollama, etc.
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
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"conversations" | "workspace">("conversations");
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (typeof window !== "undefined" && (localStorage.getItem("kairos:theme") as "dark" | "light")) || "dark";
  });
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    return (typeof window !== "undefined" && localStorage.getItem("kairos:tts") === "1") || false;
  });
  const [dragOver, setDragOver] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<
    { id: string; name: string; size: number; modified_at: string; family?: string; parameter_size?: string; quantization_level?: string }[]
  >([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
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
      const p = await window.kairos!.getProvider();
      setProviderState(p);
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
                <p>{toolCount} tools · v0.1.0</p>
              </div>
            </>
          ) : (
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

        {/* Settings Panel */}
        {showSettings && provider && (
          <div className="border-b border-slate-800 bg-slate-950 px-6 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">Configurações do Provider</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Provider</label>
                <select
                  value={provider.provider}
                  onChange={(e) =>
                    handleProviderChange({ ...provider, provider: e.target.value as ProviderConfig["provider"] })
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="openrouter">openrouter</option>
                  <option value="ollama">🦙 ollama (local)</option>
                  <option value="openai">openai</option>
                  <option value="anthropic">anthropic</option>
                  <option value="minimax">minimax</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Modelo</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={provider.modelId}
                    onChange={(e) => handleProviderChange({ ...provider, modelId: e.target.value })}
                    placeholder={provider.provider === "ollama" ? "ex: qwen2.5:3b" : "model ID"}
                    className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                  {provider.provider === "ollama" && (
                    <button
                      type="button"
                      onClick={handleListOllama}
                      disabled={ollamaLoading}
                      title="Listar modelos locais do Ollama"
                      className="rounded-md border border-slate-700 bg-slate-800 px-2.5 text-sm hover:bg-slate-700 disabled:opacity-50"
                    >
                      {ollamaLoading ? "..." : "🔄"}
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">API Key</label>
                <input
                  type="password"
                  value={provider.apiKey ?? ""}
                  onChange={(e) =>
                    handleProviderChange({ ...provider, apiKey: e.target.value || undefined })
                  }
                  placeholder={provider.provider === "ollama" ? "opcional" : "sk-..."}
                  disabled={provider.provider === "ollama"}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>
            {provider.provider === "ollama" && ollamaModels.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-slate-400 mb-1.5">Modelos instalados:</p>
                <div className="flex flex-wrap gap-1.5">
                  {ollamaModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleProviderChange({ ...provider, modelId: m.id })}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        provider.modelId === m.id
                          ? "border-emerald-500 bg-emerald-900/30 text-emerald-300"
                          : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                      title={`${m.parameter_size ?? ""} ${m.quantization_level ?? ""} • ${(m.size / 1e9).toFixed(1)} GB`}
                    >
                      {m.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {provider.provider === "ollama" && ollamaModels.length === 0 && !ollamaLoading && (
              <p className="mt-3 text-[11px] text-slate-500">
                Ollama não está rodando ou não tem modelos. Inicie com{" "}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-400">ollama serve</code>{" "}
                e clique 🔄.
              </p>
            )}
          </div>
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
          onAttach={() => void handleAttach()}
          onAttachWorkspace={() => setShowWorkspacePicker(true)}
          voiceProps={{
            onTranscript: (text) => setDraft(text),
            onAutoSend: (text) => {
              setDraft(text);
              setTimeout(() => void handleSend(), 50);
            },
          }}
        />
      </div>

      {/* Workspace picker modal */}
      {showWorkspacePicker && (
        <WorkspacePicker
          onAttach={(item) => void handleAttachFromWorkspace(item)}
          onClose={() => setShowWorkspacePicker(false)}
        />
      )}

    </div>
  );
}
