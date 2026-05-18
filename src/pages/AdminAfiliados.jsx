import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Edit2, Loader2, X, Check, Tag, Mail, AtSign, Percent,
  ExternalLink, Users as UsersIcon, BarChart3, Receipt, Megaphone, Image as ImageIcon,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { isOwner } from "../data/plans";
import { friendlyError } from "../lib/errorMessages";

const fmtBRL = (n) => `R$ ${Number(n ?? 0).toFixed(2).replace(".", ",")}`;
const fmtMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

function genCupom(nome) {
  const base = (nome ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  const suffix = Math.floor(Math.random() * 90 + 10);
  return base ? `${base}${suffix}` : `VIA${Math.floor(Math.random() * 9000 + 1000)}`;
}

const TABS = [
  { id: "afiliados", label: "Afiliados", icon: Megaphone },
  { id: "usuarios",  label: "Usuários",  icon: UsersIcon },
  { id: "comissoes", label: "Comissões", icon: Receipt },
  { id: "metricas",  label: "Métricas",  icon: BarChart3 },
];

export default function AdminAfiliados() {
  const { user } = useAuth();
  const [tab, setTab] = useState("afiliados");

  if (!user) return <Navigate to="/welcome" replace />;
  if (!isOwner(user.plano)) return <OnlyOwner />;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="rounded-full bg-[#F8FAFC] hover:bg-[#E2E8F0] p-2"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="font-display font-extrabold text-lg text-[#0F172A] flex-1">Painel · Afiliados & Usuários</div>
        </div>
        <div className="max-w-6xl mx-auto px-4 pb-1 flex gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-3 py-2 text-sm font-display font-bold inline-flex items-center gap-1.5 border-b-2 transition whitespace-nowrap"
                style={{
                  borderColor: active ? "#F97316" : "transparent",
                  color: active ? "#EA580C" : "#64748B",
                }}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {tab === "afiliados" && <AfiliadosTab />}
        {tab === "usuarios"  && <UsuariosTab />}
        {tab === "comissoes" && <ComissoesTab />}
        {tab === "metricas"  && <MetricasTab />}
      </main>
    </div>
  );
}

// =============== AFILIADOS TAB ===============

function AfiliadosTab() {
  const [afiliados, setAfiliados] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    // RPC SECURITY DEFINER — guard interno checa is_platform_owner().
    // Substitui select("*") direto na tabela (quebrado pós-R3 porque
    // a coluna `email` foi revogada de authenticated pra proteger
    // /afiliado/<cupom> público).
    const { data, error } = await supabase.rpc("admin_afiliados_list");
    if (error) {
      console.error("[AdminAfiliados] reload erro:", error);
      setAfiliados([]);
    } else {
      setAfiliados(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const save = async (form) => {
    // R9-3: RPC admin_upsert_afiliado SECURITY DEFINER (guard
    // is_platform_owner). REVOKE table-level INSERT/UPDATE em afiliados
    // significa que o client direto via supabase.from("afiliados").insert
    // bate em "permission denied". RPC é o único caminho de write.
    const { error } = await supabase.rpc("admin_upsert_afiliado", {
      p_id: form.id ?? null,
      p_nome: form.nome.trim(),
      p_email: form.email.trim().toLowerCase(),
      p_instagram: form.instagram?.trim() || null,
      p_cupom: form.cupom.trim().toUpperCase(),
      p_foto_url: form.foto_url?.trim() || null,
      p_comissao_percent: Number(form.comissao_percent ?? 5),
      p_desconto_percent: Number(form.desconto_percent ?? 0),
      p_ativo: !!form.ativo,
    });
    if (error) {
      console.error("[AdminAfiliados] upsert erro:", error);
      alert("Erro. " + friendlyError(error));
      return;
    }
    setEditing(null);
    await reload();
  };

  return (
    <>
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="font-display font-extrabold text-[#0F172A] text-base flex-1">Afiliados</div>
          <button onClick={() => setEditing("new")} className="btn-primary inline-flex items-center gap-1.5 !py-2 text-sm">
            <Plus className="w-4 h-4" /> Novo
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#F97316]" /></div>
        ) : afiliados.length === 0 ? (
          <div className="text-[#64748B] text-sm">Nenhum afiliado ainda. Clique em "+ Novo" pra começar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[#64748B] text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="py-2"></th>
                  <th>Nome</th>
                  <th>Cupom</th>
                  <th className="hidden sm:table-cell">Instagram</th>
                  <th className="text-right">Comissão</th>
                  <th className="text-right">Desconto</th>
                  <th className="text-right">Indic.</th>
                  <th className="text-right">Receita</th>
                  <th className="text-right">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {afiliados.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 w-8">
                      <FotoThumb foto_url={a.foto_url} nome={a.nome} />
                    </td>
                    <td className="py-2.5 font-display font-bold text-[#0F172A]">{a.nome}</td>
                    <td><code className="text-[12px] bg-[#FFF7ED] text-[#EA580C] px-1.5 py-0.5 rounded">{a.cupom}</code></td>
                    <td className="hidden sm:table-cell text-[#64748B] text-[12px]">{a.instagram ?? "—"}</td>
                    <td className="text-right tabular">{Number(a.comissao_percent).toFixed(0)}%</td>
                    <td className="text-right tabular">{Number(a.desconto_percent ?? 0).toFixed(0)}%</td>
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

      {editing && (
        <AfiliadoForm
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </>
  );
}

function AfiliadoForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(() => initial ?? {
    nome: "", email: "", instagram: "", cupom: "", foto_url: "",
    comissao_percent: 10, desconto_percent: 0, ativo: true,
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
          <div className="flex items-center gap-3">
            <FotoThumb foto_url={form.foto_url} nome={form.nome} size={48} />
            <Field icon={ImageIcon} className="flex-1">
              <input
                className="input"
                placeholder="URL da foto (opcional)"
                value={form.foto_url}
                onChange={(e) => setF("foto_url", e.target.value)}
                maxLength={500}
              />
            </Field>
          </div>
          <div className="text-[11px] text-[#94A3B8] -mt-1">
            Cole o link direto da foto do influenciador (ex: link da imagem do Instagram, Imgur, etc).
            Se ficar em branco, mostramos as iniciais coloridas no card de seleção.
          </div>
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
              <Percent className="w-3.5 h-3.5" /> Comissão pra o afiliado: <strong>{Number(form.comissao_percent).toFixed(0)}%</strong>
            </label>
            <input type="range" min="1" max="30" step="1" value={form.comissao_percent} onChange={(e) => setF("comissao_percent", Number(e.target.value))} className="w-full mt-2" />
          </div>
          <div>
            <label className="text-xs font-display font-bold text-[#64748B] flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Desconto pro indicado: <strong>{Number(form.desconto_percent ?? 0).toFixed(0)}%</strong>
            </label>
            <input type="range" min="0" max="50" step="5" value={form.desconto_percent ?? 0} onChange={(e) => setF("desconto_percent", Number(e.target.value))} className="w-full mt-2" />
            <div className="text-[11px] text-[#94A3B8] mt-1">Aplicado sobre a assinatura mensal/anual. Use 0 pra não dar desconto.</div>
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

// =============== USUÁRIOS TAB ===============

function UsuariosTab() {
  const [users, setUsers] = useState([]);
  const [afiliados, setAfiliados] = useState([]);
  const [filter, setFilter] = useState("todos"); // todos | organico | afiliado | instagram | google
  const [afiliadoFilter, setAfiliadoFilter] = useState("");
  const [loading, setLoading] = useState(true);
  // R13-1: mountedAt fica estável entre renders (lazy useState init roda só
  // uma vez). userStatus chamava Date.now() inline → impuro em React 19
  // concurrent. Granularidade de plano/trial é dias, então mountedAt é
  // tão bom quanto "agora" — admin recarrega a aba quando precisar de
  // atualização.
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    (async () => {
      const [{ data: u }, { data: af }] = await Promise.all([
        supabase
          .from("users")
          .select("id, nome, email, plano, plano_expires_at, trial_ends_at, origem, afiliado_id, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("afiliados").select("id, nome, cupom").order("nome"),
      ]);
      setUsers(u ?? []);
      setAfiliados(af ?? []);
      setLoading(false);
    })();
  }, []);

  const afiliadoMap = useMemo(() => {
    const m = new Map();
    afiliados.forEach((a) => m.set(a.id, a));
    return m;
  }, [afiliados]);

  const filtered = useMemo(() => {
    let list = users;
    if (filter !== "todos") {
      list = list.filter((u) => (u.origem ?? "organico") === filter);
    }
    if (afiliadoFilter) {
      list = list.filter((u) => u.afiliado_id === afiliadoFilter);
    }
    return list;
  }, [users, filter, afiliadoFilter]);

  const userStatus = (u) => {
    if (u.plano === "owner") return { label: "Owner", color: "bg-amber-100 text-amber-800" };
    if (!["pro", "grupo"].includes(u.plano)) return { label: "Sem plano", color: "bg-gray-100 text-gray-600" };
    const exp = u.plano_expires_at ? new Date(u.plano_expires_at).getTime() : null;
    if (exp && exp < mountedAt) return { label: "Expirado", color: "bg-red-100 text-red-700" };
    const trial = u.trial_ends_at ? new Date(u.trial_ends_at).getTime() : null;
    if (trial && trial > mountedAt) return { label: "Trial", color: "bg-emerald-100 text-emerald-700" };
    return { label: "Ativo", color: "bg-blue-100 text-blue-700" };
  };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="font-display font-extrabold text-[#0F172A] text-base flex-1">Usuários ({filtered.length})</div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input !py-1.5 !px-2 text-sm">
          <option value="todos">Todas origens</option>
          <option value="organico">Orgânico</option>
          <option value="afiliado">Afiliado</option>
          <option value="instagram">Instagram</option>
          <option value="google">Google</option>
        </select>
        <select value={afiliadoFilter} onChange={(e) => setAfiliadoFilter(e.target.value)} className="input !py-1.5 !px-2 text-sm">
          <option value="">Todos afiliados</option>
          {afiliados.map((a) => (
            <option key={a.id} value={a.id}>{a.nome} · {a.cupom}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#F97316]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-[#64748B] text-sm">Nenhum usuário com esses filtros.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[#64748B] text-[11px] uppercase tracking-wide">
              <tr>
                <th className="py-2">Nome / Email</th>
                <th>Plano</th>
                <th>Origem</th>
                <th>Afiliado</th>
                <th>Cadastro</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filtered.map((u) => {
                const st = userStatus(u);
                const af = u.afiliado_id ? afiliadoMap.get(u.afiliado_id) : null;
                return (
                  <tr key={u.id}>
                    <td className="py-2.5">
                      <div className="font-display font-bold text-[#0F172A]">{u.nome}</div>
                      <div className="text-[11px] text-[#64748B]">{u.email}</div>
                    </td>
                    <td className="text-[12px] text-[#0F172A]">{u.plano ?? "—"}</td>
                    <td className="text-[12px] text-[#64748B]">{u.origem ?? "organico"}</td>
                    <td className="text-[12px]">
                      {af ? <code className="bg-[#FFF7ED] text-[#EA580C] px-1.5 py-0.5 rounded">{af.cupom}</code> : <span className="text-[#94A3B8]">—</span>}
                    </td>
                    <td className="text-[12px] text-[#64748B] tabular">{fmtDate(u.created_at)}</td>
                    <td><span className={`text-[11px] px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// =============== COMISSÕES TAB ===============

function ComissoesTab() {
  const [comissoes, setComissoes] = useState([]);
  const [mes, setMes] = useState(fmtMonth());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mes) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("comissoes")
        .select("*, afiliado:afiliados(nome,cupom)")
        .eq("mes_referencia", mes)
        .order("created_at", { ascending: false });
      setComissoes(data ?? []);
      setLoading(false);
    })();
  }, [mes]);

  const togglePago = async (com) => {
    const next = com.status === "pago" ? "pendente" : "pago";
    // R10-3: RPC SECURITY DEFINER (guard is_platform_owner). UPDATE direto
    // na tabela bate em permission denied desde R9-3 REVOKE writes.
    const { error } = await supabase.rpc("admin_set_comissao_status", { p_id: com.id, p_status: next });
    if (error) {
      console.error("[AdminAfiliados] set status erro:", error);
      alert("Erro. " + friendlyError(error));
      return;
    }
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

  const totalDevido = comissoes.filter((c) => c.status === "pendente").reduce((s, c) => s + Number(c.valor_comissao), 0);
  const totalPago = comissoes.filter((c) => c.status === "pago").reduce((s, c) => s + Number(c.valor_comissao), 0);

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="font-display font-extrabold text-[#0F172A] text-base flex-1">Comissões</div>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="input !py-1.5 !px-2 text-sm" />
        <button onClick={exportCsv} className="btn-ghost !py-1.5 !px-3 text-sm">CSV</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Stat label="Pendente" value={fmtBRL(totalDevido)} highlight />
        <Stat label="Pago" value={fmtBRL(totalPago)} />
        <Stat label="Comissões" value={comissoes.length} />
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#F97316]" /></div>
      ) : comissoes.length === 0 ? (
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
  );
}

// =============== MÉTRICAS TAB ===============

function MetricasTab() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    (async () => {
      const monthIso = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
      const [{ data: users }, { data: assinaturas }] = await Promise.all([
        supabase.from("users").select("id, plano, plano_expires_at, trial_ends_at, origem, created_at").limit(1000),
        supabase.from("assinaturas").select("status, amount, ciclo, created_at").limit(1000),
      ]);

      const u = users ?? [];
      const a = assinaturas ?? [];

      const totalUsers = u.length;
      const newUsersMonth = u.filter((x) => x.created_at >= monthIso).length;

      const byOrigem = u.reduce((m, x) => {
        const o = x.origem ?? "organico";
        m[o] = (m[o] ?? 0) + 1;
        return m;
      }, {});

      const trialUsers = u.filter((x) => x.trial_ends_at && new Date(x.trial_ends_at).getTime() > Date.now()).length;
      const activePaidUsers = u.filter((x) => ["pro", "grupo"].includes(x.plano) && (!x.plano_expires_at || new Date(x.plano_expires_at).getTime() > Date.now())).length;

      const activeSubs = a.filter((s) => s.status === "active");
      // MRR: assinatura anual conta amount/12 por mês
      const mrr = activeSubs.reduce((s, x) => {
        const amount = Number(x.amount ?? 0);
        return s + (x.ciclo === "anual" ? amount / 12 : amount);
      }, 0);

      setMetrics({ totalUsers, newUsersMonth, byOrigem, trialUsers, activePaidUsers, mrr });
    })();
  }, []);

  if (!metrics) {
    return (
      <section className="card p-5 flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[#F97316]" />
      </section>
    );
  }

  const total = Object.values(metrics.byOrigem).reduce((s, v) => s + v, 0) || 1;

  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total usuários" value={metrics.totalUsers} />
        <Stat label="Novos (30d)" value={metrics.newUsersMonth} />
        <Stat label="Em trial" value={metrics.trialUsers} highlight />
        <Stat label="Pagantes ativos" value={metrics.activePaidUsers} />
      </section>

      <section className="card p-5">
        <div className="font-display font-extrabold text-[#0F172A] mb-3">Por onde chegaram</div>
        <div className="space-y-2">
          {Object.entries(metrics.byOrigem).sort((a, b) => b[1] - a[1]).map(([origem, count]) => {
            const pct = Math.round((count / total) * 100);
            return (
              <div key={origem}>
                <div className="flex justify-between text-[12px] mb-0.5">
                  <span className="font-display font-bold text-[#0F172A] capitalize">{origem}</span>
                  <span className="text-[#64748B] tabular">{count} · {pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colorForOrigem(origem) }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-5">
        <div className="font-display font-extrabold text-[#0F172A] mb-2">MRR (receita recorrente mensal)</div>
        <div className="font-display font-extrabold tabular text-3xl text-[#0F172A]">{fmtBRL(metrics.mrr)}</div>
        <div className="text-[11px] text-[#94A3B8] mt-1">Anuais distribuídos /12. Snapshot atual.</div>
      </section>
    </>
  );
}

function colorForOrigem(o) {
  const map = {
    organico: "#6366F1",
    afiliado: "#F97316",
    instagram: "#EC4899",
    google: "#10B981",
  };
  return map[o] ?? "#94A3B8";
}

// =============== HELPERS ===============

function Stat({ label, value, highlight = false }) {
  return (
    <div className="card p-4 text-center">
      <div className={`font-display font-extrabold tabular leading-none ${highlight ? "text-[#F97316]" : "text-[#0F172A]"}`} style={{ fontSize: "clamp(20px, 4vw, 28px)" }}>
        {value}
      </div>
      <div className="text-[11px] text-[#64748B] font-display font-bold uppercase tracking-wide mt-1">{label}</div>
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

const THUMB_PALETTE = ["#F97316", "#6366F1", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#06B6D4", "#EF4444"];
function colorFor(name) {
  let h = 0; const s = name ?? "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return THUMB_PALETTE[Math.abs(h) % THUMB_PALETTE.length];
}
function initialsFor(name) {
  return (name ?? "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).filter(Boolean).join("") || "?";
}

function FotoThumb({ foto_url, nome, size = 32 }) {
  if (foto_url) {
    return (
      <img
        src={foto_url}
        alt={nome}
        width={size}
        height={size}
        loading="lazy"
        className="rounded-full object-cover"
        style={{ width: size, height: size, background: "#F1F5F9" }}
        draggable={false}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-display font-extrabold"
      style={{ width: size, height: size, background: colorFor(nome), fontSize: Math.round(size * 0.38) }}
    >
      {initialsFor(nome)}
    </div>
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
