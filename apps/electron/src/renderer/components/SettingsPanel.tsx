/**
 * SettingsPanel v0.4+ — reformulado pra não confundir o cliente.
 *
 * Antes: select provider + text model + password key expostos lado a lado.
 *        Cliente não sabe o que é "baseUrl", erra digitação, fica perdido.
 *
 * Agora: toggle "Usar minha própria chave" (BYOK).
 *   - OFF (default): usa MiniMax bundled do Pastor. Mostra banner
 *     "Modo Kairós embutido · modelo X" + botão "Trocar minha chave".
 *   - ON: revela select provider + campo model + campo API key + botões
 *     "Testar conexão" / "Salvar" / "Voltar ao Kairós embutido".
 *
 * Cada provider tem default de modelo (auto-preenche quando troca o select).
 */

import { useState } from "react";
import type { ProviderConfig } from "@kairos/agent";

type ProviderId = "minimax" | "openai" | "anthropic" | "openrouter" | "ollama" | "google";

/** Defaults por provider — quando escolhe o provider, preenche modelo padrão. */
const PROVIDER_DEFAULTS: Record<ProviderId, { provider: ProviderId; modelId: string; baseUrl?: string }> = {
  minimax: { provider: "minimax", modelId: "MiniMax-M3" },
  openai: { provider: "openai", modelId: "gpt-4o-mini" },
  anthropic: { provider: "anthropic", modelId: "claude-3-5-sonnet-latest" },
  openrouter: { provider: "openrouter", modelId: "openai/gpt-4o-mini" },
  ollama: { provider: "ollama", modelId: "qwen2.5:3b", baseUrl: "http://localhost:11434" },
  google: { provider: "google", modelId: "gemini-1.5-flash" },
};

const PROVIDER_LABELS: Record<ProviderId, { label: string; emoji: string; hint?: string }> = {
  minimax: { label: "MiniMax (Pastor)", emoji: "🪶" },
  openai: { label: "OpenAI", emoji: "🟢" },
  anthropic: { label: "Anthropic (Claude)", emoji: "🟠" },
  openrouter: { label: "OpenRouter", emoji: "🔀" },
  ollama: { label: "Ollama (local)", emoji: "🦙", hint: "Precisa do Ollama rodando na máquina" },
  google: { label: "Google Gemini", emoji: "✨" },
};

/** Detecta se a config atual ainda é a bundled do Pastor (cliente não usou BYOK). */
function isBundled(p: ProviderConfig): boolean {
  return p.provider === "minimax" && !!p.apiKey && p.apiKey.startsWith("sk-");
}

