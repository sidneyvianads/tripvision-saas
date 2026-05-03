# Viajjei

> **Sempre Juntos.** — planeje sua viagem conversando com um assistente inteligente.

App de planejamento de viagens onde a IA pesquisa hotéis/restaurantes/passeios com preços reais
e monta o roteiro pra você. Compartilhe com o grupo em 1 clique.

Produzido pelo Grupo Multvision.

## Stack

- **Frontend**: React 19, Vite 8, Tailwind 4, react-router 7
- **Backend**: Netlify Functions (Node 20) + Edge Functions (Deno)
- **DB / Auth**: Supabase (Postgres + RPC + Realtime + RLS), auth custom via SHA-256
- **IA**: Anthropic `claude-sonnet-4-5` com streaming SSE e prompt caching
- **Pagamento**: Mercado Pago (preapproval + webhook)
- **PWA**: manifest + safe-area + offline cache

## Dev

```bash
npm install
npm run dev          # vite dev (http://localhost:5173)
npm run build        # bundle produção em dist/
```

Variáveis de ambiente necessárias (`.env.local` em dev, painel Netlify em prod):

| Var | Onde usa |
|---|---|
| `VITE_SUPABASE_URL` | client + functions |
| `VITE_SUPABASE_ANON_KEY` | client (RLS) |
| `SUPABASE_SERVICE_KEY` | functions (bypass RLS no gate de IA) |
| `ANTHROPIC_API_KEY` | `/api/plan`, `/api/chat` |
| `MERCADOPAGO_ACCESS_TOKEN` | `/api/create-subscription`, `/api/webhook-mp`, `/api/cancel-subscription` |

## Deploy

Conectado ao GitHub via Netlify GitHub App — `git push origin main` triggera build automático.
Deploy manual (override): `npm run build && netlify deploy --prod --build`.

## Estrutura

- `src/pages/` — rotas
- `src/components/` — UI compartilhada
- `src/hooks/` — `useAuth`, `useChat`, `useRoteiro`, `useChecklist`, `useTrips`, `useIaConversa`
- `src/lib/` — `supabase`, `applyTema`, `roteiroParser`, `roteiroResumo`, `rateLimit`, `exportPdf`, `editLog`
- `src/data/` — `plans`, `themes`, `types`
- `netlify/functions/` — `plan`, `chat`, `create-subscription`, `cancel-subscription`, `webhook-mp`
- `netlify/edge-functions/` — `og` (meta tags dinâmicas em `/v/:slug`)

## Planos

| Plano | Viagens | IA / mês | Compartilhar | Chat | Preço |
|---|---|---|---|---|---|
| Free | 1 | 5 lifetime | — | — | R$ 0 |
| Pro | 3 | 500 | 5 pessoas | ✓ | R$ 14,90/mês ou R$ 119,90/ano |
| Grupo | 5 | 2.000 | 20 pessoas | ✓ | R$ 29,90/mês ou R$ 239,90/ano |
| Owner | ∞ | ∞ | ∞ | ✓ | acesso interno (sem cobrança) |

Gates: cliente em `src/lib/rateLimit.js`; servidor em `/api/plan` via RPC `count_ia_user_messages` e `count_ia_user_messages_in_month`.

## Notas

- Repo: `sidneyvianads/tripvision-saas` (nome legacy, mantido).
- Site: `viajjei.com.br` (Netlify legacy: `tripvision-saas.netlify.app` → 301 → apex).
- Tabelas e variáveis no código mantêm nomes antigos pra não quebrar dados.
