# ADR 0002 — Supabase Auth nativo (migração de SHA-256 caseiro)

**Status**: Implementado
**Data**: 2025-12 (decisão) / 2026-01 (migração executada)
**Decisores**: Sidney
**Revisitar quando**: precisarmos de SAML/SSO enterprise OU se Supabase Auth virar gargalo (>50k MAU).

## Contexto

A primeira versão do Viajjei (out-nov/2025) usava auth caseiro:

```sql
-- Tabela users com password TEXT armazenando SHA-256 hex
INSERT INTO users (email, password) VALUES ($1, sha256($2));
SELECT * FROM users WHERE email=$1 AND password=sha256($2);
```

Problemas identificados em auditoria R3:

1. **SHA-256 sem salt** → rainbow tables crackam senha em segundos.
2. **Sem proteção de timing attack** — comparação `password = $1` no Postgres é byte-comparison não-constante.
3. **Sem JWT** — sessão era ID do user em `localStorage` (`tripvision-saas:user:v1`). Quem capturasse o localStorage virava o user.
4. **Sem refresh token** — sessão "permanente" até logout manual.
5. **Sem reset por email** — implementação caseira incompleta.
6. **RLS quebrado** — `auth.uid()` retornava NULL porque não tinha JWT, então RLS policies não funcionavam → toda lógica de membership ficava client-side.

Risco LGPD imediato (Art. 46 — medidas técnicas de segurança).

## Decisão

Migrar pra **Supabase Auth nativo** (bcrypt + JWT + session refresh built-in).

- `supabase.auth.signUp` → bcrypt 10 rounds
- `supabase.auth.signInWithPassword` → JWT (access ~1h + refresh ~30d)
- JWT carrega `sub`, `email`, `role` — RLS policies usam `auth.uid()` e `auth.jwt() ->> 'email'`
- Storage key custom `viajjei.auth` (em vez do default `sb-*`)
- `public.users` continua existindo como **profile estendido** (nome, plano, avatar_cor, origem, afiliado_id), com `id = auth.users(id)` (mesma UUID). Trigger `on_auth_user_created` cria a row em `public.users` no signUp.

## Justificativa

- **Padrão de indústria**: bcrypt 10 rounds é o que todo mundo usa há 15+ anos. Resistente a brute force GPU.
- **RLS funciona de verdade**: queries do client passam JWT no Authorization header → `auth.uid()` retorna ID válido → policies bloqueiam acesso a viagens alheias **no banco**, não na UI.
- **Reset de senha built-in**: `supabase.auth.resetPasswordForEmail()` manda email com token → user clica → `?type=recovery&access_token=...` na URL → `supabase-js` consome automaticamente e dispara event `PASSWORD_RECOVERY` que o frontend escuta pra mostrar form de nova senha.
- **JWT expira em 1h, refresh em 30d**: sessão "esquecida" não vira backdoor permanente.
- **Free tier ok**: até 50k MAU sem custo, generoso pra startup.

## Implementação

### Fase 1 — Setup paralelo (dez/2025)
Criou `auth.users` via signUp + `public.users` via trigger. Sem migrar users existentes ainda.

### Fase 2 — Backfill (jan/2026)
Para cada user existente no `public.users` antigo:
1. Cria entrada correspondente em `auth.users` via `supabase.auth.admin.createUser` com email + senha aleatória.
2. UPDATE em `public.users` setando `id = auth.users.id` (UUID consistente).
3. Envia email "sua conta foi migrada, defina nova senha" com link de recovery.

Resultado: ~30 users existentes (Sidney + 4 clientes beta) receberam email e definiram senha bcrypt. SHA-256 antigos descartados.

### Fase 3 — Cleanup (jan/2026)
- DROP coluna `public.users.password` (não usada mais).
- Audit grep: garantir que nenhum lugar do código ainda referencia `password` em `public.users`.
- Frontend signIn passou a usar `supabase.auth.signInWithPassword` exclusivo.

### Comportamento atual
- `useAuth.jsx` (`AuthProvider`) escuta `onAuthStateChange` da Supabase.
- Token em `localStorage["viajjei.auth"]` (gerenciado pela lib).
- `signOut` chama `clearSessionScopedStorage` (R12) pra limpar cupom/origem/plan-usage residuais antes de zerar user state.

## Trade-offs aceitos

- **Vendor lock-in Supabase**: portar sai caro (bcrypt hashes ficam, mas migration de JWT signing key é dor). Mitigado por nunca ter usado feature exclusiva (não usamos GoTrue magic links, OAuth providers, etc).
- **Email confirmation opcional**: deixamos desativado em produção pra reduzir fricção no signup → pagamento. Trade pra UX. Se decisão mudar, frontend já trata `needsConfirmation: true` (vê `useAuth.jsx:159`).
- **JWT expirando a cada 1h**: requer chamadas extras pra refresh. Aceito pela segurança.

## Como verificar que funciona

- `SELECT * FROM auth.users` no SQL editor — confirmar usuários reais com `encrypted_password` bcrypt (`$2a$...`).
- `SELECT count(*) FROM public.users WHERE id NOT IN (SELECT id FROM auth.users)` → deve retornar 0 (sem órfãos).
- Em DevTools, inspecionar `localStorage.getItem("viajjei.auth")` → JWT estruturado.
- `SELECT auth.uid()` em SQL editor com session válida → retorna UUID, não NULL.

## Quando revisitar

- **Enterprise SAML/SSO**: Supabase Auth tem suporte mas pago. Hoje não temos demanda.
- **Magic links em vez de senha**: ergonomicamente melhor mas trade pra deliverability de email. Reabrir quando tivermos métricas de drop-off no signup.
- **OAuth (Google/Apple)**: provavelmente próxima feature de auth. Stack já suporta.
- **>50k MAU**: avaliar custo Supabase ou portar pra Auth0/Clerk/self-hosted.

## Referências

- Supabase Auth docs: https://supabase.com/docs/guides/auth
- bcrypt cost factor 10: ~100ms por hash em CPU moderno (suficiente vs brute force)
- Implementação no código: `src/hooks/useAuth.jsx`
- Migration trigger: `supabase/migrations/2026_05_15_trigger_create_profile_on_auth_user_insert.sql`
- Resilient trigger: `supabase/migrations/2026_05_15_handle_new_auth_user_resilient_uuid.sql`
