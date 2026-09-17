/**
 * marketing:carousel — gera uma imagem de carrossel/post com texto sobre fundo.
 *
 * O fundo pode ser:
 *   - path absoluto de uma imagem existente
 *   - Buffer (imagem pré-gerada via image_synthesize, fora deste tool)
 *
 * Texto é composto via Sharp + SVG (com sombra dourada por default).
 *
 * Saída: PNG 1080x1350 (Instagram portrait) ou 1080x1080 (quadrado).
 */

import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import type { Tool } from "@kairos/agent";
import { composeCarousel, type TextBlock } from "../text-overlay.js";

const inputSchema = z.object({
  backgroundPath: z
    .string()
    .describe("Caminho absoluto da imagem de fundo (PNG/JPG/WEBP). Pode estar no workspace."),
  title: z.string().max(120).describe("Título principal"),
  subtitle: z.string().max(200).optional().describe("Subtítulo / frase de apoio"),
  verse: z.string().max(120).optional().describe("Citação (ex: '1 Pedro 4:10')"),
  brand: z.string().max(60).optional().describe("Nome/assinatura (ex: 'Fernando Borges')"),
  width: z.number().int().min(400).max(4000).default(1080),
  height: z.number().int().min(400).max(4000).default(1350),
  outputPath: z.string().describe("Caminho absoluto do PNG de saída"),
});

export const carouselTool: Tool<typeof inputSchema> = {
  name: "marketing:carousel",
  description:
    "Gera uma imagem estilo carrossel/post (texto sobre fundo) com tipografia serifa elegante. " +
    "Use pra divulgar apps, versículos, frases, anúncios. Saída PNG. " +
    "Caminho do fundo deve ser absoluto (ex: workspace:marketing/fundo.png).",
  inputSchema,
  execute: async (input) => {
    const bgBuffer = await fs.readFile(input.backgroundPath);

    const width = input.width;
    const height = input.height;

    // Posições em % da altura (top-down)
    const texts: TextBlock[] = [];

    if (input.title) {
      texts.push({
        text: input.title.toUpperCase(),
        fontSize: Math.round(width * 0.11),
        top: Math.round(height * 0.06),
        color: "#FFF8E7",
        family: "serif",
        bgOpacity: 0,
      });
    }

    if (input.subtitle) {
      texts.push({
        text: input.subtitle,
        fontSize: Math.round(width * 0.045),
        top: Math.round(height * 0.82),
        color: "#FFF8E7",
        family: "serif",
        bgOpacity: 0.45,
      });
    }

    if (input.verse) {
      texts.push({
        text: input.verse,
        fontSize: Math.round(width * 0.035),
        top: Math.round(height * 0.93),
        color: "#D4AF37",
        family: "serif",
        align: "center",
      });
    }

    if (input.brand) {
      texts.push({
        text: input.brand,
        fontSize: Math.round(width * 0.028),
        top: Math.round(height * 0.97),
        color: "#D4AF37",
        family: "serif",
        align: "center",
      });
    }

    const composed = await composeCarousel({ base: bgBuffer, width, height, texts });

    const outAbs = path.resolve(input.outputPath);
    await fs.mkdir(path.dirname(outAbs), { recursive: true });
    await fs.writeFile(outAbs, composed);

    return {
      ok: true,
      savedTo: outAbs,
      bytes: composed.length,
      width,
      height,
      message: `🎨 Carrossel salvo em ${outAbs} (${composed.length} bytes, ${width}x${height}).`,
    };
  },
};