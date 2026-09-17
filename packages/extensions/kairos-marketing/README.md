# kairos-marketing

Marketing visual: carrosséis (PNG) + slideshows (MP4).

## Tools

| Tool | Função |
|---|---|
| `marketing:carousel` | Imagem com texto sobre fundo (PNG) |
| `marketing:slideshow` | MP4 slideshow de várias imagens |

## Workflow típico

```
1. image_synthesize → gera fundo.png (paisagem inspiracional)
2. marketing:carousel → sobrepõe título/subtítulo/versículo/brand → slide-1.png
3. Repete 2 pra cada slide
4. marketing:slideshow → junta tudo em carrossel.mp4
```

## Dependências

- **Sharp** — composição de texto via SVG (já tem no monorepo)
- **ffmpeg** — slideshow (path do winget: Gyan.FFmpeg)

## Saída típica

- Carrossel: PNG 1080x1350 (Instagram portrait)
- Slideshow: MP4 H.264 1080x1920 (Reels/TikTok)

## Pendências

- Cross-dissolve com xfade filter (atualmente só corte seco)
- Branding customizado (logo, fonte)
- Temas pré-definidos (minimalista, bíblico, motivacional)