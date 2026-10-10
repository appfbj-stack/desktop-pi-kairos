/**
 * Markdown rendering com syntax highlight.
 * Sprint 1.9: usa react-markdown + remark-gfm (tabelas, listas, etc).
 *
 * O syntax highlight (rehype-highlight + highlight.js) foi removido temporariamente
 * pq crashava o Electron renderer (VE context: language-mismatch).
 * Voltaremos a adicionar na Sprint 2 com loading lazy.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none break-words
                    prose-headings:font-semibold prose-headings:text-slate-100
                    prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                    prose-p:text-slate-200 prose-p:leading-relaxed
                    prose-strong:text-slate-100 prose-strong:font-semibold
                    prose-em:text-slate-300
                    prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline
                    prose-ul:text-slate-200 prose-ol:text-slate-200
                    prose-li:my-0.5
                    prose-blockquote:border-l-emerald-500/50 prose-blockquote:text-slate-400
                    prose-code:text-emerald-300 prose-code:bg-slate-900 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                    prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 prose-pre:rounded-lg prose-pre:text-slate-200
                    prose-table:border-collapse prose-table:border prose-table:border-slate-700
                    prose-th:bg-slate-800 prose-th:text-slate-200 prose-th:p-2 prose-th:border prose-th:border-slate-700
                    prose-td:p-2 prose-td:border prose-td:border-slate-800 prose-td:text-slate-300
                    prose-hr:border-slate-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
