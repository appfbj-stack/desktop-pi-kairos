"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, setToken, type Client } from "@/lib/auth";

interface Msg { id: string; role: "user" | "assistant"; content: string; status?: string; }
interface Conv { id: string; title: string; updatedAt: string; }

export default function ChatPage() {
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [conv, setConv] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api<{ client: Client }>("/api/pwa/auth/me").then((r) => setClient(r.client)).catch(() => {
      setToken(null); router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function ensureConv() {
    if (conv) return conv;
    const r = await api<{ conversation: Conv }>("/api/pwa/conversations", { method: "POST", body: "{}" });
    setConv(r.conversation);
    return r.conversation;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput("");
    setError(null);
    const c = await ensureConv();
    const tempUser: Msg = { id: "tmp-" + Date.now(), role: "user", content: text };
    const tempAssistant: Msg = { id: "tmp-a-" + Date.now(), role: "assistant", content: "", status: "pending" };
    setMessages((m) => [...m, tempUser, tempAssistant]);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch(`/api/pwa/conversations/${c.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ content: text }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        const t = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${t.slice(0, 200)}`);
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let accum = "";
      let assistantId = tempAssistant.id;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            try {
              const json = JSON.parse(data);
              if (json.delta) {
                accum += json.delta;
                setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: accum, status: "streaming" } : x)));
              }
            } catch {}
          }
        }
      }
      setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, status: "done" } : x)));
    } catch (err: any) {
      if (err?.name !== "AbortError") setError(err?.message || "Erro");
      setMessages((m) => m.map((x) => (x.role === "assistant" && x.status === "pending" ? { ...x, content: x.content || "(erro)", status: "error" } : x)));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function logout() {
    api("/api/pwa/auth/logout", { method: "POST" }).finally(() => {
      setToken(null);
      router.replace("/login");
    });
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-kairos-deep text-kairos-neon flex items-center justify-center font-bold">K</div>
          <div>
            <h1 className="text-sm font-semibold text-kairos-deep">Kairós</h1>
            <p className="text-[10px] text-slate-500">{client?.email || "..."}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {client && (
            <span className="text-slate-500">
              {client.tokensUsed.toLocaleString("pt-BR")} / {client.tokensLimit.toLocaleString("pt-BR")} tokens
            </span>
          )}
          <Link href="/history" className="text-kairos-bright hover:underline">Historico</Link>
          <button onClick={logout} className="text-slate-400 hover:text-red-500">Sair</button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 max-w-2xl w-full mx-auto space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 text-sm mt-20">
            <p className="text-lg font-semibold text-kairos-deep mb-2">Ola, eu sou o Kairos</p>
            <p>Pergunte o que quiser. Posso ajudar com textos, planilhas, pesquisa, analise, organizacao e muito mais.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                m.role === "user"
                  ? "bg-kairos-bright text-white rounded-br-sm"
                  : m.status === "error"
                    ? "bg-red-50 text-red-700 border border-red-200 rounded-bl-sm"
                    : "bg-white text-kairos-ink border border-slate-200 rounded-bl-sm shadow-sm"
              }`}
            >
              {m.content || (m.status === "pending" ? "..." : "")}
            </div>
          </div>
        ))}
        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded">
            {error}
            {error.includes("LLM_API_KEY") && <p className="text-xs mt-1 text-red-500">A API de IA ainda nao foi configurada pelo administrador.</p>}
          </div>
        )}
      </div>

      <form onSubmit={send} className="border-t border-slate-200 bg-white px-3 py-3 flex gap-2 max-w-2xl w-full mx-auto">
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte algo ao Kairos..." disabled={streaming}
          className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-kairos-bright"
        />
        <button
          type="submit" disabled={streaming || !input.trim()}
          className="px-4 py-2.5 bg-kairos-bright text-white rounded-xl font-semibold disabled:opacity-50"
        >
          {streaming ? "..." : "Enviar"}
        </button>
      </form>
    </main>
  );
}
