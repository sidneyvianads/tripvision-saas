import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Sparkles, ExternalLink, AlertCircle, KeyRound, Trash2, Loader2, Bell } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase, sha256Hex, normalizePassword } from "../lib/supabase";
import { PLANS, planName, planIcon, isPaid, isOwner } from "../data/plans";
import UpgradeModal from "../components/UpgradeModal";
import ConfirmModal from "../components/ConfirmModal";
import Avatar from "../components/Avatar";

const formatBR = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return null; }
};

export default function Account() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [assinatura, setAssinatura] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(params.get("upgrade") != null);
  const [loading, setLoading] = useState(true);

  // Trocar senha
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  // Deletar conta
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  // Notificações
  const [notifOn, setNotifOn] = useState(user?.notifications_on ?? true);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    const oldClean = normalizePassword(pwOld);
    const newClean = normalizePassword(pwNew);
    if (newClean.length < 6) return setPwMsg({ type: "err", text: "Nova senha precisa ter no mínimo 6 caracteres." });
    if (newClean !== normalizePassword(pwNew2)) return setPwMsg({ type: "err", text: "As senhas não conferem." });

    setPwBusy(true);
    try {
      const oldHash = await sha256Hex(oldClean);
      const { data: row } = await supabase.from("users").select("senha_hash").eq("id", user.id).maybeSingle();
      if (!row || row.senha_hash !== oldHash) {
        throw new Error("Senha atual incorreta.");
      }
      const newHash = await sha256Hex(newClean);
      const { error } = await supabase.from("users").update({ senha_hash: newHash }).eq("id", user.id);
      if (error) throw new Error(error.message);
      setPwMsg({ type: "ok", text: "Senha atualizada!" });
      setPwOld(""); setPwNew(""); setPwNew2("");
    } catch (err) {
      setPwMsg({ type: "err", text: err.message });
    } finally { setPwBusy(false); }
  };

  const handleDeleteAccount = async () => {
    setDelBusy(true);
    try {
      // Apaga viagens onde é owner (CASCADE remove tudo associado)
      await supabase.from("viagens").delete().eq("owner_id", user.id);
      await supabase.from("users").delete().eq("id", user.id);
      signOut();
      navigate("/", { replace: true });
    } catch (err) {
      alert("Erro ao deletar conta: " + err.message);
      setDelBusy(false);
      setConfirmDelete(false);
    }
  };

  const handleToggleNotif = async () => {
    const next = !notifOn;
    setNotifOn(next);
    try { await supabase.from("users").update({ notifications_on: next }).eq("id", user.id); }
    catch (e) { console.warn("[notif toggle]", e); }
  };

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("assinaturas")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["active", "pending", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      setAssinatura(data);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user?.id]);

  if (!user) return null;
  const plano = user.plano ?? "free";
  const planoData = PLANS[plano];
  const isFree = !isPaid(plano);
  const isOwnerUser = isOwner(plano);

  return (
    <div className="min-h-screen flex flex-col bg-app">
      <header className="bg-white safe-top" style={{ borderBottom: "1px solid #E5E7EB" }}>
        <div className="px-4 pt-4 pb-4 flex items-center gap-3">
          <Link to="/" className="rounded-full bg-[#F3F4F6] hover:bg-[#E5E7EB] p-2" aria-label="Voltar">
            <ArrowLeft className="w-4 h-4 text-[#1F2937]" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-lg leading-tight text-[#1F2937]">Minha conta</div>
            <div className="text-[#6B7280] text-xs truncate">{user.email}</div>
          </div>
          <Avatar user={user} size={36} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-12 max-w-2xl mx-auto w-full">
        {/* Card de plano */}
        <section className="card p-5">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{planoIcon(plano)}</span>
            <span className="font-display font-extrabold text-xl text-[#0F1B2D]">Plano {planName(plano)}</span>
            {!isFree && (
              <span
                className="badge ml-auto"
                style={{ background: planoData?.cor + "33", color: planoData?.cor }}
              >
                ATIVO
              </span>
            )}
          </div>
          <p className="text-[13px] text-[#1A3A4A]/75 mt-1">{planoData?.tagline ?? ""}</p>

          {!isFree && assinatura && (
            <div className="mt-3 text-[13px] text-[#1A3A4A]/85 space-y-1">
              <div>Ciclo: <strong>{assinatura.ciclo === "anual" ? "Anual" : "Mensal"}</strong></div>
              {assinatura.current_period_end && (
                <div>Próxima cobrança: <strong>{formatBR(assinatura.current_period_end)}</strong></div>
              )}
              {assinatura.amount && (
                <div>Valor: <strong>R$ {Number(assinatura.amount).toFixed(2).replace(".", ",")}</strong></div>
              )}
            </div>
          )}

          {!isFree && !isOwnerUser && (
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="https://www.mercadopago.com.br/subscriptions"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-display font-bold border-2"
                style={{ borderColor: "#7CB9E8", color: "#1A3A4A" }}
              >
                Gerenciar no Mercado Pago <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => setShowUpgrade(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-display font-bold"
                style={{ background: "rgba(124, 185, 232, 0.15)", color: "#1A3A4A" }}
              >
                Trocar plano
              </button>
            </div>
          )}

          {isOwnerUser && (
            <div className="mt-3 rounded-xl px-3 py-2 text-[13px] font-display font-bold" style={{ background: "rgba(234, 179, 8, 0.12)", color: "#854D0E", border: "1px solid #EAB308" }}>
              👑 Acesso interno — sem cobrança, sem limites.
            </div>
          )}

          {isFree && (
            <button
              onClick={() => setShowUpgrade(true)}
              className="btn-primary mt-4 inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Assinar Pro
            </button>
          )}
        </section>

        {/* Features incluídas */}
        <section className="card p-5 mt-3">
          <div className="font-display font-extrabold text-[#0F1B2D]">O que está incluído</div>
          <ul className="mt-2 space-y-1 text-[13px] text-[#1A3A4A]">
            {(planoData?.features ?? []).map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-emerald-600">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Conta */}
        <section className="card p-5 mt-3">
          <div className="font-display font-extrabold text-[#1F2937]">Sua conta</div>
          <div className="text-[13px] text-[#374151] mt-2 space-y-1">
            <div>Nome: <strong>{user.nome}</strong></div>
            <div>E-mail: <strong>{user.email}</strong></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (!confirm("Sair? Sua sessão será encerrada nesse navegador.")) return;
                signOut();
                navigate("/");
              }}
              className="text-sm text-red-600 hover:underline font-display font-bold"
            >
              Sair da conta
            </button>
          </div>
        </section>

        {/* Trocar senha */}
        <section className="card p-5 mt-3">
          <div className="font-display font-extrabold text-[#1F2937] flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#6366F1]" /> Alterar senha
          </div>
          <form onSubmit={handleChangePassword} className="mt-3 space-y-2">
            <input type="password" className="input" placeholder="Senha atual" value={pwOld} onChange={(e) => setPwOld(e.target.value)} autoComplete="current-password" required />
            <input type="password" className="input" placeholder="Nova senha (mín. 6)" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" required />
            <input type="password" className="input" placeholder="Confirmar nova senha" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} autoComplete="new-password" required />
            {pwMsg && (
              <div className={`rounded-xl px-3 py-2 text-sm ${pwMsg.type === "ok" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {pwMsg.text}
              </div>
            )}
            <button type="submit" className="btn-primary w-full inline-flex items-center justify-center gap-2" disabled={pwBusy}>
              {pwBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Atualizar senha
            </button>
          </form>
        </section>

        {/* Notificações (placeholder) */}
        <section className="card p-5 mt-3">
          <div className="font-display font-extrabold text-[#1F2937] flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#F59E0B]" /> Notificações
          </div>
          <label className="flex items-center justify-between mt-3 cursor-pointer">
            <span className="text-[13px] text-[#374151]">
              Receber notificações
              <div className="text-[11px] text-[#9CA3AF]">Em breve — atualmente apenas guarda sua preferência.</div>
            </span>
            <button
              type="button"
              onClick={handleToggleNotif}
              className="relative w-11 h-6 rounded-full transition"
              style={{ background: notifOn ? "#6366F1" : "#D1D5DB" }}
              aria-pressed={notifOn}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                style={{ left: notifOn ? "calc(100% - 22px)" : "2px" }}
              />
            </button>
          </label>
        </section>

        {/* Deletar conta */}
        <section className="card p-5 mt-3 border-red-200" style={{ borderColor: "#FECACA" }}>
          <div className="font-display font-extrabold text-red-700 flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Deletar conta
          </div>
          <p className="text-[13px] text-[#374151] mt-2">
            Todos os seus dados (viagens, mensagens, checklists, fotos) serão apagados permanentemente. Não dá pra desfazer.
          </p>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-3 px-4 py-2.5 rounded-xl font-display font-extrabold text-sm bg-red-600 hover:bg-red-700 text-white inline-flex items-center gap-2"
            disabled={delBusy}
          >
            {delBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Excluir minha conta
          </button>
        </section>

        <ConfirmModal
          open={confirmDelete}
          title="Excluir conta?"
          body="Todos os seus dados serão apagados permanentemente. Inclui suas viagens (com roteiro, chat, checklist e contatos), foto de perfil e histórico de IA. Não dá pra desfazer."
          confirmLabel="Sim, excluir tudo"
          confirmVariant="danger"
          onConfirm={handleDeleteAccount}
          onClose={() => setConfirmDelete(false)}
        />

        <section className="card p-5 mt-3 text-[12px] text-[#1A3A4A]/70 space-y-1">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Dúvidas ou cancelamento? Escreva pra <a href="mailto:sidney@grupomultvision.com" className="text-[#2E86C1] underline">sidney@grupomultvision.com</a>
          </div>
        </section>
      </main>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason="upgrade"
        user={user}
      />
    </div>
  );
}

function planoIcon(p) { return planIcon(p); }
