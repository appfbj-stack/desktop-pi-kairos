# @kairos/extension-travel

Extension Kairós para **busca de voos e hotéis com preço real** via [Amadeus Self-Service API](https://developers.amadeus.com/self-service).

## Tools

| Tool | O que faz |
|---|---|
| `location_search` | Resolve nome de cidade/aeroporto em código IATA (GRU, LIS, JFK) |
| `flight_search` | Lista voos com preço real entre 2 cidades (data, passageiros, classe) |
| `hotel_search` | Lista hotéis com preço total da estadia em uma cidade |

## Setup

### 1. Pegar credenciais Amadeus (grátis)

1. Criar conta em https://developers.amadeus.com/register
2. Criar app Self-Service (environment = **Test**)
3. Copiar `Client ID` e `Client Secret`

Tier Self-Service (test):
- 2.000 chamadas/mês grátis
- Ambiente `test.api.amadeus.com` (não é produção, dados podem ser fictícios)
- Pra produção precisa solicitar aprovação comercial e mover pra `api.amadeus.com`

### 2. Configurar no Kairós

Adicionar no `.env` do Electron (ou nas variáveis de ambiente do instalador):

```env
AMADEUS_CLIENT_ID=sua_client_id_aqui
AMADEUS_CLIENT_SECRET=sua_client_secret_aqui
# opcional: production (default test)
AMADEUS_ENV=test
```

Reinicie o app. No log deve aparecer:

```
travel: amadeus provider OK (test)
```

### 3. Uso

O usuário final fala no chat:

- "Quero viajar de São Paulo pra Lisboa em dezembro, 7 dias"
- "Busque hotéis em Lisboa de 15/12 a 22/12"
- "Voos pra Madrid dia 20/12, 2 adultos, classe econômica"

O LLM automaticamente:
1. Chama `location_search` pra resolver "São Paulo" → GRU
2. Chama `flight_search` com `origin=GRU destination=LIS departureDate=2026-12-15 adults=1`
3. Apresenta resultados com companhia, horários, preço, link de busca

## Limitações

- **Self-Service test**: dados podem ser fictícios, preços não refletem mercado real em todos os casos
- **Cobertura**: Amadeus tem boa cobertura global mas alguns low-cost carriers (Ryanair, EasyJet) não aparecem
- **Cache de token**: 30 min (Amadeus emite token com `expires_in=1799`)
- **Rate limit**: 10 chamadas/segundo no tier grátis

## Próximos passos

- [ ] Adicionar `flight_price_confirm` (verifica preço de uma oferta específica antes de comprar)
- [ ] Adicionar `seatmap` (mapa de assentos do voo)
- [ ] Suporte a multi-trecho (ida e volta com cidades diferentes)
- [ ] Integração com Travelpayouts (afiliados BR) como fallback
