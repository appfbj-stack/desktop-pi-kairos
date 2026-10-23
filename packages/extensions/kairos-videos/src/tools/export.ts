/**
 * videos:export — exporta o vídeo final para o HD externo.
 *
 * SEGURANÇA (requisito do Pastor):
 *   Se o HD externo não estiver montado, o export NÃO apaga nem move o
 *   arquivo original. Ele devolve um aviso e mantém o trabalho em disco.
 *   Nenhum arquivo temporário é removido antes da cópia ser confirmada.
 *
 * Fluxo de aprovação:
 *   01_PARA_REVISAR  → (aprovação) → 02_APROVADOS → (publicado) → 03_PUBLICADOS
 *   O export também pode promover entre estágios dentro do destino.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import fs from "node:fs";
import path from "node:path";
import {
  ALL_STAGE_DIRS,
  loadVideosConfig,
  resolveExportTarget,
  safeName,
  STAGES,
  type StageKey,
} from "../config.js";

const inputSchema = z.object({
  input: z.string().describe("Caminho do arquivo a exportar (o MP4 final)."),
  destination: z
    .string()
    .optional()
    .describe("Raiz de destino (HD externo). Se omitir, usa o configurado. Se não houver, exporta local."),
  stage: z
    .enum(["REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"])
    .default("APPROVED")
    .describe("Pasta de destino dentro da raiz (02_APROVADOS por padrão)."),
  filename: z.string().optional().describe("Nome do arquivo no destino. Se omitir, mantém o nome original."),
  promote: z
    .boolean()
    .default(false)
    .describe("Se true, move o arquivo (em vez de copiar) e remove o original da origem."),
});

export interface ExportResult {
  exported: boolean;
  output: string;
  destinationRoot: string;
  external: boolean;
  destinationAvailable: boolean;
  sizeBytes: number;
  keptOriginal: boolean;
  message: string;
  warnings: string[];
}

export const videosExportTool: Tool<typeof inputSchema> = {
  name: "videos:export",
  description:
    "Exporta o vídeo final para o HD externo, dentro da pasta do estágio indicado (02_APROVADOS por padrão). Se o HD não estiver conectado, mantém o arquivo original e avisa — nunca apaga trabalho.",
  dangerous: true,
  inputSchema,
  execute: async (input): Promise<ExportResult> => {
    if (!fs.existsSync(input.input)) {
      throw new Error(`Arquivo não encontrado: ${input.input}`);
    }
    const stat = fs.statSync(input.input);
    if (!stat.isFile()) {
      throw new Error(`O caminho informado não é um arquivo: ${input.input}`);
    }

    const warnings: string[] = [];
    const resolved = resolveExportTarget(input.destination);
    const cfg = loadVideosConfig();

    if (resolved.autoDetected) {
      warnings.push(`HD externo detectado automaticamente: ${resolved.target}`);
    }
    if (!resolved.external) {
      warnings.push(
        "Nenhum HD externo conectado — exportei na pasta local. Conecte o HD e rode o export de novo para copiar para lá.",
      );
    }

    if (resolved.external && !resolved.available) {
      // HD externo ausente: NÃO apaga, NÃO move. Só avisa.
      warnings.push(
        `HD externo "${resolved.target}" não está conectado (ou não é uma pasta). ` +
          "O arquivo foi mantido onde está. Nada foi apagado.",
      );
      return {
        exported: false,
        output: input.input,
        destinationRoot: resolved.target,
        external: true,
        destinationAvailable: false,
        sizeBytes: stat.size,
        keptOriginal: true,
        message:
          "Destino indisponível — vídeo mantido no local. Conecte o HD e rode o export novamente.",
        warnings,
      };
    }

    // Garante a estrutura de pastas no destino.
    for (const dir of ALL_STAGE_DIRS) {
      fs.mkdirSync(path.join(resolved.target, dir), { recursive: true });
    }

    const stageKey = (input.stage ?? "APPROVED") as StageKey;
    const stageDir = path.join(resolved.target, STAGES[stageKey]);
    fs.mkdirSync(stageDir, { recursive: true });

    const finalName = input.filename?.trim()
      ? `${safeName(input.filename)}.mp4`
      : path.basename(input.input);
    const output = path.join(stageDir, finalName);

    const promote = input.promote ?? false;

    if (fs.existsSync(output)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const ext = path.extname(output);
      const base = path.basename(output, ext);
      const renamed = path.join(stageDir, `${base}_${stamp}${ext}`);
      warnings.push(`Já existia um arquivo com esse nome — salvo como ${path.basename(renamed)}.`);
      await copyOrMove(input.input, renamed, input.promote);
      return {
        exported: true,
        output: renamed,
        destinationRoot: resolved.target,
        external: resolved.external,
        destinationAvailable: true,
        sizeBytes: fs.statSync(renamed).size,
        keptOriginal: !input.promote,
        message: `Exportado para ${renamed}`,
        warnings,
      };
    }

    await copyOrMove(input.input, output, input.promote);

    return {
      exported: true,
      output,
      destinationRoot: resolved.target,
      external: resolved.external,
      destinationAvailable: true,
      sizeBytes: fs.statSync(output).size,
      keptOriginal: !input.promote,
      message: `Exportado para ${output}`,
      warnings,
    };
  },
};

/** Copia (ou move) preservando o original quando promote=false. */
async function copyOrMove(from: string, to: string, promote: boolean): Promise<void> {
  if (promote) {
    await fs.promises.rename(from, to).catch(async (err) => {
      // rename falha entre drives diferentes -> cai pra copy+unlink
      if ((err as NodeJS.ErrnoException).code === "EXDEV") {
        await fs.promises.copyFile(from, to);
        await fs.promises.unlink(from);
        return;
      }
      throw err;
    });
    return;
  }
  await fs.promises.copyFile(from, to);
}
