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
  /** Path absoluto do arquivo (lê do disco se informado). */
  path?: string;
  /** Conteúdo pré-built (data URL ou texto cru) — pula leitura do disco. */
  data?: string;
  /** Nome original (pra display). */
  name?: string;
  /** Size em bytes (opcional — calculado se faltar). */
  size?: number;
  /** MIME type (opcional — autodetectado pela extensão). */
  mimeType?: string;
}

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

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_IMAGES = 8;

function detectMime(p: string, provided?: string): string {
  if (provided) return provided;
  const ext = extname(p).toLowerCase();
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

function isImage(p: string, mimeType: string): boolean {
  return IMAGE_EXTS.has(extname(p).toLowerCase()) || mimeType.startsWith("image/");
}

export interface ContentBlock {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
}

/**
 * Monta o array de content blocks OpenAI-compatible.
 * Anexos podem vir por path (lê do disco) ou com data pré-built (data URL do IPC).
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
    const mimeType = detectMime(att.path ?? "", att.mimeType);
    const displayName = att.name ?? (att.path ? basename(att.path) : "anexo");

    let size = att.size ?? 0;
    if (!size && att.path) {
      try {
        const st = await stat(att.path);
        size = st.size;
      } catch (e) {
        logger.warn({ path: att.path, err: String(e) }, "anexo não acessível");
        skipped++;
        continue;
      }
    }

    // Não-imagem: injeta referência textual pro LLM usar tool files:read
    if (!att.data && !isImage(att.path ?? "", mimeType)) {
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
        text: `\n[anexos restantes ignorados — orçamento de ${MAX_TOTAL_BYTES / 1024 / 1024}MB atingido]`,
      });
      skipped++;
      break;
    }

    try {
      let dataUrl: string;
      if (att.data) {
        if (att.data.startsWith("data:")) {
          dataUrl = att.data;
        } else {
          const b64 = Buffer.from(att.data, "utf-8").toString("base64");
          dataUrl = `data:${mimeType};base64,${b64}`;
        }
      } else if (att.path) {
        const buf = await readFile(att.path);
        const base64 = buf.toString("base64");
        dataUrl = `data:${mimeType};base64,${base64}`;
      } else {
        logger.warn({ displayName }, "anexo sem path nem data — pulando");
        skipped++;
        continue;
      }
      blocks.push({
        type: "image_url",
        image_url: { url: dataUrl, detail: "auto" },
      });
      totalBytes += size;
      kept++;
      logger.info({ path: att.path || "(data)", size, mimeType }, "imagem anexada ao prompt");
    } catch (e) {
      logger.warn({ path: att.path, err: String(e) }, "falha lendo imagem");
      skipped++;
    }
  }

  logger.info({ kept, skipped, total: attachments.length, totalBytes }, "buildMultimodalContent OK");
  return blocks;
}
