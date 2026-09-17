# kairos-research

Busca web + extração de contatos pra prospecção de clientes.

## Tools

| Tool | Função |
|---|---|
| `web:search` | Busca no DuckDuckGo (HTML scraping, zero setup) |
| `web:fetch` | Fetch de URL → texto limpo (HTML → texto) |
| `web:extract-contacts` | Extrai emails, telefones e redes sociais |
| `web:prospect` | Fluxo combinado: search + fetch + contacts |
| `web:prospect-save` | prospect + salva em CSV no workspace/leads/ |

## Backend: DuckDuckGo

Sem API key. Sem custo. Funciona pra uso casual.

Limites: ~50 buscas/dia por IP sem rotação de User-Agent.

Pra produção com volume maior: criar API key grátis em [tavily.com](https://tavily.com) (1k buscas/mês) ou [exa.ai](https://exa.ai) (1k/mês) e implementar backend alternativo em `src/tools/search.ts`.

## Exemplos

**Buscar leads**:
```
"busque 20 empresas de TI pequenas em Belo Horizonte buscando contratar desenvolvimento web"
```

**Buscar e enriquecer**:
```
"prospecção: nicho='clínica odontológica pequena São Paulo querendo agenda online', enrich=true"
```

**Extrair contatos de uma URL**:
```
"extraia emails e telefones de https://exemplo.com.br/contato"
```

## Saída típica

```json
{
  "nicho": "padaria pequena São Paulo querendo modernizar PDV",
  "count": 15,
  "enriched": 15,
  "withContact": 8,
  "leads": [
    {
      "title": "Padaria do Bairro - Site Oficial",
      "url": "https://padariadobairro.com.br",
      "snippet": "Atendemos...",
      "emails": ["contato@padariadobairro.com.br"],
      "phones": ["(11) 98765-4321"]
    }
  ]
}
```