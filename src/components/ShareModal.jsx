// R14-5: redesenho do ShareModal com 2 abas — "Link" (QR + copy, igual
// antes) e "Email" (input email + role + lista de pendentes + capacidade).
//
// Por que manter o link público depois de gatear /v/{slug} (R14-7)?
// O link continua sendo útil pra share preview no WhatsApp (og.mjs Edge
// Function renderiza meta tags). Quem clica sem convite vê a tela de
// "peça pro organizador" — descobre que existe e como entrar.

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Copy, Check, Download, Share2, Mail, Link as LinkIcon, Trash2, AlertCircle, Loader2, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import { useAuth } from "../hooks/useAuth";
import { createInvite, listPendingInvites, revokeInvite, getInviteCapacity } from "../lib/invites";

export default function ShareModal({ open, onClose, trip, initialTab }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const shareUrl = `${window.location.origin}/v/${trip.slug}`;
  const cidades = trip.cidades?.length ? trip.cidades.join(", ") : "uma viagem incrível";
  const emoji = trip.cover_emoji ?? "🧳";
  const shareText = `Entra no app da nossa viagem pra ${cidades}! ${emoji}\n${shareUrl}`;

  return <ShareModalInner
    canvasRef={canvasRef}
    shareUrl={shareUrl}
    shareText={shareText}
    trip={trip}
    onClose={onClose}
    copied={copied}
    setCopied={setCopied}
    initialTab={initialTab}
  />;
}

function ShareModalInner({ canvasRef, shareUrl, shareText, trip, onClose, copied, setCopied, initialTab }) {
  const { user } = useAuth();
  // tab: 'link' | 'email'
  const [tab, setTab] = useState(initialTab === "email" ? "email" : "link");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 animate-fade-up" onClick={onClose}>
      <div
        className="w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col animate-pop bg-white max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white px-4 py-3 flex items-center gap-2" style={{ background: "var(--tv-gradient)" }}>
          <Share2 className="w-5 h-5" />
          <div className="font-display font-extrabold flex-1">Compartilhar viagem</div>
          <button onClick={onClose} className="rounded-full bg-white/20 hover:bg-white/30 p-1.5" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b" style={{ borderColor: "var(--tv-card-border)" }}>
          <TabButton active={tab === "link"} onClick={() => setTab("link")} icon={LinkIcon} label="Link" />
          <TabButton active={tab === "email"} onClick={() => setTab("email")} icon={Mail} label="Convidar por email" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "link" && (
            <LinkPanel
              canvasRef={canvasRef}
              shareUrl={shareUrl}
              shareText={shareText}
              trip={trip}
              copied={copied}
              setCopied={setCopied}
            />
          )}
          {tab === "email" && (
            <EmailPanel trip={trip} user={user} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`flex-1 px-3 py-2.5 text-sm font-display font-bold inline-flex items-center justify-center gap-1.5 border-b-2 ${
        active ? "" : "text-[#9CA3AF] border-transparent hover:bg-[#F9FAFB]"
      }`}
      style={active ? { color: "var(--tv-accent-dark)", borderColor: "var(--tv-accent)" } : undefined}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function LinkPanel({ canvasRef, shareUrl, shareText, trip, copied, setCopied }) {
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, shareUrl, {
      width: 220,
      margin: 1,
      color: { dark: "#1F2937", light: "#FFFFFF" },
    }).catch((e) => console.error("[ShareModal] QR error:", e));
  }, [shareUrl, canvasRef]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      prompt("Copie essa mensagem:", shareText);
    }
  };

  const shareNative = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: trip.nome, text: shareText, url: shareUrl }); }
      catch { /* cancelado */ }
    } else {
      copyText();
    }
  };

  const downloadQR = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `qr-${trip.slug}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="p-5 space-y-4">
      <div className="text-center">
        <div className="text-sm text-[#4B5563] mb-3">
          QR + link da viagem. Quem receber precisa de <strong>convite por email</strong> pra entrar — o link sozinho não dá acesso.
        </div>
        <div className="inline-block p-3 rounded-2xl border-2" style={{ borderColor: "var(--tv-card-border)" }}>
          <canvas ref={canvasRef} aria-label="QR code do link" />
        </div>
        <button
          onClick={downloadQR}
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-display font-bold bg-white border hover:bg-gray-50"
          style={{ borderColor: "var(--tv-card-border)", color: "var(--tv-accent-dark)" }}
        >
          <Download className="w-3.5 h-3.5" />
          Salvar QR
        </button>
      </div>

      <div className="rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] p-3">
        <div className="text-[11px] font-display font-bold uppercase tracking-wide text-[#6B7280] mb-1">Link</div>
        <div className="text-sm text-[#1F2937] break-all">{shareUrl}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={copyText} type="button" className="btn-ghost inline-flex items-center justify-center gap-1.5">
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copiado!" : "Copiar texto"}
        </button>
        <button onClick={shareNative} type="button" className="btn-primary inline-flex items-center justify-center gap-1.5">
          <Share2 className="w-4 h-4" /> Compartilhar
        </button>
      </div>
    </div>
  );
}

function EmailPanel({ trip, user }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("membro");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);
  const [pending, setPending] = useState([]);
  const [capacity, setCapacity] = useState({ members: 0, pending: 0, limit: 1 });
  const [loading, setLoading] = useState(true);
  const [linkCopiedId, setLinkCopiedId] = useState(null);

  const reload = async () => {
    setLoading(true);
    const [p, cap] = await Promise.all([
      listPendingInvites(trip.id),
      getInviteCapacity(trip.id),
    ]);
    setPending(p);
    setCapacity(cap);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [trip.id]);

  const used = capacity.members + capacity.pending;
  const slotsAvailable = used < capacity.limit;

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    if (!email.trim()) return setErr("Informe um email.");
    if (!slotsAvailable) return setErr("Você atingiu o limite de pessoas do seu plano.");
    setSending(true);
    try {
      const res = await createInvite({
        viagemId: trip.id,
        email,
        role,
        inviterNome: user?.nome,
        trip,
      });
      if (!res.ok) {
        const map = {
          plan_limit_reached: "Limite do plano atingido. Faça upgrade pra Grupo (20 pessoas).",
          already_member: "Esse email já é membro da viagem.",
          permission_denied: "Só admins da viagem podem convidar.",
          invalid_email: "Email inválido.",
          rpc_error: res.details ?? "Falha ao criar convite.",
        };
        setErr(map[res.motivo] ?? "Não foi possível criar o convite.");
        return;
      }
      if (res.already_pending) {
        setInfo("Esse convite já existia — re-enviei o email.");
      } else {
        setInfo(res.email_sent
          ? "Convite enviado!"
          : res.email_stub
            ? "Convite criado. Email em stub mode — copie o link abaixo."
            : "Convite criado. Email não foi enviado, copie o link.");
      }
      setEmail("");
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (conviteId) => {
    const res = await revokeInvite(conviteId);
    if (res.ok) {
      setPending((prev) => prev.filter((p) => p.id !== conviteId));
      setCapacity((c) => ({ ...c, pending: Math.max(0, c.pending - 1) }));
    }
  };

  const copyInviteLink = async (token, id) => {
    const url = `${window.location.origin}/aceitar-convite?token=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopiedId(id);
      setTimeout(() => setLinkCopiedId(null), 1800);
    } catch {
      prompt("Copie o link:", url);
    }
  };

  const limitIsExpired = capacity.limit === 1; // 1 = só owner = pending/expired/free

  return (
    <div className="p-5 space-y-4">
      {/* Capacidade */}
      <div className="rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] p-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-display font-bold uppercase tracking-wide text-[#6B7280]">Vagas</div>
          <div className="text-sm font-display font-bold text-[#0F172A]">
            {used} de {capacity.limit === 1000000 ? "∞" : capacity.limit} {capacity.limit === 1000000 ? "" : "usadas"}
          </div>
          <div className="text-xs text-[#6B7280] mt-0.5">
            {capacity.members} membro{capacity.members === 1 ? "" : "s"} · {capacity.pending} pendente{capacity.pending === 1 ? "" : "s"}
          </div>
        </div>
        {limitIsExpired && (
          <a
            href="/conta?upgrade=1"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-display font-extrabold text-white"
            style={{ background: "var(--tv-gradient)" }}
          >
            <Sparkles className="w-3 h-3" /> Upgrade
          </a>
        )}
      </div>

      {/* Form */}
      <form onSubmit={submit} className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="amigo@email.com"
            className="input col-span-2"
            disabled={sending || !slotsAvailable}
            autoComplete="off"
            required
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="input"
            disabled={sending || !slotsAvailable}
          >
            <option value="membro">Membro</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={sending || !slotsAvailable || !email.trim()}
          className="btn-primary w-full inline-flex items-center justify-center gap-1.5"
        >
          {sending && <Loader2 className="w-4 h-4 animate-spin" />}
          {sending ? "Enviando…" : slotsAvailable ? "Enviar convite" : "Sem vagas"}
        </button>
        {err && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}
        {info && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 flex items-start gap-2">
            <Check className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{info}</span>
          </div>
        )}
      </form>

      {/* Pendentes */}
      <div>
        <div className="text-[11px] font-display font-bold uppercase tracking-wide text-[#6B7280] mb-2">
          Convites pendentes
        </div>
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-[#9CA3AF]" />
          </div>
        )}
        {!loading && pending.length === 0 && (
          <div className="text-center text-[#9CA3AF] text-sm py-4">
            Nenhum convite pendente.
          </div>
        )}
        {!loading && pending.length > 0 && (
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="card p-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#0F172A] truncate">{p.email}</div>
                  <div className="text-[11px] text-[#6B7280]">
                    {p.role === "admin" ? "Admin" : "Membro"} · expira em {daysUntil(p.expira_em)}d
                  </div>
                </div>
                <button
                  onClick={() => copyInviteLink(p.token, p.id)}
                  type="button"
                  className="p-1.5 rounded-lg hover:bg-[#F3F4F6]"
                  title="Copiar link"
                >
                  {linkCopiedId === p.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-[#6B7280]" />}
                </button>
                <button
                  onClick={() => handleRevoke(p.id)}
                  type="button"
                  className="p-1.5 rounded-lg hover:bg-red-50"
                  title="Revogar"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function daysUntil(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}
