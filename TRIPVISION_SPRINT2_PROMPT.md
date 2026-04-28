# TripVision SaaS — Sprint 2: Motor IA Conversacional

## Contexto

O Sprint 1 entregou a fundação multi-tenant (cadastro, viagens, roteiro por formulário, chat, checklist, admin, share link). Agora vamos construir o DIFERENCIAL do produto: o fluxo onde o usuário **conversa com a IA** e o roteiro vai se montando automaticamente, com pesquisa online de preços, restaurantes, hotéis e passeios em tempo real.

Repo: sidneyvianads/tripvision-saas
Site: https://tripvision-saas.netlify.app
Supabase: mucwvugadqksassosixn

Skills:
```
/read supabase-developer
/read webapp-testing
/read my-claude-setup
```

---

## O que construir

### 1. NOVO ENDPOINT — /api/plan (Netlify Function)

Esse é o coração do produto. Uma Netlify Function que:

- Recebe: mensagem do usuário + histórico da conversa + dados da viagem (nome, datas, cidades, pessoas)
- Chama Claude API com:
  - **web_search_20250305** habilitado (pesquisa real de preços, restaurantes, hotéis, horários)
  - System prompt completo de planejador de viagem
  - Histórico das últimas 20 mensagens
- Retorna: resposta da IA + opcionalmente um JSON estruturado `<roteiro_update>` com atividades pra inserir no roteiro

```javascript
// netlify/functions/plan.mjs
export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { message, history = [], viagem } = await req.json();

  const SYSTEM_PROMPT = `Você é o TripVision, um planejador de viagens inteligente e simpático.

DADOS DA VIAGEM:
- Nome: ${viagem.nome}
- Datas: ${viagem.data_inicio} a ${viagem.data_fim}
- Cidades: ${viagem.cidades?.join(', ') || 'a definir'}
- Pessoas: ${viagem.num_pessoas || 'a definir'}
- Descrição: ${viagem.descricao || 'nenhuma'}

ROTEIRO ATUAL:
${viagem.roteiro_resumo || 'Vazio — nenhum dia montado ainda.'}

SEU OBJETIVO:
Ajudar o usuário a montar o roteiro completo desta viagem conversando naturalmente.

COMO AGIR:
1. ENTENDER: pergunte sobre preferências, orçamento, estilo (aventura, relax, cultura, gastronomia)
2. PESQUISAR: use web search pra encontrar restaurantes, hotéis, passeios COM preço e endereço
3. SUGERIR: apresente 2-3 opções, deixe o usuário escolher
4. MONTAR: a cada decisão, encaixe no roteiro com horário, endereço e observações
5. ALERTAR: horários de funcionamento, distâncias, clima, documentos necessários, reservas

REGRAS:
- Responda em português brasileiro
- Use emojis com moderação (não exagere)
- Seja direto e prático — pergunte UMA coisa por vez
- Quando pesquisar, SEMPRE traga preço estimado e endereço
- Sugira mas deixe o usuário decidir
- A cada bloco de decisões, resuma o que ficou definido
- NÃO invente preços — pesquise de verdade via web search
- Se não encontrar preço, diga "não encontrei o preço atualizado, vale confirmar"

FORMATO DE SAÍDA:
Sempre responda com texto natural pro usuário.
Quando tiver atividades DEFINIDAS pelo usuário (não apenas sugestões), adicione no final um bloco JSON entre tags:

