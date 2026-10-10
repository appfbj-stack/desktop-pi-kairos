/**
 * Input do chat — estilo ChatGPT.
 *
 * Caracteristicas:
 *   - Container unico arredondado (pill) com bg sutil, integra com o fundo
 *   - Botao de anexar (📎) colapsado a esquerda dentro do container
 *   - Textarea auto-grow no meio
 *   - Botao de voz (🎤) e enviar (➤) a direita dentro do container
 *   - Sem hint visivel por padrao (estilo ChatGPT)
 *   - Focus ring discreto emerald quando focado
 *   - Borda suave ate focado
 */

import { useEffect, useRef } from "react";
import { VoiceButton } from "./VoiceButton";

export function InputBar({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  onAttach,
  onAttachWorkspace,
  voiceProps,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  onAttach?: () => void;
  onAttachWorkspace?: () => void;
  voiceProps?: {
    onTranscript: (text: string, isFinal: boolean) => void;
    onAutoSend: (text: string) => void;
  };
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize (1 a 6 linhas)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      const lineHeight = 24;
      const maxLines = 6;
      const next = Math.min(ref.current.scrollHeight, lineHeight * maxLines + 16);
      ref.current.style.height = next + "px";
    }
  }, [value]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy && value.trim()) onSend();
    }
  }

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="px-4 pb-4 pt-2 bg-gradient-to-t from-slate-900 via-slate-900 to-transparent">
      <div
        className={`mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border bg-slate-800/80 px-3 py-2 shadow-lg backdrop-blur transition-colors ${
          disabled
            ? "border-slate-700/50 opacity-50"
            : "border-slate-700 focus-within:border-slate-500"
        }`}
      >
        {/* Botoes de anexar a esquerda (compacto) */}
        <div className="flex items-center gap-0.5 pb-0.5">
          {onAttach && (
            <button
              type="button"
              onClick={onAttach}
              disabled={busy}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-40 transition-colors"
              title="Anexar arquivo"
              aria-label="Anexar arquivo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          )}
          {onAttachWorkspace && (
            <button
              type="button"
              onClick={onAttachWorkspace}
              disabled={busy}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-40 transition-colors"
              title="Anexar do workspace"
              aria-label="Anexar do workspace"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </button>
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Pergunte alguma coisa ao Kairós"
          disabled={disabled || busy}
          rows={1}
          className="flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-slate-100 placeholder-slate-400 focus:outline-none disabled:opacity-50 max-h-40 overflow-y-auto"
          style={{ minHeight: "24px" }}
        />

        {/* Voz e enviar a direita */}
        <div className="flex items-center gap-1 pb-0.5">
          {voiceProps && (
            <VoiceButton
              onTranscript={voiceProps.onTranscript}
              onAutoSend={voiceProps.onAutoSend}
              disabled={busy}
              className="h-9 w-9"
            />
          )}
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-colors"
              title="Parar geração"
              aria-label="Parar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 transition-all hover:bg-slate-100 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
              title="Enviar (Enter)"
              aria-label="Enviar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M2.97 11.34a1 1 0 0 1 1.27-1.27l16.5 7a1 1 0 0 1 0 1.84l-16.5 7a1 1 0 0 1-1.27-1.27L4.66 13l1.74-1.66zM5 13l-1.35 5.07 11.7-4.95L5 13z" transform="translate(0.5 -1) rotate(45 12 12)" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Footer micro-hint (estilo ChatGPT) */}
      <p className="mx-auto mt-2 max-w-3xl text-[11px] text-slate-500 text-center">
        Kairós pode cometer erros. Confira informações importantes.
      </p>
    </div>
  );
}
