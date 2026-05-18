# Viajjei

> **Sempre Juntos.** — concierge de viagem com IA.

SaaS B2C de planejamento de viagens. O **Jei** (IA) pesquisa hotéis, restaurantes e passeios com
preços reais e monta o roteiro. O grupo planeja junto: chat, checklist, diário, contatos. Compartilhado
por convite.

Produto do **Grupo Multvision**.

- Site: **viajjei.com.br**
- Repo: `sidneyvianads/tripvision-saas` (nome legacy mantido)
- Stack region: Supabase `sa-east-1` (São Paulo), Netlify global

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 8 + Tailwind v4 + react-router 7 |
| Auth | Supabase Auth nativo (bcrypt + JWT) |
| DB | Postgres 17 via Supabase (RLS + Realtime + RPCs SECURITY DEFINER) |
| IA primária | Claude Haiku 4.5 (Anthropic) com web search nativo |
| IA fallbacks | OpenAI GPT-4o-mini → Google Gemini 2.5 Flash |
| Pagamento | Mercado Pago (preapproval + webhook HMAC) |
| Email transacional | Resend (stub se ausente) |
| Storage | Supabase Storage (buckets `avatars`, `diario`) |
| Export PDF | pdf-lib (vetorial, texto selecionável) |
| Backend | Netlify Functions (Node 20) + Edge Functions (Deno) |
| Observabilidade | Sentry (stub) + PostHog (stub) |
| Rate limit | Upstash Redis REST (stub se ausente) |
| PWA | manifest + safe-area + offline cache |

Veja decisões arquiteturais em `docs/ADR/`. Runbook de incidentes em `docs/RUNBOOK.md`.

---

## Quick start (dev local)

```bash
git clone https://github.com/sidneyvianads/tripvision-saas.git
cd tripvision-saas
npm install
cp .env.example .env.local
# Preenche pelo menos as 4 obrigatórias (ver tabela abaixo)
npm run dev          # http://localhost:5173
```

Sem **as 4 envs obrigatórias**, o app sobe mas sign-in/IA não funcionam.

---

## Variáveis de ambiente

| Var | Obrigatória? | Onde pegar | O que faz | Sem ela |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase → Project → API → URL | Endpoint do projeto (frontend + functions) | Nada funciona |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase → Project → API → `anon public` | JWT público pra auth + queries com RLS | Nada funciona |
| `SUPABASE_SERVICE_KEY` | ✅ (server) | Supabase → API → `service_role secret` | Bypass RLS em Netlify Functions (gates server-side de IA, webhooks) | Webhook MP / plan / reconcile quebram |
| `ANTHROPIC_API_KEY` | ✅ (1 dos 3) | console.anthropic.com → API Keys | Claude Haiku 4.5 — primário do Jei | Cai pro fallback OpenAI |
| `OPENAI_API_KEY` | opt | platform.openai.com → API Keys | GPT-4o-mini fallback | Cai pra Gemini |
| `GEMINI_API_KEY` | opt | aistudio.google.com → API Keys | Gemini 2.5 Flash fallback final | Jei retorna erro |
| `MERCADOPAGO_ACCESS_TOKEN` | prod | mercadopago.com.br → Credenciais → `APP_USR-…` | Criar/cancelar preapprovals | Modo placeholder (mostra "em breve") |
| `MP_WEBHOOK_SECRET` | prod | MP → Webhooks → Configurar → "Sua chave secreta" | Valida HMAC do webhook | Aceita sem validar (modo permissivo, logando warning) |
| `RESEND_API_KEY` | opt | resend.com → API Keys (após verificar viajjei.com.br) | Envio do email de convite | Stub mode — convite criado mas link copia-manual |
| `INVITE_SENDER_EMAIL` | opt | — | Sender no Resend, default `Viajjei <convites@viajjei.com.br>` | Usa default |
| `VITE_SENTRY_DSN` | opt | sentry.io → Project → DSN | Error tracking frontend | Stub (logs em console) |
| `SENTRY_DSN` | opt | idem | Error tracking backend (Functions) | Stub |
| `VITE_POSTHOG_KEY` | opt | posthog.com → Project → Settings | Analytics frontend | Stub |
| `POSTHOG_KEY` | opt | idem | Analytics backend | Stub |
| `UPSTASH_REDIS_REST_URL` | opt | upstash.com → Redis → REST URL | Rate limit em Functions | Stub (no-op, sem rate limit) |
| `UPSTASH_REDIS_REST_TOKEN` | opt | idem → REST Token | idem | Stub |
| `URL` / `DEPLOY_PRIME_URL` | auto | Netlify injeta no build | Compose de back_url do MP, OG, etc | (sempre presente em Netlify) |

