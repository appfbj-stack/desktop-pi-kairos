/**
 * Input do chat — estilo ChatGPT polido.
 *
 * v0.4+: melhorias de UX
 *   - Placeholder PT-BR convidativo e dinâmico (gira a cada 6s com dicas rápidas)
 *   - Atalho Cmd/Ctrl+K foca o input de qualquer lugar
 *   - Atalho Esc limpa o input se focado
 *   - Contador discreto aparece quando > 200 chars
 *   - Footer hint com tokens restantes (se usage disponível) + atalhos keyboard
 *   - Glow verde sutil quando focado (focus-within)
 *   - Border radius mais exagerado (rounded-3xl)
 *
 * Sprint 1.x original: container arredondado unico, anexar a esquerda,
 * textarea meio, voz/enviar a direita.
 */

import { useEffect, useRef, useState } from "react";
import { VoiceButton } from "./VoiceButton";

const ROTATING_HINTS = [
  "Pergunte, peça, planeje, crie…",
  "Me peça pra ler um arquivo e resumir",
  "Converse em linguagem natural",
  "Anexe PDF, planilha ou print e me diga o que fazer",
  "Posso automatizar planilhas, gerar PDF, criar scripts…",
];

export function InputBar({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  onAttach,
  onAttachFolder,
  onAttachWorkspace,
  onDropPaths,
  voiceProps,
  usage,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  onAttach?: () => void;
  onAttachFolder?: () => void;
  onAttachWorkspace?: () => void;
  onDropPaths?: (paths: string[]) => void;
  voiceProps?: {
    onTranscript: (text: string, isFinal: boolean) => void;
    onAutoSend: (text: string) => void;
  };
  usage?: { used: number; limit: number; remaining: number } | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const hintIdxRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);

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

  // Rotation do placeholder
  useEffect(() => {
    if (value) return; // para de girar quando tem texto
    const interval = setInterval(() => {
      hintIdxRef.current = (hintIdxRef.current + 1) % ROTATING_HINTS.length;
    }, 6000);
    return () => clearInterval(interval);
  }, [value]);

  // Global Cmd/Ctrl+K to focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      // Cmd+K (mac) ou Ctrl+K (win/linux)
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
      // Esc quando focado → limpa
      if (k === "escape" && document.activeElement === ref.current) {
        onChange("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy && value.trim()) onSend();
    }
  }

  const canSend = value.trim().length > 0 && !disabled;
  const charCount = value.length;
  const showCount = charCount > 200;

  // === Drag-and-drop de arquivos/pastas ===
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !busy) setDragOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled || busy || !onDropPaths) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    // Pega path absoluto via webUtils (Electron 30+)
    const paths: string[] = [];
    for (const f of files) {
      try {
        const p = (window as any).kairos?.getPathForFile?.(f);
        if (p) paths.push(p);
      } catch {
        // ignora
      }
    }
    if (paths.length > 0) onDropPaths(paths);
  }

  return (
    <div className="px-4 pb-4 pt-2 bg-gradient-to-t from-slate-900 via-slate-900 to-transparent">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border bg-slate-800/80 px-3 py-2 shadow-lg backdrop-blur transition-all duration-150 ${
          dragOver
            ? "border-emerald-500 ring-2 ring-emerald-500/40 bg-slate-800"
            : disabled
              ? "border-slate-700/50 opacity-50"
              : busy
                ? "border-slate-700"
                : "border-slate-700 shadow-emerald-900/0 focus-within:border-emerald-500/60 focus-within:shadow-emerald-900/20 focus-within:shadow-xl"
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
          {onAttachFolder && (
            <button
              type="button"
              onClick={onAttachFolder}
              disabled={busy}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-40 transition-colors"
              title="Anexar pasta inteira"
              aria-label="Anexar pasta"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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
          placeholder={ROTATING_HINTS[hintIdxRef.current]}
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
          {showCount && (
            <span className="text-[10px] tabular-nums text-slate-500 pr-1">
              {charCount.toLocaleString("pt-BR")}
            </span>
          )}
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors shadow-md"
              title="Parar geração (Esc)"
              aria-label="Parar"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white transition-all hover:from-emerald-400 hover:to-emerald-500 hover:shadow-md hover:shadow-emerald-900/40 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
              title="Enviar (Enter)"
              aria-label="Enviar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Footer com tokens restantes + atalhos */}
      <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between text-[10px] text-slate-500">
        <p>
          <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
            Ctrl+K
          </kbd>{" "}
          focar ·{" "}
          <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
            Esc
          </kbd>{" "}
          limpar
        </p>
        {usage && !disabled && (
          <p>
            ⏳ {usage.remaining} de {usage.limit} restantes
          </p>
        )}
        {!usage && !disabled && (
          <p>Kairós pode cometer erros. Confira informações importantes.</p>
        )}
      </div>
    </div>
  );
}
