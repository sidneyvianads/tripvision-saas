import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Users, LogOut, Shield, Check, UserCircle } from "lucide-react";
import Avatar from "./Avatar";
import People from "./People";
import Profile from "./Profile";
import PlanBadge from "./PlanBadge";
import Mountains from "./ambient/Mountains";

export default function TripLayout({ trip, isAdmin, tabLabel, user, onLogout, children }) {
  const navigate = useNavigate();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/v/${trip.slug}`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.nome, text: `Vamos juntos? ${trip.nome}`, url: shareUrl });
        return;
      } catch { /* fall through */ }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("Copie esse link:", shareUrl);
    }
  };

  return (
    <div className="min-h-screen flex flex-col gradient-winter">
      <header className="gradient-header text-white safe-top relative overflow-hidden">
        <Mountains className="h-16" color="#7CB9E8" />
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
            className="rounded-full bg-white/15 hover:bg-white/25 transition p-2"
            aria-label="Compartilhar"
            title="Compartilhar"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Share2 className="w-4 h-4" />}
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
    </div>
  );
}
