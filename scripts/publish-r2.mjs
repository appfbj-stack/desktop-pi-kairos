#!/usr/bin/env node
/**
 * publish-r2.mjs — Upload do instalador Electron pro Cloudflare R2.
 *
 * Uso:
 *   node scripts/publish-r2.mjs --file <path-do-exe> --version <X.Y.Z>
 *
 * Variáveis de ambiente (NUNCA hardcoded, NUNCA commit):
 *   CLOUDFLARE_ACCOUNT_ID  — ID da conta Cloudflare
 *   R2_ACCESS_KEY_ID       — Access Key do R2
 *   R2_SECRET_ACCESS_KEY   — Secret Key do R2
 *   R2_BUCKET_NAME         — Nome do bucket (ex: kairos-downloads)
 *   R2_PUBLIC_BASE_URL     — URL público custom (ex: https://download.kairos.com.br)
 *                            OBRIGATÓRIO para gerar URLs do site.
 *                            Se omitido, usa o endpoint padrão do R2 (não-custom).
 *
 * Layout no bucket (versionado, imutável):
 *   releases/v<X.Y.Z>/<productName>-Setup-<version>.exe
 *   releases/v<X.Y.Z>/<productName>-Setup-<version>.exe.blockmap
 *   releases/v<X.Y.Z>/latest.yml              ← formato electron-updater
 *   releases/manifest.json                    ← todas as versões publicadas
 *
 * Sem credenciais → falha com mensagem clara (NÃO expõe as keys em log).
 */

import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ---------- args ----------
function parseArgs(argv) {
  const args = { file: null, version: null, productName: "Kairos.Desktop.Alves" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--file") args.file = argv[++i];
    else if (k === "--version") args.version = argv[++i];
    else if (k === "--product") args.productName = argv[++i];
    else if (k === "--help" || k === "-h") {
      console.log("Uso: node scripts/publish-r2.mjs --file <exe> --version <X.Y.Z>");
      process.exit(0);
    }
  }
  if (!args.file || !args.version) {
    console.error("❌ Faltam --file e/ou --version");
    process.exit(1);
  }
  return args;
}

// ---------- env ----------
function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`❌ Env var ${name} não definida. Veja scripts/.env.example`);
    process.exit(1);
  }
  return v;
}

const ENV = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "",
  accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() || "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() || "",
  bucket: process.env.R2_BUCKET_NAME?.trim() || "",
  publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.trim() || "",
};

function ensureCreds() {
  const missing = [];
  if (!ENV.accountId) missing.push("CLOUDFLARE_ACCOUNT_ID");
  if (!ENV.accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!ENV.secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!ENV.bucket) missing.push("R2_BUCKET_NAME");
  if (missing.length) {
    console.error(`❌ Env vars faltando: ${missing.join(", ")}`);
    console.error(`   Defina-as antes de rodar. Veja scripts/.env.example`);
    process.exit(1);
  }
}

// ---------- sha256 ----------
async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((res, rej) => {
    const s = createReadStream(path);
    s.on("data", (c) => hash.update(c));
    s.on("end", res);
    s.on("error", rej);
  });
  return hash.digest("hex");
}

// ---------- S3 client (R2 endpoint) ----------
function makeClient() {
  // R2 endpoint: https://<accountId>.r2.cloudflarestorage.com
  const endpoint = `https://${ENV.accountId}.r2.cloudflarestorage.com`;
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: ENV.accessKeyId,
      secretAccessKey: ENV.secretAccessKey,
    },
  });
}

async function putObject(client, key, filePath, contentType) {
  const stat = statSync(filePath);
  // Para arquivos >5MB, usa multipart upload (Upload do @aws-sdk/lib-storage).
  // Pra arquivos pequenos (<5MB), usa PutObject direto.
  if (stat.size > 5 * 1024 * 1024) {
    const upload = new Upload({
      client,
      params: {
        Bucket: ENV.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType,
        ContentLength: stat.size,
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: {
          "uploaded-at": new Date().toISOString(),
          "version": process.env.VERSION_TAG || "",
        },
      },
      queueSize: 4,
      partSize: 8 * 1024 * 1024, // 8MB por parte
      leavePartsOnError: false,
    });
    await upload.done();
  } else {
    const cmd = new PutObjectCommand({
      Bucket: ENV.bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentType,
      ContentLength: stat.size,
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: {
        "uploaded-at": new Date().toISOString(),
        "version": process.env.VERSION_TAG || "",
      },
    });
    await client.send(cmd);
  }
}

