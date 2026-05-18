# ADR 0003 — Mercado Pago Preapproval como gateway de pagamento

**Status**: Aceito
**Data**: 2025-11
**Decisores**: Sidney
**Revisitar quando**: expandirmos pra outros países (MP não opera fora LATAM) OU se taxa MP subir muito acima dos competidores OU receita passar nível em que negociação custom faz sentido.

## Contexto

Viajjei é SaaS B2C com assinatura mensal/anual (`pro` R$14.90/29.90, `grupo` R$29.90/239.90). Mercado-alvo inicial: Brasil. Precisa de:

1. **Recurring billing** — assinatura renova mensal/anual automática.
2. **Métodos brasileiros**: cartão de crédito (>70% transações), PIX (crescendo), boleto (longtail).
3. **Free trial nativo** — 7 dias sem cobrar.
4. **Webhook confiável** — saber quando user pagou pra ativar plano.
5. **Custo baixo** — competir com Stripe que cobra 5.99% + R$0.50 pra cartão BR.
6. **Conformidade BR** — emissão de fiscal (NF-e) eventual, dados em território nacional.

## Decisão

**Mercado Pago Preapproval API** (recurring) + webhook HMAC pra ativação.

- `POST /api/create-subscription` (Netlify Function) → `POST api.mercadopago.com/preapproval`
- Frontend redireciona pro `init_point` do MP → user paga → MP redireciona pra `/assinatura/sucesso`
- MP chama `POST /api/webhook-mp` com event `preapproval.updated/authorized/cancelled` → valida HMAC (`MP_WEBHOOK_SECRET`) → UPDATE em `users.plano` e `users.plano_expires_at`

## Justificativa

Comparação feita em out/2025:

| Critério | Mercado Pago | Stripe | Pagar.me | Iugu |
|---|---|---|---|---|
| Taxa cartão BR (2026) | 4.99% + R$0.39 | 5.99% + R$0.50 | 5.49% + R$0.49 | 5.99% + R$0.30 |
| PIX | ✅ Sem custo extra | ⚠️ via parceiro | ✅ | ✅ |
| Boleto | ✅ | ⚠️ | ✅ | ✅ |
| Recurring nativo (preapproval) | ✅ | ✅ | ✅ | ✅ |
| Free trial built-in | ✅ `free_trial` field | ✅ | manual | manual |
| Conhecimento do BR | ✅ Top of mind, confiável | ⚠️ Estrangeira | ✅ | ⚠️ Menos comum |
| Webhook HMAC | ✅ `x-signature` | ✅ | ✅ | ✅ |
| Conta gratuita (sem mensalidade) | ✅ | ✅ | ✅ | ❌ (R$99/mês) |
| Onboarding tempo | ~1 dia (CPF + dados) | 2-3 semanas (compliance BR pra entidade estrangeira) | ~3 dias | ~5 dias |

**Mercado Pago venceu por**:

1. **Taxa mais baixa em todos os métodos** que importam pro nosso ARPU baixo (~R$15-30).
2. **Onboarding em 1 dia** — fundamental pra MVP rápido.
3. **PIX nativo sem fee adicional** — vai virar majoritário até 2027.
4. **Free trial built-in** no preapproval — tentamos implementar manual no Stripe e dá nó com cancelamento durante trial.
5. **Aceitação universal**: usuário BR confia em MP, não estranha.

## Trade-offs aceitos

- **Lock-in pra LATAM**: se expandirmos pra EUA/EU, MP não opera. Plano: dual gateway (MP no BR + Stripe fora) quando precisar. Hoje 100% BR.
- **API menos polida que Stripe**: docs em PT/ES, exemplos esparsos, erros vagos. Mitigamos com retry + log abundante em `webhook-mp.mjs`.
- **Free trial só no mensal**: MP rejeita `free_trial` em preapproval anual em alguns cenários (R7 incidente). Aceito — anual já tem 33% off como gancho, não precisa trial.
- **Webhook ordering**: MP não garante ordem de delivery. Implementação atual usa `external_reference` + idempotency check no `assinaturas` (UNIQUE em `mp_preapproval_id`).

## Implementação

### Fluxo de pagamento
```
1. User no Welcome step 3 → clica "Assinar Pro Mensal"
2. POST /api/create-subscription { plano:"pro", ciclo:"mensal", cupom? }
3. Function valida JWT, valida cupom, cria preapproval no MP
4. Response: { init_point: "https://mercadopago.com.br/..." }
5. window.location.href = init_point
6. User paga no MP (cartão/PIX/boleto)
7. MP redireciona pra /assinatura/sucesso?preapproval_id=...
8. Em paralelo, MP chama POST /api/webhook-mp
9. webhook-mp valida HMAC, UPDATE users.plano='pro', plano_expires_at=NOW()+30d
10. AssinaturaSucesso página faz poll de SELECT users.plano até virar 'pro' ou timeout (90s)
```

### Webhook HMAC
- `x-signature` header: `ts=...,v1=hmac_sha256(...)`
- `MP_WEBHOOK_SECRET` setado no painel MP + Netlify env
- Sem `MP_WEBHOOK_SECRET` → modo permissivo (loga warning, aceita). OK só em dev.
- Body parsing: `JSON.parse(rawBody)` — `rawBody` preservado pro HMAC.

### Comissão de afiliado
- `external_reference` formato `"userId:plano:ciclo:afiliadoId:descPct"` (R6).
- Webhook lê → INSERT em `comissoes(afiliado_id, valor_comissao, mes_referencia, status='pendente')`.
- Admin libera pagamento manualmente via `admin_set_comissao_status` RPC.

### Cron reconcile (R8)
- `reconcile-subscriptions.mjs` roda às `0 6 * * *` UTC (03h BRT).
- Lista `assinaturas WHERE status='active' AND plano_expires_at < NOW() + 7 days`.
- Pra cada, GET MP `preapproval/{id}` → confirma status real → UPDATE local.
- Pega caso "MP cancelou mas webhook não chegou" sem o user ficar com plano grátis por 30 dias até próximo ciclo de billing.

## Segurança

- HMAC obrigatório em prod (modo permissivo só dev).
- Rate limit 5 preapprovals/min/user, 10/min/IP em `create-subscription` (R6 fix de spam vector).
- `userId` + `userEmail` vêm do JWT validado, **não do body** — antes era spam vector (atacante anônimo poluía dashboard MP com preapprovals fake).
- Cupom normalizado com `.eq` exato + length cap 30 (R5).

## Quando revisitar

- **Expansão internacional** → adicionar Stripe pra EUA/EU. MP fica BR only.
- **Receita > R$100k/mês** → negociar taxa custom com MP (vendor account manager).
- **PIX virar >80% do mix** → reavaliar gateways que cobram PIX zero ou pix-only.
- **Compliance específica (NF-e automática)** → integrar com NFE.io ou similar, mantendo MP como gateway.

## Referências

- MP Preapproval API: https://www.mercadopago.com.br/developers/pt/reference/subscriptions/_preapproval/post
- Webhook signature docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
- Implementação: `netlify/functions/create-subscription.mjs`, `webhook-mp.mjs`, `reconcile-subscriptions.mjs`, `cancel-subscription.mjs`
