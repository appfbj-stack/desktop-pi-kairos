/**
 * Empty state bonito quando não tem mensagem.
 * Sprint 1.9: dicas, exemplos, ícone.
 */

const EXAMPLES = [
  { icon: "📊", title: "Criar planilha", prompt: "Crie uma planilha com nome e idade de 3 pessoas" },
  { icon: "📁", title: "Organizar pasta", prompt: "Liste os arquivos da minha área de trabalho" },
  { icon: "📄", title: "Ler PDF", prompt: "Leia o PDF do meu Desktop" },
  { icon: "✍️", title: "Escrever arquivo", prompt: "Crie um arquivo de texto com uma lista de tarefas" },
];

export function EmptyState({ toolCount, onPick }: { toolCount: number; onPick: (p: string) => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-900/40">
          <span className="text-2xl font-bold text-white">K</span>
        </div>
        <h2 className="mb-2 text-2xl font-semibold text-slate-100">
          Como posso ajudar hoje?
        </h2>
        <p className="mb-8 text-sm text-slate-400">
          {toolCount} ferramentas disponíveis — arquivos, planilhas, PDFs, Word, imagens, vídeo.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.title}
              type="button"
              onClick={() => onPick(ex.prompt)}
              className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-left hover:border-emerald-500/40 hover:bg-slate-800/60 transition-colors"
            >
              <span className="text-xl">{ex.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200">{ex.title}</p>
                <p className="truncate text-[11px] text-slate-500 group-hover:text-slate-400">
                  {ex.prompt}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
