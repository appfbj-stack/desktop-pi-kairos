/**
 * Store — load all records + render markdown projection.
 *
 * A projection nao eh canonica; serve soh pra inspecionar.
 * Sempre que o canonico muda, chama renderMemory() pra atualizar.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { listActive } from "./long-term.js";
import type { MemoryRecord } from "./long-term.js";
import { ensureMemoryDirs } from "./paths.js";

function renderRecord(record: MemoryRecord): string {
  const tags = record.tags.map((t) => `#${t}`).join(" ");
  const stale = renderStalenessTag(record);
  const superseded = record.superseded_by ? ` → superseded by ${record.superseded_by}` : "";
  return [
    `### ${record.id}${stale}`,
    "",
    `**Confidence**: ${record.confidence.toFixed(2)}  **Stability**: ${record.stability}${superseded ? " " + superseded : ""}`,
    `**Tags**: ${tags || "_none_"}`,
    "",
    record.statement,
    record.notes ? `\n_Note_: ${record.notes}` : "",
  ].filter((p) => p !== "").join("\n");
}

function renderStalenessTag(record: MemoryRecord): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(record.updated_at).getTime()) / 86_400_000));
  if (days >= 90) return ` 🔴 ${days}d`;
  if (days >= 30) return ` ⚠️ ${days}d`;
  return "";
}

/** Renderiza todos os records ativos como MEMORY.md projection. */
export function renderMemory(root: string): string {
  const records = listActive(root);
  const l1 = records.filter((r) => r.layer === "L1");
  const l2 = records.filter((r) => r.layer === "L2");

  const sections = [
    "# Kairós Persistent Intelligence",
    "",
    "> Generated from canonical JSONL. Do not edit directly.",
    "",
    `Total: ${records.length} active records (L1=${l1.length}, L2=${l2.length}).`,
    "",
    "## L1 — Identity",
    "",
    l1.length ? l1.map(renderRecord).join("\n\n") : "_No L1 records._",
    "",
    "## L2 — Playbooks / Project",
    "",
    l2.length ? l2.map(renderRecord).join("\n\n") : "_No L2 records._",
    "",
  ];
  const markdown = sections.join("\n");

  // Persiste projection
  const file = ensureMemoryDirs(root).rendered.memory;
  writeFileSync(file, markdown, "utf-8");
  return markdown;
}

export function loadMemoryMarkdown(root: string): string {
  try {
    return join(ensureMemoryDirs(root).rendered.dir, "MEMORY.md");
  } catch {
    return "";
  }
}
