/**
 * Typing indicator (3 dots pulsando).
 */

export function TypingIndicator() {
  return (
    <div className="flex gap-2 justify-start my-3 animate-fade-in">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
        K
      </div>
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800 px-4 py-3">
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
        </div>
      </div>
    </div>
  );
}
