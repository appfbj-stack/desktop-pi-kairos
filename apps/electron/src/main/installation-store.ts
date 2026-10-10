/**
 * Installation store — gera installation_id único no primeiro launch.
 *
 * Cada instalação do Kairós Desktop Alves tem um UUID único persistido em
 * %APPDATA%/kairos-pi/installation.json. Esse ID é usado pra:
 *  - Identificar a instalação no central-kairos (server-side licensing)
 *  - Tracking de uso/limite server-side (não burlável deletando usage.json)
 *  - Suporte/debug (cada install é rastreável)
 */

import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "@kairos/core";

const INSTALLATION_FILE = "installation.json";

interface InstallationData {
  version: 1;
  id: string;
  createdAt: number;
  productName: string;
}

function installationPath(): string {
  return path.join(app.getPath("userData"), INSTALLATION_FILE);
}

async function readInstallation(): Promise<InstallationData | null> {
  try {
    const raw = await fs.readFile(installationPath(), "utf-8");
    const parsed = JSON.parse(raw) as InstallationData;
    if (parsed.version !== 1) throw new Error("versão desconhecida");
    return parsed;
  } catch {
    return null;
  }
}

async function writeInstallation(data: InstallationData): Promise<void> {
  const file = installationPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

/** Retorna a installation data, criando se for primeira execução. */
export async function getOrCreateInstallation(productName: string = "Kairós Desktop Alves"): Promise<InstallationData> {
  const existing = await readInstallation();
  if (existing) return existing;

  const fresh: InstallationData = {
    version: 1,
    id: randomUUID(),
    createdAt: Date.now(),
    productName,
  };
  await writeInstallation(fresh);
  logger.info({ installationId: fresh.id }, "nova instalação gerada");
  return fresh;
}

/** Apenas leitura — retorna null se não existir (sem criar). */
export async function getInstallation(): Promise<InstallationData | null> {
  return readInstallation();
}