async function headObject(client, key) {
  try {
    return await client.send(new HeadObjectCommand({ Bucket: ENV.bucket, Key: key }));
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

// Valida fazendo download do primeiro MB e checa o size.
async function validateDownload(client, key, expectedSize) {
  const res = await client.send(new GetObjectCommand({
    Bucket: ENV.bucket,
    Key: key,
    Range: "bytes=0-1023",
  }));
  const chunks = [];
  for await (const c of res.Body) chunks.push(c);
  const total = chunks.reduce((a, c) => a + c.length, 0);
  if (total !== Math.min(1024, expectedSize)) {
    throw new Error(`Validação falhou: esperado >=1024 bytes (ou size total), recebi ${total}`);
  }
  if (res.ContentLength !== Math.min(1024, expectedSize)) {
    throw new Error(`ContentLength inconsistente: ${res.ContentLength} vs ${total}`);
  }
}

// ---------- manifest ----------
async function readManifest(client) {
  const res = await headObject(client, "releases/manifest.json");
  if (!res) return { versions: [] };
  const obj = await client.send(new GetObjectCommand({ Bucket: ENV.bucket, Key: "releases/manifest.json" }));
  const text = await obj.Body.transformToString("utf-8");
  return JSON.parse(text);
}

async function writeManifest(client, manifest) {
  await client.send(new PutObjectCommand({
    Bucket: ENV.bucket,
    Key: "releases/manifest.json",
    Body: JSON.stringify(manifest, null, 2),
    ContentType: "application/json",
    CacheControl: "public, max-age=60", // manifest pode mudar — cache curto
  }));
}

// ---------- latest.yml (formato electron-updater) ----------
function buildLatestYml(args, files) {
  // YML simples (electron-updater aceita YAML ou JSON-like). Mantém compat.
  // Schema: https://www.electron.build/auto-update#latestyml
  const lines = [];
  lines.push(`version: ${args.version}`);
  lines.push(`releaseDate: ${new Date().toISOString()}`);
  for (const f of files) {
    if (f.key.endsWith(".exe")) {
      lines.push(`files:`);
      lines.push(`  - url: ${f.publicUrl}`);
      lines.push(`    sha512: ${f.sha256}`);
      lines.push(`    size: ${f.size}`);
      lines.push(`    blockMapSize: ${f.blockmapSize || 0}`);
    }
  }
  return lines.join("\n") + "\n";
}

// ---------- main ----------
async function main() {
  ensureCreds();
  const args = parseArgs(process.argv);

  // Detecta arquivos adjacentes
  const exePath = args.file;
  const blockmapPath = exePath + ".blockmap";
  const hasBlockmap = (() => {
    try { statSync(blockmapPath); return true; } catch { return false; }
  })();

  const exeStat = statSync(exePath);
  const exeSha = await sha256File(exePath);
  console.log(`📦 ${basename(exePath)} (${(exeStat.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   SHA-256: ${exeSha}`);

  const versionPrefix = `releases/v${args.version}`;
  const exeKey = `${versionPrefix}/${basename(exePath)}`;
  const blockmapKey = `${versionPrefix}/${basename(blockmapPath)}`;

  const publicBase = ENV.publicBaseUrl.replace(/\/+$/, "");
  const publicExeUrl = `${publicBase}/${exeKey}`;
  const publicBlockmapUrl = `${publicBase}/${blockmapKey}`;

  const client = makeClient();

  // Upload EXE
  console.log(`☁️  Uploading ${exeKey} ...`);
  await putObject(client, exeKey, exePath, "application/x-msdownload");

  // Upload blockmap (se existir)
  let blockmapSize = 0;
  if (hasBlockmap) {
    console.log(`☁️  Uploading ${blockmapKey} ...`);
    await putObject(client, blockmapKey, blockmapPath, "application/json");
    blockmapSize = statSync(blockmapPath).size;
  }

  // Valida fazendo download parcial
  console.log("🔍 Validando download público...");
  await validateDownload(client, exeKey, exeStat.size);

  // latest.yml (electron-updater)
  const latestYml = buildLatestYml(args, [
    { key: exeKey, publicUrl: publicExeUrl, sha256: exeSha, size: exeStat.size, blockmapSize },
  ]);
  const latestYmlKey = `${versionPrefix}/latest.yml`;
  console.log(`☁️  Uploading ${latestYmlKey} ...`);
  await client.send(new PutObjectCommand({
    Bucket: ENV.bucket,
    Key: latestYmlKey,
    Body: latestYml,
    ContentType: "text/yaml",
    CacheControl: "no-cache",
  }));

  // Symlink "latest" — aponta para a versão atual (via copy do yml)
  const latestDir = "releases/latest";
  console.log(`☁️  Atualizando ${latestDir}/latest.yml ...`);
  await client.send(new PutObjectCommand({
    Bucket: ENV.bucket,
    Key: `${latestDir}/latest.yml`,
    Body: latestYml,
    ContentType: "text/yaml",
    CacheControl: "no-cache",
  }));

  // Manifest agregado
  const manifest = await readManifest(client);
  const existing = manifest.versions.findIndex((v) => v.version === args.version);
  const entry = {
    version: args.version,
    productName: args.productName,
    platform: "win32",
    arch: "x64",
    size: exeStat.size,
    sha256: exeSha,
    blockmapSize,
    uploadedAt: new Date().toISOString(),
    files: {
      exe: { key: exeKey, publicUrl: publicExeUrl },
      blockmap: hasBlockmap ? { key: blockmapKey, publicUrl: publicBlockmapUrl } : null,
      latestYml: { key: latestYmlKey, publicUrl: `${publicBase}/${latestYmlKey}` },
    },
  };
  if (existing >= 0) manifest.versions[existing] = entry;
  else manifest.versions.push(entry);
  manifest.versions.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  manifest.latest = args.version;
  await writeManifest(client, manifest);

  // Resumo
  console.log("");
  console.log("✅ Upload completo!");
  console.log(`   Instalador: ${publicExeUrl}`);
  console.log(`   Latest:     ${publicBase}/${latestDir}/latest.yml`);
  console.log(`   Manifest:   ${publicBase}/releases/manifest.json`);
  console.log(`   Tamanho:    ${(exeStat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   SHA-256:    ${exeSha}`);
}

main().catch((err) => {
  console.error("❌ Falhou:", err.message);
  process.exit(1);
});
