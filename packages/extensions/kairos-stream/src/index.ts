/**
 * kairos-stream — extensão de streaming ao vivo do Kairós.
 *
 * Tools expostas (16):
 *   Sprint 1.11 (leitura/diagnóstico):
 *     - stream:obs-status      detecta OBS Studio instalado + versão
 *     - stream:obs-config      lê basic.ini + service.ini do profile ativo
 *     - stream:hardware        detecta GPU/CPU/RAM + recomenda encoder
 *     - stream:platforms       lista RTMP/RTMPS de YouTube/Twitch/FB/Kick/etc
 *     - stream:youtube-setup   calcula encoder/bitrate/resolução baseado no upload
 *
 *   Sprint 1.12 (consulta + wizard):
 *     - stream:check-network   testa DNS + TCP no servidor RTMP alvo
 *     - stream:diagnose        orquestra status+config+network num relatório
 *     - stream:wizard          wizard guiado completo de setup de live
 *
 *   Sprint 1.13 (profissional — escrita + validação + presets):
 *     - stream:apply-config      escreve basic.ini + service.ini (com backup)
 *     - stream:scenes            lista cenas e fontes do OBS
 *     - stream:audio             configura áudio (sample rate, channel, decay, suppress)
 *     - stream:displays          detecta displays nativos + GPU de cada
 *     - stream:validate          valida setup completo pré-live (OK/WARN/FAIL)
 *     - stream:profile-backup    backup/restore/list/delete de profiles
 *     - stream:platform-preset   aplica preset otimizado (YouTube/Twitch/Kick/FB/X/TikTok)
 *     - stream:diagnostics       analisa logs do OBS pra detectar problemas
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
import { applyConfigTool } from "./tools/apply-config.js";
import { scenesTool } from "./tools/scenes.js";
import { audioTool } from "./tools/audio.js";
import { displaysTool } from "./tools/displays.js";
import { validateTool } from "./tools/validate.js";
import { profileBackupTool } from "./tools/profile-backup.js";
import { platformPresetTool } from "./tools/platform-preset.js";
import { diagnosticsTool } from "./tools/diagnostics.js";

const extension: Extension = {
  name: "kairos-stream",
  version: "0.3.0",
  description:
    "Setup profissional de live streaming: detecta hardware, lê/escreve config OBS, lista plataformas, testa rede, recomenda encoder + bitrate, aplica presets por plataforma, valida setup, analisa logs e guia o usuário com wizard passo-a-passo.",
  tools: [
    // Leitura/diagnóstico
    obsStatusTool,
    obsConfigTool,
    hardwareTool,
    platformsTool,
    youtubeSetupTool,
    networkCheckTool,
    diagnoseTool,
    wizardTool,
    // Escrita + validação + profissionalização
    applyConfigTool,
    scenesTool,
    audioTool,
    displaysTool,
    validateTool,
    profileBackupTool,
    platformPresetTool,
    diagnosticsTool,
  ] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };
