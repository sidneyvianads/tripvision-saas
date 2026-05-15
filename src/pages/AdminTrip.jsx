import { useEffect, useState } from "react";
import { useParams, useNavigate, Link, Navigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Save, Loader2, AlertTriangle, Lock, Sparkles, Copy, Eye } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTrip } from "../hooks/useTrips";
import { useRoteiro, addDia, updateDia, deleteDia, addAtividade, updateAtividade, deleteAtividade } from "../hooks/useRoteiro";
import { ACTIVITY_TYPES, TYPE_OPTIONS, STATUS_OPTIONS } from "../data/types";
import { getLimits } from "../data/plans";
import { logEdit, fetchLastEdit } from "../lib/editLog";
import { temaCssVars } from "../lib/applyTema";
import { getTema } from "../data/themes";
import UpgradeModal from "../components/UpgradeModal";
import ActivityItem from "../components/ActivityItem";
import { FullscreenLoader } from "../App";

export default function AdminTrip() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { trip, isAdmin, loading } = useTrip(slug, user?.id);
  const [editingDay, setEditingDay] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(true);

  if (loading) return <FullscreenLoader />;
  if (!trip) return <Navigate to="/" replace />;
  if (!isAdmin) return <Navigate to={`/v/${slug}`} replace />;

  const limits = getLimits(user?.plano);
  if (!limits.admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app p-4">
        <div className="card p-8 max-w-sm text-center">
          <Lock className="w-10 h-10 text-[#6366F1] mx-auto" />
          <h3 className="font-display font-extrabold text-[#1F2937] text-xl mt-3">Painel admin é Pro</h3>
          <p className="text-[#374151]/75 text-sm mt-2">
            Edição manual fina do roteiro está disponível a partir do Pro. Use a aba <strong>✨ Planejar com o Jei</strong> pra montar conversando.
          </p>
          <button
            onClick={() => setShowUpgrade(true)}
            className="btn-primary mt-5 inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Assinar Pro
          </button>
          <Link to={`/v/${slug}`} className="mt-3 block text-sm text-[#2E86C1] hover:underline font-display font-bold">
            Voltar
          </Link>
        </div>
        <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} reason="admin" user={user} />
      </div>
    );
  }

  return editingDay
    ? <DayEditor day={editingDay} trip={trip} onClose={() => setEditingDay(null)} />
    : <DayList   trip={trip} onEdit={(d) => setEditingDay(d)} />;
}

