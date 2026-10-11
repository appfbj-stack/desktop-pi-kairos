/**
 * ErrorBoundary \u2014 pega erros do React render e mostra stacktrace vis\u00edvel.
 *
 * Sem isso, um erro JS na inicializa\u00e7\u00e3o deixa a janela preta.
 * Com isso, o usu\u00e1rio v\u00ea o erro direto na tela (e pode copiar pra reportar).
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary] erro capturado:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    const message = this.state.error.message ?? String(this.state.error);
    const stack = this.state.error.stack ?? "";
    const componentStack = this.state.errorInfo?.componentStack ?? "";

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
        <div className="max-w-3xl w-full rounded-xl border border-red-700/40 bg-slate-900 p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-3xl">\ud83d\udca5</span>
            <h1 className="text-lg font-semibold text-red-300">Kair\u00f3s encontrou um erro</h1>
          </div>
          <p className="mb-4 text-sm text-slate-400">
            Algo quebrou no carregamento. Copie o texto abaixo e mande pro suporte.
          </p>
          <div className="mb-4 rounded-md bg-slate-950 p-3">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Mensagem</p>
            <pre className="whitespace-pre-wrap break-words text-sm text-red-200">{message}</pre>
          </div>
          <details className="mb-4">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">
              Stack trace (clique pra expandir)
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-[10px] text-slate-400">
{stack}
            </pre>
          </details>
          {componentStack && (
            <details className="mb-4">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">
                Component stack
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-slate-950 p-3 text-[10px] text-slate-400">
{componentStack}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const txt = `${message}\n\n${stack}\n\n${componentStack}`;
                navigator.clipboard.writeText(txt).catch(() => {});
              }}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
            >
              \ud83d\udccb Copiar erro
            </button>
            <button
              type="button"
              onClick={() => location.reload()}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              \ud83d\udd04 Recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
