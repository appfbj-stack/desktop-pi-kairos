# kairos-memory

Memória persistente cross-conversa com RAG (Retrieval-Augmented Generation).

## O que faz

O agente pode **lembrar de contexto entre conversas diferentes**. Ao invés de cada conversa começar do zero, ele consulta uma base de memórias que cresce com o uso.

5 tools:

| Tool              | Modo       | O que faz                                                |
| ----------------- | ---------- | -------------------------------------------------------- |
| `memory:save`     | write      | Salva título + conteúdo + tags opcionais                 |
| `memory:recall`   | read       | Pega 1 por id, ou as N mais recentes                     |
| `memory:list`     | read       | Lista paginada, com filtro opcional por tag              |
| `memory:forget`   | write ⚠️   | Deleta por id / tag / all                                |
| `memory:search`   | read       | Busca RAG: FTS5 (BM25) + embeddings (cosine) combinados  |

## Como funciona a busca

Score combinado = **FTS5 (BM25) × 0.4 + cosine × 0.6** quando embeddings estão ativos.
Sem embeddings (sem Ollama), usa só BM25 (que ainda é muito bom pra queries literais).

- **FTS5** acha matches literais: "João", "15 congregações", "reunião 2024-03-15"
- **Embeddings** acham matches semânticos: "culto" ~= "celebração" ~= "missa"

Os dois sinais são retornados em `signals.fts` e `signals.cosine` pra debug.

## Embeddings opcionais

Probe automático no startup: GET `http://localhost:11434/api/tags` (configurável via `KAIROS_OLLAMA_URL`).

Se encontrar um destes modelos, embeddings ficam ativos:

- `nomic-embed-text` (768d, MIT, ~270MB) — preferido
- `all-minilm` (384d)
- `mxbai-embed-large`
- `snowflake-arctic-embed`

Como instalar (no Pastor):
```powershell
# Instalar Ollama: https://ollama.com/download
# Depois baixar o modelo:
ollama pull nomic-embed-text
```

Embeddings são salvos como BLOB (Float32Array) na própria DB. Sem chamadas externas, sem custo.

## Storage

- Banco SQLite próprio: `<workspace>/kairos-memory.db`
- Tabela `memories` + virtual table `memories_fts` (FTS5)
- Triggers sincronizam as duas automaticamente
- WAL mode pra performance

## Exemplo de uso pelo agente

```
User: "Lembra que o Pastor Fernando gosta de café sem açúcar?"
Agent: [tool: memory:save]
  title: "Preferência do Pastor Fernando"
  content: "Café sem açúcar"
  tags: ["preferencia", "usuario"]
  source: "user"

User (dia seguinte): "Faz uma lista de compras pro Pastor."
Agent: [tool: memory:search]
  query: "preferências Pastor"
  → top hit: "Preferência do Pastor Fernando: Café sem açúcar"
```

## Configuração

Env vars:

- `KAIROS_WORKSPACE_DIR` — onde fica `kairos-memory.db` (default `~/.kairos-workspace`)
- `KAIROS_OLLAMA_URL` — URL do Ollama (default `http://localhost:11434`)

## Versão

0.1.0 — Sprint 1.15 do Kairós Desktop Alves.