function DayList({ trip, onEdit }) {
  const navigate = useNavigate();
  const { days, loading, reload } = useRoteiro(trip.id);
  const [adding, setAdding] = useState(false);
  const [lastEdit, setLastEdit] = useState(null);

  useEffect(() => {
    if (!trip?.id) return;
    fetchLastEdit(trip.id).then(setLastEdit);
  }, [trip?.id]);

  const handleAdd = async () => {
    setAdding(true);
    try {
      const dia_numero = days.length ? Math.max(...days.map((d) => d.dia_numero)) + 1 : 1;
      const baseDate = trip.data_inicio
        ? new Date(new Date(trip.data_inicio + "T00:00:00").getTime() + (dia_numero - 1) * 86400000)
            .toISOString().slice(0, 10)
        : null;
      const created = await addDia(trip.id, {
        dia_numero,
        data: baseDate,
        titulo: `Dia ${dia_numero}`,
        cidade: trip.cidades?.[0] ?? null,
        cover_emoji: "🗓️",
      });
      await reload();
      onEdit({ ...created, atividades: [] });
    } catch (e) {
      alert("Erro ao adicionar dia: " + e.message);
    } finally { setAdding(false); }
  };

  const handleDelete = async (d, e) => {
    e.stopPropagation();
    if (!confirm(`Deletar dia ${d.dia_numero}?`)) return;
    try { await deleteDia(d.id); await reload(); }
    catch (e) { alert("Erro: " + e.message); }
  };

  const handleCopy = async (d, e) => {
    e.stopPropagation();
    try {
      const dia_numero = days.length ? Math.max(...days.map((x) => x.dia_numero)) + 1 : 1;
      const baseDate = d.data
        ? new Date(new Date(d.data + "T00:00:00").getTime() + (dia_numero - d.dia_numero) * 86400000).toISOString().slice(0, 10)
        : null;
      const novoDia = await addDia(trip.id, {
        dia_numero,
        data: baseDate,
        weekday: null,
        titulo: `${d.titulo ?? "Dia"} (cópia)`,
        cidade: d.cidade,
        hotel: d.hotel,
        hotel_telefone: d.hotel_telefone,
        hotel_endereco: d.hotel_endereco,
        cover_emoji: d.cover_emoji ?? "📍",
        alerta: d.alerta,
      });
      // Copia atividades
      const ats = d.atividades ?? [];
      for (let i = 0; i < ats.length; i++) {
        const a = ats[i];
        await addAtividade(novoDia.id, {
          horario: a.horario, titulo: a.titulo, descricao: a.descricao,
          tipo: a.tipo, preco: a.preco, status: a.status,
          endereco: a.endereco, telefone: a.telefone, maps_url: a.maps_url,
          notas: a.notas,
        }, i);
      }
      await reload();
    } catch (err) {
      alert("Erro ao copiar: " + err.message);
    }
  };

  const tema = getTema(trip.tema);

  return (
    <div className="min-h-screen flex flex-col bg-app" style={temaCssVars(trip.tema)}>
      <header
        className="text-white safe-top relative overflow-hidden"
        style={{ background: tema.gradient }}
      >
        <div className="px-4 pt-4 pb-5 flex items-center gap-3 relative z-10">
          <Link to={`/v/${trip.slug}`} className="rounded-full bg-white/15 hover:bg-white/25 p-2" aria-label="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <div className="text-[11px] font-display font-bold opacity-90 uppercase tracking-wide">Admin</div>
            <div className="font-display font-extrabold text-lg leading-tight truncate">{trip.nome}</div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-2 pb-24">
        {lastEdit && (
          <div className="text-[11px] text-[#6B7280] font-display font-bold tabular px-1 -mb-1">
            Última edição: <strong>{lastEdit.user?.nome ?? "—"}</strong> · {timeAgo(lastEdit.created_at)}
          </div>
        )}
        {loading
          ? <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" /></div>
          : days.length === 0
            ? (
              <div className="card p-6 text-center">
                <div className="text-3xl mb-2">🗺️</div>
                <div className="font-display font-extrabold text-[#1F2937]">Sem dias ainda</div>
                <p className="text-sm text-[#374151]/70 mt-1">Adicione o primeiro dia abaixo.</p>
              </div>
            )
            : (
              days.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onEdit(d)}
                  className="card w-full p-3 flex items-center gap-3 text-left active:scale-[0.99]"
                >
                  <div className="text-2xl">{d.cover_emoji ?? "🗓️"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] uppercase font-display font-bold text-[#374151]/60 tabular tracking-wide">
                      Dia {d.dia_numero}{d.data ? ` · ${d.data.slice(8, 10)}/${d.data.slice(5, 7)}` : ""}
                    </div>
                    <div className="font-display font-extrabold truncate text-[#1F2937]">{d.titulo || "(sem título)"}</div>
                    <div className="text-xs text-[#374151]/70">{d.atividades?.length ?? 0} atividades · {d.cidade ?? "—"}</div>
                  </div>
                  <button onClick={(e) => handleCopy(d, e)} className="text-[#6B7280] hover:text-[#1F2937] p-1" aria-label="Duplicar dia" title="Duplicar dia">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={(e) => handleDelete(d, e)} className="text-red-400 hover:text-red-600 p-1" aria-label="Remover">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </button>
              ))
            )
        }
      </main>

      <button
        onClick={handleAdd}
        disabled={adding}
        className="fixed bottom-6 right-6 z-30 btn-primary !px-5 !py-3 inline-flex items-center gap-2 rounded-full shadow-[0_8px_32px_rgba(124,185,232,0.45)]"
      >
        {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
        Novo dia
      </button>
    </div>
  );
}

