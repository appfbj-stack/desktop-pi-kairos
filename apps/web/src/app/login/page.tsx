"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setToken, type Client } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const path = mode === "login" ? "/api/pwa/auth/login" : "/api/pwa/auth/register";
      const body: any = { email, password };
      if (mode === "signup") body.name = email.split("@")[0] || "Cliente";
      const r = await api<{ token: string; client: Client }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setToken(r.token);
      router.push("/chat");
    } catch (err: any) {
      setError(err?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-kairos-deep via-kairos-base to-kairos-deep px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white/95 backdrop-blur p-7 shadow-2xl">
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-kairos-deep text-kairos-neon font-bold text-xl mb-3">K</div>
          <h1 className="text-2xl font-bold text-kairos-deep">Kairós</h1>
          <p className="text-sm text-slate-500 mt-1">Seu assistente pessoal</p>
        </div>

        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-4">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 py-1.5 text-sm rounded ${mode === "login" ? "bg-white shadow text-kairos-deep font-semibold" : "text-slate-500"}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 py-1.5 text-sm rounded ${mode === "signup" ? "bg-white shadow text-kairos-deep font-semibold" : "text-slate-500"}`}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-kairos-bright focus:border-transparent outline-none"
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Senha</label>
            <input
              type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-kairos-bright focus:border-transparent outline-none"
              placeholder="minimo 8 caracteres"
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-kairos-bright text-white rounded-lg font-semibold hover:bg-blue-500 disabled:opacity-50 transition"
          >
            {loading ? "..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <p className="text-xs text-center text-slate-400 mt-5">
          10 dias de trial gratis. Sem cartao.
        </p>
      </div>
    </main>
  );
}
