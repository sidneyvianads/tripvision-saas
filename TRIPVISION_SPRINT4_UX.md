# TripVision SaaS — Sprint 4: Melhorias UX + Tema Neutro + Tema por Viagem

## Contexto

Sprints 1-3 entregues. Agora vamos polir o app com 57 melhorias de UX + trocar o visual de "inverno" pra tema neutro + tema dinâmico por viagem.

Repo: sidneyvianads/tripvision-saas
Site: https://tripvision-saas.netlify.app

Skills:
```
/read frontend-design
/read supabase-developer
```

---

## PARTE A — VISUAL: TEMA NEUTRO + TEMA POR VIAGEM

### A1. App geral (landing, login, dashboard, conta) — TEMA NEUTRO

Remover toda referência a inverno (neve, flocos, pinheiros, azul escuro gelado).

Nova paleta neutra:
- Fundo: #FAFBFC (branco levemente azulado)
- Cards: #FFFFFF com sombra suave
- Primário: gradiente #6366F1 → #8B5CF6 (índigo → violeta — remete a viagem/céu noturno/magia)
- Secundário: #F59E0B (âmbar quente — CTAs, destaques)
- Texto: #1F2937 (cinza escuro)
- Texto secundário: #6B7280
- Header: branco com borda inferior sutil, logo colorido
- Tab bar: branco, ícone ativo em índigo
- Remover: partículas de neve, SVG de montanhas, SVG de pinheiros, gradientes azul-gelo
- Manter: cantos arredondados (16px), Nunito + DM Sans

### A2. Tema por viagem — seleção na criação

Na criação da viagem, adicionar campo "Clima da viagem" com 5 opções:

```javascript
const TEMAS = {
  montanha: {
    label: "🏔️ Montanha & Frio",
    gradient: "linear-gradient(135deg, #1B4F72, #2E86C1)",
    accent: "#7CB9E8",
    bgLight: "#E8F4FD",
    cardBorder: "#2E86C1",
    particles: "snow", // flocos de neve
    emoji: "❄️",
  },
  praia: {
    label: "🏖️ Praia & Sol",
    gradient: "linear-gradient(135deg, #FF6B6B, #FF8E53)",
    accent: "#FF8E53",
    bgLight: "#FFF5F0",
    cardBorder: "#FF6B6B",
    particles: "waves", // ondas sutis
    emoji: "☀️",
  },
  cidade: {
    label: "🌆 Cidade & Cultura",
    gradient: "linear-gradient(135deg, #6366F1, #8B5CF6)",
    accent: "#A78BFA",
    bgLight: "#F0EEFF",
    cardBorder: "#6366F1",
    particles: "lights", // luzes da cidade
    emoji: "🏛️",
  },
  natureza: {
    label: "🌿 Natureza & Aventura",
    gradient: "linear-gradient(135deg, #059669, #10B981)",
    accent: "#34D399",
    bgLight: "#ECFDF5",
    cardBorder: "#059669",
    particles: "leaves", // folhas caindo
    emoji: "🌲",
  },
  internacional: {
    label: "🌍 Internacional",
    gradient: "linear-gradient(135deg, #1F2937, #374151)",
    accent: "#9CA3AF",
    bgLight: "#F3F4F6",
    cardBorder: "#374151",
    particles: null, // clean, sem partículas
    emoji: "✈️",
  },
};
```

- Salvar o tema na tabela viagens: `ALTER TABLE viagens ADD COLUMN IF NOT EXISTS tema TEXT DEFAULT 'cidade';`
- Quando abre uma viagem, carregar o tema e aplicar como CSS variables no container da viagem
- Header da viagem usa o gradient do tema
- Cards de dia usam bgLight do tema
- Acentos (botões, links, badges) usam accent do tema
- Partículas opcionais no fundo (SVG/CSS leve, não pesado)

### A3. Seletor de tema na UI

Na criação de viagem:
```
Clima da viagem:
[🏔️ Frio] [🏖️ Praia] [🌆 Cidade] [🌿 Natureza] [🌍 Internacional]
```
Chips horizontais, seleção única, preview visual ao selecionar (fundo muda).

---

## PARTE B — FLUXO DE CRIAÇÃO DE VIAGEM (UX PRINCIPAL)

### B1. Tela pós-criação — escolha IA ou Manual

Após criar viagem, NÃO ir direto pro roteiro vazio. Mostrar tela de escolha:

