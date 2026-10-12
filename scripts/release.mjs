#!/usr/bin/env node
/**
 * release.mjs -- Orquestrador de release.
 *
 * Fluxo:
 *   1. Sincroniza publish config (R2 ou GitHub) via env vars
 *   2. Le versao do apps/electron/package.json
 *   3. Valida env vars (R2_* se provider=generic)
 *   4. Roda pnpm package:win (a menos que --skip-build)
 *   5. Confirma que o instalador existe em apps/electron/release/
 *   6. Calcula SHA-256 + salva em .sha256 (auditoria)
 *   7. Chama scripts/publish-r2.mjs como sub-processo
 *
 * Uso:
 *   node scripts/release.mjs                    # le versao do package.json
 *   node scripts/release.mjs --version 0.6.0   # override explicito
 *   node scripts/release.mjs --skip-build       # nao rebuilda
 *   node scripts/release.mjs --dry-run         # valida tudo, nao faz upload
 *
 * Env vars:
 *   PUBLISH_PROVIDER=generic|github (default: github)
 *   PUBLISH_URL=https://download.kairos.com.br/releases/latest/  (se generic)
 *   CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *   R2_PUBLIC_BASE_URL (URL publica pra mostrar no log final)
 */

import { spawn } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const ELECTRON_DIR = join(REPO_ROOT, "apps", "electron");

// ---------- args ----------
function parseArgs(argv) {
  const args = {
    version: null,
    skipBuild: false,
    dryRun: false,
    productName: "Kairos.Desktop.Alves",
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--version") args.version = argv[++i];
    else if (k === "--skip-build") args.skipBuild = true;
    else if (k === "--dry-run") args.dryRun = true;
    else if (k === "--product") args.productName = argv[++i];
    else if (k === "--help" || k === "-h") {
      console.log("Uso: node scripts/release.mjs [opcoes]");
      console.log("");
      console.log("Opcoes:");
      console.log("  --version <X.Y.Z>    Override da versao (default: apps/electron/package.json)");
      console.log("  --skip-build         Nao rebuilda; usa o instalador existente");
      console.log("  --dry-run            Valida tudo, NAO faz upload");
      console.log("  --product <name>     Nome do produto (default: Kairos.Desktop.Alves)");
      process.exit(0);
    }
  }
  return args;
}

// ---------- helpers ----------
async function getVersion() {
  const pkg = JSON.parse(await readFile(join(ELECTRON_DIR, "package.json"), "utf8"));
  return pkg.version;
}

async function findInstaller(productName) {
  const version = await getVersion();
  const exeName = `${productName}-Setup-${version}.exe`;
  const path = join(ELECTRON_DIR, "release", exeName);
  if (!existsSync(path)) return null;
  return { path, name: exeName, version };
}

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

function runProcess(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...opts,
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${opts.label || cmd} falhou (exit ${code})`));
    });
    child.on("error", reject);
  });
}

async function runBuild() {
  console.log("Building instalador (apps/electron)...");
  await runProcess("pnpm", ["package:win"], {
    cwd: ELECTRON_DIR,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
    label: "build",
  });
}

async function runSyncPublishConfig() {
  console.log("Sincronizando publish config...");
  await runProcess("node", ["scripts/sync-publish-config.mjs"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
    label: "sync-publish-config",
  });
}

async function runPublish(version, exePath) {
  console.log("");
  await runProcess("node", [
    "scripts/publish-r2.mjs",
    "--file", exePath,
    "--version", version,
  ], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
    label: "publish-r2",
  });
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv);

  // Versao
  const version = args.version || (await getVersion());
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    console.error(`Versao invalida: ${version}`);
    process.exit(1);
  }
  console.log(`Versao: ${version}`);

  // Sincroniza publish config (R2 vs GitHub)
  await runSyncPublishConfig();

  // Valida env vars (so se nao for dry-run)
  if (!args.dryRun) {
    const required = ["CLOUDFLARE_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
    const missing = required.filter((k) => !process.env[k]?.trim());
    if (missing.length) {
      console.error(`Env vars faltando: ${missing.join(", ")}`);
      console.error(`   Carregue scripts/.env antes (source scripts/.env ou export VAR=valor)`);
      process.exit(1);
    }
  }

  // Build (a menos que skip-build)
  if (!args.skipBuild) {
    await runBuild();
  } else {
    console.log("Skipping build (--skip-build)");
  }

  // Localiza o instalador
  const installer = await findInstaller(args.productName);
  if (!installer) {
    console.error(`Instalador nao encontrado: apps/electron/release/${args.productName}-Setup-${version}.exe`);
    if (args.skipBuild) {
      console.error(`   Rode sem --skip-build pra gerar, ou use --version correto`);
    }
    process.exit(1);
  }
  const statInfo = await stat(installer.path);
  const sha = await sha256File(installer.path);
  console.log(`Instalador: ${installer.name} (${(statInfo.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   SHA-256:    ${sha}`);

  // Salva SHA local pra auditoria
  const shaFile = join(ELECTRON_DIR, "release", `${installer.name}.sha256`);
  await writeFile(shaFile, `${sha}  ${installer.name}\n`, "utf8");
  console.log(`   SHA-256 salvo em: ${shaFile}`);

  // Publica
  if (args.dryRun) {
    console.log("");
    console.log("DRY-RUN: tudo OK. Para publicar de verdade, remova --dry-run.");
    return;
  }
  await runPublish(installer.version, installer.path);

  // Resumo final
  console.log("");
  console.log("============================================");
  console.log(`Release v${version} publicada!`);
  console.log(`   Instalador: apps/electron/release/${installer.name}`);
  console.log(`   SHA-256:    ${sha}`);
  const pub = process.env.R2_PUBLIC_BASE_URL || "(defina R2_PUBLIC_BASE_URL)";
  console.log(`   URL publica: ${pub}/releases/v${version}/${installer.name}`);
  console.log(`   latest.yml:  ${pub}/releases/latest/latest.yml`);
  console.log("");
  console.log("Proximos passos:");
  console.log(`   1. Atualizar a pagina de download (web/download/index.html) com versao e SHA`);
  console.log(`   2. (Opcional) Criar tag git + GitHub release com o mesmo instalador`);
  console.log("============================================");
}

main().catch((err) => {
  console.error("Falhou:", err.message);
  process.exit(1);
});
