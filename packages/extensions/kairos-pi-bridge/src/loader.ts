/**
 * Pi package loader — carrega extensions do Pi (npm) e converte pra tools Kairos.
 *
 * Cada package do cat\u00e1logo Pi (https://pi.dev/packages) tem uma interface pr\u00f3pria
 * (Type, ExtensionAPI, callbacks de registro). Esta camada traduz as tools registradas
 * pra interface Kairos (Tool + Zod schema + execute).
 *
 * Como adicionar uma skill do Pi:
 *   1. Adicione o nome do package em config.json (campo `enabled`)
 *   2. Adicione a dep no package.json deste bridge
 *   3. pnpm install
 *   4. pnpm --filter @kairos/extension-pi-bridge build
 *   5. Rebuild do app: a extension \u00e9 auto-carregada
 *
 * Limita\u00e7\u00f5es conhecidas:
 *   - Packages que requerem CLI interativa (consent-manager, oauth) n\u00e3o funcionam
 *     bem no Kair\u00f3s (sem TUI). Skippados automaticamente.
 *   - Packages com depend\u00eancia de filesystem paths do Pi (~/.pi) n\u00e3o v\u00e3o
 *     funcionar out-of-the-box. Precisam ser adaptados.
 */

import { logger } from "@kairos/core";
import type { Tool } from "@kairos/agent";
import { z } from "zod";
import config from "../config.json" with { type: "json" };

/** Pacotes que dependem de TUI / CLI interativa do Pi \u2014 n\u00e3o funcionam no Kair\u00f3s. */
const SKIP_PACKAGES = new Set([
  "pi-mcp-adapter", // TUI interativa, OAuth callbacks
]);

/** Tipo m\u00ednimo de um Pi extension exportado. Nem todos packages seguem o mesmo shape. */
interface PiExtensionExport {
  default?: unknown;
  registerExtension?: (api: PiExtensionApi) => void | Promise<void>;
  tools?: PiToolSpec[];
}

interface PiExtensionApi {
  registerTool: (spec: PiToolSpec) => void;
  registerCommand?: (spec: unknown) => void;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
}

interface PiToolSpec {
  name: string;
  description: string;
  parameters?: unknown; // TypeBox TSchema OU Zod schema
  execute: (args: Record<string, unknown>, ctx?: PiToolContext) => Promise<unknown>;
}

interface PiToolContext {
  cwd?: string;
  abortSignal?: AbortSignal;
  [key: string]: unknown;
}

/** Resultado do load. */
export interface LoadResult {
  tools: Tool<z.ZodTypeAny>[];
  loadedPackages: string[];
  failedPackages: { name: string; reason: string }[];
}

/**
 * Tenta carregar cada package Pi habilitado e extrair suas tools.
 * Falhas s\u00e3o logadas mas n\u00e3o derrubam o app \u2014 outras extensions continuam funcionando.
 */
export async function loadPiExtensions(): Promise<LoadResult> {
  const result: LoadResult = {
    tools: [],
    loadedPackages: [],
    failedPackages: [],
  };

  for (const pkg of config.enabled) {
    if (SKIP_PACKAGES.has(pkg)) {
      logger.info({ pkg }, "pi-bridge: pulando package com TUI interativa");
      continue;
    }

    try {
      const mod = (await import(pkg)) as PiExtensionExport;
      const tools = extractTools(mod, pkg);
      result.tools.push(...tools);
      result.loadedPackages.push(pkg);
      logger.info({ pkg, toolCount: tools.length }, "pi-bridge: package carregado");
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      result.failedPackages.push({ name: pkg, reason });
      logger.warn({ pkg, reason }, "pi-bridge: falha ao carregar package");
    }
  }

  return result;
}

/** Extrai tools de um module Pi, suportando v\u00e1rios formatos. */
function extractTools(mod: PiExtensionExport, pkg: string): Tool<z.ZodTypeAny>[] {
  const tools: Tool<z.ZodTypeAny>[] = [];

  // Formato 1: module exporta `registerExtension(api)` que chama api.registerTool(spec)
  if (typeof mod.registerExtension === "function") {
    const collected: PiToolSpec[] = [];
    const fakeApi: PiExtensionApi = {
      registerTool: (spec: PiToolSpec) => collected.push(spec),
      registerCommand: () => {
        /* comandos n\u00e3o v\u00eam tools */
      },
      on: () => {
        /* events do lifecycle \u2014 ignoramos */
      },
    };
    mod.registerExtension(fakeApi);
    for (const spec of collected) {
      tools.push(adaptPiTool(spec, pkg));
    }
  }

  // Formato 2: module exporta `tools` array direto
  if (Array.isArray(mod.tools)) {
    for (const spec of mod.tools) {
      tools.push(adaptPiTool(spec, pkg));
    }
  }

  return tools;
}

/**
 * Adapta um Pi tool spec pra Kairos Tool.
 *
 * O Kairos espera: name, description, inputSchema (Zod), execute(input, ctx).
 * O Pi tool geralmente tem: name, description, parameters (TypeBox TSchema), execute(args, ctx).
 *
 * O schema \u00e9 passado como ZodTypeAny \u2014 se o tool original usa TypeBox, o LLM
 * vai ver campos errados. Para packages que usam TypeBox puro (pi-mcp-adapter),
 * melhor copiar as tools manualmente. Para packages com Zod ou shape simples, funciona.
 */
function adaptPiTool(spec: PiToolSpec, pkg: string): Tool<z.ZodTypeAny> {
  // Converte o parameters pra ZodAny wrapper. O LLM envia JSON que validamos como object.
  const inputSchema = z.any() as unknown as z.ZodTypeAny;

  return {
    name: `pi:${pkg}:${spec.name}`,
    description: `[Pi Bridge] ${spec.description} (origem: ${pkg})`,
    inputSchema,
    execute: async (input, ctx: { agentId: string; sessionId: string; cwd: string; abortSignal: AbortSignal; confirmDangerous: (prompt: string) => Promise<boolean> }) => {
      // Kairos ctx tem agentId, sessionId, cwd, abortSignal, confirmDangerous
      // Pi ctx tem cwd, abortSignal. Fazemos a tradu\u00e7\u00e3o.
      const piCtx: PiToolContext = {
        cwd: ctx.cwd,
        abortSignal: ctx.abortSignal,
        sessionId: ctx.sessionId,
        agentId: ctx.agentId,
      };
      const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
      // spec.execute pode ser sync ou async; o tipo PiToolSpec.execute j\u00e1 promete Promise.
      return await spec.execute(args, piCtx);
    },
  };
}
