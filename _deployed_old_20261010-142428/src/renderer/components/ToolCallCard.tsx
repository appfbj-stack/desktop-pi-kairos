/**
 * Card de tool call / tool result.
 * Sprint 1.9: visual profissional, expansível, com status (running/done/error).
 */

import { useState } from "react";

export interface ToolCall {
  name: string;
  args?: unknown;
  result?: unknown;
  durationMs?: number;
  isError?: boolean;
  pending?: boolean;
}

export function ToolCallCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const status = call.pending ? "running" : call.isError ? "error" : "ok";

  return (
    <div className="my-1.5 rounded-lg border border-slate-700/60 bg-slate-900/60 text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800/40"
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            status === "running"
              ? "bg-amber-400 animate-pulse"
              : status === "error"
              ? "bg-red-400"
              : "bg-emerald-400"
          }`}
        />
        <span className="font-mono text-emerald-300">{call.name}</span>
        {call.durationMs !== undefined && (
          <span className="text-slate-500">· {call.durationMs}ms</span>
        )}
        <span className="ml-auto text-slate-500">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-700/40 bg-slate-950/60 p-3 space-y-2">
          {call.args !== undefined && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Argumentos
              </p>
              <pre className="overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-slate-300 font-mono">
                {safeStringify(call.args)}
              </pre>
            </div>
          )}
          {call.result !== undefined && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Resultado
              </p>
              <pre className="overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-slate-300 font-mono">
                {safeStringify(call.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
