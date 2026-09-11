/**
 * kairos-stream — extensão de streaming ao vivo do Kairós.
 *
 * Tools expostas (8):
 *   - stream:obs-status      detecta OBS Studio instalado + versão
 *   - stream:obs-config      lê basic.ini + service.ini do profile ativo
 *   - stream:hardware        detecta GPU/CPU/RAM + recomenda encoder
 *   - stream:platforms       lista RTMP/RTMPS de YouTube/Twitch/FB/Kick/etc
 *   - stream:youtube-setup   calcula encoder/bitrate/resolução baseado no upload
 *   - stream:check-network   testa DNS + TCP no servidor RTMP alvo
 *   - stream:diagnose        orquestra status+config+network num relatório
 *   - stream:wizard          wizard guiado completo de setup de live
 *
 * Pensado pra Pastores que vão fazer live no YouTube/Twitch/etc sem saber o
 * que é bitrate, encoder ou stream key. O LLM (Kairós) lê o resultado e
 * traduz em PT-BR claro com passo-a-passo numerado.
 */

import type { Extension, Tool } from "@kairos/agent";
import { z } from "zod";
import { obsStatusTool } from "./tools/obs-status.js";
import { obsConfigTool } from "./tools/obs-config.js";
import { hardwareTool } from "./tools/hardware.js";
import { platformsTool } from "./tools/platforms.js";
import { youtubeSetupTool } from "./tools/youtube-setup.js";
import { networkCheckTool } from "./tools/network-check.js";
import { diagnoseTool } from "./tools/diagnose.js";
import { wizardTool } from "./tools/wizard.js";

const extension: Extension = {
  name: "kairos-stream",
  version: "0.2.0",
  description:
    "Setup profissional de live streaming: detecta hardware, lista plataformas, testa rede, recomenda encoder + bitrate, e guia o usuário com wizard passo-a-passo.",
  tools: [
    obsStatusTool,
    obsConfigTool,
    hardwareTool,
    platformsTool,
    youtubeSetupTool,
    networkCheckTool,
    diagnoseTool,
    wizardTool,
  ] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };
