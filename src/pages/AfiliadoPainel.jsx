import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, Copy, Check, Tag, Sparkles, AtSign } from "lucide-react";
import { supabase } from "../lib/supabase";
import Logo from "../components/Logo";

const fmtBRL = (n) => `R$ ${Number(n ?? 0).toFixed(2).replace(".", ",")}`;
const fmtMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default function AfiliadoPainel() {
  const { cupom } = useParams();
  const [afiliado, setAfiliado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [comissoesPorMes, setComissoesPorMes] = useState([]);
  const [indicadosAtivos, setIndicadosAtivos] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!cupom) return;
    let active = true;
    (async () => {
      const { data: af, error: afErr } = await supabase
        .from("afiliados")
        .select("id, nome, cupom, instagram, comissao_percent, desconto_percent, total_indicados, total_receita, ativo, created_at")
        .ilike("cupom", cupom)
        .maybeSingle();
      if (!active) return;
      if (afErr || !af) { setError("Cupom não encontrado."); setLoading(false); return; }
      setAfiliado(af);

      const [{ data: com }, { count: ativosCount }] = await Promise.all([
        supabase
          .from("comissoes")
          .select("mes_referencia, valor_comissao, status, valor_assinatura")
          .eq("afiliado_id", af.id)
          .order("mes_referencia", { ascending: false }),
        supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("afiliado_id", af.id),
      ]);

      const grouped = new Map();
      for (const c of (com ?? [])) {
        const m = grouped.get(c.mes_referencia) ?? { mes: c.mes_referencia, total: 0, pendente: 0, pago: 0, count: 0, receita: 0 };
        m.total += Number(c.valor_comissao);
        m.receita += Number(c.valor_assinatura);
        m.count += 1;
        if (c.status === "pago") m.pago += Number(c.valor_comissao);
        else m.pendente += Number(c.valor_comissao);
        grouped.set(c.mes_referencia, m);
      }
      if (active) {
        setComissoesPorMes(Array.from(grouped.values()));
        setIndicadosAtivos(ativosCount ?? 0);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [cupom]);

  const shareUrl = `https://viajjei.com.br/?cupom=${(cupom ?? "").toUpperCase()}`;
  const copyShare = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch {}
  };
  const copyCupom = async () => {
    try { await navigator.clipboard.writeText((cupom ?? "").toUpperCase()); }
    catch {}
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]"><Loader2 className="w-6 h-6 animate-spin text-[#F97316]" /></div>;
  if (error)   return <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6"><div className="card p-8 max-w-sm text-center"><div className="text-4xl mb-2">🔍</div><div className="font-display font-extrabold text-[#0F172A]">{error}</div><Link to="/" className="btn-primary inline-flex items-center gap-2 mt-5">Voltar</Link></div></div>;

  const mesAtual = comissoesPorMes.find((m) => m.mes === fmtMonth()) ?? { total: 0, pendente: 0, pago: 0, count: 0 };
  const totalPendente = comissoesPorMes.reduce((s, m) => s + Number(m.pendente), 0);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/"><Logo size={24} /></Link>
          <div className="flex-1" />
          <div className="text-[12px] text-[#64748B] font-display font-bold">Painel de afiliado</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-widest font-display font-extrabold text-[#F97316]">Olá,</div>
          <h1 className="font-display font-extrabold text-[#0F172A] text-3xl mt-1">{afiliado.nome}</h1>
          {afiliado.instagram && (
            <a href={`https://instagram.com/${afiliado.instagram.replace("@", "")}`} target="_blank" rel="noreferrer"
               className="text-[#64748B] text-sm mt-0.5 inline-flex items-center gap-1 hover:text-[#F97316]">
              <AtSign className="w-3.5 h-3.5" /> {afiliado.instagram}
            </a>
          )}
          {!afiliado.ativo && <div className="mt-2 inline-block text-[12px] bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">Conta inativa — fale com o time</div>}
        </div>

        {/* Card grande: a receber este mês */}
        <section
          className="rounded-2xl p-6 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)", boxShadow: "0 12px 36px rgba(249,115,22,0.30)" }}
        >
          <div className="relative z-10">
            <div className="text-[11px] uppercase tracking-widest font-display font-extrabold opacity-90">A receber este mês</div>
            <div className="font-display font-extrabold tabular leading-none mt-2" style={{ fontSize: "clamp(42px, 9vw, 64px)" }}>
              {fmtBRL(mesAtual.pendente)}
            </div>
            <div className="mt-3 flex items-center gap-2 text-[12px] opacity-90">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{mesAtual.count} {mesAtual.count === 1 ? "indicação confirmada" : "indicações confirmadas"} · {Number(afiliado.comissao_percent).toFixed(0)}% de comissão</span>
            </div>
          </div>
          <div className="absolute -bottom-8 -right-8 text-9xl opacity-10">💸</div>
        </section>

        {/* Métricas acumuladas */}
        <section className="grid grid-cols-3 gap-3">
          <MetricCard label="Indicados ativos" value={indicadosAtivos} />
          <MetricCard label="Total recebido" value={fmtBRL(afiliado.total_receita * Number(afiliado.comissao_percent) / 100)} />
          <MetricCard label="Pendente acumulado" value={fmtBRL(totalPendente)} highlight />
        </section>

        {/* Compartilhar */}
        <section className="card p-6">
          <div className="font-display font-extrabold text-[#0F172A] flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#F97316]" /> Seu cupom
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button onClick={copyCupom} className="bg-[#FFF7ED] hover:bg-[#FFEDD5] text-[#EA580C] px-3 py-2 rounded-lg font-display font-extrabold text-lg inline-flex items-center gap-2 transition">
              {afiliado.cupom}
              <Copy className="w-4 h-4 opacity-70" />
            </button>
            {Number(afiliado.desconto_percent) > 0 && (
              <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 font-display font-bold">
                Desconto de {Number(afiliado.desconto_percent).toFixed(0)}% pro indicado
              </span>
            )}
          </div>

          <div className="mt-4 text-[12px] text-[#64748B] font-display font-bold">Link de indicação:</div>
          <div className="mt-1 flex items-center gap-2">
            <input readOnly value={shareUrl} className="input flex-1 text-[13px]" />
            <button onClick={copyShare} className="btn-ghost inline-flex items-center gap-1.5 !py-2.5">
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? "Copiado!" : "Copiar"}</span>
            </button>
          </div>
          <p className="text-[12px] text-[#64748B] mt-3 leading-relaxed">
            Quando alguém criar conta usando esse link e assinar, você ganha{" "}
            <strong className="text-[#F97316]">{Number(afiliado.comissao_percent).toFixed(0)}% de comissão</strong> sobre o valor da assinatura.
            {Number(afiliado.desconto_percent) > 0 && (
              <> E quem usar seu cupom ganha <strong className="text-emerald-700">{Number(afiliado.desconto_percent).toFixed(0)}% de desconto</strong> na assinatura.</>
            )}
          </p>
        </section>

        {/* Histórico */}
        <section className="card p-6">
          <div className="font-display font-extrabold text-[#0F172A] mb-3">Histórico mensal</div>
          {comissoesPorMes.length === 0 ? (
            <div className="text-[#64748B] text-sm">Sem comissões ainda. Compartilhe seu cupom!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[#64748B] text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="py-2">Mês</th>
                    <th className="text-right">Indic.</th>
                    <th className="text-right">Pendente</th>
                    <th className="text-right">Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {comissoesPorMes.map((m) => (
                    <tr key={m.mes}>
                      <td className="py-2.5 font-display font-bold text-[#0F172A]">{m.mes}</td>
                      <td className="text-right tabular">{m.count}</td>
                      <td className="text-right tabular text-[#F97316]">{fmtBRL(m.pendente)}</td>
                      <td className="text-right tabular text-emerald-700">{fmtBRL(m.pago)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-center text-[12px] text-[#94A3B8]">
          Dúvidas? <a href="mailto:sidney@grupomultvision.com" className="text-[#F97316] font-display font-bold">sidney@grupomultvision.com</a>
        </p>
      </main>
    </div>
  );
}

function MetricCard({ label, value, highlight = false }) {
  return (
    <div className="card p-4 text-center">
      <div className={`font-display font-extrabold tabular leading-none ${highlight ? "text-[#F97316]" : "text-[#0F172A]"}`} style={{ fontSize: "clamp(18px, 3.5vw, 22px)" }}>
        {value}
      </div>
      <div className="text-[10px] text-[#64748B] font-display font-bold uppercase tracking-wide mt-1.5 leading-tight">{label}</div>
    </div>
  );
}
