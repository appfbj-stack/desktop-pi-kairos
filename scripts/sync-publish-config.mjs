#!/usr/bin/env node
/**
 * sync-publish-config.mjs — Gera apps/electron/build/publish.json a partir de env vars.
 *
 * Lê:
 *   PUBLISH_PROVIDER   - "generic" (R2) ou "github" (default se nada definido)
 *   PUBLISH_URL        - ex: "https://download.kairos.com.br/releases/latest/"
 *   PUBLISH_OWNER      - GitHub owner (se provider=github)
 *   PUBLISH_REPO       - GitHub repo (se provider=github)
 *   PUBLISH_CHANNEL    - default "latest"
 *
 * Saída: apps/electron/build/publish.json (lido pelo electron-builder via "build.publish")
 *
 * Por que isso existe:
 *   - electron-builder não suporta variáveis de ambiente em build.publish direto
 *   - Queremos o MESMO build servir tanto pro GitHub Releases (v0.4.x) quanto pro R2 (v0.5.0+)
 *   - O Pastor escolhe a target setando PUBLISH_PROVIDER antes de rodar `pnpm release`
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT = join(REPO_ROOT, "apps", "electron", "build", "publish.json");

const provider = (process.env.PUBLISH_PROVIDER || "github").trim().toLowerCase();
const channel = (process.env.PUBLISH_CHANNEL || "latest").trim();
const releaseType = (process.env.PUBLISH_RELEASE_TYPE || "release").trim();

let config;

if (provider === "generic") {
  const url = (process.env.PUBLISH_URL || "").trim();
  if (!url) {
    console.error("❌ PUBLISH_PROVIDER=generic mas PUBLISH_URL não definida");
    console.error(`   Exemplo: PUBLISH_URL=https://download.kairos.com.br/releases/latest/`);
    process.exit(1);
  }
  if (!url.endsWith("/")) {
    console.error("❌ PUBLISH_URL deve terminar com /");
    console.error(`   Atual: ${url}`);
    process.exit(1);
  }
  // Schema electron-updater generic: ${url}latest.yml e ${url}${artifactName}
  // (url já inclui / no final e o channel — não duplicar)
  config = {
    provider: "generic",
    url,
    channel,
  };
  console.log(`📡 Publish config → R2 (generic): ${url}  (channel: ${channel})`);
} else if (provider === "github") {
  const owner = (process.env.PUBLISH_OWNER || "appfbj-stack").trim();
  const repo = (process.env.PUBLISH_REPO || "kairos-releases").trim();
  config = {
    provider: "github",
    owner,
    repo,
    releaseType,
    channel,
  };
  console.log(`📡 Publish config → GitHub: ${owner}/${repo} (channel: ${channel})`);
} else {
  console.error(`❌ PUBLISH_PROVIDER inválido: ${provider} (esperado: "generic" ou "github")`);
  process.exit(1);
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(config, null, 2) + "\n", "utf8");
console.log(`✅ Gravou ${OUT}`);
