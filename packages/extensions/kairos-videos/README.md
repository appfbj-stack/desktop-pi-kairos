# @kairos/extension-videos

**Kairós Vídeos IA** — extensão do Kairós Desktop Pi para produzir vídeos curtos
de divulgação (YouTube Shorts, Instagram Reels, TikTok).

## Tools

| Tool | O que faz | Destrutiva |
|---|---|---|
| `videos:project` | Cria a estrutura de pastas (6 estágios) do projeto | não |
| `videos:script` | Descrição das telas → roteiro de ~30s (LLM do app) | não |
| `videos:source` | Busca vídeos virais de referência (yt-dlp) e baixa o escolhido | **sim** |
| `videos:voice` | Lista vozes MiniMax (73 PT-BR) ou gera o MP3 da narração | não |
| `videos:subtitles` | SRT ou lista de falas → legendas ASS 1080×1920 | não |
| `videos:compose` | Monta o vídeo vertical final (tela + narração + legenda + CTA) | **sim** |
| `videos:export` | Exporta para o HD externo / promove entre estágios | **sim** |

## Fluxo recomendado

```
videos:project   → cria KAIROS_VIDEOS/<projeto>/01_PARA_REVISAR
videos:script    → roteiro (.md) em 04_ROTEIROS
videos:source    → busca/baixa vídeo viral de REFERÊNCIA em <projeto>/_fontes/
videos:voice     → narração (.mp3) via MiniMax TTS
videos:subtitles → legendas (.ass) em 05_LEGENDAS
videos:compose   → MP4 vertical 1080×1920 em 01_PARA_REVISAR
   ↓ (aprovação manual do Pastor)
videos:export    → copia para 02_APROVADOS no HD externo
```

### `videos:source` — viral de referência

Três modos:

| Modo | Params | Retorna |
|---|---|---|
| `search` | `query`, `limit`, `minViews`, `maxDurationSec` | lista com título, views, duração, canal e link |
| `info` | `url` | metadados de um link |
| `download` | `url`, `project`, `maxHeight` | arquivo MP4 baixado em `<projeto>/_fontes/` |

- Busca: **YouTube**, via `yt-dlp` (sem login).
- Link direto: qualquer plataforma que o `yt-dlp` suporte (YouTube, TikTok,
  Instagram, X, Vimeo...).
- O material baixado é **referência** — serve de insumo para montar o vídeo do
  Kairós por cima (narração + legendas + CTA). Republicar o vídeo original
  exige autorização do autor.

## Estrutura de pastas

```
KAIROS_VIDEOS/
  01_PARA_REVISAR   ← render final aguardando aprovação
  02_APROVADOS      ← aprovados, prontos para publicar
  03_PUBLICADOS     ← já publicados
  04_ROTEIROS       ← .md do roteiro + .mp3 da narração
  05_LEGENDAS       ← .ass
  06_ARQUIVADOS     ← descartados
  <projeto>/
    _fontes/        ← vídeos de referência baixados (yt-dlp)
```

## Configuração

- Raiz dos vídeos: env `KAIROS_VIDEOS_ROOT` > global `__kairosVideosRoot` >
  `<user>\Videos\KAIROS_VIDEOS`
- HD externo de export: **detectado automaticamente** (qualquer volume além de
  `C:` com espaço livre) > `videos-config.json` (`externalRoot`) — o
  `externalRoot` configurado tem prioridade sobre a detecção
- Voz preferida: `videos-config.json` (`preferredVoiceId`)
- yt-dlp: env `YTDLP_PATH` > `yt-dlp` no PATH > instalações do Python
  (`%LOCALAPPDATA%\Programs\Python\Python*\Scripts\yt-dlp.exe`)

## Notas importantes (verificadas em 2026-10-23)

1. **Chave de LLM ≠ chave de vídeo.** A mesma chave MiniMax que escreve o roteiro
   gera **narração (TTS)** normalmente, mas **geração de vídeo/avatar** tem cota
   separada (erro `2067`). Clonagem de voz depende do plano (erro `2061`).
2. **O avatar é opcional.** O fluxo principal (tela + narração + legendas) não
   depende de avatar.
3. **Path do `.ass` precisa de escape no Windows.** Sem `C\:/...` o ffmpeg falha
   com *"Error initializing a simple filtergraph"*. Ver `ffmpeg-utils.ts`.
4. **Nada é publicado automaticamente.** A publicação depende de aprovação
   explícita do Pastor e não existe tool de publicação nesta extension.
5. **Se o HD externo estiver desconectado, nada é apagado.** O `videos:export`
   mantém o original e avisa. Quando o HD está conectado, a letra é detectada
   sozinha — não precisa configurar nada.
6. **Download baixa pelo ID, não pelo título.** Título com quebra de linha faz o
   yt-dlp imprimir o path com `\r` e o arquivo em disco fica com outro nome.
   O `videos:source` baixa como `kairos_src_<id>.<ext>` e renomeia depois, no
   Node, pra um nome limpo.
7. **`videos:compose` não baixa nada.** Ele só processa o arquivo que você
   apontar — de onde ele veio é irrelevante pra ele.

## Requisitos

- ffmpeg empacotado (`ffmpeg-static`) — já vem no bundle do app
- Chave MiniMax configurada nas Configurações do app (para roteiro e narração)
- `yt-dlp` instalado no Windows (só pra `videos:source`) —
  `pip install yt-dlp` ou `winget install yt-dlp`
- ffmpeg do sistema no PATH (o yt-dlp usa pra mesclar vídeo+áudio)
