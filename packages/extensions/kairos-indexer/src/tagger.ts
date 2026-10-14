/**
 * Tagger heurístico — gera tags a partir do path/ext/mime/nome do arquivo.
 *
 * Categorias:
 *  - Tipo de arquivo (document, image, video, audio, spreadsheet, code, archive)
 *  - Categoria semântica (invoice, contract, receipt, report, photo, screenshot)
 *  - Tags adicionais por extensão (pdf, docx, etc)
 *
 * AI-tag (via LLM/embeddings) é um TODO — heurística cobre 80% dos casos.
 */

const EXT_TYPE_MAP: Record<string, string> = {
  // documents
  pdf: "document",
  doc: "document",
  docx: "document",
  odt: "document",
  rtf: "document",
  txt: "text",
  md: "text",
  // spreadsheets
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  csv: "spreadsheet",
  ods: "spreadsheet",
  // presentations
  ppt: "presentation",
  pptx: "presentation",
  odp: "presentation",
  // images
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  svg: "image",
  heic: "image",
  // video
  mp4: "video",
  mov: "video",
  avi: "video",
  mkv: "video",
  webm: "video",
  // audio
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  flac: "audio",
  m4a: "audio",
  // code
  ts: "code",
  tsx: "code",
  js: "code",
  jsx: "code",
  py: "code",
  rb: "code",
  go: "code",
  rs: "code",
  java: "code",
  cpp: "code",
  c: "code",
  h: "code",
  cs: "code",
  php: "code",
  swift: "code",
  kt: "code",
  // markup/data
  html: "code",
  css: "code",
  json: "data",
  yaml: "data",
  yml: "data",
  xml: "data",
  sql: "data",
  // archives
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
  // ebooks
  epub: "ebook",
  mobi: "ebook",
  azw: "ebook",
  azw3: "ebook",
};

const MIME_TYPE_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/json": "json",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "text",
  "text/csv": "csv",
  "text/html": "html",
  "text/markdown": "markdown",
  "image/": "image",
  "video/": "video",
  "audio/": "audio",
};

const KEYWORD_TAGS: { pattern: RegExp; tag: string }[] = [
  // financeiro
  { pattern: /\b(invoice|nota[\s_-]?fiscal|nf[\s_-]?|fatura|boleto)\b/i, tag: "invoice" },
  { pattern: /\b(receipt|recibo|comprovante)\b/i, tag: "receipt" },
  { pattern: /\b(contract|contrato)\b/i, tag: "contract" },
  { pattern: /\b(proposta|proposal|quote|cotacao|cotação)\b/i, tag: "proposal" },
  { pattern: /\b(relatorio|relatório|report)\b/i, tag: "report" },
  // RH
  { pattern: /\b(curriculo|currículo|cv|resume)\b/i, tag: "resume" },
  { pattern: /\b(candidato|applicant)\b/i, tag: "candidate" },
  // mídia
  { pattern: /\b(screenshot|captura|capture)\b/i, tag: "screenshot" },
  { pattern: /\b(photo|foto)\b/i, tag: "photo" },
  { pattern: /\b(logo)\b/i, tag: "logo" },
  // igreja/pastoral
  { pattern: /\b(sermao|pastor|sermão|pregação|pregacao)\b/i, tag: "sermon" },
  { pattern: /\b(estudo|biblia|bíblia|bible)\b/i, tag: "bible-study" },
  // genéricos
  { pattern: /\b(backup)\b/i, tag: "backup" },
  { pattern: /\b(temp|tmp)\b/i, tag: "temporary" },
  { pattern: /\b(draft|rascunho)\b/i, tag: "draft" },
  { pattern: /\b(final|approved|publicado)\b/i, tag: "final" },
  // datas (YYYY-MM-DD ou YYYYMMDD)
  { pattern: /\b(20\d{2})[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])\b/, tag: "dated" },
];

const KEYWORD_TAG_FOLDERS: { pattern: RegExp; tag: string }[] = [
  { pattern: /\/(financeiro|finance|financ)/i, tag: "finance" },
  { pattern: /\/(cliente|clientes|client|clients)/i, tag: "client" },
  { pattern: /\/(projeto|projetos|project|projects)/i, tag: "project" },
  { pattern: /\/(notas|notes)/i, tag: "notes" },
  { pattern: /\/(arquivo|archives|acervo)/i, tag: "archive-folder" },
  { pattern: /\/(download|downloads)/i, tag: "download" },
  { pattern: /\/(desktop|desktop)\b/i, tag: "desktop" },
  { pattern: /\/(documents?|documentos?)/i, tag: "documents-folder" },
  { pattern: /\/(pictures|fotos|imagens|images|photos?)\b/i, tag: "pictures" },
  { pattern: /\/(videos?|filmes|movies?)/i, tag: "videos-folder" },
];

/** Gera tags heurísticas pra um arquivo. Sempre retorna array lowercase único. */
export function tagFile(input: {
  path: string;
  ext: string | null;
  mime: string | null;
}): string[] {
  const tags = new Set<string>();
  const ext = (input.ext ?? "").toLowerCase().replace(/^\./, "");
  const mime = (input.mime ?? "").toLowerCase();
  const path = input.path;

  // 1. Tipo por extensão
  if (ext && EXT_TYPE_MAP[ext]) {
    tags.add(EXT_TYPE_MAP[ext]);
  }

  // 2. Tag da própria extensão (pdf, docx, jpg...)
  if (ext && ext.length <= 6) tags.add(ext);

  // 3. Tipo por MIME (se extensão não cobriu)
  if (mime) {
    for (const [prefix, tag] of Object.entries(MIME_TYPE_MAP)) {
      if (mime === prefix || mime.startsWith(prefix)) {
        tags.add(tag);
        break;
      }
    }
  }

  // 4. Keywords no path
  for (const { pattern, tag } of KEYWORD_TAGS) {
    if (pattern.test(path)) tags.add(tag);
  }

  // 5. Pastas especiais
  for (const { pattern, tag } of KEYWORD_TAG_FOLDERS) {
    if (pattern.test(path)) tags.add(tag);
  }

  // 6. Heurística: arquivo grande (>10MB) → "large"
  // (não temos size aqui, mas podemos inferir por path se vier)

  return Array.from(tags).filter(Boolean);
}

/** Preview de conteúdo. Extrai primeiros N chars pra arquivos texto. */
const PREVIEW_MAX = 2000;
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "yaml", "yml", "xml", "html", "css",
  "ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "cpp", "c",
  "h", "cs", "php", "swift", "kt", "sh", "bash", "sql", "log", "ini", "toml",
  "env", "gitignore", "conf",
]);

/** Decide se deve tentar extrair preview baseado em extensão. */
export function shouldExtractPreview(ext: string | null, size: number): boolean {
  if (!ext) return false;
  if (size > 256 * 1024) return false; // >256KB não vale
  return TEXT_EXTENSIONS.has(ext.toLowerCase().replace(/^\./, ""));
}

/** Lê primeiros N chars de arquivo texto (UTF-8). Retorna null se falhar. */
export function extractPreview(filePath: string, ext: string | null, size: number): string | null {
  if (!shouldExtractPreview(ext, size)) return null;
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(Math.min(size, PREVIEW_MAX));
      fs.readSync(fd, buf, 0, buf.length, 0);
      // filtra binários
      const text = buf.toString("utf8");
      // Se tem muitos null bytes, é binário
      const nullCount = (text.match(/\u0000/g) ?? []).length;
      if (nullCount > 10) return null;
      return text.trim().slice(0, PREVIEW_MAX);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}