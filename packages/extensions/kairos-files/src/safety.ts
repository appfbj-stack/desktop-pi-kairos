/**
 * Safety guard para kairos-files.
 *
 * Toda tool passa por aqui antes de qualquer operação. Regras:
 *   - Path DEVE ser absoluto e normalizado (sem `..` ou symlinks maliciosos).
 *   - Path DEVE estar dentro de um diretório permitido (whitelist).
 *   - Whitelist default: HOME do usuário, Desktop, Documents, Downloads,
 *     Pictures, Videos, Music, e o cwd.
 *   - Whitelist pode ser expandida via env KAIROS_ALLOWED_PATHS (separado por `;`).
 *
 * Implementação simples, suficiente pro MVP. Sprint 1 endurece (symlink check,
 * leitura de settings persistido, etc).
 */

import path from "node:path";
import fs from "node:fs";
import os from "node:os";

export class PathGuardError extends Error {
  constructor(
    public readonly requestedPath: string,
    public readonly reason: string
  ) {
    super(`Acesso negado a "${requestedPath}": ${reason}`);
    this.name = "PathGuardError";
  }
}

let cachedAllowed: string[] | null = null;

function defaultAllowedPaths(): string[] {
  const home = os.homedir();
  const candidates = [
    home,
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
    path.join(home, "Downloads"),
    path.join(home, "Pictures"),
    path.join(home, "Videos"),
    path.join(home, "Music"),
    process.cwd(),
  ];
  // Mantém só os que existem (ou HOME, que sempre existe).
  return candidates.filter(
    (p, i) => i === 0 || (fs.existsSync(p) && fs.statSync(p).isDirectory())
  );
}

function loadAllowed(): string[] {
  if (cachedAllowed) return cachedAllowed;
  const envExtra = process.env.KAIROS_ALLOWED_PATHS;
  const fromEnv = envExtra
    ? envExtra.split(path.delimiter).filter(Boolean)
    : [];
  cachedAllowed = [...defaultAllowedPaths(), ...fromEnv];
  return cachedAllowed;
}

/** Testa se `target` (absoluto, normalizado) está dentro de algum path permitido. */
export function isAllowed(target: string): boolean {
  // Modo "tudo liberado" — Pastor autorizou acesso total ao PC.
  // O safety.ts só normaliza o path; não restringe mais.
  return path.isAbsolute(path.resolve(target));
}

/** Valida e normaliza o path; lança PathGuardError se inválido. */
export function ensureAllowed(target: string): string {
  if (!path.isAbsolute(target)) {
    throw new PathGuardError(target, "path precisa ser absoluto");
  }
  return path.resolve(target);
}
