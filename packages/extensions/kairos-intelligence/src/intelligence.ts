/**
 * Intelligence — classe singleton que encapsula todo o estado do extension.
 *
 * Lifecycle:
 *   1. Constructor: inicializa paths, JSONL stores, FTS index, embeddings
 *   2. probeEmbeddings() em background: detecta Ollama
 *   3. ensureEmbeddings() lazy: gera embeddings sob demanda
 *
 * Threading: tudo sync. SQLite eh thread-safe por conexao.
 */

import { defaultRoot, ensureMemoryDirs } from "./paths.js";
import { IntelligenceSearch } from "./search.js";
import { listActive, type MemoryRecord } from "./long-term.js";

export interface BootstrapContext {
  today: string;
  markdown: string;
  hits: number;
  pendingCandidates: number;
  openScratchpad: number;
  totalChars: number;
}

export class Intelligence {
  public readonly search: IntelligenceSearch;
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? defaultRoot();
    ensureMemoryDirs(this.rootDir);
    this.search = new IntelligenceSearch(this.rootDir);
    // Eager: re-indexar FTS ao iniciar
    this.search.sync();
  }

  root(): string {
    return this.rootDir;
  }

  /** Lista todos os records ativos (L1 + L2). */
  listAll(): MemoryRecord[] {
    return listActive(this.rootDir);
  }

  /** Garante que embeddings estao up-to-date. Roda async em background. */
  async refreshEmbeddings(): Promise<{ updated: number }> {
    return this.search.ensureAllEmbeddings();
  }

  /** Hook de bootstrap: monta contexto pra nova sessao. */
  async buildBootstrap(query?: string, topK = 5, maxChars = 6000): Promise<BootstrapContext> {
    const { todayString, readDailyLog, buildDailyDigest } = await import("./daily.js");
    const { listScratchpadItems } = await import("./scratchpad.js");
    const { listPending } = await import("./inbox.js");

    const today = todayString();
    const daily = readDailyLog(this.rootDir, today);
    const dailyDigest = buildDailyDigest(daily, 2000);
    const scratchpad = listScratchpadItems(this.rootDir).filter((i) => !i.done);
    const inbox = listPending(this.rootDir);

    let ragHits: Awaited<ReturnType<IntelligenceSearch["search"]>> = [];
    if (query && query.trim()) {
      try {
        ragHits = await this.search.search({ query, mode: "deep", limit: topK });
      } catch {
        ragHits = [];
      }
    }

    const sections: string[] = [];
    if (ragHits.length > 0) {
      sections.push(
        "## Memória relevante (RAG)\n" +
          ragHits
            .map((h) => `- [${h.layer}, conf ${h.confidence.toFixed(2)}, score ${h.score.toFixed(2)}] ${h.statement}`)
            .join("\n")
      );
    }
    if (inbox.length > 0) {
      sections.push(
        "## Inbox pendente (precisa ratificação)\n" +
          inbox
            .slice(0, 5)
            .map((c) => `- [${c.proposed_layer}] ${c.text}${c.tags.length ? ` _(${c.tags.join(", ")})_` : ""}`)
            .join("\n")
      );
    }
    if (scratchpad.length > 0) {
      sections.push("## Scratchpad (tarefas em aberto)\n" + scratchpad.map((s) => `- [ ] ${s.text}`).join("\n"));
    }
    if (dailyDigest) {
      sections.push(`## Daily log (${today})\n${dailyDigest}`);
    }

    let markdown = sections.join("\n\n");
    if (markdown.length > maxChars) markdown = markdown.slice(0, maxChars - 20) + "\n\n... (truncated)";

    return {
      today,
      markdown,
      hits: ragHits.length,
      pendingCandidates: inbox.length,
      openScratchpad: scratchpad.length,
      totalChars: markdown.length,
    };
  }

  close(): void {
    this.search.close();
  }
}