**Custos típicos (jan/2026):**
- Supabase free: 500MB DB + 5GB bandwidth → ~$0 até ~200 users
- Anthropic Haiku 4.5: $1/M in, $5/M out, $10/1k web search → ~$0.05/conversa típica
- OpenAI 4o-mini: $0.15/M in, $0.60/M out → ~$0.01/conversa
- Mercado Pago: 4.99% por transação cartão + R$0.39 (sem mensalidade)
- Netlify free: 100GB bandwidth + 125k function invocations
- Resend free: 100 emails/dia, 3k/mês
- Upstash free: 10k commands/dia

---

## Comandos

```bash
npm run dev      # vite dev server, hot reload
npm run build    # bundle prod em dist/
npm run preview  # preview do dist/ local
npm run test     # vitest, 190 smoke tests (~750ms)
npm run lint     # eslint . (informational no CI — non-blocking)
```

CI (GitHub Actions, `.github/workflows/test.yml`):
- `smoke tests` — vitest sem secrets, sempre roda
- `tests-real` — vitest com Supabase real (só em push pra main + secrets configurados)
- `build` — `npm run build` (bloqueia merge se falhar)
- `lint` — informational, `continue-on-error: true`

---

## Estrutura do código

```
src/
  pages/               14 rotas (Landing, Welcome, MyTrips, TripView, etc)
  components/          UI compartilhada (TripLayout, ShareModal, People, …)
  hooks/               useAuth, useTrips, useChat, useRoteiro, useChecklist, useIaConversa
  lib/
    supabase.js          client + helpers (slug, normalizeEmail, etc)
    errorMessages.js     friendlyError() — sanitiza erro técnico pra UI
    invites.js           wrappers de RPC invite_to_trip, accept_invite
    storage.js           clearSessionScopedStorage no signOut
    safeHref.js          dompurify de href pra prevenir XSS
    roteiroParser.js     parser do JSON do Jei pro DB
    exportPdf.js         export roteiro pra PDF vetorial via pdf-lib (R24)
    avatarUpload.js      upload de avatar pro Storage (R21)
    diarioUpload.js      upload de fotos do diário pro Storage (R22)
    useIaUsage.js        contador IA server-first com cache 60s (R20)
    sentry.js / analytics.js   wrappers com stub mode
  data/                plans.js, themes.js, types.js — fonte da verdade
netlify/
  functions/           12 endpoints serverless (Node 20)
  edge-functions/      og.mjs (meta tags dinâmicas em /v/:slug)
supabase/
  migrations/          27 arquivos versionados (DDL, RPCs, RLS policies)
tests/                 25 arquivos vitest smoke tests
docs/
  ADR/                 decisões arquiteturais
  RUNBOOK.md           incidentes comuns + comandos
```

### Netlify Functions (11)

