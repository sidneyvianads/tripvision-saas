import { Link, useNavigate } from "react-router-dom";
import { Sparkles, MessageCircle, CalendarCheck2, Users, CheckSquare, Smartphone, Share2, Search, MessagesSquare, ArrowRight } from "lucide-react";
import Snow from "../components/ambient/Snow";
import Pines from "../components/ambient/Pines";
import Mountains from "../components/ambient/Mountains";
import PricingSection from "../components/PricingSection";

export default function Landing() {
  const navigate = useNavigate();
  const goSignup = () => navigate("/welcome?mode=signup");
  const goLogin  = () => navigate("/welcome");

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Header fixo */}
      <header
        className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md"
        style={{
          background: "rgba(15, 27, 45, 0.85)",
          borderBottom: "1px solid rgba(124, 185, 232, 0.18)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="font-display font-extrabold text-[#E8F0FE] text-lg flex items-center gap-1.5">
            <span>❄️</span> TripVision
          </Link>
          <div className="flex-1" />
          <Link to="/precos" className="text-sm text-[#7CB9E8] hover:text-[#E8F0FE] font-display font-bold hidden sm:inline">
            Preços
          </Link>
          <button
            onClick={goLogin}
            className="text-sm text-[#7CB9E8] hover:text-[#E8F0FE] font-display font-bold"
          >
            Entrar
          </button>
          <button
            onClick={goSignup}
            className="text-sm font-display font-extrabold text-white px-3 py-1.5 rounded-full"
            style={{ background: "linear-gradient(135deg, #E8834A 0%, #D4A574 100%)", boxShadow: "0 2px 8px rgba(232, 131, 74, 0.40)" }}
          >
            Criar conta grátis
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-28 pb-16 px-4 gradient-night overflow-hidden">
        <Snow count={50} />
        <Mountains className="h-24 opacity-50" color="#7CB9E8" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-display font-extrabold tracking-widest uppercase mb-4"
               style={{ background: "rgba(124, 185, 232, 0.15)", color: "#7CB9E8", border: "1px solid rgba(124, 185, 232, 0.30)" }}>
            <Sparkles className="w-3 h-3" /> Planejamento conversacional com IA
          </div>

          <h1 className="text-4xl sm:text-6xl font-display font-extrabold text-snow leading-tight tracking-tight">
            Planeje sua viagem<br />
            <span style={{ background: "linear-gradient(135deg, #7CB9E8 0%, #D4A574 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              conversando.
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-[#E8F0FE]/85 mt-5 max-w-2xl mx-auto">
            A IA pesquisa hotéis, restaurantes e passeios com <strong className="text-[#7CB9E8]">preços reais</strong> e
            monta o roteiro pra você. Compartilhe com o grupo em 1 clique.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              onClick={goSignup}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-base font-display font-extrabold text-white"
              style={{ background: "linear-gradient(135deg, #E8834A 0%, #D4A574 100%)", boxShadow: "0 8px 24px rgba(232, 131, 74, 0.40)" }}
            >
              Começar grátis <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => document.getElementById("como-funciona")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-base font-display font-bold"
              style={{ background: "rgba(124, 185, 232, 0.12)", color: "#E8F0FE", border: "1px solid rgba(124, 185, 232, 0.40)" }}
            >
              Como funciona
            </button>
          </div>

          <p className="text-xs text-[#7CB9E8]/70 mt-4 font-display">
            ❄️ Sem cartão. Crie em 30s. Cancele quando quiser.
          </p>
        </div>

        {/* Mockup do app */}
        <div className="max-w-5xl mx-auto mt-12 px-2 relative z-10">
          <AppMockup />
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="px-4 py-14" style={{ background: "linear-gradient(180deg, #0F1B2D 0%, #1A3A4A 100%)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="text-xs font-display font-extrabold tracking-widest text-[#7CB9E8] uppercase">3 passos</div>
            <h2 className="text-3xl sm:text-4xl text-snow font-display font-extrabold mt-2">Roteiro pronto em minutos</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Step n={1} icon={MessagesSquare} title="Conte sobre sua viagem" desc='"Vou pra Gramado com a família, 5 dias, hotel Serra Azul, chegando dia 10/07 às 14h."' />
            <Step n={2} icon={Search} title="A IA pesquisa tudo" desc="Hotéis, restaurantes e passeios com preço e endereço atualizados em tempo real." />
            <Step n={3} icon={CalendarCheck2} title="Roteiro pronto pra compartilhar" desc="Dia a dia montado automaticamente. Mande o link pro grupo e todos veem pelo app." />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-14" style={{ background: "linear-gradient(180deg, #1A3A4A 0%, #0F1B2D 100%)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="text-xs font-display font-extrabold tracking-widest text-[#7CB9E8] uppercase">Tudo que você precisa</div>
            <h2 className="text-3xl sm:text-4xl text-snow font-display font-extrabold mt-2">Da inspiração ao embarque</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Feature icon={Sparkles} title="Planejamento por IA" desc="Conversa natural, pesquisa preços reais." />
            <Feature icon={CalendarCheck2} title="Roteiro automático" desc="Se monta sozinho a partir da conversa." />
            <Feature icon={MessageCircle} title="Chat do grupo" desc="Todos conversam dentro do app, em tempo real." />
            <Feature icon={CheckSquare} title="Checklist compartilhado" desc="Pendências, reservas, lembretes — todos veem." />
            <Feature icon={Smartphone} title="Instala no celular" desc="PWA, funciona como app sem passar por loja." />
            <Feature icon={Share2} title="Compartilhe com 1 clique" desc="Link único, grupo entra direto na viagem." />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-4 gradient-night relative">
        <Snow count={30} />
        <PricingSection onChoose={(plano) => plano === "free" ? goSignup() : goSignup()} />
      </section>

      {/* Depoimento */}
      <section className="px-4 py-14" style={{ background: "linear-gradient(180deg, #0F1B2D 0%, #1A3A4A 100%)" }}>
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-5xl mb-3">❄️</div>
          <p className="text-xl sm:text-2xl text-snow font-display font-bold leading-relaxed">
            "Planejei <strong className="text-[#D4A574]">14 dias</strong> de viagem em <strong className="text-[#D4A574]">30 minutos</strong> conversando com a IA. O resultado virou esse produto."
          </p>
          <p className="text-[#7CB9E8] font-display font-extrabold mt-4 text-sm">— Sidney V., Recife</p>
        </div>
      </section>

      {/* CTA final */}
      <section className="relative px-4 py-16 gradient-night overflow-hidden">
        <Snow count={40} />
        <Pines className="h-24 opacity-40" color="#0A1320" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl text-snow font-display font-extrabold">Pronto pra planejar sua próxima viagem?</h2>
          <p className="text-[#E8F0FE]/80 mt-3">Comece grátis. Sem cartão de crédito.</p>
          <button
            onClick={goSignup}
            className="mt-6 inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-display font-extrabold text-white"
            style={{ background: "linear-gradient(135deg, #E8834A 0%, #D4A574 100%)", boxShadow: "0 8px 24px rgba(232, 131, 74, 0.40)" }}
          >
            Criar conta grátis <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-8" style={{ background: "#0A1320", borderTop: "1px solid rgba(124, 185, 232, 0.18)" }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#7CB9E8]/70">
          <div className="font-display font-bold">TripVision · Grupo Multvision · © 2026</div>
          <div className="flex gap-4">
            <Link to="/precos" className="hover:text-[#E8F0FE]">Preços</Link>
            <Link to="/termos" className="hover:text-[#E8F0FE]">Termos de Uso</Link>
            <Link to="/privacidade" className="hover:text-[#E8F0FE]">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, icon: Icon, title, desc }) {
  return (
    <div
      className="rounded-2xl p-5 relative"
      style={{
        background: "linear-gradient(180deg, rgba(232, 240, 254, 0.04), rgba(124, 185, 232, 0.06))",
        border: "1px solid rgba(124, 185, 232, 0.22)",
      }}
    >
      <div
        className="absolute -top-3 -left-3 w-8 h-8 rounded-full flex items-center justify-center font-display font-extrabold text-[#0F1B2D]"
        style={{ background: "linear-gradient(135deg, #7CB9E8 0%, #D4A574 100%)" }}
      >
        {n}
      </div>
      <Icon className="w-7 h-7 text-[#7CB9E8] mt-2" />
      <div className="font-display font-extrabold text-snow text-lg mt-2">{title}</div>
      <p className="text-[#E8F0FE]/75 text-sm mt-1.5">{desc}</p>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }) {
  return (
    <div
      className="rounded-2xl p-4 flex items-start gap-3"
      style={{
        background: "rgba(232, 240, 254, 0.04)",
        border: "1px solid rgba(124, 185, 232, 0.22)",
      }}
    >
      <div className="rounded-xl p-2 shrink-0" style={{ background: "rgba(124, 185, 232, 0.18)" }}>
        <Icon className="w-5 h-5 text-[#7CB9E8]" />
      </div>
      <div>
        <div className="font-display font-extrabold text-snow">{title}</div>
        <p className="text-[#E8F0FE]/75 text-sm mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

// Mockup visual representando o app — sem screenshot, totalmente CSS+SVG
function AppMockup() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto">
      {/* Chat IA */}
      <div
        className="rounded-2xl p-4 backdrop-blur-sm"
        style={{
          background: "linear-gradient(180deg, rgba(13, 27, 42, 0.85), rgba(15, 27, 45, 0.85))",
          border: "1px solid rgba(124, 185, 232, 0.30)",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.30)",
        }}
      >
        <div className="text-[10px] uppercase tracking-widest font-display font-extrabold text-[#7CB9E8]">✨ Planejar com IA</div>
        <div className="space-y-2 mt-2">
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ background: "linear-gradient(135deg, #7CB9E8, #2E86C1)" }}>❄️</div>
            <div className="rounded-2xl rounded-bl-sm px-2.5 py-1.5 text-[12px]" style={{ background: "rgba(232, 240, 254, 0.95)", color: "#0F1B2D" }}>
              Vamos pra <strong>Gramado</strong>! Já encontrei 3 hotéis bons, qual prefere?
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <div className="rounded-2xl rounded-br-sm px-2.5 py-1.5 text-[12px] text-white" style={{ background: "linear-gradient(135deg, #2E86C1, #1B4F72)" }}>
              Fechado, vamos com o Serra Azul
            </div>
          </div>
          <div className="rounded-2xl px-3 py-2 text-[11px]" style={{ background: "linear-gradient(135deg, rgba(39, 174, 96, 0.18), rgba(39, 174, 96, 0.06))", border: "1px solid rgba(39, 174, 96, 0.45)", color: "#A7F3D0" }}>
            ✅ Adicionado: <strong>Hotel Serra Azul</strong> · check-in 14h
          </div>
        </div>
      </div>

      {/* Roteiro */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: "linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(232, 240, 254, 0.95))",
          border: "1px solid rgba(124, 185, 232, 0.30)",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.30)",
        }}
      >
        <div className="text-[10px] uppercase tracking-widest font-display font-extrabold text-[#1A3A4A]/70">📅 Roteiro</div>
        <div className="space-y-2 mt-2">
          {[
            { dia: "Dia 1 · 10/07", t: "Chegada em Gramado", emoji: "🛬", cidade: "Gramado" },
            { dia: "Dia 2 · 11/07", t: "Centro + chocolate", emoji: "🍫", cidade: "Gramado" },
            { dia: "Dia 3 · 12/07", t: "Volta", emoji: "🚗", cidade: "Gramado" },
          ].map((d) => (
            <div key={d.dia} className="rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: "rgba(124, 185, 232, 0.10)", borderLeft: "3px solid #2E86C1" }}>
              <span className="text-lg">{d.emoji}</span>
              <div>
                <div className="text-[10px] font-display font-extrabold text-[#1A3A4A]/70 uppercase tabular tracking-wide">{d.dia}</div>
                <div className="font-display font-extrabold text-[#0F1B2D] text-[13px]">{d.t}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
