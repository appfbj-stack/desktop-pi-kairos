# kairos-agenda

Agenda pessoal persistente do Kairós. O usuário pede em linguagem natural, o agente converte para ISO 8601 e grava no SQLite local.

## Tools

| Tool | Função |
|---|---|
| `agenda:add` | Adiciona compromisso (title, datetime, notes, category, priority) |
| `agenda:list` | Lista por período (today, tomorrow, week, month, all, custom) |
| `agenda:complete` | Marca como concluído (id ou query) |
| `agenda:remove` | Remove (id ou query) |

## Storage

`<workspace>/kairos-agenda.db` — SQLite local, persistente.

`env: KAIROS_WORKSPACE_DIR` setada por `agent-instance.ts` (`<userData>/kairos-workspace`).

## Datetime

Sempre **ISO 8601** (ex: `2026-09-20T14:00:00` ou `2026-09-20 14:00`). O agente converte linguagem natural antes de chamar.

## Schema

```sql
CREATE TABLE agenda_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT,
  datetime TEXT NOT NULL,
  category TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```