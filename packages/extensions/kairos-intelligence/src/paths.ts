/**
 * Estrutura de diretorios do Kairós Persistent Intelligence.
 *
 * Adaptado de pi-persistent-intelligence (MIT, Mont3ll) — usa os mesmos
 * conceitos de L1/L2/daily/scratchpad/inbox mas com paths Kairós-friendly.
 *
 * Canonical: JSONL append-only (memory/L1.*.jsonl, memory/L2.*.jsonl,
 *            inbox/captured.jsonl).
 * Projection: Markdown renderizado pra inspecao humana (rendered/MEMORY.md,
 *            daily/YYYY-MM-DD.md, scratchpad.md).
 * Search: SQLite FTS5 + embeddings (search/).
 *
 * Root default: <userData>/kairos-intelligence/
 * Override: KAIROS_INTELLIGENCE_ROOT env var.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

export interface MemoryPaths {
  root: string;
  memory: {
    dir: string;
    L1: string;            // identity records (JSONL)
    L2: string;            // playbooks / project memory (JSONL)
    tombstones: string;    // deleted record IDs (JSONL)
  };
  inbox: {
    dir: string;
    captured: string;      // pending candidates awaiting curation (JSONL)
  };
  daily: string;           // YYYY-MM-DD.md per day
  scratchpad: string;      // single checklist file
  rendered: {
    dir: string;
    memory: string;        // MEMORY.md projection
  };
  search: string;          // FTS index lives here
  sessions: string;        // session search index
}

export function defaultRoot(): string {
  return process.env.KAIROS_INTELLIGENCE_ROOT ?? join(os.homedir(), ".kairos-intelligence");
}

export function resolvePaths(root = defaultRoot()): MemoryPaths {
  return {
    root,
    memory: {
      dir: join(root, "memory"),
      L1: join(root, "memory", "L1.identity.jsonl"),
      L2: join(root, "memory", "L2.playbooks.jsonl"),
      tombstones: join(root, "memory", "tombstones.jsonl"),
    },
    inbox: {
      dir: join(root, "inbox"),
      captured: join(root, "inbox", "captured.jsonl"),
    },
    daily: join(root, "daily"),
    scratchpad: join(root, "scratchpad.md"),
    rendered: {
      dir: join(root, "rendered"),
      memory: join(root, "rendered", "MEMORY.md"),
    },
    search: join(root, "search"),
    sessions: join(root, "sessions"),
  };
}

export function ensureMemoryDirs(root = defaultRoot()): MemoryPaths {
  const paths = resolvePaths(root);
  for (const dir of [
    paths.root,
    paths.memory.dir,
    paths.inbox.dir,
    paths.daily,
    paths.rendered.dir,
    paths.search,
    paths.sessions,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  for (const file of [
    paths.memory.L1,
    paths.memory.L2,
    paths.memory.tombstones,
    paths.inbox.captured,
  ]) {
    if (!existsSync(file)) writeFileSync(file, "", "utf-8");
  }
  if (!existsSync(paths.scratchpad)) writeFileSync(paths.scratchpad, "# Scratchpad\n\n", "utf-8");
  return paths;
}
