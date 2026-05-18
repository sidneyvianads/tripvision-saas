# Contribuindo pro Viajjei

Bem-vindo. Este doc cobre o necessário pra mexer no código sem quebrar produção.

## Setup local

```bash
git clone https://github.com/sidneyvianads/tripvision-saas.git
cd tripvision-saas
npm install
cp .env.example .env.local
# preencher pelo menos as 4 envs obrigatórias (ver README → "Variáveis de ambiente")
npm run dev
```

App sobe em http://localhost:5173.

**Netlify Functions em dev** não rodam com `npm run dev` puro. Pra testar
`/api/*`, instale Netlify CLI e use `netlify dev`:

```bash
npm install -g netlify-cli
netlify link  # link com site do Netlify (precisa de acesso)
netlify dev   # serve frontend + functions juntos em http://localhost:8888
```

## Antes de commitar

```bash
npm run build      # garante que vite build passa (catch import errors)
npm test           # 190 smoke tests, ~750ms
npm run lint       # informational — não bloqueia, mas idealmente sem regressões
```

CI roda os mesmos 3 + um job extra `tests-real` (smoke contra Supabase prod
com secrets). Se algum falhar no PR, merge é bloqueado (lint não).

## Padrão de commits

Convenção [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<escopo>): <descrição curta>

<corpo opcional explicando o porquê — focado em "por que" não "o que">

Co-Authored-By: <se aplicável>
```

Tipos comuns:
- `feat` — feature nova visível pro user
- `fix` — bug fix
- `refactor` — mudança interna sem alterar comportamento
- `chore` — manutenção (deps, lockfile, cleanup)
- `docs` — só docs
- `test` — só testes
- `ci` — pipeline / GitHub Actions
- `style` — formatação (raro — Prettier não está configurado)

Exemplos do repo:
```
fix(realtime): useChat buffer reactions órfãs + ref read (R12-1)
feat(invite): SQL — tabela viagem_convites + RLS (R14-1)
docs(adr): 0001 — Claude Haiku 4.5 como IA primária (R16-2)
```

**Convenção interna**: commits da auditoria periódica (Mythos R##) referenciam
a rodada e o item: `R14-3`, `R16-5`, etc. Pra mudanças fora dessas rodadas,
omita.

## Pull Requests

1. Branch de `main`: `git checkout -b feat/<nome-curto>`.
2. Commits atômicos — uma mudança lógica por commit.
3. Build + tests passam local antes de pushar.
4. Abrir PR com:
   - **Título**: mesma convenção dos commits (`feat: ...`)
   - **Descrição**: o quê mudou + por quê + como testar manualmente
5. Aguardar CI verde.
6. Merge via "Squash and merge" no GitHub UI (mantém main linear).

Sem code review formal hoje (time pequeno) — só Sidney aprova. Se a mudança
tocar segurança/billing/auth, **pingar antes** em vez de mergear direto.

## Estilo de código

Sem Prettier configurado. Padrões implícitos (vê código existente):

- **Imports**: agrupados (react/lib externa, internos `@/lib`, internos relativos).
  Usar caminhos relativos pra arquivos próximos.
- **Funções**: hoisting via `function foo() {}` quando exportadas top-level;
  arrows pra callbacks/components.
- **React**: hooks no topo, returns no fundo. Componentes pequenos como funções
  named no MESMO arquivo (não criar `Button.jsx` separado se só usa num lugar).
- **Comentários**: explicar **por quê**, não **o quê**. Linkar com tag `Rn-x`
  quando o código existe por causa de uma decisão da auditoria
  (ex: `R12-1: pendingReactionsRef pra race do realtime`).
- **Português PT-BR** em comentários, identifiers (`viagem`, `roteiro`, `cidades`),
  e strings de UI. Inglês só em palavras técnicas (`fetch`, `setState`, `payload`).

### Erros pro usuário

**Sempre** sanitizar erro antes de mostrar pro user (vê `src/lib/errorMessages.js`):

```js
catch (err) {
  console.error("[meu-modulo] contexto:", err);  // log técnico cru
  setError(friendlyError(err));                   // UI sanitizada PT-BR
}
```

Nunca `setError(err.message)` direto — vaza schema interno do Postgres.

### Segurança

- **Nunca** logar `SUPABASE_SERVICE_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `RESEND_API_KEY` etc.
- **Nunca** usar `VITE_*` pra secret server-side (vai pro bundle frontend).
- Render de HTML do user → usar `DOMPurify`/`safeHref` (ver `src/lib/safeHref.js`).
- RPC `SECURITY DEFINER` sempre com `SET search_path = public, pg_temp` e guard
  `IF auth.uid() IS NULL THEN RAISE EXCEPTION`. Ver exemplos em
  `supabase/migrations/2026_05_18_invite_rpcs.sql`.

## Migrations SQL

- Aplicadas via **Supabase MCP** durante desenvolvimento. Cada migration é
  snapshot **DEPOIS** de aplicado em prod, versionada em
  `supabase/migrations/YYYY_MM_DD_descricao.sql`.
- Nome: `YYYY_MM_DD_<descricao_curta>.sql` (snake_case).
- Sempre incluir `CREATE OR REPLACE` ou `IF NOT EXISTS` — migrations são
  idempotentes.
- Pra mudanças destrutivas (DROP, ALTER que tira coluna): **pingar Sidney
  antes**. Backup PITR Supabase tem só 24h.

## Tests

- Smoke tests em `tests/*.test.mjs` rodam com vitest.
- Pra cada feature/bugfix novo: pelo menos 1 teste anti-regressão que
  pegaria o bug se voltasse.
- Tests podem ser **string-based** (grep no código fonte/migration) ou
  **smoke real** (chamadas anônimas pra Supabase quando env disponível).
  Veja `tests/r14-invite-flow.test.mjs` como exemplo de mix.

## O que NÃO fazer

- **Não** rodar `DROP`, `DELETE FROM users`, `TRUNCATE` em prod sem dupla
  confirmação. Use `BEGIN; ... ROLLBACK;` pra preview.
- **Não** force-push em `main` (history protected).
- **Não** mergear PR com CI vermelho a não ser que seja **lint** (informational).
- **Não** subir env vars com secrets no `.env.example` — só placeholders.
- **Não** adicionar dependências sem alinhar (bundle size importa: hoje
  ~404kb gzip 131kb).

## Onde procurar contexto

- **README.md** — overview, envs, estrutura
- **docs/ADR/** — decisões arquiteturais
- **docs/RUNBOOK.md** — incidentes operacionais
- **supabase/migrations/** — histórico de mudanças no DB

Dúvida? Abre uma issue ou pingue Sidney.
