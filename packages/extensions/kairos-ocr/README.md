# kairos-ocr

OCR via OpenRouter vision models. Extrai texto de imagens (notas fiscais, recibos, screenshots).

## Por que OpenRouter?

- Zero setup (chave já configurada)
- Modelo trocável por chamada
- Suporta vários vision models free

## Tools

| Tool | Função |
|---|---|
| `ocr:read` | Extrai texto de uma imagem. Aceita `path`, `model?`, `prompt?`, `saveTo?` |
| `ocr:status` | Mostra backend, modelo default, status da chave |

## Formatos suportados

PNG, JPG, JPEG, WEBP, GIF, BMP.

## Configuração

- `OPENROUTER_API_KEY` (env, obrigatório)
- `KAIROS_OCR_MODEL` (env, opcional) — default `google/gemma-3-4b-it:free`

## Modelos recomendados

- `google/gemma-3-4b-it:free` — rápido, leve (default)
- `meta-llama/llama-3.2-90b-vision-instruct` — alta qualidade (pago)
- `qwen/qwen2-vl-72b-instruct` — bom equilíbrio (pago)

## Uso

```
"leia a nota fiscal em C:\Users\ferna\Desktop\nf.png e salve em workspace/notas.txt"
"extraia o texto dessa imagem e me diga o valor total"
"leia todas as notas fiscais da pasta workspace/recibos/ e some os valores"
```

## Saída

- Inline (default): texto retornado direto pro agente
- Arquivo: passar `saveTo` com caminho absoluto