```
┌──────────────────────────────────────┐
│ [emoji do tema] [nome da viagem]     │
│ [cidades] · [datas] · [pessoas]      │
│                                      │
│ Como quer montar seu roteiro?        │
│                                      │
│ ┌────────────────────────────────┐   │
│ │ ✨ Planejar com IA              │   │
│ │ Converse e o roteiro se monta  │   │
│ │ sozinho com preços reais       │   │
│ │ [Começar conversa →]           │   │
│ └────────────────────────────────┘   │
│                                      │
│ ┌────────────────────────────────┐   │
│ │ ✏️ Montar manualmente           │   │
│ │ Adicione dias e atividades     │   │
│ │ você mesmo                     │   │
│ │ [Criar primeiro dia →]         │   │
│ └────────────────────────────────┘   │
└──────────────────────────────────────┘
```

### B2. Roteiro vazio — estado amigável

Se o roteiro não tem dias, mostrar ilustração + opções em vez de tela vazia:
- Ilustração SVG simpática (mala de viagem ou mapa)
- "Seu roteiro está esperando pra ser criado!"
- Botões: "✨ Planejar com IA" e "✏️ Montar manualmente"

### B3. Dentro do roteiro com dias — continuar planejando

Botão no final da lista de dias:
- "✨ Continuar planejando com IA" → abre tab Planejar
- "✏️ Adicionar dia manualmente" → abre formulário de novo dia

### B4. Botão "Novo Dia" com opção

O botão "Novo Dia" (que já existe) abre mini-menu:
- "✨ Pedir pra IA" → abre Planejar
- "✏️ Manual" → formulário atual

### B5. Tela pra convidados (share link) com roteiro vazio

Quando alguém entra pelo link mas o roteiro está vazio:
- "O organizador ainda está montando o roteiro 🔧"
- Info da viagem (nome, datas, cidades)
- "Enquanto isso, se apresente no chat! 💬"

---

## PARTE C — 57 MELHORIAS (ORGANIZADAS POR ÁREA)

### CADASTRO / LOGIN (itens 1-5)

1. Senha mínima 6 caracteres + indicador de força (fraca/média/forte com cores)
2. Campo "Confirmar senha" no cadastro
3. Link "Esqueci minha senha" → tela simples que envia email com código de 6 dígitos → tela pra digitar código + nova senha. Salvar código temporário na tabela users (campo reset_code + reset_code_expires). Enviar email via Netlify Function + Resend API (ou placeholder se não tiver key)
4. Verificar que resize de foto funciona em Android e iOS (200x200, JPEG 0.7)
5. Validação de nome: não vazio, não só espaços, max 50 chars

### DASHBOARD (itens 6-10)

6. Card de viagem mostra: número de dias no roteiro, número de membros, emoji do tema
7. Viagem sem data: mostrar "📅 Datas a definir"
8. Ordenar: viagens futuras primeiro (por data_inicio ASC), viagens passadas depois com label "Concluídas" e opacity reduzida
9. Campo de busca se 3+ viagens (filtrar por nome)
10. Deletar viagem: modal de confirmação "Tem certeza? Isso apaga roteiro, chat e checklist. Não dá pra desfazer." com botão vermelho

### CRIAÇÃO DA VIAGEM (itens 11-14)

11. Cidades: campo com botão "+ Adicionar cidade" → cria chip removível (X). Não campo de texto livre
12. Datas: usar input type="date" nativo + validar fim >= início
13. Número de pessoas: stepper +/- (botões), não campo texto. Min 1, max 50
14. Se datas preenchidas, calcular e mostrar "5 dias" automaticamente

### ROTEIRO (itens 15-21)

15. Dia sem atividades: "Dia livre — adicione atividades ou peça pra IA sugerir" + botões
16. Horários sobrepostos: borda laranja de aviso no card da atividade
17. Reordenar atividades: botões ↑↓ em cada atividade (drag and drop é complexo demais pra este sprint, usar setas)
18. Botão "Copiar dia" → duplica todas as atividades pra um novo dia
19. Campo "Notas" em cada atividade (texto livre, max 200 chars) — coluna `notas TEXT` em roteiro_atividades
20. Atividade com endereço → ícone 📍 que abre `https://maps.google.com/?q=ENDERECO` em nova aba
21. Placeholder pra clima: mostrar "🌤️ Clima disponível próximo à data" no card do dia (integração real numa sprint futura)

