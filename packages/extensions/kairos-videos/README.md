# @kairos/extension-videos

**Kairós Vídeos IA** — extensão do Kairós Desktop Pi para produzir vídeos curtos
de divulgação (YouTube Shorts, Instagram Reels, TikTok).

## Tools

| Tool | O que faz | Destrutiva |
|---|---|---|
| `videos:project` | Cria a estrutura de pastas (6 estágios) do projeto | não |
| `videos:script` | Descrição das telas → roteiro de ~30s (LLM do app) | não |
| `videos:voice` | Lista vozes MiniMax (73 PT-BR) ou gera o MP3 da narração | não |
| `videos:subtitles` | SRT ou lista de falas → legendas ASS 1080×1920 | não |
| `videos:compose` | Monta o vídeo vertical final (tela + narração + legenda + CTA) | **sim** |
| `videos:export` | Exporta para o HD externo / promove entre estágios | **sim** |

## Fluxo recomendado

```
videos:project   → cria KAIROS_VIDEOS/<projeto>/01_PARA_REVISAR
videos:script    → roteiro (.md) em 04_ROTEIROS
videos:voice     → narração (.mp3) via MiniMax TTS
videos:subtitles → legendas (.ass) em 05_LEGENDAS
videos:compose   → MP4 vertical 1080×1920 em 01_PARA_REVISAR
   ↓ (aprovação manual do Pastor)
videos:export    → copia para 02_APROVADOS no HD externo
```

## Estrutura de pastas

```
KAIROS_VIDEOS/
  01_PARA_REVISAR   ← render final aguardando aprovação
  02_APROVADOS      ← aprovados, prontos para publicar
  03_PUBLICADOS     ← já publicados
  04_ROTEIROS       ← .md do roteiro + .mp3 da narração
  05_LEGENDAS       ← .ass
  06_ARQUIVADOS     ← descartados
```

## Configuração

- Raiz dos vídeos: env `KAIROS_VIDEOS_ROOT` > global `__kairosVideosRoot` >
  `<user>\Videos\KAIROS_VIDEOS`
- HD externo de export: `videos-config.json` na raiz (`externalRoot`)
- Voz preferida: `videos-config.json` (`preferredVoiceId`)

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
   mantém o original e avisa.

## Requisitos

- ffmpeg empacotado (`ffmpeg-static`) — já vem no bundle do app
- Chave MiniMax configurada nas Configurações do app (para roteiro e narração)
