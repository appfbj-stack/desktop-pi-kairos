/**
 * WorkspacePanel — sidebar de pastas onde o usuário organiza conteúdo.
 *
 * Sprint 1.14: árvore navegável com criar/deletar/renomear/ler arquivos de texto.
 *
 * Layout:
 *   - Breadcrumb clicável no topo (volta para /)
 *   - Lista de pastas (com chevron para drill-down) e arquivos (ícone por extensão)
 *   - Botão + Nova pasta / 📄 Novo arquivo no rodapé
 *   - Click em arquivo de texto abre modal com preview + botão Enviar ao chat
 */

import { useEffect, useRef, useState } from "react";

export interface WorkspaceItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
}

interface WorkspacePanelProps {
  onOpenFile: (relPath: string, content: string, name: string) => void;
}

function joinPath(parent: string, child: string): string {
  if (parent === "/" || parent === "") return child.startsWith("/") ? child : `/${child}`;
  return `${parent}/${child}`.replace(/\/+/g, "/");
}

function parentPath(p: string): string {
  if (!p || p === "/") return "/";
  const idx = p.lastIndexOf("/");
  if (idx <= 0) return "/";
  return p.slice(0, idx);
}

function basename(p: string): string {
  if (!p || p === "/") return "";
  const idx = p.lastIndexOf("/");
  return idx === -1 ? p : p.slice(idx + 1);
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
  if (["json", "yaml", "yml", "xml", "toml", "ini", "conf", "env"].includes(ext)) return "⚙️";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"].includes(ext)) return "🖼️";
  if (["pdf"].includes(ext)) return "📕";
  if (["doc", "docx", "rtf"].includes(ext)) return "📘";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "🎬";
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) return "🎵";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "🗜️";
  if (["html", "htm", "css", "js", "ts", "tsx", "jsx"].includes(ext)) return "💻";
  return "📄";
}

const TEXT_EXT = new Set([
  "txt", "md", "csv", "tsv", "json", "xml", "yaml", "yml",
  "log", "ini", "conf", "env", "html", "htm", "css", "js", "ts",
]);