function DayEditor({ day: initial, trip, onClose }) {
  const { user } = useAuth();
  const [day, setDay] = useState(initial);
  const [atividades, setAtividades] = useState(initial.atividades ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { setDay(initial); setAtividades(initial.atividades ?? []); }, [initial.id]);

  const setField = (k, v) => setDay((d) => ({ ...d, [k]: v }));

  const setAtv = (idx, patch) => setAtividades((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  const addAtv = () => setAtividades((prev) => [...prev, { id: `_new_${Date.now()}_${prev.length}`, _new: true, horario: "", titulo: "", descricao: "", tipo: "passeio", preco: null, status: "confirmado", endereco: "", notas: "", ordem: prev.length }]);
  const removeAtv = (idx) => setAtividades((prev) => prev.filter((_, i) => i !== idx));
  const moveAtv = (idx, dir) => setAtividades((prev) => {
    const target = idx + dir;
    if (target < 0 || target >= prev.length) return prev;
    const next = [...prev];
    [next[idx], next[target]] = [next[target], next[idx]];
    return next;
  });

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      await updateDia(day.id, {
        dia_numero: Number(day.dia_numero),
        data: day.data || null,
        weekday: day.weekday || null,
        titulo: day.titulo,
        cidade: day.cidade || null,
        hotel: day.hotel || null,
        hotel_telefone: day.hotel_telefone || null,
        hotel_endereco: day.hotel_endereco || null,
        cover_emoji: day.cover_emoji || null,
        alerta: day.alerta?.trim() ? day.alerta.trim() : null,
      });

      const existingIds = new Set(initial.atividades?.map((a) => a.id) ?? []);
      const keepIds = new Set();
      for (let i = 0; i < atividades.length; i++) {
        const a = atividades[i];
        const payload = {
          horario: (a.horario ?? "").trim() || null,
          titulo: (a.titulo ?? "").trim(),
          descricao: (a.descricao ?? "").trim() || null,
          tipo: a.tipo ?? "passeio",
          preco: a.preco?.trim?.() || a.preco || null,
          status: a.status ?? "confirmado",
          endereco: (a.endereco ?? "").trim() || null,
          notas: (a.notas ?? "").trim() || null,
          ordem: i,
        };
        if (a._new) {
          await addAtividade(day.id, payload, i);
        } else {
          keepIds.add(a.id);
          await updateAtividade(a.id, payload);
        }
      }
      for (const id of existingIds) {
        if (!keepIds.has(id)) await deleteAtividade(id);
      }
      // Log edit (item 40) — usa user.id do useAuth (chave localStorage antiga
      // "tripvision-saas:user:v1" foi removida na migração Supabase Auth).
      try {
        await logEdit(trip.id, user?.id, `editou Dia ${day.dia_numero}`, { atividades: atividades.length });
      } catch {}
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally { setSaving(false); }
  };

  const tema = getTema(trip.tema);

  return (
    <div className="min-h-screen flex flex-col bg-app" style={temaCssVars(trip.tema)}>
      <header
        className="text-white safe-top relative overflow-hidden"
        style={{ background: tema.gradient }}
      >
        <div className="px-4 pt-4 pb-5 flex items-center gap-2 relative z-10">
          <button onClick={onClose} className="rounded-full bg-white/15 hover:bg-white/25 p-2" aria-label="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <div className="text-[11px] font-display font-bold opacity-90 uppercase tracking-wide">Editar dia · {trip.nome}</div>
            <div className="font-display font-extrabold text-lg leading-tight truncate">Dia {day.dia_numero}</div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-white text-[#6366F1] px-3 py-2 inline-flex items-center gap-1.5 text-sm font-display font-extrabold disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-24">
        <section className="card p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Dia #">
              <input type="number" min="1" className="input" value={day.dia_numero ?? 1} onChange={(e) => setField("dia_numero", e.target.value)} />
            </Field>
            <Field label="Data">
              <input type="date" className="input" value={day.data ?? ""} onChange={(e) => setField("data", e.target.value)} />
            </Field>
          </div>
          <Field label="Título"><input className="input" value={day.titulo ?? ""} onChange={(e) => setField("titulo", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cidade"><input className="input" value={day.cidade ?? ""} onChange={(e) => setField("cidade", e.target.value)} /></Field>
            <Field label="Cover (emoji)"><input className="input" value={day.cover_emoji ?? ""} onChange={(e) => setField("cover_emoji", e.target.value)} /></Field>
          </div>
          <Field label="Hotel"><input className="input" value={day.hotel ?? ""} onChange={(e) => setField("hotel", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telefone hotel"><input className="input" value={day.hotel_telefone ?? ""} onChange={(e) => setField("hotel_telefone", e.target.value)} /></Field>
            <Field label="Endereço hotel"><input className="input" value={day.hotel_endereco ?? ""} onChange={(e) => setField("hotel_endereco", e.target.value)} /></Field>
          </div>
          <Field label="Alerta (opcional)">
            <input className="input" value={day.alerta ?? ""} onChange={(e) => setField("alerta", e.target.value)} placeholder="Ex: Reservar com antecedência" />
          </Field>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="font-display font-extrabold text-[#1F2937]">Atividades ({atividades.length})</div>
            <button onClick={addAtv} className="text-sm font-display font-bold text-[#6366F1] inline-flex items-center gap-1">
              <Plus className="w-4 h-4" /> Adicionar
            </button>
          </div>

          {atividades.map((a, idx) => (
            <div key={a.id} className="card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input type="time" className="input !py-2" style={{ maxWidth: 110 }} value={a.horario ?? ""} onChange={(e) => setAtv(idx, { horario: e.target.value })} />
                <select className="input !py-2 flex-1" value={a.tipo ?? "passeio"} onChange={(e) => setAtv(idx, { tipo: e.target.value })}>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{ACTIVITY_TYPES[t].icon} {ACTIVITY_TYPES[t].label}</option>
                  ))}
                </select>
                <button onClick={() => moveAtv(idx, -1)} className="text-[#6366F1] px-1" aria-label="Subir">↑</button>
                <button onClick={() => moveAtv(idx, +1)} className="text-[#6366F1] px-1" aria-label="Descer">↓</button>
                <button onClick={() => removeAtv(idx)} className="text-red-400 p-1" aria-label="Remover">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input className="input" placeholder="Título" value={a.titulo ?? ""} onChange={(e) => setAtv(idx, { titulo: e.target.value })} />
              <input className="input" placeholder="Descrição" value={a.descricao ?? ""} onChange={(e) => setAtv(idx, { descricao: e.target.value })} />
              <input className="input" placeholder="Endereço (opcional)" value={a.endereco ?? ""} onChange={(e) => setAtv(idx, { endereco: e.target.value })} />
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Preço (ex: R$79,90)" value={a.preco ?? ""} onChange={(e) => setAtv(idx, { preco: e.target.value || null })} />
                <select className="input flex-1" value={a.status ?? "confirmado"} onChange={(e) => setAtv(idx, { status: e.target.value })}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <textarea
                className="input min-h-[60px] text-[13px]"
                placeholder="Notas (opcional, max 200): observações, links, lembretes…"
                value={a.notas ?? ""}
                onChange={(e) => setAtv(idx, { notas: e.target.value.slice(0, 200) })}
                maxLength={200}
              />

              {/* Preview live: como a atividade vai aparecer no roteiro */}
              {(a.titulo || a.descricao || a.horario) && (
                <div className="rounded-xl border border-dashed p-3 mt-1" style={{ borderColor: "var(--tv-card-border)", background: "var(--tv-bg-light)" }}>
                  <div className="text-[10px] font-display font-bold uppercase tracking-wide mb-1.5 inline-flex items-center gap-1" style={{ color: "var(--tv-accent-dark)" }}>
                    <Eye className="w-3 h-3" /> Preview
                  </div>
                  <ActivityItem activity={a} isLast={true} />
                </div>
              )}
            </div>
          ))}

          {atividades.length === 0 && (
            <div className="card p-6 text-center text-[#374151]/60 text-sm">Nenhuma atividade. Clique em "Adicionar".</div>
          )}
        </section>

        {err && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-display font-bold text-[#6B7280]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function timeAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}
