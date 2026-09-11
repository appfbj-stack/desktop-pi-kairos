/**
 * kairos-stream — extensão de streaming ao vivo do Kairós.
 *
 * Tools expostas (5):
 *   - stream:obs-status      detecta OBS Studio instalado + versão
 *   - stream:obs-config      lê basic.ini + service.ini do profile ativo
 *   - stream:youtube-setup   calcula encoder/bitrate/resolução baseado no upload
 *   - stream:check-network   testa DNS + TCP no servidor RTMP alvo
 *   - stream:diagnose        orquestra as 3 anteriores num relatório só
 *
 * Pensado pra Pastores que vão fazer live no YouTube sem saber o que é
 * bitrate, encoder ou stream key. O LLM (Kairós) lê o resultado e traduz
 * em PT-BR claro com passo-a-passo.
 */

import type { Extension, Tool } from "@kairos/agent";
import { z } from "zod";
import { obsStatusTool } from "./tools/obs-status.js";
import { obsConfigTool } from "./tools/obs-config.js";
import { youtubeSetupTool } from "./tools/youtube-setup.js";
import { networkCheckTool } from "./tools/network-check.js";
import { diagnoseTool } from "./tools/diagnose.js";

const extension: Extension = {
  name: "kairos-stream",
  version: "0.1.0",
  description:
    "Diagnóstico e setup de live streaming (OBS Studio + YouTube Live). Detecta instalação, lê config, testa rede, recomenda encoder/bitrate.",
  tools: [
    obsStatusTool,
    obsConfigTool,
    youtubeSetupTool,
    networkCheckTool,
    diagnoseTool,
  ] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };
