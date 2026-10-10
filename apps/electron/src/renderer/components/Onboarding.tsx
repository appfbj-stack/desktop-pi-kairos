/**
 * Onboarding — primeira tela quando o app é aberto sem chave configurada.
 *
 * Substitui o chat por uma tela cheia central com 3 passos:
 *  1. Escolher provider (OpenRouter, OpenAI, Anthropic, MiniMax, Ollama)
 *  2. Colar API key
 *  3. Testar conexão (busca modelos) e escolher um
 *
 * Sprint 1.20: simplifica o setup pro cliente não-técnico.
 * Antes: tinha que abrir Settings ⚙️ escondido, achar o campo, colar, salvar.
 * Agora: app abre direto nessa tela na primeira vez.
 */

import { useEffect, useState } from "react";
import type { ProviderConfig } from "@kairos/agent";

interface ModelInfo {
  id: string;
  name: string;
  context?: number;
  tier?: "free" | "paid";
  description?: string;
}

interface OnboardingProps {
  onComplete: (config: ProviderConfig) => void;
}

const PROVIDER_PRESETS: { value: string; label: string; emoji: string; help: string; defaultModel: string }[] = [
  { value: "openrouter", label: "OpenRouter", emoji: "🌐", help: "Acesso a 200+ modelos com 1 chave. Recomendo.", defaultModel: "nex-agi/nex-n2.5-mini:free" },
  { value: "openai", label: "OpenAI (ChatGPT)", emoji: "🤖", help: "GPT-4o, o1, etc. Precisa de chave com crédito.", defaultModel: "gpt-4o-mini" },
  { value: "anthropic", label: "Anthropic (Claude)", emoji: "🧠", help: "Claude 3.5 Sonnet, Opus. Boa pra textos longos.", defaultModel: "claude-3-5-sonnet-20241022" },
  { value: "minimax", label: "MiniMax", emoji: "⚡", help: "Rápido, tem modelos :free.", defaultModel: "MiniMax-M3" },
  { value: "ollama", label: "Ollama (local, sem chave)", emoji: "🏠", help: "Roda no seu PC. Precisa do Ollama instalado.", defaultModel: "qwen2.5:3b" },
];

const STEPS = [
  { id: 1, label: "Provider" },
  { id: 2, label: "Chave" },
  { id: 3, label: "Modelo" },
];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [provider, setProvider] = useState<string>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [search, setSearch] = useState("");

  const preset = PROVIDER_PRESETS.find((p) => p.value === provider)!;

  useEffect(() => {
    if (step === 3 && models.length === 0 && !loadingModels && provider !== "ollama") {
      void testConnection();
    }
  }, [step]);

  async function testConnection() {
    setError(null);
    setLoadingModels(true);
    try {
      const result = await window.kairos.listModels(provider, apiKey || undefined);
      if (result.error) {
        setError(result.error);
      }
      setModels(result.models);
      if (result.models.length > 0) {
        // Pré-seleciona: free primeiro, senão o defaultModel do preset
        const free = result.models.find((m: ModelInfo) => m.tier === "free");
        setSelectedModel(free?.id ?? preset.defaultModel);
      } else {
        setSelectedModel(preset.defaultModel);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingModels(false);
    }
  }

  async function handleFinish() {
    if (!selectedModel) {
      setError("Escolha um modelo antes de continuar");
      return;
    }
    const next: ProviderConfig = {
      provider,
      modelId: selectedModel,
      apiKey: apiKey || undefined,
      baseUrl: baseUrl || undefined,
    };
    onComplete(next);
  }

  const filteredModels = models.filter(
    (m) =>
      m.id.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-100">Kairós Desktop Alves</h1>
          <p className="mt-1 text-sm text-slate-400">Seu assistente pessoal de IA. Vamos configurar em 1 minuto.</p>
        </div>

        {/* Stepper */}
        <div className="mb-6 flex items-center justify-center gap-2 text-xs">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  step >= s.id
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-800 text-slate-500"
                }`}
              >
                {step > s.id ? "✓" : s.id}
              </div>
              <span className={step >= s.id ? "text-slate-200" : "text-slate-500"}>{s.label}</span>
              {i < STEPS.length - 1 && <div className="mx-1 h-px w-8 bg-slate-700" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
          {step === 1 && (
            <div>
              <h2 className="mb-1 text-lg font-semibold text-slate-100">Escolha o provedor de IA</h2>
              <p className="mb-4 text-xs text-slate-400">
                Pode trocar depois em ⚙️ Settings. <strong className="text-emerald-400">Recomendado:</strong> OpenRouter (1 chave, 200+ modelos).
              </p>
              <div className="space-y-2">
                {PROVIDER_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      setProvider(p.value);
                      setApiKey("");
                      setError(null);
                    }}
                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      provider === p.value
                        ? "border-emerald-500 bg-emerald-900/20"
                        : "border-slate-700 bg-slate-800 hover:border-slate-500"
                    }`}
                  >
                    <span className="text-2xl">{p.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-100">{p.label}</p>
                      <p className="text-[11px] text-slate-400">{p.help}</p>
                    </div>
                    {provider === p.value && <span className="text-emerald-400">●</span>}
                  </button>
                ))}
              </div>
              {provider === "ollama" && (
                <div className="mt-3 rounded-md border border-amber-700/40 bg-amber-950/40 p-3 text-xs text-amber-200">
                  ⚠️ Ollama precisa estar rodando no PC (<code>ollama serve</code>). Para
                  clientes sem conhecimento técnico, prefira OpenRouter.
                </div>
              )}
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="mb-1 text-lg font-semibold text-slate-100">Cole sua chave de API</h2>
              <p className="mb-4 text-xs text-slate-400">
                Onde conseguir:
                {provider === "openrouter" && (
                  <> <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-emerald-400 underline">openrouter.ai/keys</a> (crie conta, gere chave, opcionalmente adicione crédito $5)</>
                )}
                {provider === "openai" && (
                  <> <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-emerald-400 underline">platform.openai.com/api-keys</a> (precisa de crédito)</>
                )}
                {provider === "anthropic" && (
                  <> <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" className="text-emerald-400 underline">console.anthropic.com</a> (precisa de crédito)</>
                )}
                {provider === "minimax" && (
                  <> <a href="https://api.minimax.io/" target="_blank" rel="noreferrer" className="text-emerald-400 underline">api.minimax.io</a> (tem modelos :free)</>
                )}
                {provider === "ollama" && " (não precisa — usa Ollama local)"}
              </p>
              {provider !== "ollama" && (
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setError(null);
                  }}
                  placeholder={provider === "openrouter" ? "sk-or-v1-..." : provider === "openai" ? "sk-..." : provider === "anthropic" ? "sk-ant-..." : "sua chave aqui"}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  autoFocus
                />
              )}
              {provider === "openai" && (
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="Base URL (opcional, ex: https://api.openai.com/v1)"
                  className="mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              )}
              <p className="mt-2 text-[10px] text-slate-500">
                🔒 A chave fica salva <strong>apenas no seu PC</strong> em <code>%APPDATA%\kairos-pi\config.json</code>. Não vai pra nenhum servidor nosso.
              </p>
              {error && (
                <p className="mt-3 text-xs text-amber-400">⚠️ {error}</p>
              )}
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-md px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  ← Voltar
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={provider !== "ollama" && !apiKey}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {provider === "ollama" ? "Continuar →" : "Continuar →"}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="mb-1 text-lg font-semibold text-slate-100">Escolha um modelo</h2>
              <p className="mb-3 text-xs text-slate-400">
                {loadingModels
                  ? "Buscando modelos do provedor..."
                  : `${models.length} modelos encontrados. `}
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={loadingModels}
                  className="text-emerald-400 underline disabled:opacity-50"
                >
                  🔄 Recarregar
                </button>
              </p>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Filtrar (ex: llama, gpt, gemma, free...)"
                className="mb-3 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
              {loadingModels && (
                <p className="py-6 text-center text-sm text-slate-500">Carregando...</p>
              )}
              {!loadingModels && filteredModels.length > 0 && (
                <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {filteredModels.slice(0, 50).map((m) => {
                    const selected = selectedModel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedModel(m.id)}
                        className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors ${
                          selected
                            ? "border-emerald-500 bg-emerald-900/30"
                            : "border-slate-700 bg-slate-800 hover:border-slate-500"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-xs text-slate-200">{m.id}</p>
                          {m.name !== m.id && (
                            <p className="line-clamp-1 text-[10px] text-slate-500">{m.name}</p>
                          )}
                        </div>
                        {m.tier === "free" && (
                          <span className="ml-2 rounded-full bg-emerald-900/40 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                            FREE
                          </span>
                        )}
                        {m.context && (
                          <span className="ml-2 text-[10px] text-slate-500">
                            {(m.context / 1000).toFixed(0)}k
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {!loadingModels && models.length === 0 && (
                <div className="rounded-md border border-amber-700/40 bg-amber-950/40 p-3 text-xs text-amber-200">
                  ⚠️ Nenhum modelo retornado. Verifique a chave.
                  <button
                    type="button"
                    onClick={testConnection}
                    className="ml-2 text-emerald-400 underline"
                  >
                    Tentar de novo
                  </button>
                  <p className="mt-2 text-amber-300/80">
                    Ou clique "Começar mesmo assim" — vai usar o modelo padrão (<code>{preset.defaultModel}</code>).
                  </p>
                </div>
              )}
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-md px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  ← Voltar
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Começar ✓
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[10px] text-slate-600">
          v0.1.3 · Kairós Desktop Alves
        </p>
      </div>
    </div>
  );
}