<roteiro_update>
[
  {
    "action": "add_day",
    "dia_numero": 1,
    "data": "2026-07-10",
    "titulo": "Chegada em Gramado",
    "cidade": "Gramado",
    "hotel": "Hotel Laghetto Stilo Centro",
    "hotel_telefone": "(54) 3286-1800",
    "hotel_endereco": "Rua Madre Verônica, 27",
    "alerta": null
  },
  {
    "action": "add_activity",
    "dia_numero": 1,
    "horario": "14:00",
    "titulo": "Check-in no hotel",
    "tipo": "hospedagem",
    "descricao": "Rua Madre Verônica, 27, Centro",
    "preco": null,
    "status": "confirmado",
    "endereco": "Rua Madre Verônica, 27",
    "ordem": 1
  },
  {
    "action": "add_activity",
    "dia_numero": 1,
    "horario": "15:30",
    "titulo": "Rua Coberta + chocolate quente",
    "tipo": "passeio",
    "descricao": "Passeio livre pelo centro, lojas de chocolate, cafés",
    "preco": "Gratuito",
    "status": "confirmado",
    "endereco": "Rua Coberta, Centro de Gramado",
    "ordem": 2
  },
  {
    "action": "update_day",
    "dia_numero": 1,
    "field": "hotel",
    "value": "Pousada Nova"
  },
  {
    "action": "remove_activity",
    "dia_numero": 2,
    "ordem": 3
  }
]
</roteiro_update>

Actions possíveis:
- add_day: cria um dia novo no roteiro
- add_activity: adiciona atividade a um dia existente
- update_day: atualiza campo de um dia (titulo, cidade, hotel, alerta, etc)
- update_activity: atualiza uma atividade existente (por dia_numero + ordem)
- remove_activity: remove atividade (por dia_numero + ordem)
- remove_day: remove dia inteiro

IMPORTANTE:
- Só gere <roteiro_update> quando o usuário CONFIRMAR algo. Se está apenas sugerindo, não gere.
- Se o usuário diz "vamos com a opção 2", gere o update.
- Se o usuário diz "o que sugere pra almoço?", NÃO gere update — apenas sugira.
- Após gerar update, confirme no texto: "Adicionei ao roteiro: [resumo]"`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [...history.slice(-20), { role: "user", content: message }],
      }),
    });

    const data = await response.json();
    
    // Extrair texto de todos os content blocks
    const textBlocks = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    return new Response(JSON.stringify({ 
      reply: textBlocks,
      raw_content: data.content // mandar raw pra debug se precisar
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Plan API error:", error);
    return new Response(JSON.stringify({ 
      reply: "Desculpe, tive um problema ao processar. Tente novamente.",
      error: error.message 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/plan" };
```

---

### 2. PARSER DE <roteiro_update> NO FRONTEND

Criar um módulo que:
- Recebe a resposta da IA
- Extrai o JSON entre `<roteiro_update>` e `</roteiro_update>` (se existir)
- Executa as ações no Supabase:
  - `add_day` → INSERT em roteiro_dias
  - `add_activity` → INSERT em roteiro_atividades
  - `update_day` → UPDATE em roteiro_dias
  - `update_activity` → UPDATE em roteiro_atividades
  - `remove_activity` → DELETE em roteiro_atividades
  - `remove_day` → DELETE em roteiro_dias (CASCADE nas atividades)
- Remove as tags `<roteiro_update>...</roteiro_update>` do texto exibido ao usuário
- Mostra um toast/banner: "✅ Roteiro atualizado — 2 atividades adicionadas ao Dia 1"

