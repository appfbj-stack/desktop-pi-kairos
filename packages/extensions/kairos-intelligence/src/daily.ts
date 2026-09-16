/**
 * Daily log — append-only markdown per dia.
 *
 * Cada sessao pode deixar contexto do dia aqui. Renderizado como daily/YYYY-MM-DD.md.
 * Auto-inject inclui um digest do daily de hoje na hora de carregar contexto.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureMemoryDirs } from "./paths.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(date: string): void {
  if (!DATE_RE.test(date)) throw new Error(`Data invalida: ${date}`);
}

export function dailyLogPath(root: string, date: string): string {
  assertDate(date);
  return join(ensureMemoryDirs(root).daily, `${date}.md`);
}

export function appendDailyLog(root: string, date: string, content: string): void {
  const file = dailyLogPath(root, date);
  const prefix = existsSync(file) && readFileSync(file, "utf-8").trim() ? "\n\n" : "";
  appendFileSync(file, `${prefix}${content.trim()}\n`, "utf-8");
}

export function readDailyLog(root: string, date: string): string {
  const file = dailyLogPath(root, date);
  return existsSync(file) ? readFileSync(file, "utf-8") : "";
}

export function todayString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Constroi um digest curto do daily log pra injecao de contexto. */
export function buildDailyDigest(dailyContent: string, maxChars: number): string {
  if (!dailyContent.trim()) return "";
  // Captura soh headers + bullets (ignora ruido)
  const lines: string[] = [];
  for (const line of dailyContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("## ") || trimmed.startsWith("- ") || trimmed.startsWith("#")) {
      lines.push(trimmed);
    }
  }
  if (lines.length === 0) return dailyContent.slice(-maxChars);
  const body = lines.join("\n");
  return body.length > maxChars ? body.slice(0, maxChars - 20) + "\n... (truncated)" : body;
}
