import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles, MessageSquare, Search, CalendarCheck, MessageCircle,
  CheckSquare, Camera, Share2, ArrowRight, Menu, X,
} from "lucide-react";
import PricingSection from "../components/PricingSection";
import Logo from "../components/Logo";

// ===== HELPERS =====================================================

function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

// fade-in-up via IntersectionObserver — adiciona classe quando entra no viewport
function Reveal({ children, className = "", delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setVisible(true); io.disconnect(); }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 600ms ${delay}ms ease-out, transform 600ms ${delay}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
    >
      {children}
    </div>
  );
}

// ===== LANDING ROOT ================================================

export default function Landing() {
  const navigate = useNavigate();
  const goSignup = () => navigate("/welcome?mode=signup");
  const goLogin  = () => navigate("/welcome");

  return (
    <div className="bg-white text-[#0F172A]">
      <Header onSignup={goSignup} onLogin={goLogin} />
      <Hero onSignup={goSignup} />
      <SocialProof />
      <HowItWorks />
      <DemoMockup />
      <Features />
      <PopularDestinations />
      <PricingBlock onChoose={goSignup} />
      <Testimonial />
      <CtaFinal onSignup={goSignup} />
      <Footer />
    </div>
  );
}

// ===== HEADER ======================================================

function Header({ onSignup, onLogin }) {
  const scrolled = useScrolled(8);
  const [open, setOpen] = useState(false);
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 transition-all"
      style={{
        background: scrolled ? "rgba(255,255,255,0.92)" : "#FFFFFF",
        backdropFilter: scrolled ? "blur(8px)" : "none",
        borderBottom: "1px solid #E2E8F0",
        boxShadow: scrolled ? "0 1px 3px rgba(15, 23, 42, 0.06)" : "none",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <Link to="/" className="flex items-center" aria-label="Viajjei">
          <Logo size={26} />
        </Link>

        <nav className="hidden md:flex items-center gap-6 ml-8">
          <Link to="/precos" className="text-sm font-display font-bold text-[#475569] hover:text-[#0F172A]">Preços</Link>
          <a href="#como-funciona" className="text-sm font-display font-bold text-[#475569] hover:text-[#0F172A]">Como funciona</a>
        </nav>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-3">
          <button onClick={onLogin} className="text-sm font-display font-bold text-[#475569] hover:text-[#0F172A]">
            Entrar
          </button>
          <button
            onClick={onSignup}
            className="text-sm font-display font-extrabold text-white px-4 py-2 rounded-full transition"
            style={{ background: "#F97316", boxShadow: "0 2px 8px rgba(249, 115, 22, 0.30)" }}
          >
            Criar conta grátis
          </button>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden p-2 rounded-lg hover:bg-[#F8FAFC]"
          aria-label="Menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-[#E2E8F0] bg-white px-4 py-3 space-y-2 animate-fade-up">
          <Link to="/precos" onClick={() => setOpen(false)} className="block py-2 text-[#475569] font-display font-bold">Preços</Link>
          <a href="#como-funciona" onClick={() => setOpen(false)} className="block py-2 text-[#475569] font-display font-bold">Como funciona</a>
          <button onClick={() => { setOpen(false); onLogin(); }} className="block w-full text-left py-2 text-[#475569] font-display font-bold">
            Entrar
          </button>
          <button
            onClick={() => { setOpen(false); onSignup(); }}
            className="block w-full text-center py-2.5 rounded-full text-white font-display font-extrabold"
            style={{ background: "#F97316" }}
          >
            Criar conta grátis
          </button>
        </div>
      )}
    </header>
  );
}

// ===== HERO ========================================================

const HERO_PHOTOS = {
  noronha:  "/fotos/noronha.jpg",
  rio:      "/fotos/rio.jpg",
  salvador: "/fotos/salvador.jpg",
};

function Hero({ onSignup }) {
  return (
    <section className="pt-28 pb-16 md:pt-32 md:pb-24 px-4 bg-white">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
        <Reveal>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-display font-extrabold tracking-widest uppercase"
            style={{ background: "#FFF7ED", color: "#EA580C", border: "1px solid #FED7AA" }}
          >
            <Sparkles className="w-3 h-3" /> Seu concierge de viagem
          </span>

          <h1 className="mt-5 font-display font-extrabold text-[#0F172A] leading-tight tracking-tight"
              style={{ fontSize: "clamp(28px, 5.2vw, 48px)" }}>
            Planeje sua viagem<br />conversando.
          </h1>

          <p className="mt-5 text-[#64748B] max-w-lg" style={{ fontSize: "clamp(16px, 1.5vw, 18px)", lineHeight: 1.6 }}>
            O <strong className="text-[#0F172A]">Jei</strong>, seu concierge de viagem, pesquisa hotéis, restaurantes e passeios com{" "}
            <strong className="text-[#0F172A]">preços reais</strong> e monta o roteiro pra você.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              onClick={onSignup}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-white font-display font-extrabold transition active:scale-[0.98]"
              style={{
                background: "#F97316",
                fontSize: 17,
                boxShadow: "0 8px 24px rgba(249, 115, 22, 0.32)",
              }}
            >
              Começar grátis <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <p className="mt-3 text-[13px] text-[#94A3B8] font-display font-bold">
            Sem cartão. Crie em 30 segundos.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <PhotoCollage />
        </Reveal>
      </div>
    </section>
  );
}

function PhotoCollage() {
  return (
    <div className="relative aspect-[4/5] sm:aspect-[5/4] md:aspect-square max-w-[480px] mx-auto">
      {/* Foto principal — Noronha */}
      <div
        className="absolute inset-0 rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 20px 60px rgba(15, 23, 42, 0.18)" }}
      >
        <img
          src={HERO_PHOTOS.noronha}
          alt="Fernando de Noronha"
          loading="eager"
          className="w-full h-full object-cover"
        />
      </div>
      {/* Foto sobreposta — Rio, canto superior esquerdo */}
      <div
        className="absolute -top-4 -left-4 w-[42%] aspect-[4/3] rounded-2xl overflow-hidden hidden sm:block"
        style={{ boxShadow: "0 12px 32px rgba(15, 23, 42, 0.22)", border: "4px solid white" }}
      >
        <img src={HERO_PHOTOS.rio} alt="Rio de Janeiro" loading="eager" className="w-full h-full object-cover" />
      </div>
      {/* Foto sobreposta — Salvador, canto inferior direito */}
      <div
        className="absolute -bottom-6 -right-4 w-[48%] aspect-[4/3] rounded-2xl overflow-hidden hidden sm:block"
        style={{ boxShadow: "0 12px 32px rgba(15, 23, 42, 0.22)", border: "4px solid white" }}
      >
        <img src={HERO_PHOTOS.salvador} alt="Salvador" loading="eager" className="w-full h-full object-cover" />
      </div>
      {/* Pin emoji decorativo */}
      <div
        className="absolute top-6 right-6 w-12 h-12 rounded-full flex items-center justify-center text-2xl"
        style={{ background: "white", boxShadow: "0 8px 20px rgba(15, 23, 42, 0.18)" }}
      >
        ✈️
      </div>
    </div>
  );
}

// ===== SOCIAL PROOF ================================================

