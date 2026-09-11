/**
 * stream:profile-backup — backup/restore de profiles do OBS.
 *
 * Backup: copia profiles/<name>/ pra uma pasta com timestamp em
 *         obs-studio/.backups/<timestamp>/profiles/<name>
 *
 * Restore: substitui profiles/<name>/ pelo backup selecionado.
 *          Faz pré-restore do estado atual pra .trash.
 */

import { cp, rm, readdir, mkdir, stat, rename } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import os from "node:os";
import { z } from "zod";
import type { Tool } from "@kairos/agent";

function obsRoot(): string {
  return path.join(os.homedir(), "AppData", "Roaming", "obs-studio", "basic");
}

function backupRoot(): string {
  return path.join(os.homedir(), "AppData", "Roaming", "obs-studio", ".backups");
}

function trashDir(): string {
  return path.join(os.homedir(), "AppData", "Roaming", "obs-studio", ".trash");
}

const inputSchema = z.object({
  action: z.enum(["backup", "list", "restore", "delete"]),
  profile: z.string().optional(),
  backupName: z.string().optional(), // pra restore/delete
});

export const profileBackupTool: Tool<typeof inputSchema> = {
  name: "stream:profile-backup",
  description:
    "Backup/restore dos profiles do OBS Studio. Útil pra salvar uma config que funciona antes de tentar mudanças arriscadas.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const root = obsRoot();
    if (!existsSync(root)) {
      return { ok: false, message: `OBS não inicializado. Esperado: ${root}` };
    }

    if (input.action === "list") {
      await mkdir(backupRoot(), { recursive: true });
      const entries = (await readdir(backupRoot(), { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
        .reverse();

      const details: Array<{ name: string; createdAt: string; sizeMB: number; profiles: string[] }> = [];
      for (const name of entries) {
        const dir = path.join(backupRoot(), name);
        const s = await stat(dir);
        const profilesDir = path.join(dir, "profiles");
        let profiles: string[] = [];
        if (existsSync(profilesDir)) {
          profiles = (await readdir(profilesDir, { withFileTypes: true }))
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
        }
        details.push({
          name,
          createdAt: s.mtime.toISOString(),
          sizeMB: Math.round((s.size / 1024 / 1024) * 100) / 100,
          profiles,
        });
      }
      return { ok: true, backups: details, count: details.length };
    }

    if (input.action === "backup") {
      if (!input.profile) {
        return { ok: false, message: "Forneça `profile` para fazer backup." };
      }
      const src = path.join(root, "profiles", input.profile);
      if (!existsSync(src)) {
        return { ok: false, message: `Profile "${input.profile}" não existe em ${root}/profiles/` };
      }

      await mkdir(backupRoot(), { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const dest = path.join(backupRoot(), ts, "profiles", input.profile);
      await cp(src, dest, { recursive: true });

      return {
        ok: true,
        backupName: ts,
        path: dest,
        profile: input.profile,
        message: `Backup "${ts}" do profile "${input.profile}" criado em ${dest}`,
      };
    }

    if (input.action === "restore") {
      if (!input.profile || !input.backupName) {
        return { ok: false, message: "Forneça `profile` (destino) e `backupName` (origem)." };
      }

      const backupProfilesDir = path.join(backupRoot(), input.backupName, "profiles");
      const src = path.join(backupProfilesDir, input.profile);
      if (!existsSync(src)) {
        return {
          ok: false,
          message: `Backup "${input.backupName}" não tem o profile "${input.profile}". Conteúdo disponível: ${existsSync(backupProfilesDir) ? (await readdir(backupProfilesDir)).join(", ") : "(vazio)"}`,
        };
      }

      const dest = path.join(root, "profiles", input.profile);
      const currentExists = existsSync(dest);

      // Faz backup do estado atual antes de sobrescrever
      if (currentExists) {
        await mkdir(trashDir(), { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const trashDest = path.join(trashDir(), `profile.${input.profile}.pre-restore.${ts}`);
        await cp(dest, trashDest, { recursive: true });
      }

      if (currentExists) await rm(dest, { recursive: true, force: true });
      await mkdir(path.dirname(dest), { recursive: true });
      await cp(src, dest, { recursive: true });

      return {
        ok: true,
        restored: true,
        profile: input.profile,
        fromBackup: input.backupName,
        message: `Profile "${input.profile}" restaurado do backup "${input.backupName}". Estado anterior salvo em .trash/.`,
      };
    }

    if (input.action === "delete") {
      if (!input.backupName) {
        return { ok: false, message: "Forneça `backupName` pra deletar." };
      }
      const target = path.join(backupRoot(), input.backupName);
      if (!existsSync(target)) {
        return { ok: false, message: `Backup "${input.backupName}" não existe.` };
      }
      // Move pra .trash em vez de deletar diretamente
      await mkdir(trashDir(), { recursive: true });
      const trashDest = path.join(trashDir(), `backup.${input.backupName}`);
      await rename(target, trashDest);
      return { ok: true, message: `Backup "${input.backupName}" movido pra ${trashDest}` };
    }

    return { ok: false, message: "Ação desconhecida." };
  },
};
