/**
 * stream:hardware — detecta GPU, CPU e RAM do PC e recomenda encoder.
 *
 * Lê via PowerShell:
 *   - GPU: Get-WmiObject Win32_VideoController (Name, AdapterRAM, VideoProcessor)
 *   - CPU: Get-WmiObject Win32_Processor (Name, NumberOfCores, NumberOfLogicalProcessors)
 *   - RAM: Get-CimInstance Win32_PhysicalMemory | Measure Capacity
 *
 * Encoders suportados (em ordem de eficiência):
 *   - NVENC H.264 / HEVC  (NVIDIA Turing+ = GTX 16xx / RTX)
 *   - AMF H.264 / HEVC     (AMD RDNA+ = RX 5000+)
 *   - QuickSync H.264      (Intel iGPU 6th gen+)
 *   - x264 (CPU)           (fallback, usa muita CPU)
 *
 * Retorna recomendação priorizada + modo livre (sem path guard).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "@kairos/agent";

const execFileAsync = promisify(execFile);

const PS_SCRIPT = `
$gpu = Get-WmiObject Win32_VideoController | Select-Object -First 1 Name, AdapterRAM, VideoProcessor
$cpu = Get-WmiObject Win32_Processor | Select-Object -First 1 Name, NumberOfCores, NumberOfLogicalProcessors
$ram = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum / 1GB
$result = @{
  gpu = $gpu
  cpu = $cpu
  ramGb = [math]::Round($ram, 1)
}
$result | ConvertTo-Json -Compress
`.trim();

const inputSchema = z.object({});

interface Hardware {
  gpu: { Name: string; VideoProcessor?: string; AdapterRAM?: number };
  cpu: { Name: string; NumberOfCores: number; NumberOfLogicalProcessors: number };
  ramGb: number;
}

function detectEncoder(gpuName: string, videoProcessor: string): { primary: string; fallback: string; tier: "high" | "mid" | "low" } {
  const name = `${gpuName} ${videoProcessor}`.toLowerCase();

  // NVIDIA — RTX / GTX 16xx+ tem NVENC
  if (name.includes("nvidia") || name.includes("geforce") || name.includes("rtx") || name.includes("gtx")) {
    if (name.includes("rtx 40") || name.includes("rtx 50") || name.includes("rtx 30")) {
      return { primary: "NVENC H.264 (Quality preset)", fallback: "NVENC HEVC", tier: "high" };
    }
    if (name.includes("gtx 16") || name.includes("rtx 20") || name.includes("gtx 10")) {
      return { primary: "NVENC H.264 (Max Quality)", fallback: "x264 (CPU)", tier: "mid" };
    }
  }

  // AMD RDNA+
  if (name.includes("amd") || name.includes("radeon") || name.includes("rx ")) {
    if (name.match(/rx\s*(5|6|7|8|9)\d{3}/)) {
      return { primary: "AMF H.264 (Quality)", fallback: "x264 (CPU)", tier: "mid" };
    }
  }

  // Intel QuickSync (iGPU)
  if (name.includes("intel") || name.includes("uhd") || name.includes("iris")) {
    return { primary: "QuickSync H.264 (balanced)", fallback: "x264 (CPU)", tier: "low" };
  }

  return { primary: "x264 (CPU) — preset veryfast", fallback: "x264 (CPU) — preset ultrafast", tier: "low" };
}

function recommendBitrate(uploadMbps: number, tier: "high" | "mid" | "low"): { kbps: number; quality: string; resolution: string; fps: number } {
  const safeKbps = Math.floor(uploadMbps * 1000 * 0.75);
  if (tier === "high" && safeKbps >= 9000) return { kbps: 9000, quality: "1080p60", resolution: "1920x1080", fps: 60 };
  if (safeKbps >= 6000) return { kbps: 6000, quality: "1080p30", resolution: "1920x1080", fps: 30 };
  if (safeKbps >= 4500) return { kbps: 4500, quality: "720p30", resolution: "1280x720", fps: 30 };
  if (safeKbps >= 1500) return { kbps: 1500, quality: "480p30", resolution: "854x480", fps: 30 };
  return { kbps: 1000, quality: "360p30", resolution: "640x360", fps: 30 };
}

export const hardwareTool: Tool<typeof inputSchema> = {
  name: "stream:hardware",
  description:
    "Detecta GPU/CPU/RAM do PC e recomenda encoder + bitrate ideal pra live baseado no hardware E na velocidade de upload.",
  inputSchema,
  async execute(_input: z.infer<typeof inputSchema>, ctx: { agentId: string; sessionId: string; cwd: string; abortSignal: AbortSignal; confirmDangerous: (p: string) => Promise<boolean> }) {
    void ctx;
    let hw: Hardware;
    try {
      const { stdout } = await execFileAsync(
        "powershell",
        ["-NoProfile", "-Command", PS_SCRIPT],
        { windowsHide: true, timeout: 10000 }
      );
      hw = JSON.parse(stdout.trim());
    } catch (err) {
      return {
        error: `Falha lendo hardware via PowerShell: ${(err as Error).message}`,
        fallback: {
          recommendation: "Use x264 (CPU) com preset veryfast até instalar drivers corretos",
        },
      };
    }

    const gpuName = hw.gpu?.Name ?? "Desconhecida";
    const videoProc = hw.gpu?.VideoProcessor ?? "";
    const enc = detectEncoder(gpuName, videoProc);

    // Sugestão conservadora de upload: 5 Mbps (Pastor pode re-rodar com valor real)
    const rec = recommendBitrate(5, enc.tier);

    return {
      hardware: {
        gpu: {
          name: gpuName,
          videoProcessor: videoProc,
          vramMb: hw.gpu?.AdapterRAM ? Math.round(hw.gpu.AdapterRAM / 1024 / 1024) : undefined,
        },
        cpu: {
          name: hw.cpu?.Name ?? "Desconhecido",
          cores: hw.cpu?.NumberOfCores,
          threads: hw.cpu?.NumberOfLogicalProcessors,
        },
        ramGb: hw.ramGb,
      },
      encoder: {
        primary: enc.primary,
        fallback: enc.fallback,
        tier: enc.tier,
        reason: enc.tier === "high"
          ? "GPU topo de linha — usa encoder hardware, deixa CPU livre"
          : enc.tier === "mid"
          ? "GPU mid-range — encoder hardware funciona mas exige Quality (não Max Quality)"
          : "GPU entry-level ou desconhecida — x264 CPU é mais seguro",
      },
      recommended: rec,
      notes: [
        "Se usar x264 (CPU): preset 'veryfast' equilibra qualidade e uso de CPU. Abaixo disso, CPU sofre.",
        "Encoder hardware (NVENC/AMF/QuickSync) usa ~5% de CPU — recomendado pra cultos longos sem aquecer máquina.",
        "Bitrate recomendado assume 5 Mbps de upload. Rode stream:youtube-setup com o valor real do fast.com pra calibrar.",
      ],
    };
  },
};
