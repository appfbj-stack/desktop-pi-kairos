/**
 * Loop LLM real usando pi-ai.stream().
 *
 * Fluxo:
 *   1. Recebe Agent + userMessage
 *   2. Constrói Context (systemPrompt + messages + tools)
 *   3. Chama pi-ai.stream() — processa eventos
 *   4. Para cada ToolCall:
 *      a. Se dangerous, pede confirmação via Permissions (interface)
 *      b. Executa via ToolRegistry
 *      c. Envia ToolResultMessage de volta pro LLM
 *   5. Continua até stopReason ser "stop" | "length" | "aborted"
 *   6. Emite AgentEvent conforme o progresso
 *
 * Modelado no Pi Agent (https://pi.dev/docs/latest/sdk).
 */

import {
  type AssistantMessage,
  type AssistantMessageEvent,
  type Context,
  type Message,
  type Tool as PiTool,
  type ToolResultMessage,
  type UserMessage,
} from "@earendil-works/pi-ai";
import { stream } from "@earendil-works/pi-ai/compat";
import type { Agent } from "../agent.js";
import type { AgentEvent } from "../types.js";
import type { Tool as KairosTool } from "../tools/registry.js";
import { zodToTypebox } from "./zod-to-typebox.js";
import { buildModel, resolveApiKey, type ProviderConfig } from "./provider.js";

const DEFAULT_MAX_TOOL_ITERATIONS = 25;

