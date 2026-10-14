/**
 * kairos-mcp — extensão de cliente MCP (Model Context Protocol).
 *
 * Permite ao Kairós Desktop usar QUALQUER MCP server via JSON-RPC sobre stdio.
 * Pré-configurado com DonSeTch (web tools keyless).
 *
 * Tools:
 *   - mcp_list_servers : lista servers configurados
 *   - mcp_list_tools   : lista tools de um server
 *   - mcp_call_tool    : chama uma tool
 *
 * Config: ~/.kairos/mcp-servers.json (ou %APPDATA%/kairos/mcp-servers.json)
 * Override: KAIROS_MCP_CONFIG=/path/to/config.json
 */

import type { Extension } from "@kairos/agent";
import { allTools } from "./tools.js";
import { logger } from "@kairos/core";

logger.info("mcp: extension loaded (3 tools: list_servers, list_tools, call_tool)");

const extension: Extension = {
  name: "kairos-mcp",
  version: "0.1.0",
  description: "Cliente MCP (Model Context Protocol) — DonSeTch, GitHub, Slack, Filesystem, etc.",
  tools: allTools,
};

export default extension;
export { allTools } from "./tools.js";
export { loadConfig, saveConfig, getConfigPath, type McpServerConfig, type McpConfig } from "./config.js";
export { McpClient, getClient, closeAll, type McpToolDef, type McpCallResult } from "./client.js";
