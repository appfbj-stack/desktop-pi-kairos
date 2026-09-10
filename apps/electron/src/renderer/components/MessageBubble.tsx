/**
 * Bubble de mensagem com hover actions.
 * Sprint 1.9: avatar, copy, regenerate, edit (futuro).
 */

import { useState } from "react";
import { Markdown } from "./Markdown";
import { ToolCallCard, type ToolCall } from "./ToolCallCard";

export interface BubbleMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolName?: string;
  attachments?: { name: string; size: number }[];
  toolCall?: ToolCall;
  ts: number;
}

export function MessageBubble({ msg }: { msg: BubbleMessage }) {
  const [copied, setCopied] = useState(false);
  const tsLabel = new Date(msg.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // System: simples, centralizado
  if (msg.role === "system") {
    return (
      <div className="flex justify-center my-2 animate-fade-in">
        <div className="rounded-full bg-slate-800/60 px-3 py-1 text-[11px] text-slate-400 italic border border-slate-700/40">
          {msg.content}
        </div>
      </div>
    );
  }

  // Tool: card expansível
  if (msg.role === "tool" && msg.toolCall) {
    return (
      <div className="flex justify-start my-1.5 animate-fade-in">
        <div className="max-w-[85%]">
          <ToolCallCard call={msg.toolCall} />
        </div>
      </div>
    );
  }

  // Tool sem toolCall (legado)
  if (msg.role === "tool") {
    return (
      <div className="flex justify-start my-1.5 animate-fade-in">
        <div className="rounded-md bg-slate-800/50 px-3 py-1 text-[11px] text-slate-500 italic border border-slate-700/30">
          {msg.content}
        </div>
      </div>
    );
  }

  const isUser = msg.role === "user";
  const avatar = isUser ? "U" : "K";
  const avatarBg = isUser ? "bg-blue-500" : "bg-emerald-500";
  const bubbleBg = isUser
    ? "bg-blue-600/90 text-white"
    : "bg-slate-800 text-slate-100 border border-slate-700/50";
  const align = isUser ? "justify-end" : "justify-start";

  function handleCopy() {
    void navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`flex gap-2 ${align} my-3 animate-fade-in`}>
      {!isUser && (
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${avatarBg} text-xs font-bold text-white shadow-sm`}>
          {avatar}
        </div>
      )}
      <div className="group relative max-w-[80%]">
        <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${bubbleBg}`}>
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5 text-[10px] opacity-80">
              {msg.attachments.map((a, i) => (
                <span key={i} className="rounded bg-black/20 px-1.5 py-0.5">
                  📎 {a.name}
                </span>
              ))}
            </div>
          )}
          {(() => {
            const MAX = 280;
            const full = msg.content || "";
            const tooLong = !isUser && full.length > MAX;
            const shown = tooLong ? full.slice(0, MAX).trimEnd() + "…" : full;
            return shown || (isUser ? "" : "...");
          })()}
          {!isUser && msg.content && (
            <div className="mt-1">
              <Markdown>{msg.content}</Markdown>
            </div>
          )}
          {isUser && msg.content}
        </div>
        {/* Hover actions */}
        <div className={`absolute -bottom-6 ${isUser ? "right-0" : "left-0"} hidden gap-1 group-hover:flex`}>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 hover:text-slate-200 border border-slate-700/50"
            title="Copiar mensagem"
          >
            {copied ? "✓ copiado" : "copiar"}
          </button>
          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500 border border-slate-700/50">
            {tsLabel}
          </span>
        </div>
      </div>
      {isUser && (
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${avatarBg} text-xs font-bold text-white shadow-sm`}>
          {avatar}
        </div>
      )}
    </div>
  );
}
