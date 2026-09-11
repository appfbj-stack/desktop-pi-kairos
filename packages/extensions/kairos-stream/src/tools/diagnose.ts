/**
 * stream:diagnose — relatório completo: OBS + config + rede + recomendação.
 *
 * Chama as outras 3 tools em paralelo e monta um diagnóstico estruturado
 * pra o LLM (e pro usuário) entender o estado atual.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { obsStatusTool } from "./obs-status.js";
import { obsConfigTool } from "./obs-config.js";
import { networkCheckTool } from "./network-check.js";

const inputSchema = z.object({
  /** Testar YouTube (default), Twitch ou Facebook. */
  target: z.enum(["youtube", "twitch", "facebook"]).default("youtube"),
});

export const diagnoseTool: Tool<typeof inputSchema> = {
  name: "stream:diagnose",
  description:
    "Diagnóstico completo: detecta OBS, lê config, testa rede, devolve resumo + próximos passos recomendados.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, ctx) {
    const { target } = input;
    type ObsLike = { installed?: boolean; path?: string; error?: string };
    type ConfigLike = { configured?: boolean; profile?: string; encoding?: { Encoder?: string; Bitrate?: string }; error?: string };
    type NetworkLike = { diagnosis?: string; tcp?: { ok: boolean } };

    const [obs, config, network] = (await Promise.all([
      Promise.resolve(obsStatusTool.execute({ readVersion: false }, ctx)).catch((err): ObsLike => ({ error: (err as Error).message })),
      Promise.resolve(obsConfigTool.execute({}, ctx)).catch((err): ConfigLike => ({ error: (err as Error).message })),
      Promise.resolve(networkCheckTool.execute({ target, timeoutMs: 5000 }, ctx)).catch((err): NetworkLike => ({ diagnosis: `Erro: ${(err as Error).message}` })),
    ])) as [ObsLike, ConfigLike, NetworkLike];

    const summary: string[] = [];
    if (!obs.installed) {
      summary.push("❌ OBS Studio não instalado");
    } else {
      summary.push(`✅ OBS instalado em ${obs.path}`);
    }
    if (!config.configured) {
      summary.push("❌ OBS não foi inicializado ainda (sem profile)");
    } else {
      summary.push(`✅ Profile '${config.profile}' — encoder: ${config.encoding?.Encoder ?? "?"}, bitrate: ${config.encoding?.Bitrate ?? "?"}kbps`);
    }
    if (network.diagnosis) {
      summary.push(network.diagnosis);
    }

    const recommendations: string[] = [];
    if (!obs.installed) {
      recommendations.push("Baixar OBS Studio em https://obsproject.com e instalar (escolha versão 64-bit)");
    } else if (!config.configured) {
      recommendations.push("Abrir o OBS pelo menos uma vez pra ele criar a estrutura de profiles");
    } else {
      recommendations.push("Rode `stream:youtube-setup` com o upload medido e a stream key do YouTube Studio");
      recommendations.push("Copie o output no OBS: Configurações → Saída → Streaming");
    }
    if (network.tcp && !network.tcp.ok) {
      recommendations.push("Resolver firewall/proxy antes de tentar live (ou usar VPN)");
    }

    return {
      obs,
      config,
      network,
      summary,
      recommendations,
    };
  },
};
