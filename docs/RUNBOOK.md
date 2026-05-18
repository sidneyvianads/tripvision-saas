# RUNBOOK — Viajjei

Manual de incidentes. Foco em diagnóstico + ação rápida, não em explicação profunda
(pra isso ver `docs/ADR/`).

**Convenção**: cada incidente tem **Sintoma** → **Diagnóstico** → **Causa comum** →
**Mitigação imediata** → **Resolução**. Mantenha em ordem.

**Acessos críticos**:
- Supabase: app.supabase.com → projeto `tripvision-saas`
- Netlify: app.netlify.com → site `tripvision-saas`
- Mercado Pago: mercadopago.com.br/developers → Webhooks
- Anthropic: console.anthropic.com → Usage
- Resend: resend.com → Logs

---

## Incidente 1 — IA do Jei caída

**Sintoma**: usuários reclamam "Jei não responde", chat fica travado em "pensando…",
ou stream começa e morre no meio.

**Diagnóstico** (em ordem):
1. Netlify → Functions → `/plan` ou `/chat` → ver logs últimas 1h.
2. Procurar `[plan/claude]`, `[plan/openai]`, `[plan/gemini]` — se TODOS estão erro,
   problema é nosso (env, parser); se Claude erro e OpenAI/Gemini OK, problema é
   Anthropic.
3. Anthropic console → Usage → ver rate limit / quota.
4. `https://status.anthropic.com` — outage geral?

**Causa comum**:
- Rate limit Anthropic batendo (tier 1: 50 req/min, 50k tokens/min).
- `ANTHROPIC_API_KEY` rotacionada ou expirou.
- Bug novo no `roteiroParser.js` engole stream válido.

**Mitigação imediata**: nada a fazer — chain Claude → OpenAI → Gemini é automática.
Usuário tem qualidade levemente menor mas funciona.

**Resolução**:
- Rate limit → upgrade Anthropic tier ($1k bill mensal abre tier 2 com 1M tokens/min).
- Env stale → rotacionar e atualizar Netlify env var → trigger redeploy
  ("Deploys → Trigger deploy").
- Parser bug → revert commit + hotfix.

---

## Incidente 2 — Webhook MP não chegando

**Sintoma**: user paga (vê tela de sucesso MP) mas em `/conta` plano continua "pending"
após 1-2 minutos. Reclama "paguei mas não ativou".

**Diagnóstico**:
1. MP painel → Webhooks → seu webhook URL → Histórico → procurar últimos eventos
   pra `preapproval_id` do user.
2. Status do delivery: 2xx OK, 5xx falhou (MP retenta 5×).
3. Se 2xx: problema é nosso (webhook recebeu mas não processou) — Netlify Functions
   → `/webhook-mp` logs.
