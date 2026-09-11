/**
 * stream:validate — valida setup completo de live antes do Pastor sair pro ar.
 *
 * Checa (sem precisar rodar OBS WebSocket):
 *   ✓ OBS instalado
 *   ✓ Profile existe
 *   ✓ basic.ini tem encoder definido
 *   ✓ bitrate configurado (>500 kbps)
 *   ✓ resolução/fps definidos
 *   ✓ service.ini tem server + stream key
 *   ✓ Hardware tem GPU dedicada (NVENC/AMF) OU CPU suficiente pra x264
 *   ✓ Rede (DNS+TCP) alcança o servidor RTMP
 *
 * Devolve uma lista de checks com status (ok/warn/fail) + mensagem PT-BR clara.
 * O LLM lê isso e traduz pra o usuário com passo-a-passo numerado.
 */

import { obsStatusTool } from "./obs-status.js";
import { obsConfigTool } from "./obs-config.js";
import { hardwareTool } from "./hardware.js";
import { networkCheckTool } from "./network-check.js";
import { z } from "zod";
import type { Tool, ToolContext } from "@kairos/agent";

const mockCtx: ToolContext = {
  agentId: "kairos-stream-validate",
  sessionId: "local",
  cwd: process.cwd(),
  abortSignal: new AbortController().signal,
  confirmDangerous: async () => true,
};

const inputSchema = z.object({
  profile: z.string().optional(),
  platform: z.enum(["youtube", "twitch", "facebook", "x", "kick", "tiktok"]).optional(),
  uploadMbps: z.number().positive().optional(), // ajuda a validar bitrate
});

interface Check {
  id: string;
  status: "ok" | "warn" | "fail";
  message: string;
  recommendation?: string;
}

function inferPlatformFromServer(server: string): string {
  const s = server.toLowerCase();
  if (s.includes("youtube")) return "youtube";
  if (s.includes("twitch")) return "twitch";
  if (s.includes("facebook")) return "facebook";
  if (s.includes("pscp") || s.includes("x.com")) return "x";
  if (s.includes("kick")) return "kick";
  if (s.includes("muscdn") || s.includes("tiktok")) return "tiktok";
  return "custom";
}

