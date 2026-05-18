import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Loader2, LogOut, ChevronRight, Calendar, MapPin, Sparkles, UserCircle, Search, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import Avatar from "../components/Avatar";
import UpgradeModal from "../components/UpgradeModal";
import PlanBadge from "../components/PlanBadge";
import ConfirmModal from "../components/ConfirmModal";
import ScrollToTop from "../components/ScrollToTop";
import Logo from "../components/Logo";
import { getLimits, needsSubscription, isInTrial, trialDaysLeft } from "../data/plans";
import { describePessoas } from "../lib/roteiroResumo";
import { getTema, emojiForCidade } from "../data/themes";
import { friendlyError } from "../lib/errorMessages";

const formatBR = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch { return null; }
};

export default function MyTrips() {
  const { user, signOut } = useAuth();
  const { trips, loading, error, deleteTrip } = useTrips(user?.id);
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const limits = getLimits(user?.plano);
  const ownedCount = trips.filter((t) => t.owner_id === user?.id).length;
  const atTripLimit = ownedCount >= limits.viagens;
  const noSub = needsSubscription(user);
  const inTrial = isInTrial(user);
  const trialLeft = trialDaysLeft(user);

  const handleLogout = () => {
    if (!confirm("Sair? Sua sessão será encerrada nesse navegador.")) return;
    signOut();
    navigate("/");
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try { await deleteTrip(confirmDelete.id); }
    catch (e) {
      console.error("[MyTrips] delete erro:", e);
      alert("Erro. " + friendlyError(e));
    }
    finally { setBusyId(null); setConfirmDelete(null); }
  };

  // Item 8: ordenar futuras → passadas
  const today = new Date().toISOString().slice(0, 10);
  const sorted = useMemo(() => {
    const list = [...trips];
    list.sort((a, b) => {
      const aPast = a.data_fim && a.data_fim < today;
      const bPast = b.data_fim && b.data_fim < today;
      if (aPast !== bPast) return aPast ? 1 : -1;
      const aD = a.data_inicio ?? "9999-12-31";
      const bD = b.data_inicio ?? "9999-12-31";
      return aD.localeCompare(bD);
    });
    return list;
  }, [trips, today]);

  // Item 9: busca se 3+
  const showSearch = trips.length >= 3;
  const filtered = search.trim()
    ? sorted.filter((t) => (t.nome ?? "").toLowerCase().includes(search.toLowerCase()))
    : sorted;

  return (
    <div className="min-h-screen flex flex-col bg-soft">
      <header className="bg-white safe-top" style={{ borderBottom: "1px solid #E5E7EB" }}>
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <Link to="/" aria-label="Viajjei"><Logo size={36} /></Link>
          <PlanBadge plano={user?.plano} />
          <div className="flex-1 min-w-0">
            <div className="text-[#6B7280] text-xs truncate font-display font-bold tracking-wide text-right sm:text-left">
              Olá, {(user?.nome ?? "").split(/\s+/)[0]}!
            </div>
          </div>
          <Link to="/conta" className="rounded-full bg-[#F3F4F6] hover:bg-[#E5E7EB] transition p-2" aria-label="Minha conta" title="Minha conta">
            <UserCircle className="w-4 h-4 text-[#1F2937]" />
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-full bg-[#F3F4F6] hover:bg-[#E5E7EB] transition p-2"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="w-4 h-4 text-[#1F2937]" />
          </button>
          <Avatar user={user} size={36} />
        </div>
        <div className="px-4 pb-3 text-[#1F2937] text-sm font-display font-bold">
          📁 Minhas viagens
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {/* Banner: conta sem assinatura ativa (pending/expired/free legado) */}
        {noSub && (
          <div
            className="mb-3 rounded-2xl px-4 py-3 flex items-start gap-3"
            style={{ background: "linear-gradient(135deg, #FEF3C7, #FDE68A)", border: "1px solid #F59E0B" }}
          >
            <Sparkles className="w-5 h-5 mt-0.5 shrink-0 text-[#92400E]" />
            <div className="flex-1 min-w-0">
              <div className="font-display font-extrabold text-[#92400E] text-sm">
                Assine pra continuar planejando!
              </div>
              <div className="text-[12px] text-[#92400E]/85 mt-0.5">
                7 dias grátis. Cancele quando quiser. Suas viagens ficam disponíveis em modo leitura.
              </div>
            </div>
            <button
              onClick={() => setShowUpgrade(true)}
              className="btn-primary !py-2 !px-3 text-xs whitespace-nowrap"
            >
              Começar grátis →
            </button>
          </div>
        )}

        {/* Banner: trial em andamento */}
        {!noSub && inTrial && trialLeft > 0 && (
          <div className="mb-3 rounded-xl px-3 py-2 flex items-center gap-2 text-[12px] font-display font-bold"
               style={{ background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" }}>
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Trial ativo — {trialLeft} {trialLeft === 1 ? "dia restante" : "dias restantes"}. Aproveite o Jei sem limites!</span>
          </div>
        )}

        {showSearch && (
          <div className="mb-3 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
            <input
              type="search"
              className="input pl-11 pr-9"
              placeholder="Buscar por nome…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-[#F3F4F6]"
                aria-label="Limpar"
              >
                <X className="w-3.5 h-3.5 text-[#6B7280]" />
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="card p-4 flex items-center gap-3">
                <div className="skeleton w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/2" />
                  <div className="skeleton h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && trips.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-3">🧳</div>
            <h2 className="font-display font-extrabold text-xl text-[#1F2937]">Nenhuma viagem ainda</h2>
            <p className="text-[#6B7280] mt-1 text-sm">Comece criando sua primeira.</p>
            <button
              onClick={() => navigate("/v/new")}
              className="btn-primary mt-5 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Criar viagem
            </button>
          </div>
        )}

        {!loading && trips.length > 0 && filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-[#6B7280]">
            Nenhuma viagem com "{search}".
          </div>
        )}

        <ul className="space-y-3">
          {filtered.map((trip) => {
            const isOwner = trip.owner_id === user?.id;
            const isPast = trip.data_fim && trip.data_fim < today;
            const tema = getTema(trip.tema);
            const cidadeEmoji = trip.cidades?.length ? emojiForCidade(trip.cidades[0]) : null;
            const emoji = cidadeEmoji ?? trip.cover_emoji ?? tema.emoji;
            return (
              <li key={trip.id} className={isPast ? "opacity-65" : ""}>
                <Link
                  to={`/v/${trip.slug}`}
                  className="card p-4 flex items-center gap-3 hover:shadow-pop transition active:scale-[0.99] block"
                  style={{ borderLeft: `4px solid ${tema.cardBorder}` }}
                >
                  <div className="text-3xl select-none">{emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold text-[#1F2937] truncate flex items-center gap-2">
                      <span className="truncate">{trip.nome}</span>
                      {!isOwner && trip.role && (
                        <span className="badge bg-[#F3F4F6] text-[#6B7280]">{trip.role}</span>
                      )}
                      {isPast && (
                        <span className="badge bg-[#F3F4F6] text-[#6B7280] text-[10px]">Concluída</span>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-[#6B7280]">
                      {(trip.data_inicio || trip.data_fim) ? (
                        <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{formatBR(trip.data_inicio)} → {formatBR(trip.data_fim)}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />Datas a definir</span>
                      )}
                      {trip.cidades?.length > 0 && (
                        <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{trip.cidades.slice(0, 2).join(", ")}{trip.cidades.length > 2 ? "…" : ""}</span>
                      )}
                      <TripPeopleBadge trip={trip} />
                      {trip.viaje_segura && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 rounded-full text-[10px] font-display font-extrabold"
                          style={{ background: "#FDF4FF", color: "#9333EA", border: "1px solid #E9D5FF" }}
                          title="Modo Viaje Segura"
                        >
                          🛡️ Viaje Segura
                        </span>
                      )}
                    </div>
                  </div>
                  {isOwner && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(trip); }}
                      className="text-[#EF4444] hover:text-[#DC2626] p-1.5 rounded-full hover:bg-red-50"
                      aria-label="Deletar viagem"
                      disabled={busyId === trip.id}
                    >
                      {busyId === trip.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                  <ChevronRight className="w-5 h-5 text-[#9CA3AF] shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      </main>

      <button
        onClick={() => (noSub || atTripLimit) ? setShowUpgrade(true) : navigate("/v/new")}
        className="fixed bottom-6 right-6 z-30 btn-primary !px-5 !py-3 inline-flex items-center gap-2 rounded-full shadow-pop"
      >
        {(noSub || atTripLimit) ? <Sparkles className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        {noSub ? "Assinar" : atTripLimit ? "Liberar mais viagens" : "Nova viagem"}
      </button>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason={noSub ? "expirado" : "viagens"}
        user={user}
      />

      <ScrollToTop />

      <ConfirmModal
        open={!!confirmDelete}
        title="Deletar viagem?"
        body={confirmDelete ? `Tem certeza que quer apagar "${confirmDelete.nome}"? Isso apaga roteiro, chat e checklist. Não dá pra desfazer.` : ""}
        confirmLabel="Sim, deletar"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirmed}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function TripPeopleBadge({ trip }) {
  const txt = describePessoas(trip);
  if (!txt) return null;
  return <span className="inline-flex items-center gap-1">{txt}</span>;
}
