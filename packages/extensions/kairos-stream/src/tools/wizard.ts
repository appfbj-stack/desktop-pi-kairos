/**
 * stream:wizard — wizard guiado de setup completo do OBS pra live.
 *
 * Roda tudo de uma vez: hardware → rede → plataforma → encoder → cena.
 * Devolve um plano passo-a-passo numerado que Pastor só precisa seguir.
 *
 * Usa as outras tools internamente — é o "combo" do que o Pastor pediria
 * peça por peça.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { hardwareTool } from "./hardware.js";
import { networkCheckTool } from "./network-check.js";
import { platformsTool } from "./platforms.js";
import { youtubeSetupTool } from "./youtube-setup.js";

const inputSchema = z.object({
  /** Velocidade de upload medida (Mbps). Se omitido, usa 5 como estimativa conservadora. */
  uploadMbps: z.number().positive().optional(),
  /** Plataforma alvo (default: youtube). Aceita nome parcial (ex: "you", "twitch"). */
  platform: z.string().default("youtube"),
  /** Stream key da plataforma (opcional — se fornecido, calcula bitrate ideal). */
  streamKey: z.string().optional(),
});

interface WizardStep {
  step: number;
  title: string;
  detail: string;
  done?: boolean;
}

export const wizardTool: Tool<typeof inputSchema> = {
  name: "stream:wizard",
  description:
    "Wizard completo de setup de live: detecta hardware, testa rede, escolhe plataforma, recomenda encoder + bitrate, devolve passo-a-passo numerado.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, ctx) {
    const uploadMbps = input.uploadMbps ?? 5;
    const platform = input.platform;
    const streamKey = input.streamKey ?? "demo-key-replace-com-chave-real-24c";

    // Executa as detecções em paralelo
    interface HardwareLike { hardware?: { gpu?: { name?: string } } }
    interface NetworkLike { diagnosis?: string }
    interface PlatformsLike { platforms: Array<{ name: string; ingestServer: string; keyHint: string }> }

    const [hw, nt, pl] = (await Promise.all([
      Promise.resolve(hardwareTool.execute({}, ctx)).catch((err): HardwareLike => ({ hardware: { gpu: { name: `Erro: ${(err as Error).message}` } } })),
      Promise.resolve(networkCheckTool.execute({ target: platform.toLowerCase().includes("twitch") ? "twitch" : "youtube", timeoutMs: 5000 }, ctx)).catch((err): NetworkLike => ({ diagnosis: `Erro: ${(err as Error).message}` })),
      Promise.resolve(platformsTool.execute({ category: "all", only: platform }, ctx)).catch((err): PlatformsLike => ({ platforms: [] })),
    ])) as [HardwareLike, NetworkLike, PlatformsLike];

    const yt = input.streamKey
      ? (await Promise.resolve(youtubeSetupTool.execute({ uploadMbps, streamKey, quality: "auto" }, ctx)).catch((err) => ({ error: (err as Error).message }))) as { encoder?: { recommended: string; bitrateKbps: number }; video?: { resolution: string; fps: number; keyframeIntervalSec: number } } | { error: string } | null
      : null;

    // Monta passo-a-passo numerado
    const steps: WizardStep[] = [
      {
        step: 1,
        title: "Verificar requisitos",
        detail: `${hw.hardware?.gpu?.name ?? "GPU?"} detectada. Rede: ${nt.diagnosis ?? "?"}.`,
        done: true,
      },
      {
        step: 2,
        title: "Escolher plataforma",
        detail: (() => {
          if (!pl.platforms.length) {
            return `Plataforma "${platform}" não encontrada. Opções: youtube, twitch, facebook, kick.`;
          }
          const p = pl.platforms[0];
          return `${p.name}: server = ${p.ingestServer}. Chave: ${p.keyHint}`;
        })(),
        done: true,
      },
      {
        step: 3,
        title: "Configurar encoder no OBS",
        detail: yt && "encoder" in yt && yt.encoder
          ? `${yt.encoder.recommended} @ ${yt.encoder.bitrateKbps} kbps CBR`
          : "Use o encoder recomendado pelo hardware detectado (passo 1)",
        done: false,
      },
      {
        step: 4,
        title: "Configurar resolução e FPS",
        detail: yt && "video" in yt && yt.video
          ? `${yt.video.resolution} @ ${yt.video.fps}fps, keyframe ${yt.video.keyframeIntervalSec}s`
          : "1920x1080@30 ou 1280x720@30 (conforme upload)",
        done: false,
      },
      {
        step: 5,
        title: "Configurar áudio",
        detail: "AAC 160 kbps, 44.1 kHz, estéreo. Mic como fonte primária (ganho -3dB), sem desktop audio (evita eco).",
        done: false,
      },
      {
        step: 6,
        title: "Conectar plataforma no OBS",
        detail: "OBS → Configurações → Stream → Selecionar plataforma → Colar stream key OU conectar conta (OAuth)",
        done: false,
      },
      {
        step: 7,
        title: "Testar conexão",
        detail: "Botão 'Iniciar transmissão' no OBS com uma cena vazia (fundo preto + texto 'teste'). Veja se barra de status fica verde. Se amarela/vermelha, volte pro passo 6.",
        done: false,
      },
      {
        step: 8,
        title: "Configurar backup de gravação",
        detail: "OBS → Configurações → Saída → aba Gravando → Ativar. Formato MKV (não fragmenta se crashar). Pasta: disco D:\\ ou externo (não no C: pra não encher SSD).",
        done: false,
      },
    ];

    return {
      detected: {
        hardware: hw,
        network: nt,
        platform: pl,
        youtubeSetup: yt,
      },
      uploadMbps,
      streamKeyPreview: streamKey ? `${streamKey.slice(0, 6)}…${streamKey.slice(-4)}` : "(não fornecida)",
      steps,
      finalTips: [
        "Antes da live real: rode um teste de 5 minutos. Veja o dashboard da plataforma — o vídeo travou? Áudio cortou? Volte e ajuste bitrate pra baixo.",
        "Cultos longos (>1h): divida em 2 cenas separadas no OBS pra reduzir risco de travamento (câmera + slides).",
        "Tenha sempre o celular gravando como backup. Se tudo cair, você tem o conteúdo.",
        "Salve as configurações do OBS como 'Profile' pra reutilizar (Perfil → Salvar).",
      ],
    };
  },
};