/** Loop principal — emite AgentEvent conforme o agente processa. */
export async function* runLlmLoop(
  agent: Agent,
  userMessage: string,
  options: {
    systemPrompt?: string;
    provider: ProviderConfig;
    initialMessages?: { role: "user" | "assistant"; content: string }[];
  } = {
    provider: { provider: "openrouter", modelId: "anthropic/claude-3.5-sonnet" },
  }
): AsyncIterable<AgentEvent> {
  const maxIterations = agent.config.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
  const model = buildModel(options.provider);
  const apiKey = resolveApiKey(options.provider);

  // 1. Constrói tools no formato do pi-ai (typebox). Mapeia nome
  // sanitizado → nome original pra resolver tool calls do LLM.
  const nameLookup = new Map<string, string>();
  const tools: PiTool[] = agent.tools.list().map((t) => toKairosToolToPiTool(t, nameLookup));

  // 2. Carrega histórico (se houver) + mensagem do user
  const messages: Message[] = [];

  if (options.initialMessages && options.initialMessages.length > 0) {
    for (const m of options.initialMessages) {
      if (m.role === "user") {
        messages.push({
          role: "user",
          content: m.content,
          timestamp: Date.now(),
        });
      } else {
        // Mensagem assistant do histórico — constrói com campos obrigatórios vazios
        // (será ignorado pelo pi-ai, mas é necessário pra satisfazer o tipo discriminado)
        const stub: AssistantMessage = {
          role: "assistant",
          content: [{ type: "text", text: m.content }],
          api: "openai-completions", // placeholder
          provider: "openai",
          model: "history",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop",
          timestamp: Date.now(),
        };
        messages.push(stub);
      }
    }
  }

  const userMsg: UserMessage = {
    role: "user",
    content: userMessage,
    timestamp: Date.now(),
  };
  messages.push(userMsg);

  let iteration = 0;
  while (iteration++ < maxIterations) {
    if (agent.permissions.isAborted()) {
      yield { type: "done", reason: "aborted" };
      return;
    }

    const context: Context = {
      systemPrompt:
        options.systemPrompt ??
        [
          "Você é o Kairós, um assistente pessoal de IA que roda no Windows do usuário.",
          "Responda SEMPRE em português do Brasil.",
          "",
          "REGRA DE OURO: respostas CURTAS (máx 2-3 frases). Sem cumprimentos longos, sem disclaimers, sem floreios. Vá direto ao ponto.",
          "",
          "Você TEM acesso ao computador do usuário através das tools. Quando o usuário pedir qualquer ação, use as tools IMEDIATAMENTE — não diga que 'não tem acesso' ou que 'precisa de permissão'.",
          "",
          "Estilo: 1-3 linhas no texto. Listas só se útil. Mostre o que fez (ex: 'Pronto, planilha criada em C:/Users/.../lista.xlsx').",
        ].join("\n"),
      messages,
      tools: tools.length > 0 ? tools : undefined,
    };

    yield { type: "progress", step: "thinking", percent: 10 };

    // 3. Stream
    let lastMessage: AssistantMessage | undefined;
    try {
      for await (const event of stream(model, context, { apiKey, maxTokens: 512 })) {
        const result = yield* processStreamEvent(event, agent);
        if (result) lastMessage = result;
      }
    } catch (err) {
      yield { type: "error", message: err instanceof Error ? err.message : String(err) };
      yield { type: "done", reason: "error" };
      return;
    }

    if (!lastMessage) {
      yield { type: "error", message: "Stream não retornou mensagem final" };
      yield { type: "done", reason: "error" };
      return;
    }

    messages.push(lastMessage);

    // 4. Se for toolUse, executa as tools
    if (lastMessage.stopReason === "toolUse") {
      const toolCalls = lastMessage.content.filter(
        (c): c is Extract<typeof c, { type: "toolCall" }> => c.type === "toolCall"
      );

      for (const call of toolCalls) {
        if (agent.permissions.isAborted()) {
          yield { type: "done", reason: "aborted" };
          return;
        }

        // Resolve nome sanitizado → nome original. O LLM envia o sanitizado.
        const originalName = nameLookup.get(call.name) ?? call.name;
        const tool = agent.tools.get(originalName);
        if (!tool) {
          // Tool não encontrada — devolve erro
          const errResult: ToolResultMessage = {
            role: "toolResult",
            toolCallId: call.id,
            toolName: call.name,
            content: [{ type: "text", text: `Tool "${call.name}" não encontrada` }],
            isError: true,
            timestamp: Date.now(),
          };
          messages.push(errResult);
          yield {
            type: "tool:result",
            tool: call.name,
            output: "Tool não encontrada",
            durationMs: 0,
          };
          continue;
        }

        yield { type: "tool:call", tool: originalName, input: call.arguments };

        // Confirmação destrutiva (PRD §16, §28)
        if (tool.dangerous) {
          const prompt = `A tool "${originalName}" é destrutiva. Deseja continuar?`;
          yield {
            type: "permission:request",
            tool: originalName,
            input: call.arguments,
            prompt,
          };
          const ok = await agent.permissions.confirm({
            tool: originalName,
            prompt,
            input: call.arguments,
          });
          if (!ok) {
            const cancelResult: ToolResultMessage = {
              role: "toolResult",
              toolCallId: call.id,
              // LLM mandou o nome sanitizado — devolve o mesmo pra match.
              toolName: call.name,
              content: [{ type: "text", text: "Cancelado pelo usuário" }],
              isError: true,
              timestamp: Date.now(),
            };
            messages.push(cancelResult);
            yield {
              type: "tool:result",
              tool: originalName,
              output: "Cancelado pelo usuário",
              durationMs: 0,
            };
            continue;
          }
        }

        // Executa
        const start = Date.now();
        try {
          const parsed = tool.inputSchema.parse(call.arguments);
          const result = await tool.execute(parsed, {
            agentId: agent.id,
            sessionId: agent.id,
            cwd: agent.config.workspaceDir,
            abortSignal: new AbortController().signal,
            confirmDangerous: async (p) =>
              agent.permissions.confirm({
                tool: originalName,
                prompt: p,
                input: call.arguments,
              }),
          });
          const dur = Date.now() - start;

          const resultMsg: ToolResultMessage = {
            role: "toolResult",
            toolCallId: call.id,
            // LLM mandou o nome sanitizado — devolve o mesmo pra match.
            toolName: call.name,
            content: [{ type: "text", text: JSON.stringify(result) }],
            isError: false,
            timestamp: Date.now(),
          };
          messages.push(resultMsg);
          yield {
            type: "tool:result",
            tool: originalName,
            output: result,
            durationMs: dur,
          };
        } catch (err) {
          const dur = Date.now() - start;
          const errMsg: ToolResultMessage = {
            role: "toolResult",
            toolCallId: call.id,
            toolName: call.name,
            content: [
              {
                type: "text",
                text: `Erro: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
            timestamp: Date.now(),
          };
          messages.push(errMsg);
          yield {
            type: "tool:result",
            tool: originalName,
            output: `Erro: ${err instanceof Error ? err.message : String(err)}`,
            durationMs: dur,
          };
        }
      }
      // Continua o loop com as tool results no context
      continue;
    }

    // 5. Stop final
    if (lastMessage.stopReason === "aborted") {
      yield { type: "done", reason: "aborted" };
      return;
    }
    if (lastMessage.stopReason === "error") {
      yield { type: "error", message: lastMessage.errorMessage ?? "Erro desconhecido" };
      yield { type: "done", reason: "error" };
      return;
    }
    // stop | length
    yield { type: "done", reason: "stop" };
    return;
  }

  yield { type: "error", message: `Loop excedeu ${maxIterations} iterações` };
  yield { type: "done", reason: "error" };
}

/** Processa um evento do stream e emite AgentEvents. Retorna a mensagem final quando aplicável. */
async function* processStreamEvent(
  event: AssistantMessageEvent,
  _agent: Agent
): AsyncGenerator<AgentEvent, AssistantMessage | undefined, void> {
  switch (event.type) {
    case "start":
    case "text_start":
    case "text_end":
    case "thinking_start":
    case "thinking_end":
    case "toolcall_start":
    case "toolcall_end":
      return undefined;

    case "text_delta":
      yield { type: "message", content: event.delta };
      return undefined;

    case "thinking_delta":
      // Thinking não emite (interno). Sprint 2 pode expor opcionalmente.
      return undefined;

    case "toolcall_delta":
      // Acumula internamente — visível apenas no toolcall_end.
      return undefined;

    case "done": {
      // Sprint 1.8 fix: NÃO emitir text completo aqui — text_delta já veio
      // pedaço a pedaço. Se emitisse, o usuário veria o texto duplicado.
      // O `event.message` (AssistantMessage) já é retornado para o loop
      // continuar processando tool calls, e o texto está em message.content.
      return event.message;
    }

    case "error":
      yield {
        type: "error",
        message: event.error.errorMessage ?? "Erro no stream",
      };
      return event.error;
  }
}

/** Converte Tool Kairos (Zod) → Tool pi-ai (typebox).
 *
 * OpenAI-compatible APIs (incluindo Nemotron via OpenRouter) rejeitam tool
 * names com caracteres fora de [a-zA-Z0-9_-]. Kairós usa `namespace:tool`
 * (ex: `files:mkdir`), então normalizamos pra `namespace_tool` ao enviar
 * pro LLM. O nome original é preservado internamente — a conversão
 * reversa acontece no stream event via `originalNameBySanitized`.
 */
function toKairosToolToPiTool(tool: KairosTool, lookup: Map<string, string>): PiTool {
  const sanitized = sanitizeToolName(tool.name);
  if (sanitized !== tool.name) lookup.set(sanitized, tool.name);
  return {
    name: sanitized,
    description: tool.description,
    parameters: zodToTypebox(tool.inputSchema) as never,
  };
}

/** "files:mkdir" → "files_mkdir". Mantém [a-zA-Z0-9_-]. */
function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}