export function WorkspacePanel({ onOpenFile }: WorkspacePanelProps) {
  const [current, setCurrent] = useState("/");
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState<"folder" | "file" | null>(null);
  const [creatingName, setCreatingName] = useState("");
  const [creatingExt, setCreatingExt] = useState("md");
  const [preview, setPreview] = useState<{ path: string; name: string; content: string } | null>(null);
  const [previewEdit, setPreviewEdit] = useState("");
  const [previewDirty, setPreviewDirty] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);

  async function refresh(p: string = current) {
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
  }, []);

  useEffect(() => {
    if (creating && createInputRef.current) {
      createInputRef.current.focus();
      createInputRef.current.select();
    }
  }, [creating]);

  async function handleCreateFolder() {
    setCreating("folder");
    setCreatingName("");
    setCreatingExt("md");
  }

  async function handleCreateFile() {
    setCreating("file");
    setCreatingName("");
    setCreatingExt("md");
  }

  async function submitCreate() {
    if (!creatingName.trim()) {
      setCreating(null);
      return;
    }
    const cleanName = creatingName.trim().replace(/[\\/:*?"<>|]/g, "-");
    const finalName = creating === "file" && !cleanName.includes(".") ? `${cleanName}.${creatingExt}` : cleanName;
    const newPath = joinPath(current, finalName);
    try {
      if (creating === "folder") {
        await window.kairos!.workspace.mkdir(newPath);
      } else {
        await window.kairos!.workspace.writeText(newPath, "");
      }
      setCreating(null);
      setCreatingName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(p: string) {
    if (!window.confirm(`Excluir "${basename(p)}"?`)) return;
    try {
      await window.kairos!.workspace.delete(p);
      if (preview?.path === p) {
        setPreview(null);
        setPreviewDirty(false);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRename(p: string, newName: string) {
    if (!newName.trim() || newName === basename(p)) {
      setRenaming(null);
      return;
    }
    const clean = newName.trim().replace(/[\\/:*?"<>|]/g, "-");
    try {
      await window.kairos!.workspace.rename(p, clean);
      setRenaming(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleOpen(item: WorkspaceItem) {
    if (item.isDir) {
      await refresh(item.path);
      return;
    }
    const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
    if (!TEXT_EXT.has(ext)) {
      setError(`Tipo .${ext} não tem preview. Use o chat pra analisar binários.`);
      return;
    }
    try {
      const res = await window.kairos!.workspace.readText(item.path);
      setPreview({ path: res.path, name: res.name, content: res.content });
      setPreviewEdit(res.content);
      setPreviewDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSavePreview() {
    if (!preview) return;
    try {
      await window.kairos!.workspace.writeText(preview.path, previewEdit);
      setPreview({ ...preview, content: previewEdit });
      setPreviewDirty(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleSendToChat() {
    if (!preview) return;
    onOpenFile(preview.path, previewEdit, preview.name);
    setPreview(null);
  }

  // Breadcrumb segments
  const segments = current === "/" ? [] : current.split("/").filter(Boolean);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-400 overflow-x-auto whitespace-nowrap">
        <button
          type="button"
          onClick={() => void refresh("/")}
          className="rounded px-1.5 py-0.5 hover:bg-slate-800 hover:text-slate-100"
          title="Raiz do workspace"
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

      {/* Items */}
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

        {creating && (
          <div className="mx-2 my-1.5 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{creating === "folder" ? "📁" : "📄"}</span>
              <input
                ref={createInputRef}
                type="text"
                value={creatingName}
                onChange={(e) => setCreatingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitCreate();
                  if (e.key === "Escape") {
                    setCreating(null);
                    setCreatingName("");
                  }
                }}
                placeholder={creating === "folder" ? "nome-da-pasta" : "nome-do-arquivo"}
                className="flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
              {creating === "file" && (
                <select
                  value={creatingExt}
                  onChange={(e) => setCreatingExt(e.target.value)}
                  className="rounded border border-slate-600 bg-slate-900 px-1 py-1 text-[10px] text-slate-100"
                >
                  <option value="md">.md</option>
                  <option value="txt">.txt</option>
                  <option value="csv">.csv</option>
                  <option value="json">.json</option>
                  <option value="yaml">.yaml</option>
                </select>
              )}
              <button
                type="button"
                onClick={() => void submitCreate()}
                className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
              >
                ✓
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(null);
                  setCreatingName("");
                }}
                className="rounded bg-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-600"
              >
                ✕
              </button>
            </div>
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

        {items.map((it) => (
          <div
            key={it.path}
            className="group flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-900"
          >
            {renaming === it.path ? (
              <input
                type="text"
                defaultValue={it.name}
                autoFocus
                onBlur={(e) => void handleRename(it.path, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRename(it.path, (e.target as HTMLInputElement).value);
                  if (e.key === "Escape") setRenaming(null);
                }}
                className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => void handleOpen(it)}
                className="flex flex-1 items-center gap-2 truncate text-left text-slate-200"
              >
                <span className="shrink-0">{it.isDir ? "📁" : fileEmoji(it.name)}</span>
                <span className="truncate">{it.name}</span>
                {!it.isDir && (
                  <span className="ml-auto text-[10px] text-slate-500">{formatSize(it.size)}</span>
                )}
              </button>
            )}
            <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setRenaming(it.path)}
                className="rounded px-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                title="Renomear"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(it.path)}
                className="rounded px-1 text-slate-500 hover:bg-slate-800 hover:text-red-400"
                title="Excluir"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex gap-1.5 border-t border-slate-800 px-3 py-2">
        <button
          type="button"
          onClick={() => void handleCreateFolder()}
          className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-slate-700"
        >
          📁 + Pasta
        </button>
        <button
          type="button"
          onClick={() => void handleCreateFile()}
          className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-slate-700"
        >
          📄 + Arquivo
        </button>
      </div>

      {/* Preview modal */}
      {preview && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="flex max-h-[90%] w-full max-w-3xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-100">{preview.name}</p>
                <p className="truncate text-[10px] text-slate-500">{preview.path}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setPreviewDirty(false);
                }}
                className="ml-2 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <textarea
                value={previewEdit}
                onChange={(e) => {
                  setPreviewEdit(e.target.value);
                  setPreviewDirty(true);
                }}
                className="h-full min-h-[300px] w-full resize-none rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-[12px] text-slate-100 focus:border-emerald-500 focus:outline-none"
                spellCheck={false}
              />
            </div>
            <div className="flex items-center gap-2 border-t border-slate-800 px-4 py-2.5">
              <button
                type="button"
                onClick={handleSendToChat}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                title="Envia o conteúdo como mensagem ao agente"
              >
                💬 Enviar ao chat
              </button>
              {previewDirty && (
                <button
                  type="button"
                  onClick={handleSavePreview}
                  className="rounded-md border border-amber-600 bg-amber-700/40 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-600/40"
                >
                  💾 Salvar
                </button>
              )}
              <span className="ml-auto text-[10px] text-slate-500">
                {previewEdit.length} caracteres
                {previewDirty && " • não salvo"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
