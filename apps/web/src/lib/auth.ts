// Auth helpers: token em localStorage (MVP) — em produção trocar por cookie httpOnly setado pelo backend.
const KEY = "kairos_client_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem(KEY, t);
  else localStorage.removeItem(KEY);
}

export interface Client {
  id: string;
  email: string;
  name: string;
  status: string;
  trialEndsAt: string | null;
  tokensLimit: number;
  tokensUsed: number;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(path, { ...init, headers });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      msg = j.error || msg;
    } catch {}
    throw new Error(msg);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}
