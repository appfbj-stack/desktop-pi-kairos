# kairos-pi-bridge

Bridge pra adicionar **skills do cat\u00e1logo Pi** (https://pi.dev/packages) no Kair\u00f3s Desktop.

## Como adicionar uma skill nova

Exemplo: adicionar `pi-zip` (gerencia contexto de sess\u00f5es longas do Pi).

### 1. Adicione o package em `config.json`
```json
{
  "enabled": [
    "pi-web-access",
    "pi-mcp-adapter",
    "pi-condense",
    "pi-nolo",
    "pi-zip"
  ]
}
```

### 2. Adicione a dep em `package.json` deste bridge
```json
"dependencies": {
  "pi-zip": "*"
}
```

### 3. Instale e construa
```powershell
$env:CI = "true"
pnpm install
pnpm --filter @kairos/extension-pi-bridge build
```

### 4. Rebuild do app desktop
```powershell
pnpm --filter @kairos/electron build
pnpm --filter @kairos/electron deploy --legacy ./_deployed
cd ./_deployed && pnpm exec electron-builder --win
```

### 5. Resultado
As tools do `pi-zip` aparecem namespaced: `pi:pi-zip:compress`, `pi:pi-zip:expand`, etc.
O LLM pode usar normalmente como qualquer outra tool.

## Packages j\u00e1 habilitados (default)

| Package | Fun\u00e7\u00e3o | Status |
|---|---|---|
| `pi-web-access` | Web search, fetch URLs, YouTube, PDF extraction | \u2705 funciona |
| `pi-mcp-adapter` | MCP servers (TUI) | \u26a0\ufe0f pulado (requer TUI) |
| `pi-condense` | Compress\u00e3o de contexto | \u2705 funciona |
| `pi-nolo` | Confirma\u00e7\u00e3o de tools destrutivas | \u2705 funciona |

## Limita\u00e7\u00f5es

- **TypeBox vs Zod**: o Kairos usa Zod pra schema. Packages do Pi geralmente usam TypeBox.
  O bridge passa `z.any()` como schema fallback, o que significa que o LLM v\u00ea
  a descri\u00e7\u00e3o da tool mas n\u00e3o v\u00ea os par\u00e2metros estruturados. Para packages
  com TypeBox puro (como pi-mcp-adapter), voc\u00ea vai precisar criar uma extension
  Kairos dedicada que adapta os tools manualmente.

- **TUI interativa**: packages com OAuth callbacks, consent dialogs, ou readline n\u00e3o
  funcionam no Kair\u00f3s (Electron Renderer n\u00e3o tem TTY). Est\u00e3o na lista `SKIP_PACKAGES`
  em `loader.ts`.

- **Path dependencies**: packages que esperam `~/.pi/` ou paths espec\u00edficos do Pi v\u00e3o
  falhar. Precisam ser adaptados.

## Cat\u00e1logo

Veja https://pi.dev/packages para listar 5.376 packages dispon\u00edveis. Filtro:
- **extension** \u2014 adiciona tools (nosso foco)
- **skill** \u2014 prompt template (n\u00e3o funciona como extension)
- **theme** \u2014 visual (n\u00e3o se aplica)
- **prompt** \u2014 system prompt (n\u00e3o se aplica)

## Estrutura do bridge

```
kairos-pi-bridge/
\u251c\u2500\u2500 package.json         # deps dos packages Pi
\u251c\u2500\u2500 config.json          # lista de packages habilitados
\u251c\u2500\u2500 tsconfig.json
\u2514\u2500\u2500 src/
    \u251c\u2500\u2500 index.ts          # extension Kairos + helpers
    \u2514\u2500\u2500 loader.ts        # dynamic import + adapter Pi\u2192Kairos
```

## Como funciona tecnicamente

1. No startup, o `agent-instance.ts` importa `@kairos/extension-pi-bridge`
2. Chama `await getPiTools()` que faz `import()` din\u00e2mico de cada package
3. Para cada tool registrada (via callback `api.registerTool` ou array `tools`),
   cria um `Kairos Tool` com name `pi:<pkg>:<tool>`, description, e execute wrapper
4. Mescla as tools no array de tools da extension
5. O Agent do Kair\u00f3s v\u00ea normalmente como se fosse uma extension nativa
