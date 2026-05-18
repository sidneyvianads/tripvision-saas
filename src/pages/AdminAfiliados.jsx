import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Edit2, Loader2, X, Check, Tag, Mail, AtSign, Percent,
  ExternalLink, Users as UsersIcon, BarChart3, Receipt, Megaphone, Image as ImageIcon,
  Search, Download,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { isOwner } from "../data/plans";
import { friendlyError } from "../lib/errorMessages";
import { useConfirm } from "../lib/useConfirm";
import { useModalA11y } from "../lib/useModalA11y";
import { useDebounce } from "../lib/useDebounce";
import Pagination from "../components/Pagination";
import { downloadCsv } from "../lib/csvExport";

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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [filterAtivo, setFilterAtivo] = useState("todos");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showAlert } = useConfirm();
  const debouncedSearch = useDebounce(search, 300);

  // R19-3: reload usa admin_afiliados_list_v2 com paginação + busca + filtro.
  // AbortController cancela request anterior se user digitar rápido —
  // evita race condition (request lenta sobrescreve estado recente).
  const reload = useCallback(async (signal) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_afiliados_list_v2", {
      p_page: page,
      p_page_size: pageSize,
      p_search: debouncedSearch || null,
      p_filter_ativo: filterAtivo,
      p_sort_col: "created_at",
      p_sort_dir: "desc",
    });
    if (signal?.aborted) return;
    if (error) {
      console.error("[AdminAfiliados] reload erro:", error);
      setAfiliados([]);
      setTotal(0);
    } else {
      setAfiliados(data?.rows ?? []);
      setTotal(data?.total ?? 0);
    }
    setLoading(false);
  }, [page, pageSize, debouncedSearch, filterAtivo]);

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload]);

  // Volta pra página 1 sempre que filtros mudam — evitar "página 4 vazia"
  // depois de filtrar por algo que tem poucos resultados.
  useEffect(() => { setPage(1); }, [debouncedSearch, filterAtivo]);

  // R19-6: CSV com TODOS os afiliados que batem com os filtros atuais.
  // page_size=10000 cobre qualquer scale realista (Sidney tem ~5 hoje).
  const exportCsv = async () => {
    const { data, error } = await supabase.rpc("admin_afiliados_list_v2", {
      p_page: 1,
      p_page_size: 10000,
      p_search: debouncedSearch || null,
      p_filter_ativo: filterAtivo,
      p_sort_col: "created_at",
      p_sort_dir: "desc",
    });
    if (error) {
      console.error("[AdminAfiliados] CSV afiliados erro:", error);
      await showAlert(friendlyError(error), { title: "Não consegui exportar" });
      return;
    }
    const all = data?.rows ?? [];
    const rows = [
      ["Nome", "Email", "Instagram", "Cupom", "Comissão %", "Desconto %", "Ativo", "Indicados", "Receita R$", "Criado em"],
      ...all.map((a) => [
        a.nome, a.email, a.instagram ?? "", a.cupom,
        Number(a.comissao_percent).toFixed(0),
        Number(a.desconto_percent ?? 0).toFixed(0),
        a.ativo ? "sim" : "não",
        a.total_indicados,
        Number(a.total_receita ?? 0).toFixed(2).replace(".", ","),
        a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "",
      ]),
    ];
    downloadCsv(`afiliados-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

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
      await showAlert(friendlyError(error), { title: "Não consegui salvar" });
      return;
    }
    setEditing(null);
    await reload();
  };

  return (
    <>
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="font-display font-extrabold text-[#0F172A] text-base flex-1 min-w-[120px]">Afiliados</div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou cupom"
              className="input !py-1.5 !pl-7 !pr-2 text-sm w-44"
              aria-label="Buscar afiliados"
            />
          </div>
          <select
            value={filterAtivo}
            onChange={(e) => setFilterAtivo(e.target.value)}
            className="input !py-1.5 !px-2 text-sm"
            aria-label="Filtrar por status"
          >
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
          <button onClick={exportCsv} className="btn-ghost !py-1.5 !px-3 text-sm inline-flex items-center gap-1" title="Exportar todos os afiliados que batem com filtros">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={() => setEditing("new")} className="btn-primary inline-flex items-center gap-1.5 !py-2 text-sm">
            <Plus className="w-4 h-4" /> Novo
          </button>
        </div>

        {loading && afiliados.length === 0 ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#F97316]" /></div>
        ) : afiliados.length === 0 ? (
          <div className="text-[#64748B] text-sm">
            {debouncedSearch || filterAtivo !== "todos"
              ? "Nenhum afiliado com esses filtros."
              : "Nenhum afiliado ainda. Clique em \"+ Novo\" pra começar."}
          </div>
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

        <Pagination
          currentPage={page}
          totalCount={total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100]}
          variant="full"
          label="afiliados"
        />
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
  // R18-3: foco inicial no input Nome (primeiro do form, ação principal).
  const nomeInputRef = useRef(null);
  const { dialogRef, titleId } = useModalA11y({
    isOpen: true,
    onClose: onCancel,
    initialFocusRef: nomeInputRef,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 animate-fade-up" onClick={onCancel} role="presentation">
      <div ref={dialogRef} className="w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl bg-white max-h-[92vh] overflow-y-auto animate-pop" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="px-5 pt-5 flex items-center gap-2">
          <h2 id={titleId} className="font-display font-extrabold text-[#0F172A] flex-1 text-base m-0">{initial ? "Editar afiliado" : "Novo afiliado"}</h2>
          <button onClick={onCancel} className="p-1 rounded-full hover:bg-[#F8FAFC]" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field icon={Mail}>
            <input ref={nomeInputRef} className="input" placeholder="Nome*" value={form.nome} onChange={(e) => setF("nome", e.target.value)} maxLength={80} />
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
  const [total, setTotal] = useState(0);
  const [afiliados, setAfiliados] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [filterOrigem, setFilterOrigem] = useState("todos");
  const [filterPlano, setFilterPlano] = useState("todos");
  const [afiliadoFilter, setAfiliadoFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const { showAlert } = useConfirm();
  // R13-1: mountedAt fica estável entre renders (lazy useState init roda só
  // uma vez). userStatus chamava Date.now() inline → impuro em React 19
  // concurrent. Granularidade de plano/trial é dias, então mountedAt é
  // tão bom quanto "agora" — admin recarrega a aba quando precisar de
  // atualização.
  const [mountedAt] = useState(() => Date.now());
  const debouncedSearch = useDebounce(search, 300);

  // Lookup de afiliados pra mostrar nome/cupom na tabela. Carrega uma
  // vez — lista pequena, sem paginação.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("afiliados").select("id, nome, cupom").order("nome");
      setAfiliados(data ?? []);
    })();
  }, []);

  // R19-4: lista de users server-side com paginação + filtros.
  // Substitui .limit(500) que truncava silenciosamente acima disso.
  const reload = useCallback(async (signal) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_users_list", {
      p_page: page,
      p_page_size: pageSize,
      p_search: debouncedSearch || null,
      p_filter_plano: filterPlano,
      p_filter_origem: filterOrigem,
      p_filter_afiliado: afiliadoFilter || null,
      p_sort_col: "created_at",
      p_sort_dir: "desc",
    });
    if (signal?.aborted) return;
    if (error) {
      console.error("[AdminAfiliados] users list erro:", error);
      setUsers([]);
      setTotal(0);
    } else {
      setUsers(data?.rows ?? []);
      setTotal(data?.total ?? 0);
    }
    setLoading(false);
  }, [page, pageSize, debouncedSearch, filterPlano, filterOrigem, afiliadoFilter]);

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload]);

  useEffect(() => { setPage(1); }, [debouncedSearch, filterPlano, filterOrigem, afiliadoFilter]);

  // R19-6: CSV com TODOS os users que batem com filtros atuais.
  const exportCsv = async () => {
    const { data, error } = await supabase.rpc("admin_users_list", {
      p_page: 1,
      p_page_size: 10000,
      p_search: debouncedSearch || null,
      p_filter_plano: filterPlano,
      p_filter_origem: filterOrigem,
      p_filter_afiliado: afiliadoFilter || null,
      p_sort_col: "created_at",
      p_sort_dir: "desc",
    });
    if (error) {
      console.error("[AdminAfiliados] CSV users erro:", error);
      await showAlert(friendlyError(error), { title: "Não consegui exportar" });
      return;
    }
    const all = data?.rows ?? [];
    const rows = [
      ["Nome", "Email", "Plano", "Plano expira em", "Trial até", "Origem", "Cupom afiliado", "Cadastro"],
      ...all.map((u) => {
        const af = u.afiliado_id ? afiliadoMap.get(u.afiliado_id) : null;
        return [
          u.nome ?? "",
          u.email ?? "",
          u.plano ?? "",
          u.plano_expires_at ? new Date(u.plano_expires_at).toLocaleDateString("pt-BR") : "",
          u.trial_ends_at ? new Date(u.trial_ends_at).toLocaleDateString("pt-BR") : "",
          u.origem ?? "organico",
          af?.cupom ?? "",
          u.created_at ? new Date(u.created_at).toLocaleDateString("pt-BR") : "",
        ];
      }),
    ];
    downloadCsv(`usuarios-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const afiliadoMap = useMemo(() => {
    const m = new Map();
    afiliados.forEach((a) => m.set(a.id, a));
    return m;
  }, [afiliados]);

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
        <div className="font-display font-extrabold text-[#0F172A] text-base flex-1 min-w-[120px]">Usuários</div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome ou email"
            className="input !py-1.5 !pl-7 !pr-2 text-sm w-44"
            aria-label="Buscar usuários"
          />
        </div>
        <select value={filterPlano} onChange={(e) => setFilterPlano(e.target.value)} className="input !py-1.5 !px-2 text-sm" aria-label="Filtrar por plano">
          <option value="todos">Todos planos</option>
          <option value="pending">Sem plano</option>
          <option value="pro">Pro</option>
          <option value="grupo">Grupo</option>
          <option value="owner">Owner</option>
        </select>
        <select value={filterOrigem} onChange={(e) => setFilterOrigem(e.target.value)} className="input !py-1.5 !px-2 text-sm" aria-label="Filtrar por origem">
          <option value="todos">Todas origens</option>
          <option value="organico">Orgânico</option>
          <option value="afiliado">Afiliado</option>
          <option value="instagram">Instagram</option>
          <option value="google">Google</option>
        </select>
        <select value={afiliadoFilter} onChange={(e) => setAfiliadoFilter(e.target.value)} className="input !py-1.5 !px-2 text-sm" aria-label="Filtrar por afiliado">
          <option value="">Todos afiliados</option>
          {afiliados.map((a) => (
            <option key={a.id} value={a.id}>{a.nome} · {a.cupom}</option>
          ))}
        </select>
        <button onClick={exportCsv} className="btn-ghost !py-1.5 !px-3 text-sm inline-flex items-center gap-1" title="Exportar todos os usuários que batem com filtros">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {loading && users.length === 0 ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#F97316]" /></div>
      ) : users.length === 0 ? (
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
              {users.map((u) => {
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

      <Pagination
        currentPage={page}
        totalCount={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[25, 50, 100]}
        variant="full"
        label="usuários"
      />
    </section>
  );
}

// =============== COMISSÕES TAB ===============

function ComissoesTab() {
  const [comissoes, setComissoes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [mes, setMes] = useState(fmtMonth());
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterAfiliado, setFilterAfiliado] = useState("");
  const [afiliados, setAfiliados] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showAlert } = useConfirm();

  // Lookup de afiliados pro dropdown filter — uma vez na mount.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("afiliados").select("id, nome, cupom").order("nome");
      setAfiliados(data ?? []);
    })();
  }, []);

  // R19-5: paginação server-side via admin_comissoes_list.
  // mes vazio = sem filtro de mês (admin pode ver todas).
  const reload = useCallback(async (signal) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_comissoes_list", {
      p_page: page,
      p_page_size: pageSize,
      p_filter_status: filterStatus,
      p_filter_afiliado: filterAfiliado || null,
      p_filter_mes: mes || null,
      p_sort_col: "created_at",
      p_sort_dir: "desc",
    });
    if (signal?.aborted) return;
    if (error) {
      console.error("[AdminAfiliados] comissoes list erro:", error);
      setComissoes([]);
      setTotal(0);
    } else {
      setComissoes(data?.rows ?? []);
      setTotal(data?.total ?? 0);
    }
    setLoading(false);
  }, [page, pageSize, filterStatus, filterAfiliado, mes]);

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload]);

  useEffect(() => { setPage(1); }, [mes, filterStatus, filterAfiliado]);

  const togglePago = async (com) => {
    const next = com.status === "pago" ? "pendente" : "pago";
    // R10-3: RPC SECURITY DEFINER (guard is_platform_owner). UPDATE direto
    // na tabela bate em permission denied desde R9-3 REVOKE writes.
    const { error } = await supabase.rpc("admin_set_comissao_status", { p_id: com.id, p_status: next });
    if (error) {
      console.error("[AdminAfiliados] set status erro:", error);
      await showAlert(friendlyError(error), { title: "Não consegui atualizar" });
      return;
    }
    setComissoes((prev) => prev.map((c) => c.id === com.id ? { ...c, status: next } : c));
  };

  // R19-5: exportCsv pega TODOS os registros que batem com os filtros
  // atuais (page_size grande). Antes pegava só o que estava em comissoes,
  // que com paginação server-side virou só a página corrente — CSV
  // ficaria parcial sem o user perceber.
  const exportCsv = async () => {
    const { data, error } = await supabase.rpc("admin_comissoes_list", {
      p_page: 1,
      p_page_size: 10000,
      p_filter_status: filterStatus,
      p_filter_afiliado: filterAfiliado || null,
      p_filter_mes: mes || null,
      p_sort_col: "created_at",
      p_sort_dir: "desc",
    });
    if (error) {
      console.error("[AdminAfiliados] CSV export erro:", error);
      await showAlert(friendlyError(error), { title: "Não consegui exportar" });
      return;
    }
    const all = data?.rows ?? [];
    const rows = [
      ["Afiliado", "Cupom", "Mês", "Valor assinatura", "%", "Comissão", "Status"],
      ...all.map((c) => [
        c.afiliado?.nome ?? "?",
        c.afiliado?.cupom ?? "?",
        c.mes_referencia,
        Number(c.valor_assinatura).toFixed(2).replace(".", ","),
        Number(c.percentual).toFixed(2).replace(".", ","),
        Number(c.valor_comissao).toFixed(2).replace(".", ","),
        c.status,
      ]),
    ];
    downloadCsv(`comissoes-${mes || "todos"}.csv`, rows);
  };

  // R19-5: removidos os Stats inline (totalDevido/totalPago) — eles
  // somavam só os registros da PÁGINA atual com paginação server-side,
  // dando números enganosos. Pra totalização real, exportar CSV (R19-6).

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="font-display font-extrabold text-[#0F172A] text-base flex-1">Comissões</div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input !py-1.5 !px-2 text-sm"
          aria-label="Filtrar por status"
        >
          <option value="todos">Todos status</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select
          value={filterAfiliado}
          onChange={(e) => setFilterAfiliado(e.target.value)}
          className="input !py-1.5 !px-2 text-sm"
          aria-label="Filtrar por afiliado"
        >
          <option value="">Todos afiliados</option>
          {afiliados.map((a) => (
            <option key={a.id} value={a.id}>{a.nome} · {a.cupom}</option>
          ))}
        </select>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="input !py-1.5 !px-2 text-sm"
          aria-label="Filtrar por mês"
        />
        <button
          onClick={() => setMes("")}
          className="btn-ghost !py-1.5 !px-2 text-xs"
          title="Limpar filtro de mês"
          disabled={!mes}
        >
          Todos meses
        </button>
        <button onClick={exportCsv} className="btn-ghost !py-1.5 !px-3 text-sm inline-flex items-center gap-1">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {loading && comissoes.length === 0 ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#F97316]" /></div>
      ) : comissoes.length === 0 ? (
        <div className="text-[#64748B] text-sm">
          Sem comissões{mes ? ` em ${mes}` : ""}{filterStatus !== "todos" ? ` (${filterStatus})` : ""}.
        </div>
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

      <Pagination
        currentPage={page}
        totalCount={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[25, 50, 100]}
        variant="full"
        label="comissões"
      />
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