4. Confirmar `MP_WEBHOOK_SECRET` está setado no Netlify env (em "Site settings → Env
   vars").

**Causa comum**:
- `MP_WEBHOOK_SECRET` errado → HMAC falha em prod, webhook rejeitado.
- 5xx no Supabase momentâneo → MP retenta mas pode demorar.
- `external_reference` malformado (cupom com `:` no nome quebra parsing).
- IP do Netlify mudou e firewall do Supabase bloqueou (raro).

**Mitigação imediata**:
- Cron `reconcile-subscriptions` roda às 03h BRT — pega a maioria dos casos no D+1
  automaticamente. Conferir Netlify Functions → `reconcile-subscriptions` logs do dia.

**Resolução manual** (se urgente — cliente impaciente):
```sql
-- 1. Pegar dados do user
SELECT id, email, plano, plano_expires_at FROM users WHERE email='cliente@email.com';

-- 2. Confirmar pagamento no painel MP (preapproval_id, status='authorized')

-- 3. Ativar manualmente — Pro mensal:
UPDATE users
SET plano = 'pro',
    plano_expires_at = NOW() + INTERVAL '30 days',
    trial_ends_at = NULL
WHERE email = 'cliente@email.com';

-- 4. Registrar assinatura pra reconcile não tropeçar:
INSERT INTO assinaturas (user_id, mp_preapproval_id, status, plano, ciclo, created_at)
VALUES ('<user_uuid>', '<preapproval_id_do_mp>', 'active', 'pro', 'mensal', NOW())
ON CONFLICT (mp_preapproval_id) DO NOTHING;
```

**Investigar root cause depois** — se 3 casos no mesmo dia, abrir issue.

---

## Incidente 3 — Email de convite não enviando

**Sintoma**: admin clicou "Enviar convite" no ShareModal, viu mensagem "convite criado",
mas convidado não recebeu email após 5min.

**Diagnóstico**:
1. Resend dashboard → Logs → últimas 24h → procurar email do destinatário.
2. Se não aparece nem como tentativa: nossa função nem chamou Resend → Netlify
   Functions → `/send-invite-email` logs.
3. Se aparece com status "delivered" mas user não viu: spam folder do convidado.
4. Conferir `RESEND_API_KEY` setada no Netlify; se ausente, função está em **stub mode**
   (loga "stub mode" e retorna sucesso sem enviar — pretendido durante setup).

**Causa comum**:
- `RESEND_API_KEY` não setada → stub mode (esperado em dev/staging).
- Domínio `viajjei.com.br` não verificado no Resend → Resend rejeita silenciosamente.
- Email do convidado bounce (caixa cheia, domínio inválido).
- Rate limit Resend (free tier: 100/dia, 3k/mês).

**Mitigação imediata**: ShareModal já mostra fallback "Copie o link" quando email não
sai. Admin pode copiar manualmente e mandar pelo WhatsApp. **Link de aceitar funciona
independente do email.**

**Resolução definitiva**:
- Setar `RESEND_API_KEY` no Netlify → trigger deploy.
- Verificar domínio no Resend: SPF (`v=spf1 include:_spf.resend.com ~all`) + DKIM
  (record `resend._domainkey` que eles geram) → instruir Sidney pra inserir no DNS do
  registro.br.
- Stuck em rate limit → upgrade Resend Pro ($20/mês, 50k emails).

---

## Incidente 4 — Deploy quebrando

**Sintoma**: PR mergeado em `main` mas Netlify mostra "Build failed". Site em prod
continua funcionando (last successful deploy serve), mas mudança nova não vai pro ar.

**Diagnóstico**:
1. Netlify → Deploys → último → Deploy log.
2. Procurar `error` / `failed` no output.
3. Causas top: env var ausente, `npm ci` falha (lockfile drift), lint blocker (raro
   porque é informational), `vite build` falha por import quebrado.

**Causa comum**:
- Env var nova que dev local tem mas Netlify não → fail no `vite build`
  (`VITE_*` é resolvido em build time).
- Dependência atualizada sem lock atualizado → `npm ci` falha.
- TypeError em import (arquivo renomeado mas usuário não atualizou).

**Mitigação imediata**: Netlify → Deploys → clicar no último deploy verde →
"Publish deploy" pra restaurar produção ao estado anterior estável. **Não usar
`git revert` direto** sem pensar — pode confundir histórico se já houver outros
commits.

**Resolução**:
- Fix local: `npm run build && npm test` antes de pushar.
- Push fix → Netlify rebuilda automático.
- Adicionar env var ausente em Netlify → trigger deploy.

---

## Incidente 5 — Senha de cliente perdida

**Sintoma**: cliente liga/manda mensagem "não consigo entrar, esqueci a senha,
'esqueci' não chega no email".

**Diagnóstico**:
1. Supabase → Authentication → Users → buscar email.
2. Confirmar que user EXISTE em `auth.users` (não em `public.users`).
3. Conferir `email_confirmed_at` (se NULL, email confirmation pendente — não é o caso
   default mas vale checar).
4. Conferir spam folder do cliente.

**Causa comum**:
- Cliente digitou email errado ("paula@gmail.com" vs "paula@gmial.com" comum).
- Email do cliente está com filtro agressivo (Outlook frequentemente).
- Cliente usou social login no signup que não existe ainda (não temos OAuth).

**Resolução**:
- Supabase → Authentication → Users → user → ⋯ → "Send password recovery". Manda
  email do template Supabase pra reset.
- Se email não chegar mesmo após retry, último recurso (manual e raro):
  - Authentication → Users → user → "Reset password" e definir uma senha temporária →
    mandar pelo WhatsApp instruindo a trocar no primeiro login.

---

## Incidente 6 — Afiliado reclama de comissão errada

**Sintoma**: afiliado vê em `/afiliado/<cupom>` valor de comissão menor do que
esperava, ou conversão sumida.

**Diagnóstico**:
```sql
-- Comissões do afiliado no mês:
SELECT * FROM comissoes
WHERE afiliado_id = (SELECT id FROM afiliados WHERE cupom = 'CUPOM_DO_AFILIADO')
  AND mes_referencia = '2026-02-01'  -- ajustar mês
ORDER BY created_at DESC;

-- Assinaturas que disparariam comissão mas não estão lá:
SELECT u.email, u.created_at, u.afiliado_id, u.plano, a.cupom
FROM users u
LEFT JOIN afiliados a ON u.afiliado_id = a.id
WHERE u.afiliado_id IS NOT NULL
  AND u.created_at >= '2026-02-01'::date
  AND u.plano IN ('pro', 'grupo');
```

**Causa comum**:
- User assinou mas `external_reference` do MP não tinha afiliado_id (sign-up via link
  sem cupom). Atribuição perdida — nada a fazer retroativamente sem evidência.
- Cron `reconcile-subscriptions` ainda não rodou (cron é diário 03h BRT).
- Bug no parsing do `external_reference` (formato `userId:plano:ciclo:afiliadoId:descPct`).

**Resolução**:
- Se assinatura confirmada + afiliado_id no user mas comissão ausente, INSERT manual:
```sql
INSERT INTO comissoes (
  afiliado_id, user_id, valor_assinatura, comissao_percent, valor_comissao,
  mes_referencia, status
)
VALUES (
  '<afiliado_uuid>', '<user_uuid>', 14.90, 20, 2.98,
  date_trunc('month', NOW())::date, 'pendente'
);
```
- Pra marcar como paga (após admin pagar fora do sistema):
  RPC `admin_set_comissao_status` (visível em `/admin/afiliados` tab Comissões).

---

## Comandos SQL ad-hoc úteis

```sql
-- Ativar plano manualmente (suporte cliente):
UPDATE users
SET plano = 'grupo', plano_expires_at = NOW() + INTERVAL '365 days'
WHERE email = 'cliente@email.com';

-- Ver últimas conversas com Jei (debug de bug reportado):
SELECT user_id, viagem_id, jsonb_array_length(messages) AS turn_count, updated_at
FROM ia_conversas
ORDER BY updated_at DESC
LIMIT 20;

-- Quantos users ativos por plano:
SELECT plano, COUNT(*) FROM users WHERE plano_expires_at > NOW() GROUP BY plano;

-- Convites pendentes (R14):
SELECT v.nome, vc.email, vc.role, vc.expira_em
FROM viagem_convites vc
JOIN viagens v ON v.id = vc.viagem_id
WHERE vc.aceito_em IS NULL AND vc.expira_em > NOW();

-- Comissões pendentes pra pagar:
SELECT a.nome, a.cupom, c.mes_referencia, SUM(c.valor_comissao) AS total
FROM comissoes c
JOIN afiliados a ON a.id = c.afiliado_id
WHERE c.status = 'pendente'
GROUP BY a.nome, a.cupom, c.mes_referencia
ORDER BY c.mes_referencia DESC;

-- Webhook MP delivery rate (últimas 24h via Netlify logs):
-- não tem como SQL — usar `netlify functions:invoke webhook-mp --no-identity` em CLI.

-- Tamanho atual do DB (vigia free tier 500MB):
SELECT pg_size_pretty(pg_database_size(current_database()));
```

---

## Comandos Bash úteis

```bash
# Rodar smoke tests local com Supabase real:
VITE_SUPABASE_URL=$(grep VITE_SUPABASE_URL .env.local | cut -d= -f2) \
VITE_SUPABASE_ANON_KEY=$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d= -f2) \
npm test

# Trigger build no Netlify via API (sem precisar push fake):
curl -X POST -d '{}' \
  "https://api.netlify.com/build_hooks/<your-hook-id>"
```

---

## Contatos de emergência

| Serviço | URL | Plano atual |
|---|---|---|
| Anthropic | console.anthropic.com / sales@anthropic.com | Build tier (PAYG) |
| Mercado Pago | developers.mercadopago.com / 0800-637-2200 | conta padrão |
| Supabase | supabase.com/dashboard / support@supabase.io | Free tier (~$0/mês) |
| Netlify | netlify.com / support@netlify.com | Free tier |
| Resend | resend.com / help@resend.com | Free tier (100/dia) |
| Upstash | upstash.com | Free tier |

**Sidney (owner)**: sidney@grupomultvision.com (para escalações)

---

## Notas operacionais

- Cron de reconcile roda **uma vez por dia** (06h UTC = 03h BRT). Se algo precisa
  rodar agora, invocar manualmente via Netlify CLI: `netlify functions:invoke
  reconcile-subscriptions`.
- Backups Supabase: free tier faz **PITR de 24h**. Pra restore, abrir ticket com
  Supabase support (preferir DB seed por SQL via migrations).
- Não roda comando destrutivo (`DROP`, `DELETE FROM users`, `TRUNCATE`) sem
  **dupla confirmação** com Sidney. Sempre `BEGIN; ... ROLLBACK;` primeiro pra
  verificar plano.
- `SUPABASE_SERVICE_KEY` é **bypass total de RLS**. Trate como senha root —
  NUNCA commitar, NUNCA logar, NUNCA expor em frontend (`VITE_*` é build-time
  e vai pro bundle público).
