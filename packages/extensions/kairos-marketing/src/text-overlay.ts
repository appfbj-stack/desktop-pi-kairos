/**
 * Compositor de texto via SVG + Sharp.
 *
 * Gera SVG com o texto em fonte serif/script, depois sharp sobrepõe em uma imagem base.
 * Retorna Buffer PNG.
 */

import sharp from "sharp";

export interface TextBlock {
  text: string;
  /** Tamanho em px (largura da imagem final) */
  fontSize?: number;
  /** Cor (CSS) — default: branco com sombra dourada */
  color?: string;
  /** Alinhamento horizontal */
  align?: "left" | "center" | "right";
  /** Margem do topo (px) */
  top?: number;
  /** Margem lateral (px) */
  marginX?: number;
  /** Família: serif, sans-serif, cursive */
  family?: "serif" | "sans-serif" | "cursive";
  /** Espaçamento entre linhas */
  lineSpacing?: number;
  /** Opacidade do background do texto (0-1) — 0 = sem fundo */
  bgOpacity?: number;
}

export interface CarouselOptions {
  /** Imagem base (Buffer ou path) */
  base: Buffer | string;
  /** Largura final (px). Default 1080 (Instagram square) */
  width?: number;
  /** Altura final (px). Default 1350 (Instagram portrait) */
  height?: number;
  /** Blocos de texto sobrepostos (de cima pra baixo) */
  texts: TextBlock[];
}

/** Quebra texto em múltiplas linhas se passar maxChars. */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = current ? current + " " + w : w;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Gera SVG do texto. Width/height passados pra dimensionar. */
function buildTextSvg(
  width: number,
  height: number,
  texts: TextBlock[]
): string {
  const chunks: string[] = [];
  chunks.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );

  for (const t of texts) {
    const fontSize = t.fontSize ?? Math.round(width * 0.06);
    const color = t.color ?? "#FFF8E7";
    const family = t.family ?? "serif";
    const marginX = t.marginX ?? Math.round(width * 0.06);
    const align = t.align ?? "center";
    const anchor =
      align === "left" ? "start" : align === "right" ? "end" : "middle";
    const x =
      align === "left" ? marginX : align === "right" ? width - marginX : width / 2;
    const lineSpacing = t.lineSpacing ?? fontSize * 1.2;
    const bgOpacity = t.bgOpacity ?? 0;

    // Wrap em múltiplas linhas se necessário
    const maxCharsPerLine = Math.floor(width / (fontSize * 0.5)) - 4;
    const lines = wrapText(t.text, maxCharsPerLine);

    const topPx = t.top ?? Math.round(height * 0.05);

    // Background opcional (semi-transparent preto atrás do texto)
    if (bgOpacity > 0) {
      const blockHeight = lines.length * lineSpacing + 20;
      chunks.push(
        `<rect x="0" y="${topPx - 10}" width="${width}" height="${blockHeight}" fill="rgba(0,0,0,${bgOpacity})" />`
      );
    }

    // Linhas de texto com sombra dourada (efeito do exemplo)
    lines.forEach((line, i) => {
      const y = topPx + (i + 1) * lineSpacing;
      // Sombra dourada sutil (camada por trás)
      chunks.push(
        `<text x="${x + 2}" y="${y + 2}" font-family="${family}" font-size="${fontSize}" font-weight="700" fill="rgba(180,140,60,0.6)" text-anchor="${anchor}">${escapeXml(line)}</text>`
      );
      // Texto principal
      chunks.push(
        `<text x="${x}" y="${y}" font-family="${family}" font-size="${fontSize}" font-weight="700" fill="${color}" text-anchor="${anchor}">${escapeXml(line)}</text>`
      );
    });
  }

  chunks.push(`</svg>`);
  return chunks.join("");
}

/** Compõe texto em cima de uma imagem base. */
export async function composeCarousel(opts: CarouselOptions): Promise<Buffer> {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1350;

  let baseBuffer: Buffer;
  if (typeof opts.base === "string") {
    baseBuffer = await sharp(opts.base).resize(width, height, { fit: "cover" }).toBuffer();
  } else {
    baseBuffer = await sharp(opts.base).resize(width, height, { fit: "cover" }).toBuffer();
  }

  const textSvg = buildTextSvg(width, height, opts.texts);

  const result = await sharp(baseBuffer)
    .composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }])
    .png({ quality: 95 })
    .toBuffer();

  return result;
}