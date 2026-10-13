"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/auth";

interface Conv { id: string; title: string; updatedAt: string; }

export default function HistoryPage() {
  const router = useRouter();
  const [list, setList] = useState<Conv[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api<{ conversations: Conv[] }>("/api/pwa/conversations")
      .then((r) => setList(r.conversations))
      .catch((e) => { setError(e.message); if (String(e.message).includes("Token") || String(e.message).includes("401")) { setToken(null); router.replace("/login"); } });
  }, [router]);

  async function del(id: string) {
    if (!confirm("Apagar essa conversa?")) return;
    await api(`/api/pwa/conversations/${id}`, { method: "DELETE" });
    setList((l) => l?.filter((c) => c.id !== id) ?? null);
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/chat" className="text-kairos-bright hover:underline text-sm">Voltar</Link>
          <h1 className="text-base font-semibold text-kairos-deep">Historico</h1>
        </div>
      </header>
      <div className="max-w-2xl mx-auto p-4">
        {error && <p className="text-red-600 bg-red-50 p-3 rounded text-sm">{error}</p>}
        {list === null && !error && <p className="text-slate-400 text-sm">Carregando...</p>}
        {list && list.length === 0 && <p className="text-slate-400 text-sm text-center mt-10">Nenhuma conversa ainda.</p>}
        <ul className="space-y-2">
          {list?.map((c) => (
            <li key={c.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between hover:shadow">
              <Link href={`/chat?conv=${c.id}`} className="flex-1">
                <p className="font-medium text-kairos-ink text-sm">{c.title || "Sem titulo"}</p>
                <p className="text-xs text-slate-400 mt-0.5">{new Date(c.updatedAt).toLocaleString("pt-BR")}</p>
              </Link>
              <button onClick={() => del(c.id)} className="text-xs text-slate-400 hover:text-red-500 px-2">Apagar</button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
