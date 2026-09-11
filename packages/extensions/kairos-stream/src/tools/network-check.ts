/**
 * stream:check-network — testa conectividade com servidor RTMP do YouTube.
 *
 * Faz DNS + TCP handshake + mede latência (ms) pro rtmp endpoint.
 * Não abre stream real (não envia dados), só verifica que a rota de rede
 * tá aberta e mede o RTT.
 *
 * Sintoma típico: timeout aqui = firewall/proxy corporativo bloqueando
 * saída na porta 1935 ou DNS travado.
 */

import dns from "node:dns/promises";
import net from "node:net";
import { z } from "zod";
import type { Tool } from "@kairos/agent";

const RTMP_HOSTS: Record<string, { host: string; port: number }> = {
  youtube: { host: "a.rtmp.youtube.com", port: 1935 },
  twitch: { host: "live.twitch.tv", port: 1935 },
  facebook: { host: "live-api-s.facebook.com", port: 443 },
};

function tcpProbe(host: string, port: number, timeoutMs: number): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;
    const onDone = (result: { ok: boolean; latencyMs?: number; error?: string }) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch {}
      resolve(result);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => onDone({ ok: true, latencyMs: Date.now() - start }));
    sock.once("timeout", () => onDone({ ok: false, error: `timeout após ${timeoutMs}ms` }));
    sock.once("error", (err) => onDone({ ok: false, error: err.message }));
    sock.connect(port, host);
  });
}

const inputSchema = z.object({
  /** Qual servidor testar. Default: youtube. */
  target: z.enum(["youtube", "twitch", "facebook"]).default("youtube"),
  /** Timeout TCP em ms. */
  timeoutMs: z.number().min(500).max(15000).default(5000),
});

export const networkCheckTool: Tool<typeof inputSchema> = {
  name: "stream:check-network",
  description:
    "Testa DNS + TCP na porta 1935 do servidor RTMP alvo. Mede latência. Útil pra descobrir se firewall/proxy tá bloqueando a live.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const { target, timeoutMs } = input;
    const { host, port } = RTMP_HOSTS[target];
    interface CheckResult {
      target: string;
      host: string;
      port: number;
      dns: { resolved: boolean; records?: string[]; error?: string; latencyMs: number };
      tcp: { ok: boolean; latencyMs?: number; error?: string };
      diagnosis: string;
    }
    const out: CheckResult = {
      target,
      host,
      port,
      dns: { resolved: false, latencyMs: 0 },
      tcp: { ok: false },
      diagnosis: "",
    };

    // DNS check
    const dnsStart = Date.now();
    try {
      const records = await dns.resolve4(host);
      out.dns = { resolved: true, records, latencyMs: Date.now() - dnsStart };
    } catch (err) {
      out.dns = { resolved: false, error: (err as Error).message, latencyMs: Date.now() - dnsStart };
    }

    // TCP probe
    out.tcp = await tcpProbe(host, port, timeoutMs);

    // Diagnóstico
    if (!out.dns.resolved) {
      out.diagnosis = "❌ DNS falhou — sem internet ou DNS do provedor travado";
    } else if (!out.tcp.ok) {
      out.diagnosis = `❌ TCP ${port} bloqueado — firewall ou proxy corporativo. Tente porta 443 (RTMPS) ou VPN.`;
    } else if (out.tcp.latencyMs && out.tcp.latencyMs > 200) {
      out.diagnosis = `⚠️ Latência alta (${out.tcp.latencyMs}ms) — pode causar instabilidade na live`;
    } else {
      out.diagnosis = `✅ Conexão OK (DNS ${out.dns.latencyMs}ms + TCP ${out.tcp.latencyMs}ms). Live deve funcionar.`;
    }

    return out;
  },
};
