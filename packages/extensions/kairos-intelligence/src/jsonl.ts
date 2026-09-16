/**
 * JSONL primitives — append-only durable storage.
 *
 * Adaptado de pi-persistent-intelligence/src/jsonl.ts. Usado pra L1, L2,
 * inbox/captured e tombstones. Atomic writes (writeJsonlAtomic) garantem
 * que o arquivo nunca fica corrompido no meio de uma mutacao.
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

export function readJsonl<T = unknown>(file: string): T[] {
  if (!existsSync(file)) return [];
  const content = readFileSync(file, "utf-8");
  const out: T[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // linha corrompida — pula mas nao derruba tudo
    }
  }
  return out;
}

export function writeJsonl<T>(file: string, records: T[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const content = records.map((r) => JSON.stringify(r)).join("\n");
  writeFileSync(file, content ? `${content}\n` : "", "utf-8");
}

export function appendJsonl<T>(file: string, record: T): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`, "utf-8");
}

/** Escrita atomica: escreve em arquivo temporario + fsync + rename. */
export function writeJsonlAtomic<T>(file: string, records: T[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  const content = records.map((r) => JSON.stringify(r)).join("\n");
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeSync(fd, content ? `${content}\n` : "", undefined, "utf-8");
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    unlinkSync(temporary);
    throw error;
  }
  closeSync(fd);
  renameSync(temporary, file);
}
