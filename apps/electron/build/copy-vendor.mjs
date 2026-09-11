/**
 * Copia os dist/ dos workspaces Kairós pra dentro de apps/electron/_vendor/
 * e cria symlinks em apps/electron/node_modules/@kairos/<name>.
 *
 * IMPORTANTE: usa paths POSIX (/) no destino pra que o electron-builder empacote
 * com paths válidos no app.asar (Node não resolve paths com \ dentro do asar).
 *
 * Por que vendor: o electron-builder não segue symlinks de workspaces pnpm
 * que apontam pra paths acima do app dir (erro "must be under <appDir>").
 */

import { cp, symlink, rm, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..", "..");
const VENDOR = path.join(APP_ROOT, "_vendor");
const NODE_MODULES = path.join(APP_ROOT, "node_modules");
const KAIROS_NM = path.join(NODE_MODULES, "@kairos");

const PACKAGES = [
  { name: "agent", src: "packages/agent" },
  { name: "core", src: "packages/core" },
  { name: "extension-files", src: "packages/extensions/kairos-files" },
  { name: "extension-spreadsheets", src: "packages/extensions/kairos-spreadsheets" },
  { name: "extension-pdf-create", src: "packages/extensions/kairos-pdf-create" },
  { name: "extension-documents", src: "packages/extensions/kairos-documents" },
  { name: "extension-images", src: "packages/extensions/kairos-images" },
  { name: "extension-stream", src: "packages/extensions/kairos-stream" },
  { name: "extension-video", src: "packages/extensions/kairos-video" },
];

/** Copia srcDir → dstDir preservando estrutura, mas usando paths POSIX nos metadados. */
async function copyDirPosix(srcDir, dstDir) {
  await mkdir(dstDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirPosix(src, dst);
    } else if (entry.isFile()) {
      await cp(src, dst, { force: true });
    }
  }
}

async function copyWorkspace({ name, src }) {
  const srcDist = path.join(REPO_ROOT, src, "dist");
  const srcPkg = path.join(REPO_ROOT, src, "package.json");
  const dstDist = path.join(VENDOR, name, "dist");
  const dstPkg = path.join(VENDOR, name, "package.json");

  if (!existsSync(srcDist)) {
    console.warn(`⚠️  ${name}: dist/ não existe em ${src}/dist`);
    return;
  }

  await copyDirPosix(srcDist, dstDist);
  await cp(srcPkg, dstPkg, { force: true });
  console.log(`✓ ${name} → _vendor/${name}/`);
}

async function linkPackage(pkgName) {
  const target = path.join("..", "..", "_vendor", pkgName);
  const link = path.join(KAIROS_NM, pkgName);
  await mkdir(KAIROS_NM, { recursive: true });
  try {
    await rm(link, { recursive: true, force: true });
  } catch {}
  await symlink(target, link, "junction");
  console.log(`✓ node_modules/@kairos/${pkgName} → ${target}`);
}

async function main() {
  console.log("📦 Copiando workspaces para _vendor/ (paths POSIX)...\n");

  // Limpa _vendor anterior
  try {
    await rm(VENDOR, { recursive: true, force: true });
  } catch {}

  for (const pkg of PACKAGES) {
    await copyWorkspace(pkg);
  }

  console.log("\n🔗 Criando symlinks @kairos/* → _vendor/* ...\n");
  for (const pkg of PACKAGES) {
    await linkPackage(pkg.name);
  }

  console.log("\n✨ Vendor pronto.");
}

main().catch((err) => {
  console.error("✗ Falhou:", err);
  process.exit(1);
});
