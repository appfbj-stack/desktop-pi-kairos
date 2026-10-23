/**
 * Configuração e caminhos do Kairós Vídeos IA.
 *
 * Estrutura de pastas (padrão, configurável):
 *   KAIROS_VIDEOS/
 *     01_PARA_REVISAR
 *     02_APROVADOS
 *     03_PUBLICADOS
 *     04_ROTEIROS
 *     05_LEGENDAS
 *     06_ARQUIVADOS
 *
 * A raiz pode vir de:
 *   1. env KAIROS_VIDEOS_ROOT
 *   2. globalThis.__kairosVideosRoot (definido pelo agent-instance.ts)
 *   3. <userData>/Videos/KAIROS_VIDEOS  (fallback)
 *
 * O arquivo `videos-config.json` na raiz guarda preferências persistentes
 * (raiz do HD externo, voz preferida, etc).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const STAGES = {
  REVIEW: "01_PARA_REVISAR",
  APPROVED: "02_APROVADOS",
  PUBLISHED: "03_PUBLICADOS",
  SCRIPTS: "04_ROTEIROS",
  SUBTITLES: "05_LEGENDAS",
  ARCHIVED: "06_ARQUIVADOS",
} as const;

export type StageKey = keyof typeof STAGES;

export const ALL_STAGE_DIRS: string[] = Object.values(STAGES);

const CONFIG_FILE = "videos-config.json";

export interface VideosConfig {
  /** Raiz do projeto de vídeos (onde ficam as 6 subpastas). */
  root: string;
  /** Raiz do HD externo para export. null = usa a raiz local. */
  externalRoot: string | null;
  /** Voz preferida (voice_id da MiniMax) para TTS. */
  preferredVoiceId: string | null;
  /** Modelo do LLM usado para roteiro. */
  scriptModel: string | null;
}

/** Raiz padrão: pasta Videos do usuário. */
function defaultRoot(): string {
  const home = os.homedir();
  return path.join(home, "Videos", "KAIROS_VIDEOS");
}

/** Raiz configurada (env > global > default). */
export function getVideosRoot(): string {
  const fromEnv = process.env.KAIROS_VIDEOS_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  const fromGlobal = (globalThis as any).__kairosVideosRoot;
  if (typeof fromGlobal === "string" && fromGlobal.trim()) {
    return path.resolve(fromGlobal.trim());
  }

  return defaultRoot();
}

/** Caminho do arquivo de config persistente. */
export function configFilePath(root = getVideosRoot()): string {
  return path.join(root, CONFIG_FILE);
}

/** Lê a config persistente; se não existir, devolve os defaults. */
export function loadVideosConfig(root = getVideosRoot()): VideosConfig {
  const defaults: VideosConfig = {
    root,
    externalRoot: null,
    preferredVoiceId: null,
    scriptModel: null,
  };

  try {
    const raw = fs.readFileSync(configFilePath(root), "utf-8");
    const parsed = JSON.parse(raw) as Partial<VideosConfig>;
    return {
      root: typeof parsed.root === "string" ? parsed.root : defaults.root,
      externalRoot:
        typeof parsed.externalRoot === "string" && parsed.externalRoot.trim()
          ? parsed.externalRoot
          : null,
      preferredVoiceId:
        typeof parsed.preferredVoiceId === "string" && parsed.preferredVoiceId.trim()
          ? parsed.preferredVoiceId
          : null,
      scriptModel:
        typeof parsed.scriptModel === "string" && parsed.scriptModel.trim()
          ? parsed.scriptModel
          : null,
    };
  } catch {
    return defaults;
  }
}

/** Salva a config persistente (merge com o que existe). */
export function saveVideosConfig(
  patch: Partial<VideosConfig>,
  root = getVideosRoot(),
): VideosConfig {
  const current = loadVideosConfig(root);
  const next: VideosConfig = { ...current, ...patch, root: patch.root ?? current.root };
  fs.mkdirSync(path.dirname(configFilePath(root)), { recursive: true });
  fs.writeFileSync(configFilePath(root), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

/** Cria a estrutura de pastas (idempotente). */
export function ensureProjectStructure(root = getVideosRoot()): string[] {
  fs.mkdirSync(root, { recursive: true });
  for (const dir of ALL_STAGE_DIRS) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  return ALL_STAGE_DIRS;
}

/** Caminho absoluto de uma pasta de estágio. */
export function stagePath(stage: StageKey, root = getVideosRoot()): string {
  return path.join(root, STAGES[stage]);
}

/**
 * Descobre um HD externo montado, sem precisar saber a letra.
 *
 * Heurística: qualquer volume além de C: com espaço livre é candidato a HD
 * externo. Entre vários, vence o com mais espaço. HD desconectado simplesmente
 * não aparece — e o export mantém o comportamento seguro (não apaga nada).
 */
export function detectExternalRoot(minFreeGb = 2): string | null {
  const systemRoot = path.parse(process.cwd()).root.toUpperCase(); // "C:\"
  const candidates: { root: string; free: number }[] = [];

  for (const letter of "DEFGHIJKLMNOPQRSTUVWXYZ") {
    const root = `${letter}:\\`;
    if (root.toUpperCase() === systemRoot) continue;
    try {
      if (!fs.existsSync(root)) continue;
      const stat = fs.statSync(root);
      if (!stat.isDirectory()) continue;
      // Espaço livre via fs.statfs (disponível no Node 18.15+).
      let free = 0;
      try {
        const st = fs.statfsSync(root);
        free = (st.bavail * st.bsize) / (1024 * 1024 * 1024);
      } catch {
        free = 0;
      }
      if (free < minFreeGb) continue;
      candidates.push({ root, free });
    } catch {
      /* ignora letra inacessível */
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.free - a.free);
  return candidates[0]?.root ?? null;
}

/**
 * Resolve o destino final do export.
 *
 * Ordem de preferência:
 *   1. raiz pedida na chamada
 *   2. `externalRoot` do videos-config.json
 *   3. HD externo detectado automaticamente
 *   4. raiz local (sem HD — o export segue seguro e não apaga nada)
 *
 * Regra de segurança: se o HD externo não estiver montado, o export NÃO apaga
 * nem move o arquivo original — apenas avisa e devolve o caminho temporário.
 */
export function resolveExportTarget(
  requestedRoot: string | null | undefined,
): { target: string; external: boolean; available: boolean; autoDetected: boolean } {
  const cfg = loadVideosConfig();
  const explicit = (requestedRoot?.trim() || cfg.externalRoot || "").trim();

  if (explicit) {
    const resolved = path.resolve(explicit);
    const available = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
    return { target: resolved, external: true, available, autoDetected: false };
  }

  // Sem configuração: tenta achar o HD externo sozinho.
  const detected = detectExternalRoot();
  if (detected) {
    return { target: detected, external: true, available: true, autoDetected: true };
  }

  return { target: cfg.root, external: false, available: true, autoDetected: false };
}

/** Sanitiza um nome de arquivo/pasta (remove caracteres proibidos no Windows). */
export function safeName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .replace(/\s+/g, "_")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "projeto"
  );
}
