# kairos-intelligence

Memória persistente governada do Kairós Desktop Alves — port de [pi-persistent-intelligence](https://github.com/Mont3ll/pi-persistent-intelligence) (MIT).

## O que é

Mesma arquitetura L1/L2/daily/scratchpad/inbox do upstream, mas:
- **better-sqlite3** (Node) em vez de bun:sqlite
- **Ollama local** para embeddings (zero custo, offline) em vez de qmd externo
- **6 tools** simples em vez de 50+ comandos (curadoria, doctor, health, diagnostics etc.)
- **Patch governance SIMPLIFICADO**: candidate → inbox → curate (sem patches JSON)

## Tools

| Tool | Modo | O que faz |
| ----------------- | -------- | -------------------------------------------------- |
| `memory:bootstrap` | read     | Auto-inject de contexto (daily + scratchpad + inbox + RAG) |
| `memory:write`     | write ⚠️ | target=daily → append direto; target=long_term/identity → inbox |
| `memory:read`      | read     | Lê long_term / daily / scratchpad / inbox |
| `memory:search`    | read     | RAG: keyword (FTS5) / semantic (Ollama) / deep (ambos) |
| `memory:curate`    | write ⚠️ | promote/reject candidate do inbox para L1/L2 |
| `scratchpad`       | write ⚠️ | checklist persistente (add/done/undo/clear/list) |

## Camadas (L1 vs L2)

- **L1 — Identity** (`L1.identity.jsonl`): preferencias firmes, info pessoal. Nunca auto-aplica.
- **L2 — Playbooks** (`L2.playbooks.jsonl`): decisoes de projeto, workflow, ferramentas, regras.
- **Daily** (`daily/YYYY-MM-DD.md`): contexto de sessao, append-only.
- **Scratchpad** (`scratchpad.md`): checklist de tarefas em aberto.

## Fluxo de captura

```
observacao/decisao
  ↓ memory:write target=long_term
candidate no inbox
  ↓ memory:read target=inbox
  ↓ memory:curate action=promote layer=L2
record canonico (L2.playbooks.jsonl)
  ↓ sync FTS + (se Ollama) embedding
buscavel via memory:search / auto-inject no memory:bootstrap
```

## Storage

- **Canonical**: JSONL append-only em `~/.kairos-intelligence/memory/`
- **Projection**: `rendered/MEMORY.md` regenerado a cada promocao
- **Search**: `search/memory-fts.db` (SQLite FTS5) + `search/embeddings.db` (Float32 embeddings)

## Embeddings opcionais

Probe automático em Ollama local (localhost:11434) procurando:
- `nomic-embed-text` (preferido, 768d)
- `all-minilm` (fallback, 384d)
- `mxbai-embed-large`
- `snowflake-arctic-embed`

Se Ollama não tiver nenhum modelo, RAG funciona só com FTS5 (BM25). Sem degradação.

Pra ativar:
```powershell
ollama pull nomic-embed-text
```

## Configuração

- `KAIROS_INTELLIGENCE_ROOT` — diretório raiz (default `~/.kairos-intelligence`)
- `KAIROS_OLLAMA_URL` — URL do Ollama (default `http://localhost:11434`)

## Diferenças do upstream

| Feature | pi-persistent-intelligence | kairos-intelligence |
| --- | --- | --- |
| Runtime | Bun | Node |
| FTS | bun:sqlite | better-sqlite3 |
| Embeddings | qmd CLI (Go) | Ollama local (HTTP) |
| Commands | 50+ (doctor, health, diagnostics, etc.) | 0 (deferidos pra Sprint 1.16) |
| Patch governance | JSON patches com apply/simulate | Candidate → inbox → curate |
| Obsidian integration | Sim | Não (Sprint 1.16+) |
| Auto-inject | session_start hook do Pi Agent | Via memory:bootstrap tool |
| Memory-worth scoring | Sim (LLM-assisted) | Não (heurística simples: identity vs long_term) |

## Próximos passos (Sprint 1.16+)

- Patch governance completo (compatível com upstream)
- memory-doctor, memory-health-audit, memory-diagnostics
- Obsidian vault integration (opcional, flag)
- pi-governance-rs compatibility (import/export bundle)
- session-search completo (FTS sobre messages table do kairos.db)
- memory-worth scoring (LLM-assisted)

## Versão

0.1.0 — Sprint 1.15 do Kairós Desktop Alves.