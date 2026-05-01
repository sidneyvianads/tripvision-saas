import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Sparkles, PencilLine, ArrowRight, ArrowLeft } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTrip } from "../hooks/useTrips";
import { temaCssVars } from "../lib/applyTema";
import { getTema } from "../data/themes";
import { FullscreenLoader } from "../App";

const formatBR = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch { return null; }
};

export default function ChooseFlow() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { trip, loading } = useTrip(slug, user?.id);
  const navigate = useNavigate();

  if (loading) return <FullscreenLoader />;
  if (!trip) return <Navigate to="/" replace />;

  const tema = getTema(trip.tema);

  return (
    <div className="min-h-screen flex flex-col bg-app" style={temaCssVars(trip.tema)}>
      <header className="bg-white safe-top" style={{ borderBottom: "1px solid #E5E7EB" }}>
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <Link to="/" className="rounded-full bg-[#F3F4F6] hover:bg-[#E5E7EB] p-2" aria-label="Voltar">
            <ArrowLeft className="w-4 h-4 text-[#1F2937]" />
          </Link>
          <div className="flex-1">
            <div className="font-display font-extrabold text-lg leading-tight text-[#1F2937]">Como começar</div>
            <div className="text-[#6B7280] text-xs">Escolha como quer montar o roteiro</div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-xl mx-auto w-full">
        {/* Hero da viagem */}
        <div
          className="rounded-2xl p-5 text-white mb-6"
          style={{ background: tema.gradient, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.15)" }}
        >
          <div className="text-3xl">{trip.cover_emoji ?? tema.emoji}</div>
          <div className="font-display font-extrabold text-xl mt-1 leading-tight">{trip.nome}</div>
          <div className="text-white/85 text-sm mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {trip.cidades?.length > 0 && <span>📍 {trip.cidades.join(", ")}</span>}
            {(trip.data_inicio || trip.data_fim) && (
              <span>🗓️ {formatBR(trip.data_inicio)} → {formatBR(trip.data_fim)}</span>
            )}
            {trip.num_pessoas && <span>👥 {trip.num_pessoas}</span>}
          </div>
        </div>

        <h2 className="font-display font-extrabold text-[#1F2937] text-lg mb-3">
          Como quer montar seu roteiro?
        </h2>

        <button
          onClick={() => navigate(`/v/${trip.slug}?tab=planejar`)}
          className="card w-full p-5 text-left active:scale-[0.99] transition flex items-center gap-4 hover:shadow-pop"
          style={{ borderLeft: `4px solid ${tema.cardBorder}` }}
        >
          <div
            className="rounded-2xl p-3 shrink-0"
            style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)", color: "white" }}
          >
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-display font-extrabold text-[#1F2937] text-lg">✨ Planejar com IA</div>
            <p className="text-[#6B7280] text-sm mt-0.5">
              Converse e o roteiro se monta sozinho com preços reais, hotéis e passeios pesquisados online.
            </p>
            <div className="inline-flex items-center gap-1 text-primary text-sm font-display font-bold mt-2">
              Começar conversa <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate(`/v/${trip.slug}/admin`)}
          className="card w-full p-5 text-left active:scale-[0.99] transition flex items-center gap-4 hover:shadow-pop mt-3"
          style={{ borderLeft: "4px solid #F59E0B" }}
        >
          <div
            className="rounded-2xl p-3 shrink-0"
            style={{ background: "linear-gradient(135deg, #F59E0B, #FBBF24)", color: "white" }}
          >
            <PencilLine className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-display font-extrabold text-[#1F2937] text-lg">✏️ Montar manualmente</div>
            <p className="text-[#6B7280] text-sm mt-0.5">
              Adicione dias e atividades você mesmo, com horários, descrições e endereços.
            </p>
            <div className="inline-flex items-center gap-1 text-amber text-sm font-display font-bold mt-2">
              Criar primeiro dia <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate(`/v/${trip.slug}`)}
          className="mt-4 text-sm text-[#6B7280] hover:text-[#1F2937] font-display font-bold w-full text-center"
        >
          Pular e ver roteiro vazio
        </button>
      </main>
    </div>
  );
}