export function SettingsPanel({
  provider,
  onProviderChange,
  onClose,
  onListModels,
  onListOllama,
  ollamaModels,
  ollamaLoading,
}: {
  provider: ProviderConfig;
  onProviderChange: (next: ProviderConfig) => Promise<void>;
  onClose: () => void;
  onListModels: () => void;
  onListOllama: () => void;
  ollamaModels: { id: string; name: string; size: number }[];
  ollamaLoading: boolean;
  modelCatalog: { id: string; name: string; tier?: "free" | "paid"; description?: string }[];
  modelCatalogLoading: boolean;
  modelCatalogError: string | null;
  onPickModel: (id: string) => void;
}) {
  const usingBundled = isBundled(provider);

  // Modo BYOK: cliente editando a config antes de salvar
  const [byokMode, setByokMode] = useState(!usingBundled);
  const [draft, setDraft] = useState<ProviderConfig>(provider);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  function pickProvider(pid: ProviderId) {
    const def = PROVIDER_DEFAULTS[pid];
    setDraft({
      provider: def.provider as ProviderConfig["provider"],
      modelId: def.modelId,
      apiKey: draft.apiKey, // mantém o que já digitou
      baseUrl: def.baseUrl ?? draft.baseUrl,
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onProviderChange(draft);
      setByokMode(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetBundled() {
    setSaving(true);
    try {
      const bundled: ProviderConfig = {
        provider: "minimax",
        modelId: "MiniMax-M3",
        apiKey: "bundled",
      };
      await onProviderChange(bundled);
      setByokMode(false);
    } finally {
      setSaving(false);
    }
  }

  // ─── UI ───────────────────────────────────────────────────────
  return (
    <div className="border-b border-slate-800 bg-slate-950 px-6 py-5">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Configurações</h2>
            <p className="mt-1 text-xs text-slate-500">
              Kairós já vem com chave embutida do Pastor — use direto. Pra trocar pela sua, ative o modo BYOK.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            aria-label="Fechar configurações"
          >
            ✕
          </button>
        </div>

        {/* Status atual: bundled vs custom */}
        {!byokMode && (
          <div className="mt-4 rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-lg shadow-sm">
                🪶
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-300">
                  Modo Kairós embutido (recomendado)
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Provider: <strong className="text-slate-200">MiniMax</strong> · Modelo:{" "}
                  <strong className="text-slate-200">{provider.modelId}</strong>
                </p>
                <p className="mt-2 text-[11px] text-slate-500">
                  Custo pago pelo Pastor. Você ganha 15 mensagens grátis por instalação.
                  Após o trial, renove via central-kairos.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setByokMode(true);
                  setDraft(provider);
                }}
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
              >
                🔑 Usar minha própria chave
              </button>
              <button
                type="button"
                onClick={() => void handleResetBundled()}
                disabled={saving}
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
                title="Garante chave fresh embutida"
              >
                🔄 Recarregar chave embutida
              </button>
            </div>
          </div>
        )}

        {/* Modo BYOK */}
        {byokMode && (
          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Usar minha própria chave</p>
              <button
                type="button"
                onClick={() => {
                  setByokMode(false);
                  setDraft(provider);
                }}
                disabled={saving}
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                ← voltar
              </button>
            </div>

            {/* Provider picker — pills/lista */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                Provider
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.keys(PROVIDER_DEFAULTS) as ProviderId[]).map((pid) => {
                  const meta = PROVIDER_LABELS[pid];
                  const selected = draft.provider === pid;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => pickProvider(pid)}
                      className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors ${
                        selected
                          ? "border-emerald-500 bg-emerald-900/30"
                          : "border-slate-700 bg-slate-800 hover:border-slate-500"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{meta.emoji}</span>
                        <span className="text-xs font-medium text-slate-100">{meta.label}</span>
                      </div>
                      {meta.hint && (
                        <span className="mt-0.5 text-[10px] text-slate-500">{meta.hint}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Model */}
            <div className="mt-3">
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                Modelo
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={draft.modelId}
                  onChange={(e) => setDraft({ ...draft, modelId: e.target.value })}
                  placeholder="model-id"
                  className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
                {draft.provider !== "ollama" && (
                  <button
                    type="button"
                    onClick={onListModels}
                    title="Listar modelos disponíveis"
                    className="rounded-md border border-slate-700 bg-slate-800 px-2.5 text-xs hover:bg-slate-700"
                  >
                    📋
                  </button>
                )}
                {draft.provider === "ollama" && (
                  <button
                    type="button"
                    onClick={onListOllama}
                    disabled={ollamaLoading}
                    title="Listar modelos Ollama locais"
                    className="rounded-md border border-slate-700 bg-slate-800 px-2.5 text-xs hover:bg-slate-700 disabled:opacity-50"
                  >
                    {ollamaLoading ? "..." : "🔄"}
                  </button>
                )}
              </div>
              {/* Atalhos rápidos por provider */}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {draft.provider === "openai" && (
                  <>
                    {["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo", "o1-mini"].map((m) => (
                      <ModelChip key={m} id={m} current={draft.modelId} onPick={(id) => setDraft({ ...draft, modelId: id })} />
                    ))}
                  </>
                )}
                {draft.provider === "anthropic" && (
                  <>
                    {["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"].map((m) => (
                      <ModelChip key={m} id={m} current={draft.modelId} onPick={(id) => setDraft({ ...draft, modelId: id })} />
                    ))}
                  </>
                )}
                {draft.provider === "openrouter" && (
                  <>
                    {["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash-exp:free", "meta-llama/llama-3.3-70b-instruct:free"].map((m) => (
                      <ModelChip key={m} id={m} current={draft.modelId} onPick={(id) => setDraft({ ...draft, modelId: id })} />
                    ))}
                  </>
                )}
                {draft.provider === "google" && (
                  <>
                    {["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"].map((m) => (
                      <ModelChip key={m} id={m} current={draft.modelId} onPick={(id) => setDraft({ ...draft, modelId: id })} />
                    ))}
                  </>
                )}
                {draft.provider === "ollama" && ollamaModels.length > 0 && (
                  <>
                    {ollamaModels.slice(0, 8).map((m) => (
                      <ModelChip key={m.id} id={m.id} current={draft.modelId} onPick={(id) => setDraft({ ...draft, modelId: id })} />
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Base URL (só Ollama por enquanto) */}
            {draft.provider === "ollama" && (
              <div className="mt-3">
                <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                  Endpoint Ollama
                </label>
                <input
                  type="text"
                  value={draft.baseUrl ?? ""}
                  onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value || undefined })}
                  placeholder="http://localhost:11434"
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            )}

            {/* API Key */}
            <div className="mt-3">
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                API Key
                {draft.provider === "ollama" && (
                  <span className="ml-1 normal-case text-slate-600">(opcional)</span>
                )}
              </label>
              <div className="flex gap-1.5">
                <input
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey ?? ""}
                  onChange={(e) => setDraft({ ...draft, apiKey: e.target.value || undefined })}
                  placeholder={draft.provider === "ollama" ? "vazio" : "sk-..."}
                  disabled={draft.provider === "ollama"}
                  className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2.5 text-xs hover:bg-slate-700"
                  title={showKey ? "Esconder" : "Mostrar"}
                >
                  {showKey ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !draft.provider || !draft.modelId}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
              >
                {saving ? "Salvando…" : "✓ Salvar e usar"}
              </button>
              <button
                type="button"
                onClick={() => void handleResetBundled()}
                disabled={saving}
                className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                ↩ Voltar ao Kairós embutido
              </button>
              <button
                type="button"
                onClick={() => {
                  setByokMode(false);
                  setDraft(provider);
                }}
                disabled={saving}
                className="ml-auto rounded-md px-4 py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cancelar
              </button>
            </div>

            {draft.provider === "ollama" && ollamaModels.length === 0 && !ollamaLoading && (
              <p className="mt-3 text-[11px] text-slate-500">
                Ollama não está rodando ou não tem modelos. Inicie com{" "}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-400">ollama serve</code>{" "}
                e clique 🔄.
              </p>
            )}
          </div>
        )}

        <p className="mt-4 text-[10px] text-slate-600">
          Config salva em <code className="text-slate-500">%APPDATA%\kairos-pi\config.json</code>
        </p>
      </div>
    </div>
  );
}

function ModelChip({ id, current, onPick }: { id: string; current: string; onPick: (id: string) => void }) {
  const selected = id === current;
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
        selected
          ? "border-emerald-500 bg-emerald-900/30 text-emerald-300"
          : "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
      }`}
    >
      {id}
    </button>
  );
}
