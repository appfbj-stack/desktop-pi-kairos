#!/usr/bin/env node
/**
 * release.mjs — Orquestrador de release.
 *
 * Fluxo:
 *   1. Valida env vars
 *   2. Lê versão do apps/electron/package.json
 *   3. Confirma que o instalador existe em apps/electron/release/
 *   4. Calcula SHA-256 antes do upload (comparação com o que o R2 recebeu)
 *   5. Chama publish-r2.mjs como sub-processo
 *   6. (Opcional) Gera resumo pra colar no GitHub Release
 *
 * Uso:
 *   node scripts/release.mjs                    # lê versão do package.json
 *   node scripts/release.mjs --version 0.6.0   # override explícito
 *   node scripts/release.mjs --skip-build       # não rebuilda (usa release/ existente)
 *   node scripts/release.mjs --dry-run          # valida tudo, não faz upload
 */

import { spawn } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
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
      console.log(`Uso: node scripts/release.mjs [opções]

Opções:
  --version <X.Y.Z>    Override da versão (default: apps/electron/package.json)
  --skip-build         Não rebuilda; usa o instalador em apps/electron/release/ existente
  --dry-run            Valida tudo, NÃO faz upload
  --product <name>     Nome do produto (default: Kairos.Desktop.Alves)`);
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
  // electron-builder produz: release/<productName>-Setup-<version>.exe
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

async function runBuild() {
  console.log("🔨 Building instalador (apps/electron)...");
  // Roda `pnpm package:win` no apps/electron.
  // Esse script faz: pnpm icons && pnpm vendor && pnpm build && pnpm deploy && pnpm package:win
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["package:win"], {
      cwd: ELECTRON_DIR,
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build falhou (exit ${code})`));
    });
    child.on("error", reject);
  });
}

function runPublish(version, exePath, dryRun) {
  return new Promise((resolve, reject) => {
    const args = [
      "scripts/publish-r2.mjs",
      "--file", exePath,
      "--version", version,
    ];
    if (dryRun) {
      // dry-run no publish: só valida env vars e calcula SHA
      console.log("🧪 [DRY-RUN] Não vou fazer upload de verdade");
      args.length = 0; // limpa args do publish
    }
    const child = spawn("node", args, {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`publish falhou (exit ${code})`));
    });
    child.on("error", reject);
  });
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv);

  // Versão
  const version = args.version || (await getVersion());
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    console.error(`❌ Versão inválida: ${version}`);
    process.exit(1);
  }
  console.log(`📌 Versão: ${version}`);

  // Env vars (se não for dry-run)
  if (!args.dryRun) {
    const required = ["CLOUDFLARE_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
    const missing = required.filter((k) => !process.env[k]?.trim());
    if (missing.length) {
      console.error(`❌ Env vars faltando: ${missing.join(", ")}`);
      console.error(`   Carregue scripts/.env antes (source scripts/.env ou export VAR=valor)`);
      process.exit(1);
    }
  }

  // Build (a menos que skip-build)
  if (!args.skipBuild) {
    await runBuild();
  } else {
    console.log("⏭️  Skipping build (--skip-build)");
  }

  // Localiza o instalador
  const installer = await findInstaller(args.productName);
  if (!installer) {
    console.error(`❌ Instalador não encontrado: apps/electron/release/${args.productName}-Setup-${version}.exe`);
    if (args.skipBuild) {
      console.error(`   Rode sem --skip-build pra gerar, ou use --version correto`);
    }
    process.exit(1);
  }
  const statInfo = await stat(installer.path);
  const sha = await sha256File(installer.path);
  console.log(`📦 Instalador: ${installer.name} (${(statInfo.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   SHA-256:    ${sha}`);

  // Salva SHA local pra comparar depois (auditoria)
  const shaFile = join(ELECTRON_DIR, "release", `${installer.name}.sha256`);
  await writeFile(shaFile, `${sha}  ${installer.name}\n`, "utf8");
  console.log(`   SHA-256 salvo em: ${shaFile}`);

  // Publica
  if (args.dryRun) {
    console.log("");
    console.log("🧪 DRY-RUN: tudo OK. Para publicar de verdade, remova --dry-run.");
    return;
  }
  console.log("");
  await runPublish(installer.version, installer.path, false);

  // Resumo final
  console.log("");
  console.log("═══════════════════════════════════════════");
  console.log(`✅ Release v${version} publicada!`);
  console.log(`   Instalador: apps/electron/release/${installer.name}`);
  console.log(`   SHA-256:    ${sha}`);
  console.log(`   URL pública: ${process.env.R2_PUBLIC_BASE_URL || "(defina R2_PUBLIC_BASE_URL)"}/releases/v${version}/${installer.name}`);
  console.log(`   latest.yml: ${process.env.R2_PUBLIC_BASE_URL || "(defina R2_PUBLIC_BASE_URL)"}/releases/latest/latest.yml`);
  console.log("");
  console.log("📋 Próximos passos:");
  console.log("   1. Atualizar a página de download (web/download/index.html) com versão e SHA");
  console.log("   2. (Opcional) Criar tag git + GitHub release com o mesmo instalador");
  console.log("═══════════════════════════════════════════");
}

main().catch((err) => {
  console.error("❌ Falhou:", err.message);
  process.exit(1);
});
