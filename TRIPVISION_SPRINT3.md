# TripVision SaaS — Sprint 3: Landing Page + Monetização

## Contexto

Sprint 1 (Fundação multi-tenant) e Sprint 2 (IA conversacional com streaming + web search + roteiro automático) estão no ar. Agora vamos monetizar: landing page pública, paywall no fluxo Pro, e integração de pagamento.

Repo: sidneyvianads/tripvision-saas
Site: https://tripvision-saas.netlify.app
Supabase: mucwvugadqksassosixn

Skills:
```
/read supabase-developer
/read webapp-testing
/read my-claude-setup
/read frontend-design
```

---

## O que construir

### 1. LANDING PAGE PÚBLICA (/)

Quando o usuário NÃO está logado, a rota / mostra a landing page em vez de "Minhas Viagens". Se logado, vai direto pra dashboard.

**Estrutura da landing:**

```
[Header fixo]
Logo TripVision ❄️ | Entrar | Criar conta grátis

[Hero]
"Planeje sua viagem conversando.
A IA pesquisa, sugere e monta o roteiro pra você."
[Botão CTA: "Começar grátis →"]
[Mockup/screenshot do app com chat + roteiro lado a lado]

[Como funciona — 3 passos]
1. 💬 Conte sobre sua viagem — "Vou pra Gramado com a família, 5 dias"
2. 🔍 A IA pesquisa tudo — Hotéis, restaurantes, passeios com preços reais
3. 📅 Roteiro pronto — Compartilhe com o grupo, todos acompanham pelo app

[Demo visual]
GIF ou screenshot do streaming funcionando — texto aparecendo + card verde do roteiro

[Funcionalidades — grid 2x3]
✨ Planejamento por IA — Conversa natural, pesquisa preços reais
📅 Roteiro automático — Se monta sozinho da conversa
💬 Chat do grupo — Todos conversam dentro do app
✅ Checklist — Pendências compartilhadas
📱 Instala no celular — PWA, funciona como app
🔗 Compartilhe — Link único, grupo entra em 1 clique

[Planos e preços]
(Seção de pricing — ver item 2)

[Depoimento/Social proof]
"Planejei 14 dias de viagem em 30 minutos conversando com a IA"
— Sidney V., Recife

[CTA final]
"Pronto pra planejar sua próxima viagem?"
[Botão: "Criar conta grátis →"]

[Footer]
TripVision · Grupo Multvision · © 2026
Termos de Uso · Política de Privacidade
```