### TAB PLANEJAR / IA (itens 22-26)

22. Mensagens longas da IA: renderizar com parágrafos espaçados (margin-bottom entre blocos, max-width 90% no mobile)
23. Botão "📋 Resumir roteiro" fixo no topo do chat — ao clicar, manda mensagem automática "Resuma todo o roteiro montado até agora" pra IA
24. Chips de sugestão embaixo do input (scrollável horizontal):
    ["Sugere hotel", "O que fazer amanhã?", "Restaurante perto", "Quanto vai custar?", "Passeio pra crianças", "Onde almoçar?"]
    Ao tocar, preenche o input e envia
25. Botão "↩️ Desfazer" no card verde de roteiro_update — remove o que foi adicionado (DELETE das atividades inseridas)
26. Mostrar termos pesquisados no loading: "🔍 Pesquisando: hotéis centro Gramado"

### CHAT DO GRUPO (itens 27-31)

27. Badge vermelho no ícone do Chat na tab bar quando tem mensagem não lida. Contar msgs com created_at > última visualização do usuário. Salvar last_seen_chat na tabela viagem_membros
28. Responder mensagem: botão de reply em cada mensagem → mostra preview da msg original acima da resposta. Campo `reply_to UUID REFERENCES messages(id)` na tabela messages
29. Reações: long press ou botão em cada mensagem → picker com 6 emojis (👍❤️😂😮😢🔥). Tabela `reactions (id, message_id, user_id, emoji)` ou campo JSONB reactions na messages
30. Compartilhar atividade no chat: no roteiro, cada atividade tem ícone 💬 "Compartilhar no chat" → envia mensagem formatada com detalhes da atividade
31. Mensagem de sistema automática: quando roteiro é editado via admin ou IA, inserir mensagem tipo "[SISTEMA] Sidney adicionou 3 atividades ao Dia 2". Campo is_system BOOLEAN na messages

### CHECKLIST (itens 32-36)

32. Botão "+ Novo item" pra adicionar itens personalizados (título + categoria)
33. Campo "Responsável" em cada item — dropdown com membros da viagem. Coluna `responsavel_id UUID REFERENCES users(id)` no checklist
34. Campo "Prazo" em cada item — date picker. Coluna `prazo DATE` no checklist
35. Categorias expandidas: "antes", "durante", "malas", "documentos", "ingressos", "reservas". Atualizar o CHECK constraint
36. Indicador de prazo: se faltam 3 dias, mostrar badge "⚠️ 3 dias" em vermelho

### SHARE LINK (itens 37-39)

37. Open Graph dinâmico por viagem: og:title = nome da viagem, og:description = cidades + datas. Criar Netlify Function /api/og que gera HTML com meta tags dinâmicas baseadas no slug da viagem. Ou usar _redirects pra servir meta tags por viagem
38. Botão "Compartilhar" copia mensagem formatada: "Entra no app da nossa viagem pra [cidades]! [emoji] [link]" + toast "Copiado!"
39. Gerar QR code do link de convite usando canvas ou lib qrcode leve. Botão "QR Code" ao lado de "Compartilhar"

### ADMIN (itens 40-41)

40. Log de edições simples: ao salvar no admin, inserir registro em nova tabela `edit_log (id, viagem_id, user_id, acao TEXT, created_at)`. Mostrar na tela admin: "Última edição: Sidney, há 2h"
41. Preview antes de salvar: ao editar atividade, mostrar card de preview embaixo do formulário mostrando como vai ficar

### CONTATOS (itens 42-44)

42. Botão "+ Adicionar contato" pra contatos personalizados. Tabela `contatos (id, viagem_id, nome, telefone, categoria, endereco)`. Categorias: hotel, restaurante, emergência, transporte, guia, outro
43. Toggle "Favoritar" em cada contato → favoritos ficam no topo (campo `favorito BOOLEAN`)
44. Botão WhatsApp: além de tel:, adicionar link `https://wa.me/55NUMERO` (limpar número, só dígitos)

### PERFIL (itens 45-47)

45. Trocar senha: na página /conta, seção "Alterar senha" com campos senha atual + nova senha + confirmar
46. Deletar conta: botão vermelho "Excluir minha conta" → confirmação → DELETE do user + todas viagens onde é owner + CASCADE. Mensagem: "Todos os seus dados serão apagados permanentemente"
47. Toggle notificações: placeholder pra futuro. Switch "Receber notificações" (salva preferência mas não faz nada ainda)

