import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Plus, Edit2, Loader2, X, Check, Tag, Mail, AtSign, Percent, ExternalLink } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { isOwner } from "../data/plans";

const fmtBRL = (n) => `R$ ${Number(n ?? 0).toFixed(2).replace(".", ",")}`;
const fmtMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function genCupom(nome) {
  const base = (nome ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  const suffix = Math.floor(Math.random() * 90 + 10);
  return base ? `${base}${suffix}` : `VIA${Math.floor(Math.random() * 9000 + 1000)}`;
}

export default function AdminAfiliados() {
  const { user } = useAuth();
  const [afiliados, setAfiliados] = useState([]);
  const [comissoes, setComissoes] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | row
  const [mes, setMes] = useState(fmtMonth());
  const [loading, setLoading] = useState(true);

  if (!user) return <Navigate to="/welcome" replace />;
  if (!isOwner(user.plano)) return <OnlyOwner />;

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: af } = await supabase.from("afiliados").select("*").order("created_at", { ascending: false });
      if (active) setAfiliados(af ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!mes) return;
    (async () => {
      const { data } = await supabase
        .from("comissoes")
        .select("*, afiliado:afiliados(nome,cupom)")
        .eq("mes_referencia", mes)
        .order("created_at", { ascending: false });
      setComissoes(data ?? []);
    })();
  }, [mes]);

  const reload = async () => {
    const { data } = await supabase.from("afiliados").select("*").order("created_at", { ascending: false });
    setAfiliados(data ?? []);
  };

  const save = async (form) => {
    const payload = {
      nome: form.nome.trim(),
      email: form.email.trim().toLowerCase(),
      instagram: form.instagram?.trim() || null,
      cupom: form.cupom.trim().toUpperCase(),
      comissao_percent: Number(form.comissao_percent ?? 5),
      ativo: !!form.ativo,
    };
    if (form.id) {
      const { error } = await supabase.from("afiliados").update(payload).eq("id", form.id);
      if (error) { alert("Erro: " + error.message); return; }
    } else {
      const { error } = await supabase.from("afiliados").insert(payload);
      if (error) { alert("Erro: " + error.message); return; }
    }
    setEditing(null);
    await reload();
  };

  const togglePago = async (com) => {
    const next = com.status === "pago" ? "pendente" : "pago";
    const { error } = await supabase.from("comissoes").update({ status: next }).eq("id", com.id);
    if (error) { alert("Erro: " + error.message); return; }
    setComissoes((prev) => prev.map((c) => c.id === com.id ? { ...c, status: next } : c));
  };

  const exportCsv = () => {
    const rows = [
      ["Afiliado", "Cupom", "Mês", "Valor assinatura", "%", "Comissão", "Status"],
      ...comissoes.map((c) => [
        c.afiliado?.nome ?? "?",
        c.afiliado?.cupom ?? "?",
        c.mes_referencia,
        Number(c.valor_assinatura).toFixed(2).replace(".", ","),
        Number(c.percentual).toFixed(2).replace(".", ","),
        Number(c.valor_comissao).toFixed(2).replace(".", ","),
        c.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `comissoes-${mes}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="rounded-full bg-[#F8FAFC] hover:bg-[#E2E8F0] p-2"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="font-display font-extrabold text-lg text-[#0F172A] flex-1">Afiliados</div>
          <button onClick={() => setEditing("new")} className="btn-primary inline-flex items-center gap-1.5 !py-2 text-sm">
            <Plus className="w-4 h-4" /> Novo
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Lista de afiliados */}
        <section className="card p-5">
          <div className="font-display font-extrabold text-[#0F172A] text-base mb-3">Afiliados ativos</div>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#F97316]" /></div>
          ) : afiliados.length === 0 ? (
            <div className="text-[#64748B] text-sm">Nenhum afiliado ainda. Clique em "+ Novo" pra começar.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[#64748B] text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="py-2">Nome</th>
                    <th>Cupom</th>
                    <th className="hidden sm:table-cell">Instagram</th>
                    <th className="text-right">%</th>
                    <th className="text-right">Indic.</th>
                    <th className="text-right">Receita</th>
                    <th className="text-right">Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {afiliados.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2.5 font-display font-bold text-[#0F172A]">{a.nome}</td>
                      <td><code className="text-[12px] bg-[#FFF7ED] text-[#EA580C] px-1.5 py-0.5 rounded">{a.cupom}</code></td>
                      <td className="hidden sm:table-cell text-[#64748B] text-[12px]">{a.instagram ?? "—"}</td>
                      <td className="text-right tabular">{Number(a.comissao_percent).toFixed(0)}%</td>
                      <td className="text-right tabular">{a.total_indicados}</td>
                      <td className="text-right tabular">{fmtBRL(a.total_receita)}</td>
                      <td className="text-right">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${a.ativo ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {a.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="text-right">
                        <button onClick={() => setEditing(a)} className="text-[#F97316] hover:text-[#EA580C] p-1">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <Link to={`/afiliado/${a.cupom}`} target="_blank" className="text-[#64748B] hover:text-[#0F172A] p-1 inline-block">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Relatório de comissões */}
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="font-display font-extrabold text-[#0F172A] text-base flex-1">Comissões</div>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="input !py-1.5 !px-2 text-sm" />
            <button onClick={exportCsv} className="btn-ghost !py-1.5 !px-3 text-sm">CSV</button>
          </div>
          {comissoes.length === 0 ? (
            <div className="text-[#64748B] text-sm">Sem comissões em {mes}.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[#64748B] text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="py-2">Afiliado</th>
                    <th>Cupom</th>
                    <th className="text-right">Assinatura</th>
                    <th className="text-right">%</th>
                    <th className="text-right">Comissão</th>
                    <th className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {comissoes.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 font-display font-bold text-[#0F172A]">{c.afiliado?.nome ?? "?"}</td>
                      <td><code className="text-[11px] bg-[#FFF7ED] text-[#EA580C] px-1.5 py-0.5 rounded">{c.afiliado?.cupom ?? "?"}</code></td>
                      <td className="text-right tabular">{fmtBRL(c.valor_assinatura)}</td>
                      <td className="text-right tabular">{Number(c.percentual).toFixed(0)}%</td>
                      <td className="text-right tabular font-display font-extrabold">{fmtBRL(c.valor_comissao)}</td>
                      <td className="text-right">
                        <button
                          onClick={() => togglePago(c)}
                          className={`text-[11px] px-2 py-0.5 rounded-full font-display font-bold ${c.status === "pago" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                          title="Clique pra alternar"
                        >
                          {c.status === "pago" ? "✓ Pago" : "Pendente"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {editing && (
        <AfiliadoForm
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

function AfiliadoForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(() => initial ?? {
    nome: "", email: "", instagram: "", cupom: "",
    comissao_percent: 5, ativo: true,
  });
  const setF = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const valid = form.nome.trim() && form.email.trim() && form.cupom.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 animate-fade-up" onClick={onCancel}>
      <div className="w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl bg-white max-h-[92vh] overflow-y-auto animate-pop" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 flex items-center gap-2">
          <div className="font-display font-extrabold text-[#0F172A] flex-1">{initial ? "Editar afiliado" : "Novo afiliado"}</div>
          <button onClick={onCancel} className="p-1 rounded-full hover:bg-[#F8FAFC]"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field icon={Mail}>
            <input className="input" placeholder="Nome*" value={form.nome} onChange={(e) => setF("nome", e.target.value)} maxLength={80} />
          </Field>
          <Field icon={Mail}>
            <input className="input" placeholder="Email*" type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} maxLength={120} />
          </Field>
          <Field icon={AtSign}>
            <input className="input" placeholder="@instagram (opcional)" value={form.instagram} onChange={(e) => setF("instagram", e.target.value)} maxLength={60} />
          </Field>
          <div className="flex gap-2">
            <Field icon={Tag} className="flex-1">
              <input className="input uppercase" placeholder="CUPOM*" value={form.cupom} onChange={(e) => setF("cupom", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={20} />
            </Field>
            <button
              type="button"
              onClick={() => setF("cupom", genCupom(form.nome))}
              className="text-[12px] text-[#F97316] font-display font-bold hover:underline"
              title="Gerar cupom automático"
            >
              gerar
            </button>
          </div>
          <div>
            <label className="text-xs font-display font-bold text-[#64748B] flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5" /> Comissão: <strong>{Number(form.comissao_percent).toFixed(0)}%</strong>
            </label>
            <input type="range" min="1" max="30" step="1" value={form.comissao_percent} onChange={(e) => setF("comissao_percent", Number(e.target.value))} className="w-full mt-2" />
          </div>
          <label className="flex items-center gap-2 text-sm text-[#374151]">
            <input type="checkbox" checked={!!form.ativo} onChange={(e) => setF("ativo", e.target.checked)} /> Ativo
          </label>
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onCancel} className="btn-ghost">Cancelar</button>
          <button onClick={() => onSave(form)} className="btn-primary inline-flex items-center gap-1.5" disabled={!valid}>
            <Check className="w-4 h-4" /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, children, className = "" }) {
  return (
    <label className={`relative block ${className}`}>
      <Icon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
      <div className="[&>input]:pl-10">{children}</div>
    </label>
  );
}

function OnlyOwner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4">
      <div className="card p-8 max-w-sm text-center">
        <div className="text-4xl mb-3">🔒</div>
        <div className="font-display font-extrabold text-[#0F172A] text-lg">Acesso restrito</div>
        <p className="text-[#64748B] text-sm mt-1">Apenas administradores acessam essa página.</p>
        <Link to="/" className="btn-primary inline-flex items-center gap-2 mt-5">Voltar</Link>
      </div>
    </div>
  );
}
