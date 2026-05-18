# ADR 0001 — Claude Haiku 4.5 como IA primária do Jei

**Status**: Aceito
**Data**: 2026-01 (migração final em 2026-02; histórico de tentativas anteriores documentado abaixo)
**Decisores**: Sidney (founder/eng lead)
**Revisitar quando**: Anthropic descontinuar Haiku 4.5 OU custo passar ~10% da receita OU competidor tiver web search nativo com latência menor.

## Contexto

O Jei é o concierge de viagem do Viajjei. Tem dois flows distintos:
- **`/api/plan`** (streaming SSE) — monta roteiro estruturado: parse de JSON com `roteiro_dias[]` + `roteiro_atividades[]` aninhado, salva no Postgres. Precisa de **seguimento estrito de instrução** (schema) e **acesso a web** (preços reais de hotel/passeio).
- **`/api/chat`** (streaming SSE) — chat livre depois do roteiro pronto. Conversa natural sobre a viagem.

Exigências:
1. **Streaming server-sent events** — usuário vê texto aparecer, latência percebida cai 3-5×.
2. **Web search nativo** — pesquisar Booking, Tripadvisor, Google Maps em runtime sem implementar tool calling próprio.
3. **Português técnico fluente** — preços em BRL, "passeio", "hotel boutique", etc.
4. **Seguimento de schema JSON** — parser quebra se modelo improvisar.
5. **Custo previsível** — margem aceita até ~R$0.10/conversa.

## Decisão

**Claude Haiku 4.5 (Anthropic)** como modelo primário, com chain de fallback:

```
Claude Haiku 4.5  →  GPT-4o-mini  →  Gemini 2.5 Flash
```

Streaming SSE em todos. Fallback automático em 5xx ou network error (`netlify/functions/_lib/retry.mjs` faz 2 attempts, depois cai pro próximo provider).

## Justificativa

| Critério | Claude Haiku 4.5 | GPT-4o-mini | Gemini 2.5 Flash |
|---|---|---|---|
| Seguimento de schema | ✅ Excelente — raramente improvisa | ⚠️ Médio — adiciona campos ad-hoc | ⚠️ Médio |
| Web search nativo | ✅ Built-in tool (`web_search`) | ❌ Precisa Bing/Tavily separado | ❌ |
| Streaming SSE | ✅ Estável | ✅ Estável | ⚠️ Quebra mid-stream em testes |
| PT-BR | ✅ Fluente | ✅ Fluente | ✅ Fluente |
| Latência first-byte | ~800ms | ~600ms | ~700ms |
| Custo input | $1.00/1M tokens | $0.15/1M | $0.075/1M |
| Custo output | $5.00/1M tokens | $0.60/1M | $0.30/1M |
| Web search add | $10/1k searches | n/a | n/a |
| Custo estimado/conversa (5 turns) | ~$0.05 | ~$0.01 | ~$0.008 |

Haiku 4.5 é **5×–7× mais caro** que GPT-4o-mini, mas:

1. **Web search nativo elimina ~150 linhas de código** (Tavily/Brave + parsing + budget control). Em GPT-4o-mini precisaríamos manter um sub-serviço de search.
2. **Schema compliance**: testamos GPT-4o-mini em janeiro/2026 e ele adicionava campos como `"observacoes"` e `"dica_local"` que o parser não esperava → roteiros parcialmente salvos. Haiku segue o schema literalmente.
3. **Margem aceitável**: 5 turns × $0.05 = $0.25 = R$1.50. Pro plano custa R$14.90/mês — 10% da receita por user pesado. OK pra MVP.

## Trade-offs aceitos

- **Vendor lock-in parcial**: a chain de fallback existe pra mitigar, mas se Anthropic descontinuar Haiku 4.5 sem aviso, qualidade cai pra GPT-4o-mini (segundo melhor) até portarmos.
- **Custo crescente com sucesso**: se MAU passar 10k, custo de IA passa de ~$50/mês pra ~$500/mês. Plano `grupo` (R$29.90) precisa pelo menos 17 grupos pra cobrir.
- **Dependência de web search da Anthropic**: se a API mudar contract ou subir preço, refazemos o tool calling.

## Histórico de tentativas anteriores

- **Gemini 2.0 Flash (out/2025)**: descontinuado pela Google em jan/2026, forçou migração.
- **Gemini 2.5 Flash (jan/2026)**: streaming SSE quebrava mid-response em ~30% dos casos — texto travava ao chegar em tool result. Não confiável pra produção.
- **GPT-4o-mini (jan/2026, tentativa primário)**: ignorava instrução "responda APENAS JSON válido" em ~15% das chamadas → parser falhava com texto pré-JSON. Movido pra fallback.
- **Claude Sonnet 3.5 (dez/2025)**: qualidade excelente mas custo 4× Haiku 4.5 com diferença qualitativa marginal pro nosso use case. Não justificou.
- **DeepSeek R1 (testado fev/2026)**: latência inaceitável em sa-east-1 (~3s first byte). Pulou.
- **Qwen 2.5 (testado fev/2026)**: PT-BR fluente mas sem web search nativo. Mesma situação do GPT.

## Implementação

- `netlify/functions/plan.mjs` — chain Claude → OpenAI → Gemini com retry interno por provider.
- `netlify/functions/chat.mjs` — mesma chain.
- Ambos com prompt caching habilitado no Anthropic (system prompt cacheable, reduz input cost ~70% em conversas multi-turn).
- Modelo via string literal `"claude-haiku-4-5"` — alias estável da Anthropic, pega o snapshot atual.

## Quando revisitar

- **Anthropic descontinua Haiku 4.5** → migrar pra modelo `claude-haiku-*` sucessor ou avaliar Claude Sonnet sob custo revisado.
- **Custo > 10% da receita** → testar GPT-4o-mini novamente com novo prompt engineering pra forçar schema compliance.
- **Competidor com web search nativo + preço melhor** → re-benchmark.
- **Stream-aware tool calling no GPT/Gemini** → reabre comparação séria.

## Referências

- Pricing Anthropic: https://www.anthropic.com/pricing
- Streaming SSE docs: https://docs.anthropic.com/en/api/messages-streaming
- Comparação interna em `netlify/functions/plan.mjs:1-50` (header de contexto técnico)