### PERFORMANCE / TÉCNICO (itens 48-51)

48. Offline: detectar navigator.onLine. Quando offline, mostrar banner fixo no topo "📡 Sem conexão — dados podem estar desatualizados". Quando voltar online, remover banner + re-fetch
49. Cache do roteiro: salvar último roteiro carregado no localStorage por viagem. Ao abrir, mostrar cache primeiro, atualizar em background
50. Lazy loading: fotos de perfil com loading="lazy" nos <img>
51. Skeleton loading: componente Skeleton.jsx (divs animadas pulsando). Usar enquanto carrega roteiro, chat, checklist em vez de spinner

### MICRO-DETALHES (itens 52-57)

52. Vibração: navigator.vibrate(50) ao marcar item do checklist (só se suportado)
53. Som: não implementar agora (complexo com PWA), pular
54. Scroll to top: botão flutuante "↑" que aparece quando scrollou mais de 500px
55. Datas em português: formatar todas com Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }) → "10 de julho"
56. Fuso horário: mostrar timezone do destino no card do dia. Usar mapeamento simples cidade→timezone
57. Emoji no título: sugerir emoji baseado na cidade. Mapeamento básico: {"Gramado": "🌲", "Rio de Janeiro": "🏖️", "São Paulo": "🌆", "Paris": "🗼", "Florianópolis": "🏖️"} + fallback pro emoji do tema

---

## MIGRATIONS SQL NECESSÁRIAS

```sql
-- Tema na viagem
ALTER TABLE viagens ADD COLUMN IF NOT EXISTS tema TEXT DEFAULT 'cidade';

-- Notas nas atividades
ALTER TABLE roteiro_atividades ADD COLUMN IF NOT EXISTS notas TEXT;

-- Reply no chat
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES messages(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- Reações
CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions_all" ON reactions FOR ALL USING (true) WITH CHECK (true);

-- Last seen chat
ALTER TABLE viagem_membros ADD COLUMN IF NOT EXISTS last_seen_chat TIMESTAMPTZ;

-- Checklist melhorias
ALTER TABLE checklist ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES users(id);
ALTER TABLE checklist ADD COLUMN IF NOT EXISTS prazo DATE;
ALTER TABLE checklist DROP CONSTRAINT IF EXISTS checklist_categoria_check;
ALTER TABLE checklist ADD CONSTRAINT checklist_categoria_check CHECK (categoria IN ('antes', 'durante', 'malas', 'documentos', 'ingressos', 'reservas'));

-- Contatos por viagem
CREATE TABLE IF NOT EXISTS contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID REFERENCES viagens(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  endereco TEXT,
  categoria TEXT DEFAULT 'outro' CHECK (categoria IN ('hotel', 'restaurante', 'emergencia', 'transporte', 'guia', 'outro')),
  favorito BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contatos_all" ON contatos FOR ALL USING (true) WITH CHECK (true);

-- Log de edições
CREATE TABLE IF NOT EXISTS edit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID REFERENCES viagens(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  acao TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE edit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edit_log_all" ON edit_log FOR ALL USING (true) WITH CHECK (true);

-- Reset de senha
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_expires TIMESTAMPTZ;

-- Realtime nas novas tabelas
ALTER PUBLICATION supabase_realtime ADD TABLE reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE contatos;
```

---

## ORDEM DE EXECUÇÃO SUGERIDA

Agrupar por impacto + velocidade:

**Batch 1 — Visual (tema neutro + temas)**
A1, A2, A3

**Batch 2 — Fluxo principal**
B1, B2, B3, B4, B5

**Batch 3 — Cadastro/Dashboard**
1-14

**Batch 4 — Roteiro**
15-21

**Batch 5 — IA/Planejar**
22-26

**Batch 6 — Chat**
27-31

**Batch 7 — Checklist + Contatos**
32-36, 42-44

**Batch 8 — Share + Admin**
37-41

**Batch 9 — Perfil + Performance + Micro**
45-57

Migrations SQL rodar ANTES de tudo.

---

## NÃO QUEBRAR NADA

- Login, viagens, roteiro, IA streaming, chat, checklist, admin, share — tudo continua
- ferias-2026.netlify.app intocado
- Planos Free/Pro/Grupo (Sprint 3) continua

Commit, push e deploy.