**Design:**
- Visual inverno (mesma paleta azul/petróleo do app)
- Gradiente hero: azul escuro com partículas de neve (reutilizar do Welcome)
- Seções alternando fundo escuro/claro
- Responsivo mobile-first
- Animações suaves no scroll (fade-in dos cards)
- CTA em laranja lareira (#E8834A) — contraste com o azul
- Fonte: Nunito + DM Sans (mesmas do app)

---

### 2. SEÇÃO DE PREÇOS (PricingSection.jsx)

Exibir na landing e também acessível via link /precos.

3 cards lado a lado:

Free (R$0): 1 viagem, roteiro manual, 5 pessoas/grupo, 5 msgs IA total, checklist básico
Pro R$14,90/mês ou R$119,90/ano (MAIS POPULAR): 5 viagens, IA ilimitada, 15 pessoas/grupo, 50 msgs IA/dia, chat, admin, checklist full
Grupo R$29,90/mês ou R$239,90/ano: 10 viagens, IA ilimitada, 30 pessoas/grupo, 100 msgs IA/dia, suporte prioritário

Toggle mensal/anual no topo. Card Pro com borda dourada e badge "MAIS POPULAR".

---

### 3. INTEGRAÇÃO MERCADO PAGO

#### 3.1 Netlify Function — /api/create-subscription

Cria assinatura recorrente no Mercado Pago (Checkout Pro / Preapproval):
- Recebe: plano (pro_mensal, pro_anual, grupo_mensal, grupo_anual), userId, userEmail
- Chama POST https://api.mercadopago.com/preapproval com auto_recurring
- Retorna init_point (URL de pagamento do MP)
- external_reference = userId (pra identificar no webhook)
- back_url = https://tripvision-saas.netlify.app/assinatura/sucesso

Valores:
- pro_mensal: R$14,90/mês
- pro_anual: R$119,90 (parcela única anual)
- grupo_mensal: R$29,90/mês
- grupo_anual: R$239,90 (parcela única anual)

#### 3.2 Webhook — /api/webhook-mp

Recebe notificações do Mercado Pago (subscription_preapproval):
- status "authorized" → UPDATE users SET plano = 'pro' ou 'grupo' + plano_expires_at + INSERT em assinaturas
- status "cancelled"/"paused" → UPDATE users SET plano = 'free'
- Usar SUPABASE_SERVICE_KEY (service_role) pra acessar sem auth de usuário

#### 3.3 Env vars necessárias no Netlify

- MERCADOPAGO_ACCESS_TOKEN (Sidney configura depois)
- SUPABASE_SERVICE_KEY (service_role key do projeto)

Sidney vai configurar as keys depois. Criar tudo funcional com placeholder: quando MERCADOPAGO_ACCESS_TOKEN não existe, o botão "Assinar" mostra toast "Pagamento será habilitado em breve!" em vez de quebrar.

---

### 4. PAYWALL NO FLUXO PRO

Quando Free tenta usar IA além do limite (5 msgs lifetime), mostrar UpgradeModal:

- Título: "✨ Libere o poder da IA"
- Texto: "Você usou suas 5 mensagens gratuitas. Assine o Pro pra planejamento ilimitado!"
- 2 cards: Mensal (R$14,90) e Anual (R$119,90 — economize 33%)
- Botão "Assinar" → chama /api/create-subscription → redireciona pro MP
- Link "Continuar no Free" fecha o modal

**Limites a implementar em cada componente:**

| Feature | Free | Pro | Grupo |
|---|---|---|---|
| Viagens | 1 | 5 | 10 |
| Msgs IA | 5 lifetime | 50/dia | 100/dia |
| Membros/viagem | 5 | 15 | 30 |
| Chat grupo | ❌ | ✅ | ✅ |
| Admin editar | ❌ | ✅ | ✅ |
| Checklist itens | 5 | Ilimitado | Ilimitado |

Verificações:
- PlanChat.jsx: checar limite de msgs antes de enviar
- Dashboard: checar limite de viagens antes de criar
- Share link auto-join: checar limite de membros
- GroupChat.jsx: bloquear pra Free com mensagem "Disponível no Pro"
- Admin: bloquear pra Free
- Checklist: limitar a 5 itens no Free

---

### 5. PÁGINA DE SUCESSO (/assinatura/sucesso)

Após pagamento:
- "🎉 Bem-vindo ao TripVision Pro!"
- Re-fetch perfil do usuário pra carregar plano atualizado
- Se webhook ainda não processou: "Estamos confirmando seu pagamento... ⏳" com polling a cada 5s até plano mudar
- Botão "Ir pra Minhas Viagens →"

---

### 6. BADGE DE PLANO

- Header: badge "Pro ✨" ou "Grupo ⭐" ao lado do nome (Free não mostra)
- Dashboard: card com plano atual + data renovação + link "Gerenciar"
- Tab Planejar: contador "32/50 hoje" (Pro) ou "3/5 total" (Free)

---

### 7. PÁGINA /conta

- Plano atual + data renovação
- Botão "Cancelar assinatura" (link pro MP)
- Botão "Trocar plano"
- Email de contato: sidney@grupomultvision.com

---

### 8. SEO

No index.html:
```html
<title>TripVision — Planeje sua viagem conversando com IA</title>
<meta name="description" content="Planeje viagens completas conversando com inteligência artificial. A IA pesquisa hotéis, restaurantes e passeios com preços reais e monta o roteiro pra você.">
<meta property="og:title" content="TripVision — Planeje sua viagem conversando">
<meta property="og:description" content="A IA pesquisa, sugere e monta o roteiro. Compartilhe com o grupo.">
<meta property="og:url" content="https://tripvision-saas.netlify.app">
<meta name="twitter:card" content="summary_large_image">
```

---

### 9. TERMOS E PRIVACIDADE

Criar /termos e /privacidade com texto simples:

Termos: TripVision é plataforma de planejamento. IA pode errar preços. Dados são do usuário. Cancelamento a qualquer momento. Grupo Multvision LTDA — CNPJ 49.628.444/0001-65.

Privacidade (LGPD): dados coletados (nome, email, foto, viagens). Finalidade: funcionamento do app. Não compartilha com terceiros. Armazenado em Supabase (São Paulo). Direitos: acesso, correção, exclusão via sidney@grupomultvision.com.

---

### 10. NÃO QUEBRAR NADA

Todo o fluxo atual continua. ferias-2026.netlify.app intocado. Usuários existentes = free.

---

### 11. ORDEM DE EXECUÇÃO

1. Landing page
2. Pricing section
3. Roteamento: / = landing (deslogado) ou dashboard (logado)
4. /api/create-subscription
5. /api/webhook-mp
6. UpgradeModal + verificações de limites
7. Página /assinatura/sucesso
8. Badge de plano + /conta
9. SEO meta tags
10. /termos e /privacidade
11. Commit, push, deploy

Commit, push e deploy.