function SocialProof() {
  const avatars = ["#F97316", "#6366F1", "#10B981", "#F59E0B", "#EC4899"];
  return (
    <section className="py-10 px-4" style={{ background: "#F8FAFC" }}>
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-6 text-center sm:text-left">
        <div className="flex items-center -space-x-2">
          {avatars.map((c, i) => (
            <div
              key={i}
              className="w-9 h-9 rounded-full border-2 border-white"
              style={{ background: `linear-gradient(135deg, ${c}, ${avatars[(i + 2) % avatars.length]})` }}
            />
          ))}
        </div>
        <div>
          <div className="font-display font-extrabold text-[#0F172A]">+100 viagens planejadas</div>
          <div className="text-[13px] text-[#64748B] flex items-center gap-1.5 justify-center sm:justify-start">
            <span className="text-[#F59E0B]">⭐⭐⭐⭐⭐</span>
            <span><strong className="text-[#0F172A]">4.9</strong> de satisfação</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ===== COMO FUNCIONA ===============================================

function HowItWorks() {
  const steps = [
    { n: 1, Icon: MessageSquare, title: "Conte sobre sua viagem",
      desc: "Fale o destino, as datas e com quem vai. Como conversar com um amigo." },
    { n: 2, Icon: Search, title: "O Jei pesquisa tudo",
      desc: "Hotéis, restaurantes e passeios com preços reais. Sugere as melhores opções." },
    { n: 3, Icon: CalendarCheck, title: "Roteiro pronto",
      desc: "Dia a dia organizado. Compartilhe com o grupo e todo mundo acompanha." },
  ];
  return (
    <section id="como-funciona" className="py-20 md:py-28 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <Reveal className="text-center mb-12">
          <h2 className="font-display font-extrabold text-[#0F172A]" style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>
            Como funciona
          </h2>
          <p className="text-[#64748B] mt-3 text-base">Planeje em 3 passos simples</p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <div
                className="bg-white rounded-2xl p-7 h-full transition-all hover:-translate-y-1"
                style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)" }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center font-display font-extrabold text-white text-lg"
                  style={{ background: "#F97316" }}
                >
                  {s.n}
                </div>
                <s.Icon className="w-8 h-8 mt-5 text-[#0F172A]" strokeWidth={1.6} />
                <div className="font-display font-extrabold text-[#0F172A] text-lg mt-4">{s.title}</div>
                <p className="text-[#64748B] text-sm mt-2 leading-relaxed">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== DEMO MOCKUP =================================================

function DemoMockup() {
  return (
    <section className="py-20 md:py-28 px-4" style={{ background: "#F8FAFC" }}>
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-12">
          <h2 className="font-display font-extrabold text-[#0F172A]" style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>
            Veja na prática
          </h2>
          <p className="text-[#64748B] mt-3 text-base">Conversa do lado, roteiro pronto do outro.</p>
        </Reveal>

        <Reveal delay={120}>
          <div
            className="bg-white rounded-2xl overflow-hidden grid md:grid-cols-2 gap-0"
            style={{ boxShadow: "0 20px 60px rgba(15, 23, 42, 0.10)", border: "1px solid #E2E8F0" }}
          >
            {/* Lado esquerdo — chat */}
            <div className="p-5 md:p-6" style={{ background: "#FFF7ED" }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: "#F97316", color: "white" }}>✨</div>
                <div className="font-display font-extrabold text-[#0F172A] text-sm">Planejar com o Jei</div>
              </div>

              {/* msg user */}
              <div className="flex justify-end mb-2">
                <div className="rounded-2xl rounded-br-sm px-3 py-2 text-sm text-white max-w-[80%]" style={{ background: "#F97316" }}>
                  Vou pra Gramado 3 dias com a família, hotel Serra Azul, chegando 10/07 às 14h.
                </div>
              </div>

              {/* msg bot */}
              <div className="flex justify-start mb-2">
                <div className="rounded-2xl rounded-bl-sm px-3 py-2 text-sm bg-white max-w-[85%]" style={{ border: "1px solid #E2E8F0", color: "#0F172A" }}>
                  Show! Já anotei: <strong>3 dias em Gramado</strong>, chegada <strong>10/07 às 14h</strong> no Hotel Serra Azul. Vou montar os 3 dias.
                </div>
              </div>

              {/* card verde "roteiro atualizado" */}
              <div className="rounded-2xl px-3 py-2.5 text-sm text-white mt-3" style={{ background: "#065F46" }}>
                <div className="font-display font-extrabold text-[12px] flex items-center gap-1.5">✅ Roteiro atualizado</div>
                <div className="text-[11px] mt-1.5 space-y-0.5" style={{ color: "#D1FAE5" }}>
                  <div>📍 Dia 1 — Chegada</div>
                  <div>📍 Dia 2 — Centro + chocolate</div>
                  <div>📍 Dia 3 — Volta</div>
                </div>
              </div>
            </div>

            {/* Lado direito — roteiro */}
            <div className="p-5 md:p-6 bg-white">
              <div className="flex items-center gap-2 mb-4">
                <CalendarCheck className="w-5 h-5 text-[#F97316]" strokeWidth={1.8} />
                <div className="font-display font-extrabold text-[#0F172A] text-sm">Roteiro · Gramado</div>
              </div>

              {[
                { dia: "Dia 1 · 10/07", t: "Chegada em Gramado", emoji: "🛬", time: "14:00" },
                { dia: "Dia 2 · 11/07", t: "Centro + chocolate quente", emoji: "🍫", time: "10:00" },
                { dia: "Dia 3 · 12/07", t: "Volta pra Recife", emoji: "🚗", time: "11:00" },
              ].map((d) => (
                <div
                  key={d.dia}
                  className="rounded-xl px-3 py-2.5 mb-2 flex items-center gap-3"
                  style={{ background: "#F8FAFC", borderLeft: "3px solid #F97316" }}
                >
                  <div className="text-xl">{d.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-display font-extrabold text-[#94A3B8] uppercase tabular tracking-wide">{d.dia}</div>
                    <div className="text-[13px] font-display font-bold text-[#0F172A] truncate">{d.t}</div>
                  </div>
                  <div className="text-[11px] tabular text-[#64748B] font-display font-bold">{d.time}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ===== FEATURES ====================================================

function Features() {
  const items = [
    { Icon: Sparkles,      title: "Planeje com o Jei",    desc: "Fale o que quer. O Jei sugere, pesquisa e monta." },
    { Icon: CalendarCheck, title: "Roteiro automático",   desc: "Seu roteiro se monta sozinho, dia a dia." },
    { Icon: MessageCircle, title: "Chat do grupo",        desc: "Todo mundo conversa e se organiza no app." },
    { Icon: CheckSquare,   title: "Lista de pendências",  desc: "Quem compra ingresso? Quem reserva mesa? Tudo organizado." },
    { Icon: Camera,        title: "Diário da viagem",     desc: "Fotos e memórias de cada dia, compartilhadas com o grupo." },
    { Icon: Share2,        title: "Compartilhe em 1 clique", desc: "Mande o link, o grupo entra na hora." },
  ];
  return (
    <section className="py-20 md:py-28 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <Reveal className="text-center mb-12">
          <h2 className="font-display font-extrabold text-[#0F172A]" style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>
            Tudo que você precisa pra viajar
          </h2>
          <p className="text-[#64748B] mt-3 text-base">Da inspiração ao embarque, num app só.</p>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <div
                className="bg-white rounded-2xl p-6 h-full transition-all hover:-translate-y-1"
                style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)" }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: "#FFF7ED" }}
                >
                  <f.Icon className="w-6 h-6" strokeWidth={1.8} style={{ color: "#EA580C" }} />
                </div>
                <div className="font-display font-extrabold text-[#0F172A] mt-4">{f.title}</div>
                <p className="text-[#64748B] text-sm mt-1.5 leading-relaxed">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== POPULAR DESTINATIONS ========================================

const DESTINOS = [
  { nome: "Fernando de Noronha", emoji: "🏝️", url: "/fotos/noronha.jpg"  },
  { nome: "Rio de Janeiro",      emoji: "🏖️", url: "/fotos/rio.jpg"      },
  { nome: "Salvador",            emoji: "🎭", url: "/fotos/salvador.jpg" },
  { nome: "Paris",               emoji: "🗼", url: "/fotos/paris.jpg"    },
  { nome: "Londres",             emoji: "🇬🇧", url: "/fotos/londres.jpg"  },
  { nome: "Dubai",               emoji: "🏙️", url: "/fotos/dubai.webp"   },
  { nome: "Roma",                emoji: "🏛️", url: "/fotos/roma.jpeg"    },
  { nome: "Polinésia",           emoji: "🌴", url: "/fotos/polinesia.jpeg" },
];

function PopularDestinations() {
  return (
    <section className="py-20 md:py-28 px-4" style={{ background: "#F8FAFC" }}>
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-12">
          <h2 className="font-display font-extrabold text-[#0F172A]" style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>
            Pra onde você quer ir?
          </h2>
          <p className="text-[#64748B] mt-3 text-base">Planeje qualquer destino com a ajuda do Jei.</p>
        </Reveal>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {DESTINOS.map((d, i) => (
            <Reveal key={d.nome} delay={(i % 4) * 80}>
              <div
                className="relative aspect-[4/5] sm:aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.03] shadow-md hover:shadow-xl"
              >
                <img src={d.url} alt={d.nome} loading="lazy" className="w-full h-full object-cover" />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.6) 100%)" }}
                />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <div className="text-xl">{d.emoji}</div>
                  <div className="font-display font-extrabold text-base mt-0.5 leading-tight">{d.nome}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== PRICING =====================================================

function PricingBlock({ onChoose }) {
  return (
    <section className="py-20 md:py-24 px-4 bg-white" id="precos">
      <Reveal className="text-center mb-8">
        <h2 className="font-display font-extrabold text-[#0F172A]" style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>
          Escolha seu plano
        </h2>
        <p className="text-[#64748B] mt-3 text-base">Comece grátis. Cresça quando quiser.</p>
      </Reveal>
      <div className="max-w-5xl mx-auto">
        <PricingSection onChoose={onChoose} compact />
      </div>
    </section>
  );
}

// ===== TESTIMONIAL =================================================

function Testimonial() {
  return (
    <section className="py-20 md:py-28 px-4" style={{ background: "#F8FAFC" }}>
      <Reveal>
        <div
          className="max-w-3xl mx-auto bg-white rounded-2xl p-8 md:p-12 text-center"
          style={{ boxShadow: "0 10px 40px rgba(15, 23, 42, 0.08)", border: "1px solid #E2E8F0" }}
        >
          <div className="text-5xl text-[#F97316] leading-none mb-2 font-display">"</div>
          <p className="text-[#0F172A] font-display font-bold leading-relaxed" style={{ fontSize: "clamp(18px, 2.2vw, 24px)" }}>
            Planejei <strong>14 dias de viagem em 30 minutos</strong> conversando com o Jei. Nunca foi tão fácil.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <div
              className="w-10 h-10 rounded-full"
              style={{ background: "linear-gradient(135deg, #F97316, #FB923C)" }}
            />
            <div className="text-left">
              <div className="font-display font-extrabold text-[#0F172A] text-sm">Sidney V.</div>
              <div className="text-[12px] text-[#64748B] flex items-center gap-1">
                Recife · <span className="text-[#F59E0B]">⭐⭐⭐⭐⭐</span>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ===== CTA FINAL ===================================================

function CtaFinal({ onSignup }) {
  return (
    <section
      className="py-20 md:py-28 px-4 relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #FFF7ED 0%, #FFFFFF 100%)" }}
    >
      <Reveal>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="text-6xl mb-3 inline-block animate-fade-up">✈️</div>
          <h2 className="font-display font-extrabold text-[#0F172A]" style={{ fontSize: "clamp(28px, 4.5vw, 44px)" }}>
            Pronto pra sua próxima viagem?
          </h2>
          <p className="text-[#F97316] font-display font-extrabold mt-2" style={{ fontSize: "clamp(18px, 2vw, 22px)" }}>
            Sempre Juntos.
          </p>
          <button
            onClick={onSignup}
            className="mt-7 inline-flex items-center gap-2 px-7 py-4 rounded-xl text-white font-display font-extrabold text-base transition active:scale-[0.98]"
            style={{
              background: "#F97316",
              boxShadow: "0 12px 32px rgba(249, 115, 22, 0.32)",
            }}
          >
            Criar conta grátis <ArrowRight className="w-5 h-5" />
          </button>
          <p className="mt-3 text-[13px] text-[#94A3B8] font-display font-bold">
            Sem cartão. Crie em 30 segundos.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

// ===== FOOTER ======================================================

function Footer() {
  return (
    <footer className="px-4 py-12 md:py-16" style={{ background: "#0F172A" }}>
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-white">
        <div>
          <Logo size={28} white />
          <div className="text-[#F97316] font-display font-extrabold text-sm mt-2">Sempre Juntos.</div>
          <div className="text-[#94A3B8] text-[13px] mt-3">© 2026 Grupo Multvision</div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-widest font-display font-extrabold text-[#94A3B8]">Produto</div>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li><Link to="/precos" className="text-[#E2E8F0] hover:text-white">Preços</Link></li>
            <li><a href="#como-funciona" className="text-[#E2E8F0] hover:text-white">Como funciona</a></li>
          </ul>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-widest font-display font-extrabold text-[#94A3B8]">Legal</div>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li><Link to="/termos" className="text-[#E2E8F0] hover:text-white">Termos de Uso</Link></li>
            <li><Link to="/privacidade" className="text-[#E2E8F0] hover:text-white">Privacidade</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
