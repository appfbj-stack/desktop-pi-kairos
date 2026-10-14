/**
 * Tools MCP expostas pro LLM.
 *
 * Estratégia: 3 tools "guarda-chuva" que aceitam `server` como parâmetro.
 * Vantagem: não precisa expor N×M tools (uma por server×tool).
 *
 * Para DonSeTch, o user adiciona depois:
 *   1. Instala DonSeTch: `npm i -g donsetch` (ou `scoop install donsetch`)
 *   2. Config vem pré-configurado em ~/.kairos/mcp-servers.json
 *   3. Kairós detecta e oferece as tools
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { logger } from "@kairos/core";
import { loadConfig } from "./config.js";
import { getClient, closeAll } from "./client.js";

// =============================================================================
// 1. mcp_list_servers
// =============================================================================

const ListServersInput = z.object({});

export const mcpListServers: Tool = {
  name: "mcp_list_servers",
  description:
    "Lista os MCP servers configurados no Kairós com nome, comando e descrição. " +
    "Use antes de chamar tools MCP pra saber o que tá disponível.",
  inputSchema: ListServersInput,
  execute: async () => {
    const config = await loadConfig();
    const entries = Object.entries(config);
    if (entries.length === 0) {
      return "Nenhum MCP server configurado. Edite ~/.kairos/mcp-servers.json pra adicionar.";
    }
    return entries
      .map(([name, cfg], i) => {
        const cmd = `${cfg.command}${cfg.args?.length ? " " + cfg.args.join(" ") : ""}`;
        const status = cfg.disabled ? "❌ desabilitado" : "✅ ativo";
        return [
          `${i + 1}. **${name}** — ${status}`,
          `   Comando: \`${cmd}\``,
          cfg.description ? `   ${cfg.description}` : null,
        ].filter(Boolean).join("\n");
      })
      .join("\n\n");
  },
};

// =============================================================================
// 2. mcp_list_tools
// =============================================================================

const ListToolsInput = z.object({
  server: z.string().describe("Nome do MCP server (ex: 'donsetch', 'github')"),
});

export const mcpListTools: Tool = {
  name: "mcp_list_tools",
  description:
    "Lista as tools expostas por um MCP server específico. " +
    "Use pra descobrir o que cada server consegue fazer antes de chamar.",
  inputSchema: ListToolsInput,
  execute: async (input) => {
    const { server } = ListToolsInput.parse(input);
    try {
      const cli = await getClient(server);
      const tools = await cli.listTools();
      if (tools.length === 0) return `Server "${server}" não expõe nenhuma tool.`;
      return `**${server}** expõe ${tools.length} tools:\n\n` +
        tools
          .map((t, i) => `${i + 1}. **${t.name}**${t.description ? `\n   ${t.description}` : ""}`)
          .join("\n");
    } catch (e: any) {
      return `❌ Erro em ${server}: ${e.message}`;
    }
  },
};

// =============================================================================
// 3. mcp_call_tool
// =============================================================================

const CallToolInput = z.object({
  server: z.string().describe("Nome do MCP server"),
  tool: z.string().describe("Nome da tool dentro do server"),
  args: z.record(z.any()).optional().describe("Argumentos da tool (JSON object)"),
  timeoutMs: z.number().int().min(1000).max(300000).default(60000)
    .describe("Timeout em ms (default 60s). Use valor maior pra tools pesadas (crawl, etc)."),
});

export const mcpCallTool: Tool = {
  name: "mcp_call_tool",
  description:
    "Chama uma tool de um MCP server. " +
    "Use args com os parâmetros exigidos pela tool (veja mcp_list_tools pra ver o schema). " +
    "Retorna o conteúdo que o server devolveu.",
  inputSchema: CallToolInput,
  execute: async (input) => {
    const { server, tool, args, timeoutMs } = CallToolInput.parse(input);
    try {
      const cli = await getClient(server);
      const result = await cli.callTool(tool, args, timeoutMs);
      if (result.isError) {
        return `⚠️ Tool ${server}.${tool} retornou erro: ${result.content.map((c) => c.text || c.data || "").join("\n")}`;
      }
      // Renderiza content blocks
      const parts: string[] = [];
      for (const c of result.content) {
        if (c.type === "text" && c.text) {
          parts.push(c.text);
        } else if (c.type === "image" && c.data) {
          parts.push(`[imagem ${c.mimeType || "image/png"} — ${c.data.length} chars base64]`);
        } else {
          parts.push(`[${c.type}: ${c.data || c.text || ""}]`);
        }
      }
      return parts.join("\n\n") || "(sem conteúdo)";
    } catch (e: any) {
      return `❌ Erro chamando ${server}.${tool}: ${e.message}`;
    }
  },
};

export const allTools: Tool[] = [mcpListServers, mcpListTools, mcpCallTool];

// Limpa subprocesses no exit
process.on("exit", () => {
  closeAll().catch(() => {});
});
