/**
 * videos:project — cria (ou reutiliza) a estrutura de pastas de um projeto de vídeo.
 *
 * Cria a hierarquia padrão:
 *   <raiz>/<nome-do-projeto>/
 *     01_PARA_REVISAR/  02_APROVADOS/  03_PUBLICADOS/
 *     04_ROTEIROS/     05_LEGENDAS/   06_ARQUIVADOS/
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import fs from "node:fs";
import path from "node:path";
import {
  ALL_STAGE_DIRS,
  detectExternalRoot,
  ensureProjectStructure,
  getVideosRoot,
  loadVideosConfig,
  safeName,
  saveVideosConfig,
} from "../config.js";

const inputSchema = z.object({
  name: z
    .string()
    .describe("Nome do projeto (ex.: 'kairos-crm-divulgacao'). Usado como nome de pasta."),
  root: z
    .string()
    .optional()
    .describe("Raiz base dos vídeos. Se omitir, usa a configurada (HD externo ou pasta local)."),
  setAsRoot: z
    .boolean()
    .default(false)
    .describe("Se true, grava esta raiz como destino padrão das próximas execuções."),
});

export interface ProjectResult {
  projectDir: string;
  root: string;
  folders: Record<string, string>;
  created: boolean;
  /** HD externo configurado manualmente no videos-config.json (se houver). */
  externalRoot: string | null;
  /** HD externo detectado automaticamente agora (se houver algum montado). */
  detectedExternalRoot: string | null;
}

export const videosProjectTool: Tool<typeof inputSchema> = {
  name: "videos:project",
  description:
    "Cria a estrutura de pastas de um projeto de vídeo (6 estágios: para revisar, aprovados, publicados, roteiros, legendas, arquivados). Use no início de cada vídeo de divulgação.",
  dangerous: false,
  inputSchema,
  execute: async (input): Promise<ProjectResult> => {
    const baseRoot = input.root?.trim()
      ? path.resolve(input.root.trim())
      : getVideosRoot();

    if (input.setAsRoot) {
      saveVideosConfig({ root: baseRoot });
    }

    // Garante as 6 pastas na raiz (idempotente).
    ensureProjectStructure(baseRoot);

    const projectDir = path.join(baseRoot, safeName(input.name));
    fs.mkdirSync(projectDir, { recursive: true });

    const folders: Record<string, string> = {};
    let created = false;
    for (const dir of ALL_STAGE_DIRS) {
      const full = path.join(projectDir, dir);
      if (!fs.existsSync(full)) created = true;
      fs.mkdirSync(full, { recursive: true });
      folders[dir] = full;
    }

    const cfg = loadVideosConfig(baseRoot);
    return {
      projectDir,
      root: baseRoot,
      folders,
      created,
      externalRoot: cfg.externalRoot,
      detectedExternalRoot: detectExternalRoot(),
    } as ProjectResult;
  },
};
