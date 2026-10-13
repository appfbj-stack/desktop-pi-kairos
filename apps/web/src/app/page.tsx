"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getToken() ? "/chat" : "/login");
  }, [router]);
  return (
    <main className="min-h-screen flex items-center justify-center text-kairos-ink">
      <p className="text-sm text-slate-500">Carregando...</p>
    </main>
  );
}
