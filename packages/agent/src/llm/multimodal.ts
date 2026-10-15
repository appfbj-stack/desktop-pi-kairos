/**
 * Constrói conteúdo multimodal (text + image blocks) pra LLM.
 *
 * MiniMax-M3 é multimodal nativo (OpenAI-compatible).
 * OpenAI espera: content: [{type:"text", text}, {type:"image_url", image_url:{url:"data:image/png;base64,..."}}]
 *
 * Pra PDF/doc: injeta como texto com path — o LLM usa tool files:read pra abrir.
 */

import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { logger } from "@kairos/core";

export interface MultimodalAttachment {
  /** Path absoluto do arquivo. */
  path: string;
  /** Nome original (pra display). */
  name?: string;
  /** Size em bytes (opcional — calculado se faltar). */
  size?: number;
  /** MIME type (opcional — autodetectado pela extensão). */
  mimeType?: string;
}

/** Mapa simples de extensão → MIME. Sem dep externa. */
const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

/** Limites de proteção. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;   // 20MB
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;   // 50MB total por msg
const MAX_IMAGES = 8;

function detectMime(path: string, provided?: string): string {
  if (provided) return provided;
  const ext = extname(path).toLowerCase();
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

function isImage(path: string, mimeType: string): boolean {
  return IMAGE_EXTS.has(extname(path).toLowerCase()) || mimeType.startsWith("image/");
}

export interface ContentBlock {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
}

/**
 * Monta o array de content blocks OpenAI-compatible.
 * Lê cada imagem do disco, base64-ifica, e injeta como image_url.
 */
export async function buildMultimodalContent(
  text: string,
  attachments: MultimodalAttachment[] = []
): Promise<string | ContentBlock[]> {
  if (!attachments || attachments.length === 0) return text;

  if (attachments.length > MAX_IMAGES) {
    logger.warn({ count: attachments.length, max: MAX_IMAGES }, "muitos anexos — truncando");
    attachments = attachments.slice(0, MAX_IMAGES);
  }

  const blocks: ContentBlock[] = [];
  if (text) blocks.push({ type: "text", text });

  let totalBytes = (text?.length ?? 0);
  let kept = 0;
  let skipped = 0;

  for (const att of attachments) {
    const mimeType = detectMime(att.path, att.mimeType);
    const displayName = att.name ?? basename(att.path);

    let size = att.size ?? 0;
    if (!size) {
      try {
        const st = await stat(att.path);
        size = st.size;
      } catch (e) {
        logger.warn({ path: att.path, err: String(e) }, "anexo não acessível");
        skipped++;
        continue;
      }
    }

    if (!isImage(att.path, mimeType)) {
      blocks.push({
        type: "text",
        text: `\n[anexo: ${displayName} (${(size / 1024).toFixed(1)}KB, ${mimeType}) em ${att.path}]`,
      });
      kept++;
      continue;
    }

    if (size > MAX_IMAGE_BYTES) {
      logger.warn({ path: att.path, size, max: MAX_IMAGE_BYTES }, "imagem grande demais — ignorando");
      blocks.push({
        type: "text",
        text: `\n[anexo: ${displayName} (${(size / 1024).toFixed(0)}KB) — excedeu ${MAX_IMAGE_BYTES / 1024 / 1024}MB, ignorado]`,
      });
      skipped++;
      continue;
    }

    if (totalBytes + size > MAX_TOTAL_BYTES) {
      logger.warn({ totalBytes, size, max: MAX_TOTAL_BYTES }, "budget de bytes estourou — parando");
      blocks.push({
        type: "text",
        text: `\n[anexos restantes ignorados — orçamento de ${MAX_TOTAL_BYTES / 1024 / 1024}MB por mensagem atingido]`,
      });
      skipped++;
      break;
    }

    try {
      const buf = await readFile(att.path);
      const base64 = buf.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64}`;
      blocks.push({
        type: "image_url",
        image_url: { url: dataUrl, detail: "auto" },
      });
      totalBytes += size;
      kept++;
      logger.info({ path: att.path, size, mimeType }, "imagem anexada ao prompt");
    } catch (e) {
      logger.warn({ path: att.path, err: String(e) }, "falha lendo imagem");
      skipped++;
    }
  }

  logger.info({ kept, skipped, total: attachments.length, totalBytes }, "buildMultimodalContent OK");
  return blocks;
}
