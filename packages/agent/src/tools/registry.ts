/**
 * Tool Registry — registro de tools (funções que o LLM pode chamar).
 *
 * Modelado na extensions API do Pi Agent (`@earendil-works/pi-coding-agent`).
 * Cada tool tem nome, descrição, schema Zod do input e função execute.
 */

import { z } from "zod";

export interface ToolContext {
  agentId: string;
  sessionId: string;
  cwd: string;
  abortSignal: AbortSignal;
  /** Pede confirmação ao usuário antes de executar tool destrutiva. */
  confirmDangerous: (prompt: string) => Promise<boolean>;
}

export interface Tool<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TInput;
  /** Se true, pede confirmação antes de executar (ver PRD §16 e §28). */
  dangerous?: boolean;
  execute: (input: z.infer<TInput>, ctx: ToolContext) => Promise<unknown>;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register<T extends z.ZodTypeAny>(tool: Tool<T>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool já registrada: ${tool.name}`);
    }
    this.tools.set(tool.name, tool as unknown as Tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }
}
