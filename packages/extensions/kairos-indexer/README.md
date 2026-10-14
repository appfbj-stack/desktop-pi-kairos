# kairos-indexer

Indexação automática de pastas + tagging heurístico.

**Tools:**

- `indexer_scan_folder` — escaneia uma pasta, indexa todos os arquivos (metadados + preview), atribui tags heurísticas
- `indexer_search` — busca no índice por tag, extensão, MIME, texto do preview ou path
- `indexer_auto_tag_file` — força re-tagging heurístico de um arquivo
- `indexer_get_stats` — totais, top tags, mais pesados, mais antigos
- `indexer_add_folder_watch` — adiciona pasta pra escaneamento (manual ou programado)
- `indexer_list_watches` — lista pastas configuradas

**Schema SQLite:**

- `indexed_files` (path UNIQUE, size, mtime, mime, ext, preview, indexed_at)
- `file_tags` (file_id FK, tag, source, confidence)
- `folder_watches` (path UNIQUE, recursive, last_scan_at, file_count, active)

**Tagger heurístico:**

- Extensão → tipo (pdf=document, jpg=image, etc)
- MIME type → categoria
- Keywords no path → tag (invoice, contract, receipt, etc)
- Palavras-chave em PT/EN suportadas

AI-tag (via LLM/embeddings) fica em TODO/FUTURO.

**Workflow típico:**

1. `indexer_add_folder_watch` com pasta do cliente
2. `indexer_scan_folder` pra indexar agora
3. `indexer_search` pra encontrar qualquer arquivo por tag/keyword
4. Sistema mantém o índice atualizado