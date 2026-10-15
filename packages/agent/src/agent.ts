/**
 * Kairós Agent — classe principal.
 *
 * A UI (Electron) instancia um Agent por sessão e escuta os eventos
 * via stream/observer. O loop é desacoplado da UI.
 *
 * Sprint 1.8: provider agora é parte do AgentConfig (mutável).
 * Antes lia do env, ignorando mudanças da UI. Agora a UI atualiza
 * `agent.config.provider` e o loop usa isso.
 */

import { runAgentLoop } from "./loop.js";
import { ToolRegistry } from "./tools/registry.js";
import { Permissions } from "./permissions/index.js";
import type { AgentConfig, AgentEvent } from "./types.js";

export class Agent {
  readonly id: string;
  readonly config: AgentConfig;
  readonly tools: ToolRegistry;
  readonly permissions: Permissions;

  constructor(id: string, config: AgentConfig) {
    this.id = id;
    this.config = config;
    this.tools = new ToolRegistry();
    this.permissions = new Permissions();
  }

  /**
   * Inicia o loop do agente com a mensagem do usuário.
   * Emite AgentEvent conforme processa.
   *
   * @param userMessage Texto enviado pelo usuário
   * @param options.initialMessages Histórico prévio da conversa (papel + conteúdo)
   *        para manter contexto entre turnos. Sprint 1.4: persistido em SQLite
   *        via ConversationStore.
   */
  async *handle(
    userMessage: string,
    options: {
      initialMessages?: { role: "user" | "assistant"; content: string }[];
      attachments?: import("./llm/multimodal.js").MultimodalAttachment[];
    } = {}
  ): AsyncIterable<AgentEvent> {
    // Reseta estado de abort pra novo turno (Sprint 1.8).
    this.permissions.resetAbort();
    yield* runAgentLoop(this, userMessage, options);
  }

  /**
   * Pede cancelamento da execução atual.
   */
  stop(): void {
    this.permissions.abort();
  }
}
