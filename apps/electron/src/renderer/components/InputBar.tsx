/**
 * Input do chat com auto-resize e atalhos.
 * Sprint 1.9: textarea auto-grow, Enter envia, Shift+Enter quebra linha.
 */

import { useEffect, useRef } from "react";

export function InputBar({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  onAttach,
  onAttachWorkspace,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  onAttach?: () => void;
  onAttachWorkspace?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + "px";
    }
  }, [value]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy && value.trim()) onSend();
    }
  }

  return (
    <div className="border-t border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        {onAttach && (
          <button
            type="button"
            onClick={onAttach}
            disabled={busy}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-40 transition-colors"
            title="Anexar arquivo do disco"
          >
            📎
          </button>
        )}
        {onAttachWorkspace && (
          <button
            type="button"
            onClick={onAttachWorkspace}
            disabled={busy}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-40 transition-colors"
            title="Anexar arquivo do workspace"
          >
            📂
          </button>
        )}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Pergunte ao Kairós ou peça uma tarefa…"
          disabled={disabled || busy}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white hover:bg-red-500 shadow-sm"
            title="Parar geração"
          >
            ⏹
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!value.trim() || disabled}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm font-bold"
            title="Enviar (Enter)"
          >
            ➤
          </button>
        )}
      </div>
      <p className="mx-auto mt-1.5 max-w-3xl text-[10px] text-slate-600 text-center">
        Enter envia · Shift+Enter quebra linha · O Kairós pode executar tarefas no seu computador
      </p>
    </div>
  );
}
