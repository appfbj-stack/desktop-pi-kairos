/**
 * kairos-videos — Kairós Vídeos IA.
 *
 * Fluxo completo de vídeos curtos de divulgação (YouTube Shorts / Instagram Reels):
 *   1. videos:project   — cria a estrutura de pastas do projeto
 *   2. videos:script    — descrição das telas → roteiro de ~30s (LLM do app)
 *   3. videos:voice     — narração: lista vozes PT-BR ou gera MP3 (MiniMax TTS)
 *   4. videos:subtitles — SRT/falas → legendas ASS 1080×1920
 *   5. videos:compose   — monta o vídeo vertical final
 *   6. videos:export    — exporta para o HD externo (com fallback seguro)
 *
 * O avatar por IA é OPCIONAL e depende de cota da MiniMax (hoje bloqueada).
 * O sistema funciona sem avatar: gravação de tela + narração + legendas.
 *
 * Nada é publicado automaticamente em redes sociais.
 */

import type { Extension, Tool } from "@kairos/agent";
import { z } from "zod";
import { videosProjectTool } from "./tools/project.js";
import { videosScriptTool } from "./tools/script.js";
import { videosVoiceTool } from "./tools/voice.js";
import { videosSubtitlesTool } from "./tools/subtitles.js";
import { videosComposeTool } from "./tools/compose.js";
import { videosExportTool } from "./tools/export.js";

const extension: Extension = {
  name: "kairos-videos",
  version: "0.1.0",
  description:
    "Kairós Vídeos IA — cria vídeos verticais de divulgação: projeto, roteiro, narração (MiniMax TTS), legendas ASS, montagem 1080×1920 e export para HD externo. Avatar opcional (depende de cota da API).",
  tools: [
    videosProjectTool,
    videosScriptTool,
    videosVoiceTool,
    videosSubtitlesTool,
    videosComposeTool,
    videosExportTool,
  ] as unknown as Tool<z.ZodTypeAny>[],
};

export default extension;
export { extension };
