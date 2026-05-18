import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Share2, Users, LogOut, Shield, UserCircle, Lock,
  BookUser, MoreHorizontal,
} from "lucide-react";
import Avatar from "./Avatar";
import People from "./People";
import Profile from "./Profile";
import Contatos from "./Contatos";
import ShareModal from "./ShareModal";
import PlanBadge from "./PlanBadge";
import UpgradeModal from "./UpgradeModal";
import { temaCssVars } from "../lib/applyTema";
import { getTema } from "../data/themes";
import { getLimits } from "../data/plans";

export default function TripLayout({ trip, isAdmin, tabLabel, user, onLogout, children }) {
  const navigate = useNavigate();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [contatosOpen, setContatosOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // R14-6: aba inicial do ShareModal. People dispara com 'email' pra
  // abrir direto no convite por email.
  const [shareTab, setShareTab] = useState("link");
  const [profileOpen, setProfileOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Refs pra ancorar o dropdown no botão e pra detectar click-outside
  // mesmo quando o painel é renderizado num portal (fora do header).
  const menuBtnRef = useRef(null);
  const menuPanelRef = useRef(null);
  const [menuCoords, setMenuCoords] = useState({ top: 0, right: 0 });

  const limits = getLimits(user?.plano);
  const canShare = limits.compartilhar === true;

  const handleShare = () => {
    if (!canShare) { setShowUpgrade(true); return; }
    setShareTab("link");
    setShareOpen(true);
  };

  // R14-6: People → "Convidar" abre ShareModal direto na aba email.
  const handleOpenInvite = () => {
    if (!canShare) { setShowUpgrade(true); return; }
    setPeopleOpen(false);
    setShareTab("email");
    setShareOpen(true);
  };

  // Calcula posição do dropdown a partir do botão ⋯ no momento da abertura
  // e em qualquer resize/scroll de viewport. Top fica logo abaixo do botão;
  // right respeita o padding lateral (botão alinhado à direita do header).
  const recalcMenuCoords = () => {
    const el = menuBtnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuCoords({
      top: Math.round(r.bottom + 8),
      right: Math.round(window.innerWidth - r.right),
    });
  };

  useLayoutEffect(() => {
    if (!menuOpen) return;
    recalcMenuCoords();
    window.addEventListener("resize", recalcMenuCoords);
    window.addEventListener("scroll", recalcMenuCoords, true);
    return () => {
      window.removeEventListener("resize", recalcMenuCoords);
      window.removeEventListener("scroll", recalcMenuCoords, true);
    };
  }, [menuOpen]);

  // Click-outside / Esc — checa também o painel no portal
  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e) => {
      const insideBtn = menuBtnRef.current && menuBtnRef.current.contains(e.target);
      const insidePanel = menuPanelRef.current && menuPanelRef.current.contains(e.target);
      if (!insideBtn && !insidePanel) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const tema = getTema(trip.tema);

  // Ações disponíveis. Renderizadas inline no desktop e como itens de
  // menu dropdown no mobile (≤ md / 768px). Inclui apenas os botões
  // que valem como "ação" — voltar e avatar ficam fora.
  const actions = [
    isAdmin && { key: "admin", label: "Admin", icon: Shield, onClick: () => navigate(`/v/${trip.slug}/admin`) },
    { key: "people", label: "Quem vai", icon: Users, onClick: () => setPeopleOpen(true) },
    { key: "contatos", label: "Contatos", icon: BookUser, onClick: () => setContatosOpen(true) },
    { key: "share", label: canShare ? "Compartilhar" : "Compartilhar (Pro)", icon: Share2, onClick: handleShare, lockedPro: !canShare },
    { key: "conta", label: "Minha conta", icon: UserCircle, to: "/conta" },
    onLogout && { key: "logout", label: "Sair", icon: LogOut, onClick: onLogout, danger: true },
  ].filter(Boolean);

  return (
    <div className="min-h-screen flex flex-col bg-app" style={temaCssVars(trip.tema)}>
      <header
        className="text-white safe-top relative overflow-hidden"
        style={{ background: tema.gradient }}
      >
        <div className="px-3 sm:px-4 pt-4 pb-5 flex items-center gap-2 relative z-10">
          <Link to="/" className="rounded-full bg-white/15 hover:bg-white/25 p-2 shrink-0" aria-label="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="text-xl sm:text-2xl shrink-0">{trip.cover_emoji ?? "🧳"}</div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-base sm:text-lg leading-tight flex items-center gap-1.5 sm:gap-2">
              <span className="truncate">{trip.nome}</span>
              {/* Badges escondidos no mobile pra liberar espaço — só desktop */}
              <span className="hidden md:inline-flex">
                <PlanBadge plano={user?.plano} />
              </span>
              {trip.viaje_segura && (
                <>
                  {/* Mobile: bolinha emoji compacta */}
                  <span
                    className="md:hidden inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                    style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)" }}
                    title="Viaje Segura ativado"
                    aria-label="Viaje Segura"
                  >
                    <span className="text-[11px]">🛡️</span>
                  </span>
                  {/* Desktop: badge completa */}
                  <span
                    className="hidden md:inline-flex items-center gap-1 text-[10px] font-display font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: "rgba(255,255,255,0.18)", color: "#FFFFFF", border: "1px solid rgba(255,255,255,0.35)" }}
                    title="Viaje Segura ativado"
                  >
                    🛡️ Viaje Segura
                  </span>
                </>
              )}
            </div>
            <div className="text-white/75 text-[11px] sm:text-xs truncate font-display font-bold">
              {trip.cidades?.length ? trip.cidades.slice(0, 3).join(" · ") : "—"}
            </div>
          </div>

          {/* DESKTOP: botões inline */}
          {actions.map((a) => {
            const Icon = a.icon;
            const className = "hidden md:inline-flex rounded-full bg-white/15 hover:bg-white/25 transition p-2 relative shrink-0";
            return a.to ? (
              <Link key={a.key} to={a.to} className={className} aria-label={a.label} title={a.label}>
                <Icon className="w-4 h-4" />
              </Link>
            ) : (
              <button key={a.key} onClick={a.onClick} className={className} aria-label={a.label} title={a.label}>
                <Icon className="w-4 h-4" />
                {a.lockedPro && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center"
                    style={{ background: "#F59E0B", boxShadow: "0 0 0 1.5px rgba(0,0,0,0.20)" }}
                  >
                    <Lock className="w-2 h-2 text-white" />
                  </span>
                )}
              </button>
            );
          })}

          {/* MOBILE: botão "⋯" — painel renderizado via portal pra escapar
              do overflow-hidden do header e ficar acima de qualquer coisa */}
          <button
            ref={menuBtnRef}
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden rounded-full bg-white/15 hover:bg-white/25 transition p-2 shrink-0"
            aria-label="Mais opções"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {user && (
            <button
              onClick={() => setProfileOpen(true)}
              className="rounded-full transition active:scale-95 shrink-0"
              style={{ boxShadow: "0 0 0 2px rgba(255,255,255,0.45)" }}
              aria-label="Editar perfil"
            >
              <Avatar user={user} size={36} />
            </button>
          )}
        </div>

        {tabLabel && (
          <div className="px-3 sm:px-4 pb-3 -mt-1 text-white/85 text-sm font-display font-bold relative z-10">
            {tabLabel}
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-24">{children}</main>

      {/* Dropdown mobile no portal — fixed, z-50, com scroll se passar da viewport */}
      {menuOpen && createPortal(
        <div
          ref={menuPanelRef}
          role="menu"
          className="fixed min-w-[220px] max-w-[calc(100vw-16px)] rounded-xl overflow-hidden animate-pop md:hidden"
          style={{
            top: menuCoords.top,
            right: menuCoords.right,
            zIndex: 50,
            background: "white",
            boxShadow: "0 12px 32px rgba(15, 23, 42, 0.20), 0 0 0 1px rgba(15, 23, 42, 0.06)",
            maxHeight: `calc(100vh - ${menuCoords.top + 16}px)`,
            overflowY: "auto",
          }}
        >
          {actions.map((a, i) => {
            const Icon = a.icon;
            const isLast = i === actions.length - 1;
            const itemClass = `w-full flex items-center gap-2.5 px-3.5 py-3 text-sm font-display font-bold text-left transition ${a.danger ? "text-red-600 hover:bg-red-50" : "text-[#0F172A] hover:bg-[#F8FAFC]"} ${isLast ? "" : "border-b border-[#F1F5F9]"}`;
            const close = () => setMenuOpen(false);
            return a.to ? (
              <Link key={a.key} to={a.to} className={itemClass} onClick={close} role="menuitem">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{a.label}</span>
                {a.lockedPro && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
              </Link>
            ) : (
              <button
                key={a.key}
                onClick={() => { close(); a.onClick(); }}
                className={itemClass}
                role="menuitem"
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{a.label}</span>
                {a.lockedPro && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}

      {peopleOpen   && <People   viagemId={trip.id} isAdmin={isAdmin} onOpenInvite={handleOpenInvite} onClose={() => setPeopleOpen(false)} />}
      {contatosOpen && <Contatos viagemId={trip.id} isAdmin={isAdmin} onClose={() => setContatosOpen(false)} />}
      {profileOpen  && <Profile  onClose={() => setProfileOpen(false)} />}
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} trip={trip} initialTab={shareTab} />
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} reason="compartilhar" user={user} />
    </div>
  );
}
