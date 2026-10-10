/**
 * Config store — persiste provider config (apiKey, model, baseUrl) em disco.
 *
 * Localização: %APPDATA%/kairos-pi/config.json
 *  - Em dev: ~/.config/kairos-pi/config.json
 *
 * API key fica em texto plano local (não criptografada). Para um app desktop
 * pessoal rodando num único PC, é o trade-off correto: zero fricção pro
 * usuário vs. um vault do Windows. Se virar multi-usuário ou cloud, plugar
 * safeStorage (Electron) ou AES-GCM com key do SO depois.
 *
 * Sprint 1.20: adicionado para que ⚙️ Settings salve a chave do LLM entre
 * sessões — antes a config só existia em env vars e se perdia ao reiniciar.
 */

import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProviderConfig } from "@kairos/agent";
import { readProviderConfigFromEnv } from "@kairos/agent";
import { logger } from "@kairos/core";

const CONFIG_FILE = "config.json";

interface StoredConfig {
  version: 1;
  provider?: Partial<ProviderConfig>;
}

/** Retorna path absoluto do arquivo de config. */
function configPath(): string {
  return path.join(app.getPath("userData"), CONFIG_FILE);
}

/** Lê config do disco. Se não existe, retorna null. */
async function readConfigFile(): Promise<StoredConfig | null> {
  try {
    const raw = await fs.readFile(configPath(), "utf-8");
    const parsed = JSON.parse(raw) as StoredConfig;
    if (parsed.version !== 1) {
      logger.warn({ version: parsed.version }, "config version desconhecida, ignorando");
      return null;
    }
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    logger.warn({ err: String(err) }, "erro ao ler config.json");
    return null;
  }
}

/** Escreve config no disco (atômico: escreve tmp + rename). */
async function writeConfigFile(config: StoredConfig): Promise<void> {
  const file = configPath();
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(config, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

/**
 * Carrega config final do provider:
 *  1. Se config.json tem override → usa
 *  2. Senão, usa env vars (readProviderConfigFromEnv)
 *
 * Merge: campos do override ganham; campos faltantes vêm das env vars.
 */
export async function loadProviderConfig(): Promise<ProviderConfig> {
  const env = readProviderConfigFromEnv();
  const stored = await readConfigFile();
  if (!stored?.provider) {
    logger.info({ source: "env" }, "provider config carregada das env vars");
    return env;
  }
  const merged: ProviderConfig = {
    ...env,
    ...stored.provider,
    // apiKey undefined do store não deve sobrescrever env:
    apiKey: stored.provider.apiKey ?? env.apiKey,
  };
  logger.info(
    {
      source: "file",
      provider: merged.provider,
      model: merged.modelId,
      hasApiKey: !!merged.apiKey,
    },
    "provider config carregada do disco"
  );
  return merged;
}

/** Persiste config do provider em disco. */
export async function saveProviderConfig(next: ProviderConfig): Promise<void> {
  // Não persistimos apiKey vazio se já existe no env
  const toStore: Partial<ProviderConfig> = {
    provider: next.provider,
    modelId: next.modelId,
    baseUrl: next.baseUrl,
  };
  // "bundled" é sentinel — significa "voltar a usar chave MiniMax do Pastor"
  // Não persistimos como apiKey real (initProvider detecta ausência de key)
  if (next.apiKey && next.apiKey !== "bundled") {
    toStore.apiKey = next.apiKey;
  }
  await writeConfigFile({ version: 1, provider: toStore });
  logger.info({ provider: next.provider, model: next.modelId, hasKey: !!toStore.apiKey }, "provider config salva no disco");
}

/** Path absoluto do arquivo de config (útil pra Settings mostrar). */
export function getConfigFilePath(): string {
  return configPath();
}
