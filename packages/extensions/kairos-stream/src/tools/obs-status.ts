/**
 * stream:obs-status — detecta instalação do OBS Studio no Windows.
 *
 * Procura em:
 *   - %PROGRAMFILES%/obs-studio/bin/64bit/obs64.exe
 *   - %PROGRAMFILES(X86)%
 *   - %LOCALAPPDATA%/Programs/obs-studio
 *
 * Retorna: { installed, path, version?, architecture }
 *
 * Não abre o OBS — só lê o filesystem e metadados do executável.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "@kairos/agent";

const execFileAsync = promisify(execFile);

const CANDIDATE_PATHS = [
  path.join(process.env.ProgramFiles ?? "C:\\Program Files", "obs-studio", "bin", "64bit", "obs64.exe"),
  path.join(process.env.ProgramFiles ?? "C:\\Program Files", "obs-studio", "bin", "32bit", "obs32.exe"),
  path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "obs-studio", "bin", "64bit", "obs64.exe"),
  path.join(process.env.LOCALAPPDATA ?? "", "Programs", "obs-studio", "bin", "64bit", "obs64.exe"),
];

const inputSchema = z.object({
  /** Quando true, lê a versão via PowerShell (mais lento, mais preciso). */
  readVersion: z.boolean().default(false),
});

export const obsStatusTool: Tool<typeof inputSchema> = {
  name: "stream:obs-status",
  description:
    "Detecta se o OBS Studio está instalado no Windows. Retorna path do executável e (opcionalmente) versão lida via PowerShell.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const { readVersion } = input;
    const found: { path: string; arch: "64bit" | "32bit" }[] = [];
    for (const p of CANDIDATE_PATHS) {
      if (p && existsSync(p)) {
        const arch = p.includes("64bit") ? "64bit" : "32bit";
        found.push({ path: p, arch });
      }
    }

    if (found.length === 0) {
      return {
        installed: false,
        message: "OBS Studio não encontrado nos caminhos padrão. Baixe em https://obsproject.com",
        searchPaths: CANDIDATE_PATHS,
      };
    }

    const primary = found[0];
    const stat = statSync(primary.path);
    let version: string | undefined;
    if (readVersion) {
      try {
        // Lê versão do FileVersion do .exe (Windows).
        const { stdout } = await execFileAsync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `(Get-Item '${primary.path}').VersionInfo.FileVersion`,
          ],
          { windowsHide: true, timeout: 5000 }
        );
        version = stdout.trim() || undefined;
      } catch {
        version = undefined;
      }
    }

    return {
      installed: true,
      path: primary.path,
      arch: primary.arch,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      version,
      allInstallations: found,
    };
  },
};
