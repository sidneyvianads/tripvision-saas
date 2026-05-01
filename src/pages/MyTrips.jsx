import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Loader2, LogOut, ChevronRight, Calendar, Users, MapPin, Sparkles, UserCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import Avatar from "../components/Avatar";
import Mountains from "../components/ambient/Mountains";
import UpgradeModal from "../components/UpgradeModal";
import PlanBadge from "../components/PlanBadge";
import { getLimits, isPaid } from "../data/plans";

const formatBR = (iso) => {
  if (!iso) return "?";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
};

export default function MyTrips() {
  const { user, signOut } = useAuth();
  const { trips, loading, error, deleteTrip } = useTrips(user?.id);
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const limits = getLimits(user?.plano);
  const ownedCount = trips.filter((t) => t.owner_id === user?.id).length;
  const atTripLimit = ownedCount >= limits.viagens;

  const handleLogout = () => {
    if (!confirm("Sair? Sua sessão será encerrada nesse navegador.")) return;
    signOut();
  };

  const handleDelete = async (trip, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (trip.owner_id !== user.id) return;
    if (!confirm(`Deletar "${trip.nome}"? Essa ação não pode ser desfeita.`)) return;
    setBusyId(trip.id);
    try { await deleteTrip(trip.id); }
    catch (e) { alert("Erro: " + e.message); }
    finally { setBusyId(null); }
  };

  return (
    <div className="min-h-screen flex flex-col gradient-winter">
      <header className="gradient-header text-white safe-top relative overflow-hidden">
        <Mountains className="h-16" color="#7CB9E8" />
        <div className="px-4 pt-4 pb-5 flex items-center gap-3 relative z-10">
          <div className="text-2xl">🧳</div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-lg leading-tight flex items-center gap-2">
              TripVision <PlanBadge plano={user?.plano} />
            </div>
            <div className="text-[#7CB9E8] text-xs truncate font-display font-bold tracking-wide">
              Olá, {(user?.nome ?? "").split(/\s+/)[0]}!
            </div>
          </div>
          <Link to="/conta" className="rounded-full bg-white/15 hover:bg-white/25 transition p-2" aria-label="Minha conta" title="Minha conta">
            <UserCircle className="w-4 h-4" />
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-full bg-white/15 hover:bg-white/25 transition p-2"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <Avatar user={user} size={36} style={{ boxShadow: "0 0 0 2px rgba(255,255,255,0.45)" }} />
        </div>
        <div className="px-4 pb-3 -mt-1 text-white/85 text-sm font-display font-bold relative z-10">
          📁 Minhas viagens
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#7CB9E8]" />
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && trips.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-3">❄️</div>
            <h2 className="font-display font-extrabold text-xl text-snow">Nenhuma viagem ainda</h2>
            <p className="text-[#7CB9E8] mt-1 text-sm">Comece criando sua primeira viagem.</p>
          </div>
        )}

        <ul className="space-y-3">
          {trips.map((trip) => {
            const isOwner = trip.owner_id === user?.id;
            return (
              <li key={trip.id}>
                <Link
                  to={`/v/${trip.slug}`}
                  className="card p-4 flex items-center gap-3 hover:bg-[#E8F0FE]/60 transition active:scale-[0.99]"
                  style={{ borderLeft: `4px solid ${trip.cor_tema ?? "#7CB9E8"}` }}
                >
                  <div className="text-3xl select-none">{trip.cover_emoji ?? "🧳"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold text-[#0F1B2D] truncate flex items-center gap-2">
                      <span className="truncate">{trip.nome}</span>
                      {!isOwner && trip.role && (
                        <span className="badge bg-[#E8F0FE] text-[#1A3A4A]">{trip.role}</span>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-[#1A3A4A]/75">
                      {(trip.data_inicio || trip.data_fim) && (
                        <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{formatBR(trip.data_inicio)} → {formatBR(trip.data_fim)}</span>
                      )}
                      {trip.cidades?.length > 0 && (
                        <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{trip.cidades.slice(0, 2).join(", ")}{trip.cidades.length > 2 ? "…" : ""}</span>
                      )}
                      {trip.num_pessoas && (
                        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{trip.num_pessoas}</span>
                      )}
                    </div>
                  </div>
                  {isOwner && (
                    <button
                      onClick={(e) => handleDelete(trip, e)}
                      className="text-red-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50/80"
                      aria-label="Deletar viagem"
                      disabled={busyId === trip.id}
                    >
                      {busyId === trip.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                  <ChevronRight className="w-5 h-5 text-[#7CB9E8] shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      </main>

      <button
        onClick={() => atTripLimit ? setShowUpgrade(true) : navigate("/v/new")}
        className="fixed bottom-6 right-6 z-30 btn-primary !px-5 !py-3 inline-flex items-center gap-2 rounded-full shadow-[0_8px_32px_rgba(124,185,232,0.45)]"
      >
        {atTripLimit ? <Sparkles className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        {atTripLimit ? "Liberar mais viagens" : "Nova viagem"}
      </button>

      {!isPaid(user?.plano) && (
        <div className="fixed bottom-6 left-6 z-30 hidden sm:block">
          <div
            className="rounded-2xl px-3 py-2 text-[11px] font-display font-bold"
            style={{ background: "rgba(15, 27, 45, 0.85)", color: "#7CB9E8", border: "1px solid rgba(124, 185, 232, 0.30)" }}
          >
            {ownedCount} / {limits.viagens} viagens · plano Free
          </div>
        </div>
      )}

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} reason="viagens" user={user} />
    </div>
  );
}