```javascript
// src/lib/roteiroParser.js
export function parseRoteiroUpdate(text) {
  const match = text.match(/<roteiro_update>([\s\S]*?)<\/roteiro_update>/);
  if (!match) return { cleanText: text, updates: null };
  
  const cleanText = text.replace(/<roteiro_update>[\s\S]*?<\/roteiro_update>/, '').trim();
  
  try {
    const updates = JSON.parse(match[1]);
    return { cleanText, updates };
  } catch (e) {
    console.error('Failed to parse roteiro_update JSON:', e);
    return { cleanText, updates: null };
  }
}

export async function applyRoteiroUpdates(supabase, viagemId, updates) {
  const results = [];
  
  for (const update of updates) {
    switch (update.action) {
      case 'add_day': {
        const { data, error } = await supabase.from('roteiro_dias').insert({
          viagem_id: viagemId,
          dia_numero: update.dia_numero,
          data: update.data,
          titulo: update.titulo,
          cidade: update.cidade,
          hotel: update.hotel,
          hotel_telefone: update.hotel_telefone,
          hotel_endereco: update.hotel_endereco,
          alerta: update.alerta,
          cover_emoji: update.cover_emoji || '📍',
        }).select().single();
        results.push({ action: 'add_day', dia: update.dia_numero, success: !error });
        break;
      }
      
      case 'add_activity': {
        // Buscar o dia
        const { data: dia } = await supabase
          .from('roteiro_dias')
          .select('id')
          .eq('viagem_id', viagemId)
          .eq('dia_numero', update.dia_numero)
          .maybeSingle();
        
        if (dia) {
          const { error } = await supabase.from('roteiro_atividades').insert({
            dia_id: dia.id,
            horario: update.horario,
            titulo: update.titulo,
            tipo: update.tipo || 'passeio',
            descricao: update.descricao,
            preco: update.preco,
            status: update.status || 'confirmado',
            endereco: update.endereco,
            telefone: update.telefone,
            maps_url: update.maps_url,
            ordem: update.ordem,
          });
          results.push({ action: 'add_activity', dia: update.dia_numero, titulo: update.titulo, success: !error });
        }
        break;
      }
      
      case 'update_day': {
        const { error } = await supabase
          .from('roteiro_dias')
          .update({ [update.field]: update.value })
          .eq('viagem_id', viagemId)
          .eq('dia_numero', update.dia_numero);
        results.push({ action: 'update_day', success: !error });
        break;
      }
      
      case 'remove_activity': {
        const { data: dia } = await supabase
          .from('roteiro_dias')
          .select('id')
          .eq('viagem_id', viagemId)
          .eq('dia_numero', update.dia_numero)
          .maybeSingle();
        
        if (dia) {
          const { error } = await supabase
            .from('roteiro_atividades')
            .delete()
            .eq('dia_id', dia.id)
            .eq('ordem', update.ordem);
          results.push({ action: 'remove_activity', success: !error });
        }
        break;
      }
      
      case 'remove_day': {
        const { error } = await supabase
          .from('roteiro_dias')
          .delete()
          .eq('viagem_id', viagemId)
          .eq('dia_numero', update.dia_numero);
        results.push({ action: 'remove_day', success: !error });
        break;
      }
    }
  }
  
  return results;
}
```

---

### 3. TELA DE PLANEJAMENTO IA (PlanChat.jsx)

Nova tela/tab dentro da viagem. É diferente do concierge (que responde perguntas). O PlanChat CONSTRÓI o roteiro.

**Visual:**
- Fundo: gradiente azul escuro com estrelas sutis (como o AiChat)
- Header: "Planejando: [nome da viagem]" + botão "Ver roteiro" (abre split view ou navega pro roteiro)
- Chat: bolhas de mensagem com avatar
- Quando a IA gera um `<roteiro_update>`, mostrar um card especial inline no chat:
  - Card com borda verde, ícone ✅
  - "Adicionei ao roteiro:"
  - Lista das atividades adicionadas (mini-preview)
  - Botão "Ver no roteiro" que navega pra tab de roteiro
- Input: campo + botão enviar + indicador de "pesquisando..." quando a IA usa web search (pode demorar 5-15 segundos)
- Loading: mostrar "🔍 Pesquisando..." quando demora (web search pode levar tempo)

**Fluxo:**
```
Usuário abre viagem → Tab "✨ Planejar" (nova tab entre Roteiro e Chat)
→ Se é primeira vez: mensagem de boas-vindas da IA com base nos dados da viagem
   "Olá! Vi que vocês vão pra [cidades] de [data_inicio] a [data_fim], [num_pessoas] pessoas.
    Vamos montar o roteiro juntos! Me conta: vocês vão de avião ou carro?"
→ Conversa vai e volta
→ IA pesquisa, sugere, usuário confirma
→ Roteiro vai sendo preenchido automaticamente
→ Usuário pode alternar entre tab Planejar e tab Roteiro pra ver o progresso
```

