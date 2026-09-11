/**
 * stream:displays — detecta os monitores/displays nativos do Windows.
 *
 * Útil pra:
 *   - Sugerir resolução de canvas do OBS baseada no display real
 *   - Identificar o "Display Capture" (captura de tela) que o usuário deve escolher
 *   - Detectar GPU ativa em cada display (pra NVENC funcionar)
 *
 * Usa WMI (Win32_DesktopMonitor + Win32_VideoController) via PowerShell.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "@kairos/agent";

const exec = promisify(execFile);

const inputSchema = z.object({});

interface Display {
  index: number;
  name: string;
  widthPx: number;
  heightPx: number;
  refreshRateHz: number | null;
  primary: boolean;
}

interface VideoController {
  name: string;
  driverVersion: string;
  adapterRAM_MB: number;
  status: string;
}

async function runPs(script: string): Promise<string> {
  const { stdout } = await exec(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { timeout: 12000, maxBuffer: 4 * 1024 * 1024 },
  );
  return stdout.trim();
}

export const displaysTool: Tool<typeof inputSchema> = {
  name: "stream:displays",
  description:
    "Detecta todos os monitores/displays nativos do Windows (resolução + refresh rate + GPU ativa) pra sugerir configuração de canvas do OBS.",
  inputSchema,
  async execute(_input: z.infer<typeof inputSchema>) {
    try {
      // Win32_DesktopMonitor: lista monitores (Name, ScreenWidth, ScreenHeight, pixels_per_X_logical_inch, etc)
      // Win32_VideoConfiguration: refresh rate (RefreshRate)
      // Win32_VideoController: GPU info (Name, DriverVersion, AdapterRAM, VideoProcessor)
      const ps = `
$monitors = Get-CimInstance -ClassName Win32_DesktopMonitor -ErrorAction SilentlyContinue;
$configs = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue;
$gpus = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue | Select-Object Name, DriverVersion, AdapterRAM, VideoProcessor, Status;

$out = [PSCustomObject]@{
  Monitors = @($monitors | ForEach-Object {
    [PSCustomObject]@{
      Name = $_.Name
      WidthPx = $_.ScreenWidth
      HeightPx = $_.ScreenHeight
      PixelsPerXLogicalInch = $_.PixelsPerXLogicalInch
    }
  });
  VideoConfigs = @($configs | ForEach-Object {
    [PSCustomObject]@{
      Name = $_.Name
      VideoProcessor = $_.VideoProcessor
      RefreshRate = $_.RefreshRate
      BitsPerPixel = $_.BitsPerPixel
    }
  });
  GPUs = @($gpus | ForEach-Object {
    [PSCustomObject]@{
      Name = $_.Name
      DriverVersion = $_.DriverVersion
      AdapterRAM_MB = [int]($_.AdapterRAM / 1MB)
      VideoProcessor = $_.VideoProcessor
      Status = $_.Status
    }
  });
};
$out | ConvertTo-Json -Depth 4
`;
      const stdout = await runPs(ps);
      const data = JSON.parse(stdout);

      const displays: Display[] = (data.Monitors ?? []).map((m: any, i: number) => ({
        index: i,
        name: m.Name ?? `Monitor ${i + 1}`,
        widthPx: m.WidthPx ?? 0,
        heightPx: m.HeightPx ?? 0,
        refreshRateHz: null,
        primary: i === 0,
      }));

      // Tenta casar refresh rate por VideoConfig Name parecido
      const refreshByName = new Map<string, number>();
      for (const vc of data.VideoConfigs ?? []) {
        if (vc.RefreshRate && vc.RefreshRate > 0) {
          refreshByName.set(vc.Name ?? "", vc.RefreshRate);
        }
      }
      for (const d of displays) {
        const r = refreshByName.get(d.name);
        if (r) d.refreshRateHz = r;
      }

      const gpus: VideoController[] = (data.GPUs ?? []).map((g: any) => ({
        name: g.Name ?? "(sem nome)",
        driverVersion: g.DriverVersion ?? "?",
        adapterRAM_MB: g.AdapterRAM_MB ?? 0,
        status: g.Status ?? "?",
      }));

      // Sugestão de canvas baseado no display primário
      const primary = displays[0];
      const suggestion = primary
        ? {
            canvasWidth: primary.widthPx,
            canvasHeight: primary.heightPx,
            fps: primary.refreshRateHz ?? 30,
            note: primary.refreshRateHz
              ? `Use o refresh rate nativo (${primary.refreshRateHz} Hz) ou 30/60 pra compatibilidade YouTube/Twitch.`
              : "Refresh rate não detectado. Sugerido 30 FPS pra compatibilidade ampla.",
          }
        : {
            canvasWidth: 1920,
            canvasHeight: 1080,
            fps: 30,
            note: "Nenhum display detectado — usando padrão 1920x1080@30.",
          };

      // Filtra GPU "MS Idd Device" (Microsoft Indirect Display Driver — display virtual)
      const realGpus = gpus.filter((g) => !g.name.toLowerCase().includes("ms idd") && !g.name.toLowerCase().includes("indirect"));
      const gpusDetected = realGpus.length > 0 ? realGpus : gpus;

      return {
        ok: true,
        displays,
        gpus: gpusDetected,
        virtualDisplaysIgnored: gpus.length - gpusDetected.length,
        suggestion,
        nvidiaAvailable: gpusDetected.some((g) => g.name.toLowerCase().includes("nvidia")),
        amdAvailable: gpusDetected.some((g) => g.name.toLowerCase().includes("amd") || g.name.toLowerCase().includes("radeon")),
        intelAvailable: gpusDetected.some((g) => g.name.toLowerCase().includes("intel")),
      };
    } catch (err) {
      return {
        ok: false,
        message: `Falha detectando displays: ${(err as Error).message}`,
      };
    }
  },
};
