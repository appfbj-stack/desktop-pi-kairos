/**
 * WorkspacePicker — modal pra anexar arquivo do workspace direto ao chat.
 *
 * Click em pasta = navega. Click em arquivo de texto = anexa como pending
 * attachment (que aparece antes do input e é enviado junto).
 */

import { useEffect, useRef, useState } from "react";

interface WorkspaceItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
}

interface WorkspacePickerProps {
  onAttach: (item: { name: string; size: number; path: string }) => void;
  onClose: () => void;
}

function basename(p: string): string {
  if (!p || p === "/") return "";
  const idx = p.lastIndexOf("/");
  return idx === -1 ? p : p.slice(idx + 1);
}

function parentPath(p: string): string {
  if (!p || p === "/") return "/";
  const idx = p.lastIndexOf("/");
  if (idx <= 0) return "/";
  return p.slice(0, idx);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fileEmoji(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["md", "txt", "log"].includes(ext)) return "📝";
  if (["csv", "tsv", "xlsx", "xls"].includes(ext)) return "📊";
  if (["json", "yaml", "yml", "xml"].includes(ext)) return "⚙️";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "🖼️";
  if (["html", "css", "js", "ts"].includes(ext)) return "💻";
  return "📄";
}

const TEXT_EXT = new Set([
  "txt", "md", "csv", "tsv", "json", "xml", "yaml", "yml",
  "log", "ini", "conf", "env", "html", "htm", "css", "js", "ts",
]);

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export function WorkspacePicker({ onAttach, onClose }: WorkspacePickerProps) {
  const [current, setCurrent] = useState("/");
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh(p: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await window.kairos!.workspace.list(p);
      setCurrent(res.current);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh("/");
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleOpen(it: WorkspaceItem) {
    if (it.isDir) {
      await refresh(it.path);
      return;
    }
    const ext = it.name.split(".").pop()?.toLowerCase() ?? "";
    if (!TEXT_EXT.has(ext) && !IMAGE_EXT.has(ext)) {
      setError(`Tipo .${ext} não pode ser anexado. Use o chat pra analisar.`);
      return;
    }
    // Para arquivos de texto, lê o tamanho real antes de anexar (pra mostrar no pending)
    // O attach via IPC lê o arquivo e retorna o conteúdo. Aqui só mandamos o path pro handler
    // do agent que já cuida do resto. Mas queremos size ANTES — lemos stat.
    let size = it.size;
    try {
      const txt = await window.kairos!.workspace.readText(it.path);
      size = txt.size;
    } catch {
      // imagem ou erro — usa o stat
    }
    onAttach({ name: it.name, size, path: it.path });
    onClose();
  }

  const segments = current === "/" ? [] : current.split("/").filter(Boolean);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex max-h-[80%] w-full max-w-2xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-base">📂</span>
            <div>
              <p className="text-sm font-semibold text-slate-100">Anexar do Workspace</p>
              <p className="text-[10px] text-slate-500">Escolha um arquivo de texto ou imagem</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-900/40 px-3 py-1.5 text-[11px] text-slate-400 overflow-x-auto whitespace-nowrap">
          <button
            type="button"
            onClick={() => void refresh("/")}
            className="rounded px-1.5 py-0.5 hover:bg-slate-800 hover:text-slate-100"
          >
            🏠 raiz
          </button>
          {segments.map((seg, i) => {
            const pathUpTo = "/" + segments.slice(0, i + 1).join("/");
            return (
              <span key={pathUpTo} className="flex items-center gap-1">
                <span className="text-slate-600">/</span>
                <button
                  type="button"
                  onClick={() => void refresh(pathUpTo)}
                  className="rounded px-1.5 py-0.5 hover:bg-slate-800 hover:text-slate-100"
                >
                  {seg}
                </button>
              </span>
            );
          })}
          {loading && <span className="ml-auto text-[10px] text-slate-500">...</span>}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {error && (
            <div className="mx-3 my-2 rounded-md border border-red-800 bg-red-950/40 px-2.5 py-1.5 text-[11px] text-red-300">
              {error}
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-2 text-red-400 hover:text-red-200"
              >
                ✕
              </button>
            </div>
          )}

          {current !== "/" && (
            <button
              type="button"
              onClick={() => void refresh(parentPath(current))}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-900"
            >
              <span>↩️</span>
              <span>..</span>
            </button>
          )}

          {items.length === 0 && !loading && (
            <p className="px-4 py-3 text-[11px] text-slate-500 italic">Pasta vazia</p>
          )}

          {items.map((it) => {
            const ext = it.name.split(".").pop()?.toLowerCase() ?? "";
            const canAttach = !it.isDir && (TEXT_EXT.has(ext) || IMAGE_EXT.has(ext));
            return (
              <button
                key={it.path}
                type="button"
                onClick={() => void handleOpen(it)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  canAttach
                    ? "text-slate-200 hover:bg-emerald-900/30 hover:text-emerald-100"
                    : "text-slate-500 hover:bg-slate-900"
                }`}
              >
                <span className="shrink-0">{it.isDir ? "📁" : fileEmoji(it.name)}</span>
                <span className="flex-1 truncate">{it.name}</span>
                {!it.isDir && (
                  <span className="ml-auto text-[10px] text-slate-500">
                    {formatSize(it.size)}
                    {!canAttach && " · ✗ não anexável"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2 text-[10px] text-slate-500">
          <span>📁 %{`APPDATA`}%/kairos-workspace</span>
          <span>ESC fecha</span>
        </div>
      </div>
    </div>
  );
}