**Persistência da conversa:**
- Salvar histórico na tabela `ia_conversas` (já existe no schema)
- Ao reabrir, carregar histórico e continuar de onde parou
- System prompt inclui o roteiro ATUAL da viagem (pra IA saber o que já foi planejado)

---

### 4. CONSTRUIR RESUMO DO ROTEIRO PRO SYSTEM PROMPT

Função que monta um resumo textual do roteiro atual pra injetar no system prompt:

```javascript
// src/lib/roteiroResumo.js
export function buildRoteiroResumo(dias, atividades) {
  if (!dias || dias.length === 0) return 'Vazio — nenhum dia montado ainda.';
  
  return dias.map(dia => {
    const acts = atividades
      .filter(a => a.dia_id === dia.id)
      .sort((a, b) => a.ordem - b.ordem)
      .map(a => `  ${a.horario || '??:??'} — ${a.titulo}${a.preco ? ` (${a.preco})` : ''}`)
      .join('\n');
    
    return `Dia ${dia.dia_numero} (${dia.data || '?'}) — ${dia.titulo || dia.cidade || '?'}:
${dia.hotel ? `  Hotel: ${dia.hotel}` : ''}
${dia.alerta ? `  ⚠️ ${dia.alerta}` : ''}
${acts || '  (sem atividades ainda)'}`;
  }).join('\n\n');
}
```

---

### 5. TAB BAR ATUALIZADA

Adicionar nova tab "Planejar" com ícone Sparkles (✨) do lucide-react:

```
📅 Roteiro | ✨ Planejar | 💬 Chat | ✅ Tarefas
```

A tab "IA" (concierge) pode ser absorvida pelo Planejar. Ou manter as duas:
- ✨ Planejar = constrói o roteiro (usa /api/plan com web search)
- 🤖 IA = responde perguntas sobre o roteiro já montado (usa /api/chat, mais barato)

Recomendo SUBSTITUIR a tab IA pelo Planejar. O concierge vira um botão dentro do roteiro ("Perguntar à IA sobre este dia").

---

### 6. MENSAGEM DE BOAS-VINDAS INTELIGENTE

Quando o usuário abre o PlanChat pela primeira vez numa viagem, a IA manda uma mensagem automaticamente baseada nos dados da viagem:

```javascript
const welcomeMessage = buildWelcomeMessage(viagem);

function buildWelcomeMessage(viagem) {
  const parts = [];
  parts.push(`Olá! 👋 Vamos planejar sua viagem`);
  
  if (viagem.nome) parts.push(`"${viagem.nome}"`);
  if (viagem.cidades?.length) parts.push(`pra ${viagem.cidades.join(', ')}`);
  if (viagem.data_inicio && viagem.data_fim) parts.push(`de ${formatDate(viagem.data_inicio)} a ${formatDate(viagem.data_fim)}`);
  if (viagem.num_pessoas) parts.push(`com ${viagem.num_pessoas} pessoas`);
  
  parts.push('!\n\nMe conta um pouco mais:');
  
  if (!viagem.cidades?.length) {
    parts.push('- Pra onde vocês querem ir?');
  } else {
    parts.push('- Vocês vão de avião, carro ou ônibus?');
    parts.push('- Já têm hotel reservado ou querem sugestões?');
    parts.push('- Qual o estilo do grupo: aventura, relax, gastronomia, cultural?');
  }
  
  return parts.join(' ');
}
```

---

### 7. INDICADOR DE LOADING COM WEB SEARCH

A web search pode demorar 5-15 segundos. O UX precisa comunicar que algo está acontecendo:

- Ao enviar mensagem, mostrar bolha da IA com animação de loading
- Texto alternando: "Pensando..." → "🔍 Pesquisando restaurantes..." → "📍 Buscando preços..." → "✍️ Montando sugestões..."
- Rotacionar a cada 3 segundos
- Quando a resposta chegar, substituir pelo texto real

---

### 8. CARD DE ROTEIRO UPDATE INLINE NO CHAT

Quando a IA retorna um `<roteiro_update>`, além de aplicar no banco, mostrar um card especial no chat:

