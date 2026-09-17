# kairos-finance

Finanças pessoais do Kairós. Despesas, faturas, P&L. Local-only em SQLite.

## Tools

| Tool | Função |
|---|---|
| `finance:expense:add` | Registra despesa (valor, categoria, data, fornecedor) |
| `finance:expense:list` | Lista com filtros (período, categoria, fornecedor) |
| `finance:expense:summary` | Soma por categoria no mês/período |
| `finance:invoice:create` | Cria fatura a receber |
| `finance:invoice:list` | Lista com aging (a vencer / vencido) |
| `finance:invoice:mark-paid` | Marca fatura como paga |
| `finance:profit-loss` | DRE: receitas (faturas pagas) - despesas |
| `finance:status` | Snapshot rápido do mês |

## Storage

`<workspace>/kairos-finance.db` — SQLite local.

`env: KAIROS_WORKSPACE_DIR` setada por `agent-instance.ts`.

## Categorias padrão sugeridas

- `alimentacao`, `transporte`, `moradia`, `saude`, `educacao`
- `material`, `servicos`, `marketing`, `impostos`, `outros`

(O usuário pode usar qualquer string como categoria — não há enum fechado.)

## Schema

```sql
expenses  (id, date, amount, category, vendor, notes, payment_method, created_at)
invoices  (id, client, amount, description, issue_date, due_date, status, paid_date, created_at)
mileage   (id, date, km, purpose, created_at)  -- reservado para futuro
```

## Status de fatura

- `pending` — aberta (calcula aging)
- `paid` — paga (paid_date preenchida)
- `overdue` — vencida (auto via due_date < hoje)
- `cancelled` — cancelada

## Exemplos de uso

```
"gastei R$ 49,90 no almoço com o João hoje, cartão de crédito"
"crie uma fatura de R$ 1500 para cliente Maria, vencimento dia 30"
"quanto gastei em transporte esse mês?"
"qual meu lucro esse mês?"
"me liste faturas vencidas"
```