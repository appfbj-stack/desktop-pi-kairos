/**
 * stream:scenes — lista as cenas do OBS e as fontes dentro de cada cena.
 *
 * O OBS salva as cenas em basic/scenes/<scene>.json OU mantém o estado em
 * obsSceneOrdering.json + arquivos JSON por source. Como o formato mudou
 * nas versões, esta tool tenta várias estratégias.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import os from "node:os";
import { z } from "zod";
import type { Tool } from "@kairos/agent";

function obsRoot(): string {
  return path.join(os.homedir(), "AppData", "Roaming", "obs-studio", "basic");
}

const inputSchema = z.object({
  profile: z.string().optional(),
  scene: z.string().optional(), // se passado, mostra só as fontes dessa cena
});

interface Source {
  name: string;
  type: string;
  settings?: Record<string, unknown>;
}

interface Scene {
  name: string;
  sources: Source[];
}

async function tryReadJson(p: string): Promise<unknown | null> {
  try {
    const txt = await readFile(p, "utf-8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export const scenesTool: Tool<typeof inputSchema> = {
  name: "stream:scenes",
  description:
    "Lista as cenas configuradas no OBS Studio e as fontes (câmera, microfone, tela, imagem) dentro de cada cena.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const root = obsRoot();
    if (!existsSync(root)) {
      return { ok: false, message: `OBS não inicializado. Esperado: ${root}` };
    }

    const profilesDir = path.join(root, "profiles");
    let profiles: string[];
    try {
      profiles = (await readdir(profilesDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return { ok: false, message: "profiles dir não existe" };
    }
    if (profiles.length === 0) return { ok: false, message: "Nenhum profile encontrado" };

    const chosen = input.profile && profiles.includes(input.profile) ? input.profile : profiles.sort()[0];
    const profileDir = path.join(profilesDir, chosen);
    const scenesDir = path.join(profileDir, "scenes");

    if (!existsSync(scenesDir)) {
      // Pode acontecer em profiles novos — sem cenas ainda
      return {
        ok: true,
        profile: chosen,
        scenes: [],
        currentScene: "(nenhuma)",
        message: "Nenhuma cena configurada. Abra o OBS e adicione cenas/câmera/microfone.",
      };
    }

    // Estratégia 1: tentar ler obsSceneOrdering.json (formato novo)
    const orderingPath = path.join(profileDir, "obsSceneOrdering.json");
    const ordering = (await tryReadJson(orderingPath)) as { currentScene?: string; sceneOrder?: Array<{ name: string }> } | null;

    // Estratégia 2: ler todos os JSONs da pasta scenes/
    const files = (await readdir(scenesDir)).filter((f) => f.endsWith(".json"));
    const scenes: Scene[] = [];

    for (const f of files) {
      const data = (await tryReadJson(path.join(scenesDir, f))) as
        | { name?: string; sources?: Array<{ name?: string; type?: string; settings?: Record<string, unknown> }> }
        | null;
      if (!data) continue;
      // ignora arquivos auxiliares (item de source, etc) — só pega cenas
      if (!data.sources || !data.name) continue;

      scenes.push({
        name: data.name,
        sources: (data.sources ?? [])
          .filter((s) => !!s.name)
          .map((s) => ({
            name: s.name as string,
            type: (s.type ?? "unknown").replace(/^dshow_input_/, "").replace(/^wasapi_input_/, ""),
            settings: s.settings,
          })),
      });
    }

    // Ordena conforme obsSceneOrdering se disponível
    if (ordering?.sceneOrder) {
      const order = new Map(ordering.sceneOrder.map((s, i) => [s.name, i]));
      scenes.sort((a, b) => (order.get(a.name) ?? 999) - (order.get(b.name) ?? 999));
    } else {
      scenes.sort((a, b) => a.name.localeCompare(b.name));
    }

    const currentScene = ordering?.currentScene ?? scenes[0]?.name ?? "(nenhuma)";

    // Resumo por tipo de source
    const sourceTypes = new Map<string, number>();
    for (const sc of scenes) {
      for (const src of sc.sources) {
        sourceTypes.set(src.type, (sourceTypes.get(src.type) ?? 0) + 1);
      }
    }

    let resultScenes = scenes;
    if (input.scene) {
      resultScenes = scenes.filter((s) => s.name === input.scene);
      if (resultScenes.length === 0) {
        return {
          ok: false,
          message: `Cena "${input.scene}" não encontrada. Cenas disponíveis: ${scenes.map((s) => s.name).join(", ")}`,
          availableScenes: scenes.map((s) => s.name),
        };
      }
    }

    return {
      ok: true,
      profile: chosen,
      currentScene,
      sceneCount: scenes.length,
      sourceTypes: Object.fromEntries(sourceTypes),
      scenes: resultScenes.map((s) => ({
        name: s.name,
        isCurrent: s.name === currentScene,
        sourceCount: s.sources.length,
        sources: s.sources.map((src) => ({
          name: src.name,
          type: src.type,
          device: (src.settings as { device?: string; device_id?: string } | undefined)?.device
            ?? (src.settings as { device_id?: string } | undefined)?.device_id
            ?? null,
        })),
      })),
    };
  },
};
