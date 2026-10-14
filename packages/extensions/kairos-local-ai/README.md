# @kairos/extension-local-ai

**IA 100% local** pro Kairós Desktop. Vision, RAG e Voice rodando no PC do cliente via Ollama. **Nada sai do PC** — ideal pra LGPD, médico, advocacia, financeiro.

## Capacidades

| Tool | O que faz | Requer |
|---|---|---|
| `local_ai_status` | Mostra status do Ollama + modelos instalados | - |
| `vision_describe` | Descreve/responde pergunta sobre uma imagem | `moondream` ou `llava` |
| `rag_index_path` | Indexa 1 arquivo (chunks + embeddings) | `nomic-embed-text` |
| `rag_index_workspace` | Indexa workspace inteiro | `nomic-embed-text` |
| `rag_search` | Top-K chunks mais similares à query | `nomic-embed-text` |
| `rag_list_indexed` | Lista arquivos indexados | - |
| `rag_clear` | Remove chunks (1 arquivo ou tudo) | - |
| `transcribe_audio` | Transcreve áudio (Whisper) | `whisper` |

## Setup (uma vez)

### 1. Instalar Ollama

- macOS: `brew install ollama && ollama serve`
- Windows: https://ollama.com/download
- Linux: `curl -fsSL https://ollama.com/install.sh | sh && ollama serve`

### 2. Baixar modelos

```bash
# Vision (recomendado: moondream — rápido, 1.7B)
ollama pull moondream

# Embeddings (recomendado: nomic-embed-text — 137M, excelente)
ollama pull nomic-embed-text

# Whisper (Ollama 0.4+)
ollama pull whisper
```

Modelos alternativos:
- Vision: `llava:7b` (melhor, mais pesado), `llama3.2-vision:11b` (o melhor)
- Embeddings: `mxbai-embed-large`, `all-minilm`
- Whisper: só tem o `whisper` oficial

### 3. Usar no Kairós

No chat, peça pro LLM:

- "Kairós, descreve a imagem C:\fotos\nota.jpg usando vision local"
- "Indexa todo o workspace no RAG"
- "Busca no RAG: 'contrato de prestação de serviços'"
- "Transcreve o áudio C:\reuniao\audio.mp3"

O LLM descobre as tools automaticamente e usa Ollama local.

## Por que local-first?

- **LGPD**: dados sensíveis (foto de nota fiscal, contrato, áudio de reunião) não vão pra nuvem
- **Custo zero**: depois do setup, é grátis pra sempre
- **Latência**: roda offline, sem depender de internet
- **Compliance**: empresas podem auditar o que roda na máquina

## Limitações

- **Velocidade**: CPU é mais lento que GPU. moondream 1.7B roda em ~2-5s por imagem em CPU moderno
- **Qualidade**: modelos pequenos perdem pra GPT-4V/GPT-4 em tarefas complexas
- **Primeiro uso**: cada modelo precisa ser baixado (~500MB-2GB cada)
- **Whisper precisa Ollama 0.4+**
