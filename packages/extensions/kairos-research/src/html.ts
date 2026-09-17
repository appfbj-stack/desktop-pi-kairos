/**
 * Helpers HTML — convert + regex extraction.
 * Sem deps (zero setup, sem precisar de cheerio/htmlparser).
 */

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BLOCK_TAGS = new Set([
  "script", "style", "noscript", "iframe", "svg", "canvas", "video", "audio",
  "header", "footer", "nav", "aside", "form",
]);

/** Strip HTML tags e retorna texto legível com preservação básica de estrutura. */
export function htmlToText(html: string): string {
  let text = html;

  // Remove blocos inteiros (script, style, etc)
  for (const tag of BLOCK_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
    text = text.replace(re, " ");
  }

  // Substitui tags de bloco por \n
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|td|th|article|section|main|header|footer)[^>]*>/gi, "\n");

  // Remove todas tags restantes
  text = text.replace(/<[^>]+>/g, " ");

  // Decodifica entidades comuns
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

  // Normaliza whitespace
  text = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

  return text;
}

/** Trunca texto em N caracteres preservando palavras completas. */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.7 ? cut.slice(0, lastSpace) : cut) + "…";
}

/** Regex de email (RFC simplificado). */
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** Regex de telefone BR (com ou sem formatação, com DDD opcional, com 9 ou 8 dígitos). */
const PHONE_BR_RE =
  /(?:\+?55\s?)?\(?(?:\d{2}|0\d{2})\)?\s?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/g;

const PHONE_INTL_RE =
  /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,5}[\s.-]?\d{3,5}\b/g;

const SOCIAL_RE = {
  instagram: /\b(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,30})\b/gi,
  facebook: /\b(?:https?:\/\/)?(?:www\.)?facebook\.com\/([A-Za-z0-9._-]{2,50})\b/gi,
  linkedin: /\b(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|company)\/([A-Za-z0-9._-]{3,100})\b/gi,
  whatsapp: /\b(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send\?phone=)(\d{10,15})\b/gi,
  twitter: /\b(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\b/gi,
  youtube: /\b(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:@|channel\/|user\/)?([A-Za-z0-9._-]{2,40})\b/gi,
};

export function extractEmails(text: string): string[] {
  return [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
}

export function extractPhones(text: string, region: "BR" | "INTL" = "BR"): string[] {
  const re = region === "BR" ? PHONE_BR_RE : PHONE_INTL_RE;
  return [...new Set((text.match(re) ?? []).map((p) => p.replace(/\s+/g, " ").trim()))];
}

export function extractSocials(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [platform, re] of Object.entries(SOCIAL_RE)) {
    const matches = [...text.matchAll(re)].map((m) => m[0]);
    if (matches.length) out[platform] = [...new Set(matches)];
  }
  return out;
}