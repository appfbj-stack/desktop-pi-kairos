/**
 * kairos-marketing — geração de conteúdo visual pra divulgação.
 *
 * Tools expostas:
 *   - marketing:carousel  imagem com texto sobre fundo (PNG)
 *   - marketing:slideshow MP4 slideshow de várias imagens (ffmpeg)
 *
 * Stack:
 *   - Sharp (composição SVG + texto)
 *   - ffmpeg (slideshow) — precisa estar no PATH
 *   - image_synthesize (geração de fundo via IA, fora deste tool)
 *
 * Workflow típico:
 *   1. image_synthesize gera fundo (em outro tool/LLM)
 *   2. marketing:carousel sobrepõe texto + salva PNG
 *   3. Repete pra cada slide do carrossel
 *   4. marketing:slideshow junta tudo em MP4
 */

import { z } from "zod";
import type { Extension, Tool } from "@kairos/agent";
import { carouselTool } from "./tools/carousel.js";
import { slideshowTool } from "./tools/slideshow.js";

const extension: Extension = {
  name: "kairos-marketing",
  version: "0.1.0",
  description:
    "Marketing visual: gera carrosséis (PNG com texto) e monta slideshows em MP4. " +
    "Use pra divulgar apps, versículos, frases, anúncios em redes sociais.",
  tools: [carouselTool, slideshowTool] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };