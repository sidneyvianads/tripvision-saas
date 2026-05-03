import { useEffect, useState } from "react";
import { X, Loader2, Plus, Phone, MapPin, MessageCircle, Star, Trash2, Pencil, BookUser } from "lucide-react";
import { supabase } from "../lib/supabase";

const CATEGORIAS = [
  { value: "hotel",       label: "🏨 Hotel" },
  { value: "restaurante", label: "🍽️ Restaurante" },
  { value: "emergencia",  label: "🚨 Emergência" },
  { value: "transporte",  label: "🚗 Transporte" },
  { value: "guia",        label: "🧭 Guia" },
  { value: "outro",       label: "📌 Outro" },
];
const CAT_LABEL = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]));

const onlyDigits = (s) => (s ?? "").replace(/\D/g, "");
const waLink = (tel) => {
  const d = onlyDigits(tel);
  if (!d) return null;
  const withCountry = d.length <= 11 ? "55" + d : d;
  return `https://wa.me/${withCountry}`;
};
const telLink = (tel) => {
  const d = onlyDigits(tel);
  return d ? `tel:${d}` : null;
};
const mapsLink = (endereco) =>
  endereco ? `https://maps.google.com/?q=${encodeURIComponent(endereco)}` : null;

export default function Contatos({ viagemId, isAdmin, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | object
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("contatos")
        .select("id, nome, telefone, endereco, categoria, favorito, ordem, created_at")
        .eq("viagem_id", viagemId)
        .order("favorito", { ascending: false })
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: true });
      if (!active) return;
      if (error) setError(error.message);
      else setItems(data ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [viagemId]);

  const reload = async () => {
    const { data } = await supabase
      .from("contatos")
      .select("id, nome, telefone, endereco, categoria, favorito, ordem, created_at")
      .eq("viagem_id", viagemId)
      .order("favorito", { ascending: false })
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: true });
    setItems(data ?? []);
  };

  const saveContact = async (form) => {
    setSavingId(form.id ?? "new");
    const payload = {
      viagem_id: viagemId,
      nome: form.nome.trim(),
      telefone: form.telefone?.trim() || null,
      endereco: form.endereco?.trim() || null,
      categoria: form.categoria,
      favorito: !!form.favorito,
      ordem: form.ordem ?? items.length,
    };
    let res;
    if (form.id) {
      res = await supabase.from("contatos").update(payload).eq("id", form.id).select().single();
    } else {
      res = await supabase.from("contatos").insert(payload).select().single();
    }
    setSavingId(null);
    if (res.error) { setError(res.error.message); return; }
    setEditing(null);
    await reload();
  };

  const toggleFav = async (c) => {
    setItems((prev) => prev.map((x) => x.id === c.id ? { ...x, favorito: !c.favorito } : x));
    const { error } = await supabase.from("contatos").update({ favorito: !c.favorito }).eq("id", c.id);
    if (error) setError(error.message);
    else await reload();
  };

  const deleteContact = async (c) => {
    if (!confirm(`Remover "${c.nome}"?`)) return;
    const { error } = await supabase.from("contatos").delete().eq("id", c.id);
    if (error) setError(error.message);
    else setItems((prev) => prev.filter((x) => x.id !== c.id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 animate-fade-up" onClick={onClose}>
      <div
        className="w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col animate-pop bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white px-4 py-3 flex items-center gap-2" style={{ background: "var(--tv-gradient)" }}>
          <BookUser className="w-5 h-5" />
          <div className="font-display font-extrabold flex-1">Contatos da viagem</div>
          <button onClick={onClose} className="rounded-full bg-white/20 hover:bg-white/30 p-1.5" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--tv-accent)" }} />
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">
              {error}
            </div>
          )}

          {!loading && items.length === 0 && !editing && (
            <div className="text-center py-8 text-[#6B7280]">
              <BookUser className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <div className="font-display font-bold">Nenhum contato ainda</div>
              <div className="text-sm mt-1">Adicione hotéis, restaurantes, guias…</div>
            </div>
          )}

          {items.map((c) => (
            <ContactCard
              key={c.id}
              c={c}
              isAdmin={isAdmin}
              onEdit={() => setEditing(c)}
              onDelete={() => deleteContact(c)}
              onFav={() => toggleFav(c)}
            />
          ))}

          {editing && (
            <ContactForm
              initial={editing === "new" ? null : editing}
              onCancel={() => setEditing(null)}
              onSave={saveContact}
              saving={savingId === (editing?.id ?? "new")}
            />
          )}
        </div>

        {isAdmin && !editing && (
          <div className="p-3 border-t border-[#E5E7EB] bg-white">
            <button
              onClick={() => setEditing("new")}
              className="btn-primary w-full inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Adicionar contato
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactCard({ c, isAdmin, onEdit, onDelete, onFav }) {
  const wa = waLink(c.telefone);
  const tel = telLink(c.telefone);
  const map = mapsLink(c.endereco);
  return (
    <div className="card p-3">
      <div className="flex items-start gap-2">
        <button
          onClick={onFav}
          className="shrink-0 p-1"
          aria-label={c.favorito ? "Desfavoritar" : "Favoritar"}
          title={c.favorito ? "Favorito" : "Marcar como favorito"}
        >
          <Star
            className="w-4 h-4 transition-colors"
            style={{
              color: c.favorito ? "#F59E0B" : "#D1D5DB",
              fill: c.favorito ? "#F59E0B" : "transparent",
            }}
          />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold text-[#1F2937] truncate">{c.nome}</div>
          <div className="text-[11px] font-display font-bold uppercase tracking-wide" style={{ color: "var(--tv-accent-dark)" }}>
            {CAT_LABEL[c.categoria] ?? c.categoria}
          </div>
          {c.telefone && (
            <div className="text-sm text-[#4B5563] mt-1 tabular">{c.telefone}</div>
          )}
          {c.endereco && (
            <div className="text-xs text-[#6B7280] mt-0.5 truncate">{c.endereco}</div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-display font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </a>
            )}
            {tel && (
              <a href={tel} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-display font-bold" style={{ background: "var(--tv-bg-light)", color: "var(--tv-accent-dark)", border: "1px solid var(--tv-card-border)" }}>
                <Phone className="w-3 h-3" /> Ligar
              </a>
            )}
            {map && (
              <a href={map} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-display font-bold bg-blue-100 text-blue-700 hover:bg-blue-200">
                <MapPin className="w-3 h-3" /> Mapa
              </a>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-col gap-1 shrink-0">
            <button onClick={onEdit} className="text-[#6B7280] hover:text-[#1F2937] p-1" aria-label="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1" aria-label="Remover">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactForm({ initial, onCancel, onSave, saving }) {
  const [form, setForm] = useState(() => initial ?? {
    nome: "", telefone: "", endereco: "", categoria: "outro", favorito: false,
  });
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.nome.trim().length > 0;

  return (
    <div className="card p-3 space-y-2 border-2" style={{ borderColor: "var(--tv-accent)" }}>
      <div className="font-display font-extrabold text-[#1F2937] text-sm">
        {initial ? "Editar contato" : "Novo contato"}
      </div>
      <input className="input" placeholder="Nome*" value={form.nome} onChange={(e) => setF("nome", e.target.value)} maxLength={80} />
      <select className="input" value={form.categoria} onChange={(e) => setF("categoria", e.target.value)}>
        {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <input className="input" placeholder="Telefone (com DDD)" value={form.telefone ?? ""} onChange={(e) => setF("telefone", e.target.value)} maxLength={30} />
      <input className="input" placeholder="Endereço (opcional)" value={form.endereco ?? ""} onChange={(e) => setF("endereco", e.target.value)} maxLength={200} />
      <label className="flex items-center gap-2 text-sm text-[#374151]">
        <input type="checkbox" checked={!!form.favorito} onChange={(e) => setF("favorito", e.target.checked)} />
        ⭐ Favorito (sobe pro topo)
      </label>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="btn-ghost flex-1" type="button">Cancelar</button>
        <button
          onClick={() => onSave(form)}
          className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5"
          disabled={!valid || saving}
          type="button"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Salvar
        </button>
      </div>
    </div>
  );
}
