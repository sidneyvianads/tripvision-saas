import { useEffect, useMemo, useState } from "react";
import { useParams, Navigate, useSearchParams, useNavigate } from "react-router-dom";
import { Sparkles, PencilLine } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTrip } from "../hooks/useTrips";
import { useRoteiro } from "../hooks/useRoteiro";
import { useUnreadCount } from "../hooks/useChat";
import TripLayout from "../components/TripLayout";
import TabBar from "../components/TabBar";
import Countdown from "../components/Countdown";
import DayCard from "../components/DayCard";
import GroupChat from "../components/GroupChat";
import PlanChat from "../components/PlanChat";
import Checklist from "../components/Checklist";
import { FullscreenLoader } from "../App";

const TAB_TITLES = {
  roteiro:  "📅 Roteiro",
  planejar: "✨ Planejar com IA",
  chat:     "💬 Chat do grupo",
  tarefas:  "✅ Tarefas",
};

export default function TripView() {
  const { slug } = useParams();
  const { user, signOut } = useAuth();
  const { trip, isAdmin, loading, error } = useTrip(slug, user?.id);
  const [params, setParams] = useSearchParams();
  const initialTab = params.get("tab") || "roteiro";
  const [tab, setTab] = useState(initialTab);
  const { count: unreadChat, markSeen } = useUnreadCount(trip?.id, user?.id);

  useEffect(() => { if (tab === "chat") markSeen(); }, [tab, markSeen]);

  // Sincroniza ?tab= quando muda
  useEffect(() => {
    if (params.get("tab") !== tab && tab !== "roteiro") {
      setParams({ tab }, { replace: true });
    } else if (params.get("tab") && tab === "roteiro") {
      setParams({}, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleLogout = () => {
    if (!confirm("Sair? Sua sessão será encerrada nesse navegador.")) return;
    signOut();
  };

  if (loading) return <FullscreenLoader />;
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app text-center p-6">
        <div>
          <div className="text-6xl mb-3">🧭</div>
          <h1 className="text-2xl text-[#1F2937]">{error}</h1>
          <a href="/" className="text-ice mt-2 inline-block">Voltar</a>
        </div>
      </div>
    );
  }
  if (!trip) return <Navigate to="/" replace />;

  return (
    <>
      <TripLayout
        trip={trip}
        isAdmin={isAdmin}
        tabLabel={TAB_TITLES[tab]}
        user={user}
        onLogout={handleLogout}
      >
        {tab === "roteiro"  && <RoteiroTab trip={trip} isAdmin={isAdmin} onPlanejar={() => setTab("planejar")} />}
        {tab === "planejar" && <PlanChat   trip={trip} user={user} onGoToRoteiro={() => setTab("roteiro")} />}
        {tab === "chat"     && <GroupChat  viagemId={trip.id} user={user} />}
        {tab === "tarefas"  && <Checklist  viagemId={trip.id} user={user} isAdmin={isAdmin} />}
      </TripLayout>
      <TabBar active={tab} onChange={setTab} badges={{ chat: unreadChat }} />
    </>
  );
}

function RoteiroTab({ trip, isAdmin, onPlanejar }) {
  const navigate = useNavigate();
  const { days, loading } = useRoteiro(trip.id);
  const todayKey = new Date().toISOString().slice(0, 10);

  const initialExpanded = useMemo(() => {
    if (!days?.length) return null;
    const todayIdx = days.findIndex((d) => d.data === todayKey);
    if (todayIdx >= 0) return days[todayIdx].dia_numero;
    if (trip.data_inicio && todayKey < trip.data_inicio) return days[0].dia_numero;
    return null;
  }, [days, todayKey, trip.data_inicio]);

  const [expanded, setExpanded] = useState(null);
  useEffect(() => {
    if (expanded == null && initialExpanded != null) setExpanded(initialExpanded);
  }, [initialExpanded, expanded]);

  useEffect(() => {
    if (expanded != null) {
      setTimeout(() => {
        const el = document.getElementById(`day-${expanded}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [expanded]);

  if (loading) return <FullscreenLoader />;

  return (
    <div>
      <Countdown start={trip.data_inicio} end={trip.data_fim} />

      {days.length === 0 ? (
        <div className="card-tema p-6 mx-4 mt-5 text-center">
          <div className="text-5xl mb-3">🗺️</div>
          <div className="font-display font-extrabold text-[#1F2937] text-lg">Seu roteiro está esperando!</div>
          <p className="text-sm text-[#4B5563] mt-1">
            Como quer montar?
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={onPlanejar}
              className="btn-primary inline-flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Planejar com IA
            </button>
            {isAdmin && (
              <button
                onClick={() => navigate(`/v/${trip.slug}/admin`)}
                className="btn-ghost inline-flex items-center justify-center gap-2"
              >
                <PencilLine className="w-4 h-4" /> Montar manualmente
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 mt-5 space-y-3 pb-4">
          {days.map((day) => (
            <div id={`day-${day.dia_numero}`} key={day.id} style={{ scrollMarginTop: 16 }}>
              <DayCard
                day={day}
                expanded={expanded === day.dia_numero}
                onToggle={() => setExpanded(expanded === day.dia_numero ? null : day.dia_numero)}
                isToday={day.data === todayKey}
                color={trip.cor_tema}
              />
            </div>
          ))}

          <div className="card-tema p-4 mt-3 text-center">
            <p className="text-sm text-[#4B5563]">Falta algum dia? Continue de onde parou.</p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2 justify-center">
              <button onClick={onPlanejar} className="btn-primary inline-flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" /> Continuar com IA
              </button>
              {isAdmin && (
                <button onClick={() => navigate(`/v/${trip.slug}/admin`)} className="btn-ghost inline-flex items-center justify-center gap-2">
                  <PencilLine className="w-4 h-4" /> Adicionar dia manual
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
