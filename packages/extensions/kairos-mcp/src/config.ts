/**
 * Config dos MCP servers.
 *
 * Arquivo: ~/.kairos/mcp-servers.json (ou %APPDATA%/kairos/mcp-servers.json no Windows)
 *
 * Schema:
 * {
 *   "servers": {
 *     "donsetch": {
 *       "command": "donsetch",
 *       "args": ["mcp", "--supervised"],
 *       "env": { ... },
 *       "description": "Web tools keyless (fetch, search, crawl, screenshot)"
 *     },
 *     "github": {
 *       "command": "npx",
 *       "args": ["-y", "@modelcontextprotocol/server-github"],
 *       "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "..." }
 *     }
 *   }
 * }
 */

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "@kairos/core";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  /** Se true, desabilita o server. */
  disabled?: boolean;
  /** Timeout de inicialização em ms (default 30000). */
  initTimeoutMs?: number;
}

export type McpConfig = Record<string, McpServerConfig>;

/** Path padrão do arquivo de config MCP. */
function defaultConfigPath(): string {
  // %APPDATA% no Windows, ~/Library/Application Support no macOS, ~/.config no Linux
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "kairos", "mcp-servers.json");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "kairos", "mcp-servers.json");
  }
  return path.join(home, ".config", "kairos", "mcp-servers.json");
}

/** Caminho do config (env KAIROS_MCP_CONFIG sobrescreve). */
export function getConfigPath(): string {
  return process.env.KAIROS_MCP_CONFIG || defaultConfigPath();
}

/** Config default incluído no app — DonSeTch. */
function getDefaultConfig(): McpConfig {
  return {
    donsetch: {
      command: "donsetch",
      args: ["mcp", "--supervised"],
      description: "Web tools keyless (fetch, search, crawl, screenshot) — sem API keys, sem conta",
      initTimeoutMs: 30000,
    },
  };
}

let cached: { mtime: number; config: McpConfig } | null = null;

/** Lê o config do disco, com cache por mtime. Cria arquivo default se não existir. */
export async function loadConfig(): Promise<McpConfig> {
  const configPath = getConfigPath();
  try {
    const stat = await fs.stat(configPath);
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.config;
    }
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as { servers?: McpConfig };
    const config = parsed.servers ?? {};
    cached = { mtime: stat.mtimeMs, config };
    return config;
  } catch (e: any) {
    if (e.code === "ENOENT") {
      // Cria arquivo default
      const def = getDefaultConfig();
      const dir = path.dirname(configPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(configPath, JSON.stringify({ servers: def }, null, 2), "utf-8");
      logger.info({ path: configPath }, "mcp: config default criado");
      cached = { mtime: Date.now(), config: def };
      return def;
    }
    logger.warn({ err: String(e) }, "mcp: erro ao ler config, usando default");
    return getDefaultConfig();
  }
}

/** Salva config no disco (cria diretório se necessário). */
export async function saveConfig(config: McpConfig): Promise<void> {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ servers: config }, null, 2), "utf-8");
  cached = null; // invalida cache
}
