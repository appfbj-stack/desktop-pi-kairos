# @kairos/extension-mcp

Cliente **MCP (Model Context Protocol)** pro Kairós Desktop. Conecta o agente a qualquer MCP server via stdio.

## Pré-configurado

Ao iniciar pela primeira vez, o Kairós cria `~/.kairos/mcp-servers.json` com:

```json
{
  "servers": {
    "donsetch": {
      "command": "donsetch",
      "args": ["mcp", "--supervised"],
      "description": "Web tools keyless (fetch, search, crawl, screenshot)"
    }
  }
}
```

## Como usar

1. **Instalar DonSeTch** (se ainda não tiver):
   ```bash
   npm install -g donsetch
   # ou scoop install donsetch
   ```
   Ou usar qualquer outro MCP server.

2. **Reiniciar o Kairós** (ele lê `mcp-servers.json` no startup).

3. **No chat do Kairós**, peça pro LLM usar as tools MCP:
   - "Use o MCP DonSeTch pra buscar a documentação do React 19"
   - "Liste as tools do MCP GitHub"
   - "Use o MCP Filesystem pra ler /tmp/relatorio.pdf"

O LLM chamará automaticamente:
- `mcp_list_servers` — pra descobrir servers
- `mcp_list_tools(server)` — pra ver as tools
- `mcp_call_tool(server, tool, args)` — pra invocar

## Adicionar mais servers

Edite `~/.kairos/mcp-servers.json` (ou use `KAIROS_MCP_CONFIG=/path/to/config.json`):

```json
{
  "servers": {
    "donsetch": { "command": "donsetch", "args": ["mcp", "--supervised"] },

    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxx" },
      "description": "GitHub: issues, PRs, commits, files"
    },

    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/c/Users/ferna/Documents"],
      "description": "Filesystem oficial — ler/escrever arquivos com whitelist"
    },

    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": { "SLACK_BOT_TOKEN": "xoxb-xxxx" }
    },

    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://..."],
      "description": "Consultar banco Postgres direto (somente leitura)"
    }
  }
}
```

Lista completa de servers oficiais: https://github.com/modelcontextprotocol/servers

## Como funciona

1. **stdio**: Kairós spawna o subprocess (`donsetch mcp --supervised`), se comunica via JSON-RPC 2.0 por stdin/stdout.
2. **initialize**: handshake inicial com versão do protocolo.
3. **tools/list**: Kairós descobre as tools do server.
4. **tools/call**: Kairós chama uma tool com args e devolve o resultado pro LLM.
5. **Cleanup**: subprocess é morto no exit do Kairós.

## Limitações

- **stdio only** (não suporta SSE/HTTP transport ainda — versão 2)
- **Sem reconexão automática** — se o server crashar, o LLM precisa chamar `mcp_list_tools` de novo
- **Timeout de 60s** por tool call (ajustável via parâmetro `timeoutMs`)
