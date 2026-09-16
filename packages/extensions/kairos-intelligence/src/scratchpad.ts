/**
 * Scratchpad — checklist simples persistido em scratchpad.md.
 *
 * Adaptado de pi-persistent-intelligence/src/scratchpad.ts. Formato:
 *   - [ ] item pendente
 *   - [x] item concluido
 *
 * Aparece no auto-inject pra lembrar tarefas em aberto.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { ensureMemoryDirs } from "./paths.js";

export interface ScratchpadItem {
  done: boolean;
  text: string;
}

export function parseScratchpad(content: string): ScratchpadItem[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.match(/^- \[([ xX])\] (.+)$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ done: (m[1] ?? "").toLowerCase() === "x", text: m[2] ?? "" }));
}

export function serializeScratchpad(items: ScratchpadItem[]): string {
  return ["# Scratchpad", "", ...items.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`), ""].join("\n");
}

export function listScratchpadItems(root: string): ScratchpadItem[] {
  const file = ensureMemoryDirs(root).scratchpad;
  return parseScratchpad(readFileSync(file, "utf-8"));
}

function writeItems(root: string, items: ScratchpadItem[]): void {
  const file = ensureMemoryDirs(root).scratchpad;
  writeFileSync(file, serializeScratchpad(items), "utf-8");
}

export function addScratchpadItem(root: string, text: string): ScratchpadItem[] {
  const items = listScratchpadItems(root);
  items.push({ done: false, text });
  writeItems(root, items);
  return items;
}

export function markScratchpadDone(root: string, matchText: string): ScratchpadItem[] {
  return updateMatch(root, matchText, true);
}

export function markScratchpadUndone(root: string, matchText: string): ScratchpadItem[] {
  return updateMatch(root, matchText, false);
}

function updateMatch(root: string, matchText: string, done: boolean): ScratchpadItem[] {
  const items = listScratchpadItems(root);
  const item = items.find((e) => e.text.includes(matchText));
  if (!item) throw new Error(`Item nao encontrado no scratchpad: ${matchText}`);
  item.done = done;
  writeItems(root, items);
  return items;
}

export function clearDoneScratchpadItems(root: string): ScratchpadItem[] {
  const remaining = listScratchpadItems(root).filter((i) => !i.done);
  writeItems(root, remaining);
  return remaining;
}
