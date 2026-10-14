/**
 * Cliente MCP (Model Context Protocol) sobre stdio.
 *
 * Implementação mínima do protocolo:
 *   - JSON-RPC 2.0 sobre stdin/stdout (delimitado por \n)
 *   - initialize → initialized → tools/list + tools/call
 *   - Timeout de leitura configurável
 *   - Buffer de stdout com parsing de múltiplas linhas
 *
 * Spec: https://modelcontextprotocol.io/specification/2024-11-05
 */

import { spawn, type ChildProcess } from "node:child_process";
import { logger } from "@kairos/core";
import type { McpServerConfig } from "./config.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: any; // JSON Schema
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

export class McpClient {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: any) => void; reject: (e: any) => void }>();
  private buffer = "";
  private initPromise: Promise<void> | null = null;
  private closed = false;

  constructor(public readonly name: string, private readonly config: McpServerConfig) {}

  /** Inicializa o subprocess MCP. Idempotente. */
  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    if (this.config.disabled) {
      throw new Error(`Server "${this.name}" está desabilitado.`);
    }
    const env = { ...process.env, ...(this.config.env ?? {}) };
    this.proc = spawn(this.config.command, this.config.args ?? [], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.closed = false;

    this.proc.stdout?.setEncoding("utf-8");
    this.proc.stdout?.on("data", (chunk: string) => {
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as JsonRpcResponse | { method: string; params: any };
          if ("id" in msg && typeof msg.id === "number") {
            const p = this.pending.get(msg.id);
            if (p) {
              this.pending.delete(msg.id);
              if (msg.error) p.reject(new Error(`MCP ${this.name}: ${msg.error.message}`));
              else p.resolve(msg.result);
            }
          } else if ("method" in msg) {
            // notificações (ex: notifications/message, notifications/initialized)
            logger.debug({ server: this.name, method: msg.method }, "mcp: notificação recebida");
          }
        } catch (e) {
          logger.warn({ line: line.slice(0, 200), err: String(e) }, "mcp: linha não-JSON ignorada");
        }
      }
    });

    this.proc.stderr?.setEncoding("utf-8");
    this.proc.stderr?.on("data", (chunk: string) => {
      logger.debug({ server: this.name, stderr: chunk.trim().slice(0, 200) }, "mcp: stderr");
    });

    this.proc.on("close", (code) => {
      if (!this.closed) {
        logger.warn({ server: this.name, code }, "mcp: subprocess fechou inesperadamente");
      }
      // rejeita todos os pendentes
      for (const [, p] of this.pending) p.reject(new Error(`MCP ${this.name} fechou (code=${code})`));
      this.pending.clear();
    });

    this.proc.on("error", (err) => {
      logger.error({ server: this.name, err: String(err) }, "mcp: erro no subprocess");
      for (const [, p] of this.pending) p.reject(err);
      this.pending.clear();
    });

    // initialize handshake (timeout 30s default)
    const initTimeout = this.config.initTimeoutMs ?? 30000;
    try {
      const result = await this.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "kairos-desktop", version: "0.5.0" },
      }, initTimeout);
      logger.info({ server: this.name, serverInfo: result.serverInfo }, "mcp: initialized");
      // initialized notification
      this.notify("notifications/initialized", {});
    } catch (e: any) {
      this.proc?.kill();
      this.proc = null;
      throw new Error(`mcp ${this.name}: initialize falhou — ${e.message}`);
    }
  }

  /** Envia request JSON-RPC e espera response. */
  private request(method: string, params: any, timeoutMs = 30000): Promise<any> {
    if (!this.proc?.stdin) {
      return Promise.reject(new Error(`mcp ${this.name}: subprocess não inicializado`));
    }
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`mcp ${this.name}: ${method} timeout (${timeoutMs}ms)`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (r) => { clearTimeout(timer); resolve(r); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      try {
        this.proc!.stdin!.write(JSON.stringify(req) + "\n");
      } catch (e: any) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  /** Envia notificação (sem id, sem esperar response). */
  private notify(method: string, params: any): void {
    if (!this.proc?.stdin) return;
    const msg = { jsonrpc: "2.0", method, params };
    try {
      this.proc.stdin.write(JSON.stringify(msg) + "\n");
    } catch {
      // ignore
    }
  }

  /** Lista tools do server. */
  async listTools(): Promise<McpToolDef[]> {
    await this.initialize();
    const result = await this.request("tools/list", {});
    return (result?.tools ?? []) as McpToolDef[];
  }

  /** Chama uma tool. */
  async callTool(name: string, args: any, timeoutMs = 60000): Promise<McpCallResult> {
    await this.initialize();
    const result = await this.request("tools/call", { name, arguments: args ?? {} }, timeoutMs);
    return result as McpCallResult;
  }

  /** Fecha subprocess. */
  async close(): Promise<void> {
    this.closed = true;
    if (this.proc) {
      try { this.proc.stdin?.end(); } catch { /* ignore */ }
      this.proc.kill();
      this.proc = null;
    }
    this.initPromise = null;
    this.pending.clear();
  }
}

// =============================================================================
// Pool de clients (lazy-start por server)
// =============================================================================

const pool = new Map<string, McpClient>();

/** Pega/cria client MCP por nome. */
export async function getClient(name: string): Promise<McpClient> {
  let cli = pool.get(name);
  if (cli) return cli;
  const { loadConfig } = await import("./config.js");
  const config = await loadConfig();
  const cfg = config[name];
  if (!cfg) {
    throw new Error(`MCP server "${name}" não configurado. Use mcp_list_servers pra ver os disponíveis.`);
  }
  cli = new McpClient(name, cfg);
  pool.set(name, cli);
  return cli;
}

/** Fecha todos os clients (no shutdown do app). */
export async function closeAll(): Promise<void> {
  for (const cli of pool.values()) {
    await cli.close();
  }
  pool.clear();
}
