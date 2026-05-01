import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Users, LogOut, Shield, Check, UserCircle, Lock } from "lucide-react";
import Avatar from "./Avatar";
import People from "./People";
import Profile from "./Profile";
import PlanBadge from "./PlanBadge";
import UpgradeModal from "./UpgradeModal";
import TemaParticles from "./ambient/TemaParticles";
import { temaCssVars } from "../lib/applyTema";
import { getTema } from "../data/themes";
import { getLimits } from "../data/plans";

export default function TripLayout({ trip, isAdmin, tabLabel, user, onLogout, children }) {
  const navigate = useNavigate();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const limits = getLimits(user?.plano);
  const canShare = limits.compartilhar === true;

  const shareUrl = `${window.location.origin}/v/${trip.slug}`;
  const cidades = trip.cidades?.length ? trip.cidades.join(", ") : "uma viagem incrível";
  const emoji = trip.cover_emoji ?? "🧳";
  const shareText = `Entra no app da nossa viagem pra ${cidades}! ${emoji}\n${shareUrl}`;

  const handleShare = async () => {
    if (!canShare) { setShowUpgrade(true); return; }
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.nome, text: shareText, url: shareUrl });
        return;
      } catch { /* fall through */ }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      prompt("Copie essa mensagem:", shareText);
    }
  };

  const tema = getTema(trip.tema);

  return (
    <div className="min-h-screen flex flex-col bg-app" style={temaCssVars(trip.tema)}>
      <header className="gradient-tema text-white safe-top relative overflow-hidden">
        <TemaParticles tema={tema} count={20} className="opacity-50" />
        <div className="px-4 pt-4 pb-5 flex items-center gap-2 relative z-10">
          <Link to="/" className="rounded-full bg-white/15 hover:bg-white/25 p-2" aria-label="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="text-2xl">{trip.cover_emoji ?? "🧳"}</div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-lg leading-tight truncate flex items-center gap-2">
              <span className="truncate">{trip.nome}</span>
              <PlanBadge plano={user?.plano} />
            </div>
            <div className="text-[#7CB9E8] text-xs truncate font-display font-bold">
              {trip.cidades?.length ? trip.cidades.slice(0, 3).join(" · ") : "—"}
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={() => navigate(`/v/${trip.slug}/admin`)}
              className="rounded-full bg-white/15 hover:bg-white/25 transition p-2"
              aria-label="Admin"
              title="Admin"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setPeopleOpen(true)}
            className="rounded-full bg-white/15 hover:bg-white/25 transition p-2"
            aria-label="Quem vai"
            title="Quem vai"
          >
            <Users className="w-4 h-4" />
          </button>
          <button
            onClick={handleShare}
            className="rounded-full bg-white/15 hover:bg-white/25 transition p-2 relative"
            aria-label={canShare ? "Compartilhar" : "Compartilhar (Pro)"}
            title={canShare ? "Compartilhar" : "Compartilhar é Pro"}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Share2 className="w-4 h-4" />}
            {!canShare && (
              <span
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center"
                style={{ background: "#F59E0B", boxShadow: "0 0 0 1.5px rgba(0,0,0,0.20)" }}
              >
                <Lock className="w-2 h-2 text-white" />
              </span>
            )}
          </button>
          <Link
            to="/conta"
            className="rounded-full bg-white/15 hover:bg-white/25 transition p-2"
            aria-label="Minha conta"
            title="Minha conta"
          >
            <UserCircle className="w-4 h-4" />
          </Link>
          {onLogout && (
            <button
              onClick={onLogout}
              className="rounded-full bg-white/15 hover:bg-white/25 transition p-2"
              aria-label="Sair"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
          {user && (
            <button
              onClick={() => setProfileOpen(true)}
              className="rounded-full transition active:scale-95"
              style={{ boxShadow: "0 0 0 2px rgba(255,255,255,0.45)" }}
              aria-label="Editar perfil"
            >
              <Avatar user={user} size={36} />
            </button>
          )}
        </div>

        {tabLabel && (
          <div className="px-4 pb-3 -mt-1 text-white/85 text-sm font-display font-bold relative z-10">
            {tabLabel}
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-24">{children}</main>

      {peopleOpen  && <People  viagemId={trip.id} onClose={() => setPeopleOpen(false)} />}
      {profileOpen && <Profile onClose={() => setProfileOpen(false)} />}
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} reason="compartilhar" user={user} />
    </div>
  );
}
