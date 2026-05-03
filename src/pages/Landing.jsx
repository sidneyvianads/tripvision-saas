import { Link, useNavigate } from "react-router-dom";
import { Sparkles, MessageCircle, CalendarCheck2, CheckSquare, Smartphone, Share2, Search, MessagesSquare, ArrowRight } from "lucide-react";
import PricingSection from "../components/PricingSection";

export default function Landing() {
  const navigate = useNavigate();
  const goSignup = () => navigate("/welcome?mode=signup");
  const goLogin  = () => navigate("/welcome");

  return (
    <div className="min-h-screen flex flex-col bg-app">
      {/* Header fixo */}
      <header
        className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md"
        style={{ background: "rgba(255, 255, 255, 0.92)", borderBottom: "1px solid #E5E7EB" }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="font-display font-extrabold text-[#1F2937] text-lg flex items-center gap-1.5">
            <span>🧳</span> Viajjei
          </Link>
          <div className="flex-1" />
          <Link to="/precos" className="text-sm text-[#6B7280] hover:text-[#1F2937] font-display font-bold hidden sm:inline">
            Preços
          </Link>
          <button
            onClick={goLogin}
            className="text-sm text-[#6B7280] hover:text-[#1F2937] font-display font-bold"
          >
            Entrar
          </button>
          <button
            onClick={goSignup}
            className="text-sm font-display font-extrabold text-white px-3 py-1.5 rounded-full"
            style={{ background: "#F97316", boxShadow: "0 2px 8px rgba(249, 115, 22, 0.30)" }}
          >
            Criar conta grátis
          </button>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative pt-28 pb-16 px-4 overflow-hidden"
        style={{ background: "#FFFFFF" }}
      >
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-display font-extrabold tracking-widest uppercase mb-4"
            style={{ background: "#FFF7ED", color: "#EA580C", border: "1px solid #FED7AA" }}
          >
            <Sparkles className="w-3 h-3" /> Converse e planeje
          </div>

          <h1 className="text-4xl sm:text-6xl font-display font-extrabold text-[#1F2937] leading-tight tracking-tight">
            Planeje sua viagem<br />
            <span style={{ background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              conversando.
            </span>
          </h1>
          <div className="text-2xl sm:text-3xl font-display font-extrabold mt-3 text-[#F97316]">
            Sempre Juntos.
          </div>
          <p className="text-lg sm:text-xl text-[#475569] mt-5 max-w-2xl mx-auto">
            O assistente pesquisa hotéis, restaurantes e passeios com <strong className="text-[#F97316]">preços reais</strong> e
            monta o roteiro pra você. Compartilhe com o grupo em 1 clique.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              onClick={goSignup}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-base font-display font-extrabold text-white transition"
              style={{ background: "#F97316", boxShadow: "0 8px 20px rgba(249, 115, 22, 0.35)" }}
            >
              Criar conta grátis <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => document.getElementById("como-funciona")?.scrollIntoView({ behavior: "smooth" })}
              className="btn-ghost"
            >
              Como funciona
            </button>
          </div>

          <p className="text-xs text-[#6B7280] mt-4 font-display">
            Sem cartão. Crie em 30s. Cancele quando quiser.
          </p>
        </div>

        {/* Mockup */}
        <div className="max-w-5xl mx-auto mt-12 px-2 relative z-10">
          <AppMockup />
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="px-4 py-14 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="text-xs font-display font-extrabold tracking-widest text-[#6366F1] uppercase">3 passos</div>
            <h2 className="text-3xl sm:text-4xl text-[#1F2937] font-display font-extrabold mt-2">Roteiro pronto em minutos</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Step n={1} icon={MessagesSquare} title="Conte sobre sua viagem" desc='"Vou pra Gramado com a família, 5 dias, hotel Serra Azul, chegando dia 10/07 às 14h."' />
            <Step n={2} icon={Search} title="O assistente pesquisa tudo" desc="Hotéis, restaurantes e passeios com preço e endereço atualizados." />
            <Step n={3} icon={CalendarCheck2} title="Roteiro pronto pra compartilhar" desc="Dia a dia montado automaticamente. Mande o link pro grupo e todos veem pelo celular." />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-14 bg-soft">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="text-xs font-display font-extrabold tracking-widest text-[#6366F1] uppercase">Tudo que você precisa</div>
            <h2 className="text-3xl sm:text-4xl text-[#1F2937] font-display font-extrabold mt-2">Da inspiração ao embarque</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Feature icon={Sparkles} title="Assistente inteligente" desc="Conversa natural, pesquisa preços reais." />
            <Feature icon={CalendarCheck2} title="Roteiro automático" desc="Se monta sozinho a partir da conversa." />
            <Feature icon={MessageCircle} title="Chat do grupo" desc="Todos conversam dentro do app — atualiza na hora." />
            <Feature icon={CheckSquare} title="Checklist compartilhado" desc="Pendências, reservas, lembretes — todos veem." />
            <Feature icon={Smartphone} title="Instala como app" desc="Funciona no celular como qualquer aplicativo, sem loja." />
            <Feature icon={Share2} title="Compartilhe com 1 clique" desc="Link único, grupo entra direto na viagem." />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-4 bg-white">
        <PricingSection onChoose={() => goSignup()} />
      </section>

      {/* Depoimento */}
      <section className="px-4 py-14 bg-soft">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-5xl mb-3">💬</div>
          <p className="text-xl sm:text-2xl text-[#1F2937] font-display font-bold leading-relaxed">
            "Planejei <strong className="text-[#6366F1]">14 dias</strong> de viagem em <strong className="text-[#6366F1]">30 minutos</strong> conversando com a IA. O resultado virou esse produto."
          </p>
          <p className="text-[#6B7280] font-display font-extrabold mt-4 text-sm">— Sidney V., Recife</p>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-4 py-16" style={{ background: "#F8FAFC" }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl text-[#0F172A] font-display font-extrabold">Pronto pra planejar sua próxima viagem?</h2>
          <p className="text-[#475569] mt-3">Comece grátis. Sem cartão de crédito.</p>
          <button
            onClick={goSignup}
            className="mt-6 inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-display font-extrabold text-white transition"
            style={{ background: "#F97316", boxShadow: "0 8px 24px rgba(249, 115, 22, 0.30)" }}
          >
            Criar conta grátis <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      <footer className="px-4 py-8 bg-white" style={{ borderTop: "1px solid #E5E7EB" }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#6B7280]">
          <div className="font-display font-bold">Viajjei · Sempre Juntos · Grupo Multvision · © 2026</div>
          <div className="flex gap-4">
            <Link to="/precos" className="hover:text-[#1F2937]">Preços</Link>
            <Link to="/termos" className="hover:text-[#1F2937]">Termos de Uso</Link>
            <Link to="/privacidade" className="hover:text-[#1F2937]">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, icon: Icon, title, desc }) {
  return (
    <div className="card p-5 relative">
      <div
        className="absolute -top-3 -left-3 w-8 h-8 rounded-full flex items-center justify-center font-display font-extrabold text-white"
        style={{ background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)" }}
      >
        {n}
      </div>
      <Icon className="w-7 h-7 text-[#6366F1] mt-2" />
      <div className="font-display font-extrabold text-[#1F2937] text-lg mt-2">{title}</div>
      <p className="text-[#4B5563] text-sm mt-1.5">{desc}</p>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className="rounded-xl p-2 shrink-0" style={{ background: "#EEF2FF" }}>
        <Icon className="w-5 h-5 text-[#6366F1]" />
      </div>
      <div>
        <div className="font-display font-extrabold text-[#1F2937]">{title}</div>
        <p className="text-[#4B5563] text-sm mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function AppMockup() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto">
      {/* Chat IA */}
      <div className="card p-4">
        <div className="text-[10px] uppercase tracking-widest font-display font-extrabold text-[#6366F1]">✨ Planejar com IA</div>
        <div className="space-y-2 mt-2">
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}>✨</div>
            <div className="rounded-2xl rounded-bl-sm px-2.5 py-1.5 text-[12px]" style={{ background: "#F3F4F6", color: "#1F2937" }}>
              Vamos pra <strong>Gramado</strong>! Já encontrei 3 hotéis bons, qual prefere?
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <div className="rounded-2xl rounded-br-sm px-2.5 py-1.5 text-[12px] text-white" style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}>
              Fechado, vamos com o Serra Azul
            </div>
          </div>
          <div className="rounded-2xl px-3 py-2 text-[11px]" style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857" }}>
            ✅ Adicionado: <strong>Hotel Serra Azul</strong> · check-in 14h
          </div>
        </div>
      </div>

      {/* Roteiro */}
      <div className="card p-4">
        <div className="text-[10px] uppercase tracking-widest font-display font-extrabold text-[#6B7280]">📅 Roteiro</div>
        <div className="space-y-2 mt-2">
          {[
            { dia: "Dia 1 · 10/07", t: "Chegada em Gramado", emoji: "🛬" },
            { dia: "Dia 2 · 11/07", t: "Centro + chocolate", emoji: "🍫" },
            { dia: "Dia 3 · 12/07", t: "Volta", emoji: "🚗" },
          ].map((d) => (
            <div key={d.dia} className="rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: "#EEF2FF", borderLeft: "3px solid #6366F1" }}>
              <span className="text-lg">{d.emoji}</span>
              <div>
                <div className="text-[10px] font-display font-extrabold text-[#6B7280] uppercase tabular tracking-wide">{d.dia}</div>
                <div className="font-display font-extrabold text-[#1F2937] text-[13px]">{d.t}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
