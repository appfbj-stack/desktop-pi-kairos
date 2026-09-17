/**
 * web:prospect-save — busca + enrich + salva leads em CSV/Excel automaticamente.
 *
 * Wrapper sobre web:prospect que escreve resultado direto em arquivo no workspace.
 * Colunas: title, url, snippet, emails, phones, fetched_at.
 *
 * CSV abre nativo em Excel/Google Sheets/LibreOffice.
 */

import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import { prospectTool } from "./prospect.js";
import type { Tool } from "@kairos/agent";

const inputSchema = z.object({
  nicho: z.string().min(2).describe("Nicho + intenção de compra (mesmo formato de web:prospect)"),
  maxLeads: z.number().int().min(1).max(20).default(15),
  region: z.enum(["br-pt", "us-en", "wt-wt"]).default("br-pt"),
  filename: z
    .string()
    .optional()
    .describe("Nome do arquivo .csv. Default: leads-{timestamp}.csv"),
});

interface ProspectLead {
  title: string;
  url: string;
  snippet: string;
  emails?: string[];
  phones?: string[];
}

/** Escapa valor CSV (aspas + vírgulas + quebras de linha). */
function csvEscape(value: string | undefined | null): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function leadsToCsv(leads: ProspectLead[]): string {
  const header = "title,url,snippet,emails,phones,fetched_at";
  const now = new Date().toISOString();
  const rows = leads.map((l) =>
    [
      csvEscape(l.title),
      csvEscape(l.url),
      csvEscape(l.snippet),
      csvEscape((l.emails ?? []).join("; ")),
      csvEscape((l.phones ?? []).join("; ")),
      now,
    ].join(",")
  );
  return [header, ...rows].join("\n") + "\n";
}

export const prospectSaveTool: Tool<typeof inputSchema> = {
  name: "web:prospect-save",
  description:
    "Busca + enrich + salva leads em CSV no workspace. " +
    "Use pra prospectar clientes e já ter o arquivo pronto pra abrir no Excel. " +
    "Caminho: <workspace>/leads/.csv (default: leads-{timestamp}.csv).",
  inputSchema,
  execute: async (input) => {
    const workspace = process.env.KAIROS_WORKSPACE_DIR;
    if (!workspace) throw new Error("KAIROS_WORKSPACE_DIR não definido.");

    // Reusa prospectTool chamando execute diretamente
    const result = (await prospectTool.execute(
      {
        nicho: input.nicho,
        maxLeads: input.maxLeads,
        region: input.region,
        enrich: true,
      },
      {
        agentId: "research",
        sessionId: "research-prospect-save",
        cwd: workspace,
        abortSignal: new AbortController().signal,
        confirmDangerous: async () => true,
      }
    )) as { leads: ProspectLead[]; count: number; withContact: number };

    const leads = result.leads ?? [];
    const filename =
      input.filename ??
      `leads-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.csv`;

    const leadsDir = path.join(workspace, "leads");
    await fs.mkdir(leadsDir, { recursive: true });
    const outPath = path.join(leadsDir, filename);
    await fs.writeFile(outPath, leadsToCsv(leads), "utf-8");

    const withEmail = leads.filter((l) => (l.emails?.length ?? 0) > 0).length;
    const withPhone = leads.filter((l) => (l.phones?.length ?? 0) > 0).length;

    return {
      ok: true,
      savedTo: outPath,
      filename,
      bytes: (await fs.stat(outPath)).size,
      totalLeads: leads.length,
      withEmail,
      withPhone,
      withContact: result.withContact,
      message: `💾 ${leads.length} leads salvos em workspace:leads/${filename}. ${withEmail} com email, ${withPhone} com telefone.`,
    };
  },
};