| Endpoint | O que faz |
|---|---|
| `/api/plan` | Streaming SSE Claude → parser → INSERT em roteiro_dias |
| `/api/chat` | Streaming SSE chat livre com Jei (gate por plano) |
| `/api/create-subscription` | Cria preapproval MP, retorna init_point |
| `/api/webhook-mp` | Webhook MP — ativa plano, registra comissão de afiliado |
| `/api/cancel-subscription` | Cancela preapproval no MP |
| `/api/reconcile-subscriptions` | Cron diário (06h UTC = 03h BRT) — sincroniza estado MP |
| `/api/delete-account` | LGPD — apaga user + cascades |
| `/api/delete-ia-history` | Apaga ia_conversas do user |
| `/api/export-user-data` | LGPD — export JSON completo |
| `/api/send-invite-email` | Resend transacional (stub OK) |
| `og` (edge) | Injeta meta tags OG em /v/:slug pra share preview |

---

## Modelos de dados (top tabelas)

| Tabela | Concern | RLS notes |
|---|---|---|
| `users` | Profile + plano + afiliado_id | self-read; UPDATE só campos próprios |
| `viagens` | Root entity da viagem | trigger add_owner_as_admin no INSERT |
| `viagem_membros` | Multi-tenancy via membership | RLS gate principal — quem vê o quê |
| `viagem_convites` | Invite flow (R14) | só RPC SECURITY DEFINER muta; SELECT por admin/criador/email |
| `roteiro_dias` + `roteiro_atividades` | Itinerário | herda RLS de viagens via is_member_of |
| `ia_conversas` | Histórico do Jei por (viagem, user) | self-read; jsonb messages array |
| `messages` + `reactions` | Chat do grupo | realtime via publication supabase_realtime |
| `checklist` | Tarefas da viagem | idem |
| `diario` | Posts com foto compressed base64 | idem |
| `contatos` | Hotéis/restaurantes/emergência | idem |
| `edit_log` | Auditoria de mudanças no roteiro | append-only |
| `assinaturas` | MP preapprovals | UNIQUE mp_preapproval_id |
| `afiliados` | Programa de afiliados (cupom, desconto, comissão) | só owner manage |
| `comissoes` | Comissões por mês | só owner manage; admin_set_comissao_status RPC |

22 migrations versionadas em `supabase/migrations/`. Aplicação histórica via MCP — cada arquivo é snapshot do que rodou em prod.

---

## CI/CD

- **Push em `main`** → Netlify GitHub App triggera build automático → deploy em produção.
- **PR** → deploy preview em `deploy-preview-N--tripvision-saas.netlify.app` + workflow `tests` bloqueia merge se smoke/build falhar.
- **Cron jobs**: `reconcile-subscriptions` em `0 6 * * *` UTC (03h BRT) reconcilia preapprovals divergentes.
- **Deploy manual (override)**: `npm run build && netlify deploy --prod --build`.

### Headers de segurança (em `netlify.toml`)
- HSTS 1 ano + includeSubDomains
- X-Frame-Options DENY
- Content-Security-Policy `connect-src` (Supabase https+wss, Resend, Posthog, Sentry, Google Fonts)
- Permissions-Policy bloqueando camera/microphone, permitindo geolocation/payment self

---

## Planos comerciais

| Plano | Viagens | IA / mês | Compartilhar | Preço |
|---|---|---|---|---|
| **Pending** (sem assinatura) | 0 (read-only) | 0 | — | — |
| **Pro** | 3 | 500 | 5 pessoas | R$ 14,90/mês ou R$ 119,90/ano |
| **Grupo** | 5 | 2.000 | 20 pessoas | R$ 29,90/mês ou R$ 239,90/ano |
| **Owner** (interno) | ∞ | ∞ | ∞ | — |

Trial 7 dias no plano mensal. Anual cobra direto (33% off já é o gancho). Limites em `src/data/plans.js` (fonte da verdade) + gates server-side via RPCs `count_ia_user_messages_*` e `is_within_plan_limit`.

---

## Notas

- Repo + tabelas mantêm nome legacy `tripvision-saas` pra não quebrar dados de produção; o produto se chama Viajjei.
- Netlify legacy `tripvision-saas.netlify.app` → 301 → apex `viajjei.com.br`.
- 190 smoke tests, build em ~300ms, 16 commits/semana em jan/2026.
- Documentação técnica completa em `docs/`.
