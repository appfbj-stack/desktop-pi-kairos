/**
 * Tipos públicos do agente Kairós.
 */

import type { Model } from "@earendil-works/pi-ai";
import type { ProviderConfig } from "./llm/index.js";

export interface AgentConfig {
  /** Config do provider LLM ativo (mutável — UI troca em runtime). */
  provider: ProviderConfig;
  /** Model do pi-ai cacheado. Recalculado quando provider muda. */
  model: Model<any>;
  /** Diretório onde fica o SQLite (`kairos.db`) e arquivos de sessão. */
  workspaceDir: string;
  /** Lista de extensões habilitadas. */
  enabledExtensions: string[];
  /** Locale da UI (default: `pt-BR`). */
  locale?: string;
  /**
   * Limite de iterações do loop agentico antes de abortar com erro
   * (evita loop infinito quando o LLM não converge). Default: 25.
   */
  maxToolIterations?: number;
}

export type AgentEvent =
  | { type: "message"; content: string }
  | { type: "tool:call"; tool: string; input: unknown }
  | { type: "tool:result"; tool: string; output: unknown; durationMs: number }
  | { type: "progress"; step: string; percent?: number }
  | { type: "permission:request"; tool: string; input: unknown; prompt: string }
  | { type: "done"; reason: "stop" | "error" | "aborted" }
  | { type: "error"; message: string };