export const validateTool: Tool<typeof inputSchema> = {
  name: "stream:validate",
  description:
    "Valida setup completo de live antes de sair pro ar: OBS, encoder, bitrate, resolução, stream service, hardware, rede. Retorna lista de OK/WARN/FAIL com ações.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const checks: Check[] = [];

    // 1. OBS instalado
    const obsStatus = (await obsStatusTool.execute({ readVersion: false }, mockCtx)) as {
      installed: boolean;
      version?: string;
      path?: string;
    };
    checks.push(
      obsStatus.installed
        ? {
            id: "obs-installed",
            status: "ok",
            message: `OBS Studio ${obsStatus.version ?? "?"} instalado em ${obsStatus.path ?? "?"}`,
          }
        : {
            id: "obs-installed",
            status: "fail",
            message: "OBS Studio não encontrado. Instale em https://obsproject.com/",
            recommendation: "Baixar OBS Studio 32+ (64-bit) e rodar pelo menos uma vez antes de configurar a live.",
          },
    );

    // 2. Profile + config básica
    let configData: any = {};
    if (obsStatus.installed) {
      try {
        configData = await obsConfigTool.execute({ profile: input.profile }, mockCtx);
      } catch (err) {
        configData = { error: (err as Error).message };
      }
    }

    if (configData.configured) {
      const enc = configData.encoding ?? {};
      checks.push({
        id: "profile",
        status: "ok",
        message: `Profile "${configData.profile}" ativo (${configData.allProfiles?.length ?? 1} disponíveis)`,
      });

      // Encoder
      if (enc.Encoder && enc.Encoder !== "?") {
        const isHW = /nvenc|amf|qsv|vt/i.test(enc.Encoder);
        checks.push({
          id: "encoder",
          status: "ok",
          message: `Encoder configurado: ${enc.Encoder}${isHW ? " (hardware — bom)" : " (CPU — funciona mas pesa mais)"}`,
          recommendation: isHW
            ? undefined
            : "Se tiver GPU NVIDIA/AMD/Intel, troque pra NVENC/AMF/QSV em Configurações → Saída → Modo: Avançado → Encoder.",
        });
      } else {
        checks.push({
          id: "encoder",
          status: "fail",
          message: "Encoder não configurado no OBS",
          recommendation: "Abrir OBS → Configurações → Saída → Modo Avançado → definir Encoder (x264 ou NVENC).",
        });
      }

      // Bitrate
      const bitrate = parseInt(enc.Bitrate ?? "0", 10);
      if (bitrate > 0) {
        const targetPlatform = input.platform ?? inferPlatformFromServer(configData.streamingService?.server ?? "");
        const recommended =
          targetPlatform === "twitch" ? 6000 : targetPlatform === "kick" ? 6000 : 8000;
        if (bitrate < 1000) {
          checks.push({
            id: "bitrate",
            status: "warn",
            message: `Bitrate ${bitrate} kbps — muito baixo (vai ficar pixelado)`,
            recommendation: `Para ${targetPlatform} sugiro ${recommended} kbps em 1080p.`,
          });
        } else if (bitrate > 20000) {
          checks.push({
            id: "bitrate",
            status: "warn",
            message: `Bitrate ${bitrate} kbps — alto demais (vai exigir upload rápido)`,
            recommendation: "YouTube recomenda ≤ 9000 kbps pra 1080p60. Twitch ≤ 6000.",
          });
        } else {
          checks.push({
            id: "bitrate",
            status: "ok",
            message: `Bitrate ${bitrate} kbps — OK`,
          });
        }
      } else {
        checks.push({
          id: "bitrate",
          status: "fail",
          message: "Bitrate não configurado (0 ou vazio)",
          recommendation: "Configurações → Saída → Controle de taxa: CBR → Bitrate: 6000 (Twitch) ou 8000-9000 (YouTube).",
        });
      }

      // Resolução
      const outW = parseInt(enc.OutputCX ?? "0", 10);
      const outH = parseInt(enc.OutputCY ?? "0", 10);
      if (outW > 0 && outH > 0) {
        checks.push({
          id: "resolution",
          status: "ok",
          message: `Resolução de saída: ${outW}x${outH}`,
        });
      } else {
        checks.push({
          id: "resolution",
          status: "fail",
          message: "Resolução de saída não definida",
          recommendation: "Configurações → Vídeo → Resolução de Saída: 1920x1080 (ou 1280x720).",
        });
      }

      // FPS
      const fpsNum = parseInt(enc.FPSNum ?? "0", 10);
      const fpsDen = parseInt(enc.FPSDen ?? "1", 10);
      const fps = fpsDen > 0 ? fpsNum / fpsDen : 0;
      if (fps > 0) {
        checks.push({
          id: "fps",
          status: "ok",
          message: `FPS: ${fps} (${fpsNum}/${fpsDen})`,
          recommendation: fps === 60 ? undefined : "Pra gameplay ou live com movimento, considere 60 FPS.",
        });
      } else {
        checks.push({
          id: "fps",
          status: "warn",
          message: "FPS não definido",
          recommendation: "Configurações → Vídeo → FPS: 30 (culto) ou 60 (dinâmico).",
        });
      }

      // Stream service
      const svc = configData.streamingService ?? {};
      if (svc.type && svc.type !== "(não configurado)" && svc.key && !svc.key.startsWith("(")) {
        const detectedPlatform = input.platform ?? inferPlatformFromServer(svc.server ?? "");
        checks.push({
          id: "stream-service",
          status: "ok",
          message: `Serviço: ${svc.type} → ${detectedPlatform} (key: ${svc.key})`,
        });
      } else {
        checks.push({
          id: "stream-service",
          status: "fail",
          message: "Stream key não configurada — live NÃO vai funcionar",
          recommendation:
            "Pegar a stream key no painel do YouTube Studio / Twitch Dashboard e colar em Configurações → Transmissão → Chave de transmissão.",
        });
      }
    } else {
      checks.push({
        id: "profile",
        status: "fail",
        message: configData.message ?? "Profile do OBS não inicializado",
        recommendation: "Abrir o OBS e criar pelo menos uma cena com câmera/microfone.",
      });
    }

    // 3. Hardware
    let hwData: any = {};
    try {
      hwData = await hardwareTool.execute({}, mockCtx);
    } catch (err) {
      hwData = { error: (err as Error).message };
    }
    if (hwData.ok) {
      const gpuName: string = hwData.gpu?.name ?? "";
      const isVirtual = /ms idd|indirect/i.test(gpuName);
      checks.push({
        id: "hardware-gpu",
        status: isVirtual
          ? "warn"
          : /nvidia|amd|radeon|intel.*iris|arc/i.test(gpuName)
            ? "ok"
            : "warn",
        message: isVirtual
          ? `GPU detectada: ${gpuName} (display virtual — não é GPU real)`
          : `GPU: ${gpuName}`,
        recommendation: isVirtual
          ? "O Windows reportou um display virtual em vez da GPU real. Verifique em Gerenciador de Dispositivos → Adaptadores de vídeo."
          : undefined,
      });

      const cpuCores = hwData.cpu?.cores ?? 0;
      checks.push({
        id: "hardware-cpu",
        status: cpuCores >= 4 ? "ok" : "warn",
        message: `CPU: ${hwData.cpu?.model ?? "?"} (${cpuCores} cores)`,
        recommendation: cpuCores < 4 ? "Poucos cores — vai depender de encoder de hardware." : undefined,
      });

      const ramGB = hwData.ram?.totalGB ?? 0;
      checks.push({
        id: "hardware-ram",
        status: ramGB >= 8 ? "ok" : "warn",
        message: `RAM: ${ramGB} GB`,
        recommendation: ramGB < 8 ? "RAM baixa — feche outros apps pesados durante a live." : undefined,
      });
    } else {
      checks.push({
        id: "hardware",
        status: "warn",
        message: `Não foi possível detectar hardware: ${hwData.error ?? "?"}`,
      });
    }

    // 4. Rede (se tiver server)
    if (configData.streamingService?.server) {
      try {
        const platform = inferPlatformFromServer(configData.streamingService.server);
        const target = (["youtube", "twitch", "facebook"] as const).find((p) => p === platform) ?? "youtube";
        const net = (await networkCheckTool.execute({ target, timeoutMs: 5000 }, mockCtx)) as {
          ok: boolean;
          host?: string;
          dnsMs?: number;
          tcpMs?: number;
          error?: string;
          diagnosis?: string;
        };
        checks.push({
          id: "network",
          status: net.ok ? "ok" : "fail",
          message: net.ok
            ? `Rede OK: DNS ${net.dnsMs ?? "?"}ms + TCP ${net.tcpMs ?? "?"}ms até ${net.host ?? target}`
            : `Rede com problema: ${net.diagnosis ?? net.error ?? "?"} — público pode não conseguir assistir`,
          recommendation: net.ok
            ? undefined
            : "Verifique firewall/antivírus ou peça ajuda do provedor de internet.",
        });
      } catch (err) {
        checks.push({
          id: "network",
          status: "warn",
          message: `Falha testando rede: ${(err as Error).message}`,
        });
      }
    }

    // Sumário
    const summary = {
      ok: checks.filter((c) => c.status === "ok").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
    };

    const canGoLive = summary.fail === 0;
    return {
      ok: true,
      canGoLive,
      summary,
      checks,
      nextSteps: canGoLive
        ? ["Abrir OBS", "Clicar em 'Iniciar Transmissão'", "Monitorar dropped frames nos primeiros 2 min"]
        : checks
            .filter((c) => c.status === "fail" && c.recommendation)
            .map((c) => c.recommendation as string),
    };
  },
};