```
┌─────────────────────────────────────┐
│ ✅ Roteiro atualizado               │
│                                     │
│ Dia 1 — Chegada em Gramado         │
│   14:00 Check-in Hotel Laghetto    │
│   15:30 Rua Coberta + chocolate    │
│   19:30 Jantar no Il Piacere       │
│                                     │
│ [Ver no roteiro →]                  │
└─────────────────────────────────────┘
```

Visual: card com fundo verde escuro sutil, borda verde, cantos arredondados. Botão "Ver no roteiro" navega pra tab Roteiro.

---

### 9. SPLIT VIEW (OPCIONAL MAS DESEJÁVEL)

Em telas maiores (desktop/tablet), mostrar o chat de planejamento à esquerda e o roteiro à direita, lado a lado. Conforme a IA adiciona atividades, o roteiro atualiza em tempo real na tela ao lado.

Em mobile: manter tabs, mas o card inline + botão "Ver no roteiro" resolve.

---

### 10. ATUALIZAR /api/chat (CONCIERGE)

O endpoint /api/chat existente continua como concierge leve (sem web search, mais rápido e barato). Mas atualizar o system prompt pra incluir o roteiro atual da viagem dinamicamente:

- Receber viagem_id no request
- Buscar roteiro_dias + roteiro_atividades do Supabase
- Injetar no system prompt
- Assim o concierge sabe responder "que horas saímos amanhã?" mesmo que o roteiro tenha sido editado

---

### 11. RATE LIMITING (PROTEÇÃO DE CUSTO)

Web search custa ~US$0.01/chamada e a IA com web search pode fazer 3-5 searches por resposta. Proteger:

- Máximo 50 mensagens por viagem por dia no PlanChat (free: 5 mensagens por viagem, total)
- Mostrar contador: "32/50 mensagens restantes hoje"
- Quando esgotar: "Você usou todas as mensagens de planejamento por hoje. Volte amanhã ou faça upgrade pro plano Grupo!"
- Armazenar contagem em tabela ou no localStorage (localStorage é mais simples pro MVP)

---

### 12. NÃO QUEBRAR NADA

- Login, cadastro, minhas viagens, formulário manual, chat grupo, checklist, admin, contatos, share link, fotos — tudo continua funcionando
- Visual inverno mantido
- ferias-2026.netlify.app não é tocado

---

## Ordem de execução sugerida

1. Criar /api/plan (Netlify Function com web search)
2. Criar roteiroParser.js + roteiroResumo.js
3. Criar PlanChat.jsx (UI do chat de planejamento)
4. Integrar parser: quando IA retorna update → aplicar no Supabase → mostrar card inline
5. Atualizar TabBar (substituir IA por Planejar)
6. Mensagem de boas-vindas inteligente
7. Persistência da conversa em ia_conversas
8. Loading states (pesquisando...)
9. Rate limiting básico
10. Testar fluxo completo: criar viagem → planejar por IA → ver roteiro montado
11. Commit, push, deploy

---

## Teste de aceitação

Criar viagem "Teste Gramado 3 dias" → abrir tab Planejar → conversar:

```
Usuário: "Vou com a família, 6 pessoas, de São Paulo, de avião"
IA: [pesquisa voos] "O aeroporto mais perto é POA..."
Usuário: "Vamos alugar carro lá"
IA: [gera update dia 1] "Adicionei ao roteiro: Dia 1 — voo SP→POA + carro até Gramado"
Usuário: "Sugere hotel bom e barato"
IA: [pesquisa hotéis] "Encontrei 3 opções: 1) Hotel X R$350/noite... 2)..."
Usuário: "Vamos com o 2"
IA: [gera update] "Hotel adicionado ao Dia 1"
Usuário: "O que fazer no primeiro dia à tarde?"
IA: [pesquisa passeios] "Tem a Rua Coberta, Snowland, Mini Mundo..."
```

→ Ao final: roteiro na tab Roteiro com dias e atividades preenchidos automaticamente.

---

Commit, push e deploy.
