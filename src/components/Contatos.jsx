import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Plus, Phone, MapPin, MessageCircle, Star, Trash2, Pencil, BookUser, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errorMessages";
import { useConfirm } from "../lib/useConfirm";

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

// Heurística pra inferir categoria a partir do tipo da atividade do roteiro
const tipoAtividadeToCategoria = (tipo) => {
  if (tipo === "alimentacao") return "restaurante";
  if (tipo === "hospedagem") return "hotel";
  if (tipo === "transporte") return "transporte";
  return "outro";
};

// Chave de deduplicação: normaliza nome+telefone (ou nome+endereço como fallback)
const dedupeKey = (nome, tel, end) => {
  const n = (nome ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const t = onlyDigits(tel);
  const e = (end ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${n}|${t || e}`;
};

export default function Contatos({ viagemId, isAdmin, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | object
  const [savingId, setSavingId] = useState(null);
  const { showConfirm } = useConfirm();

  // Contatos vindos do roteiro (read-only, calculados em runtime)
  const [autoContacts, setAutoContacts] = useState([]);

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
      if (error) {
        console.error("[Contatos] load erro:", error);
        setError(friendlyError(error));
      } else {
        setItems(data ?? []);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [viagemId]);

  // Carrega contatos do roteiro: hotéis + atividades com telefone ou endereço
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: dias, error: errDias } = await supabase
        .from("roteiro_dias")
        .select("id, dia_numero, data, cidade, hotel, hotel_telefone, hotel_endereco")
        .eq("viagem_id", viagemId)
        .order("dia_numero");
      if (errDias || !active) return;

      const diaIds = (dias ?? []).map((d) => d.id);
      let atividades = [];
      if (diaIds.length > 0) {
        const { data: ats } = await supabase
          .from("roteiro_atividades")
          .select("id, dia_id, titulo, tipo, telefone, endereco, ordem")
          .in("dia_id", diaIds);
        atividades = ats ?? [];
      }

      const diaById = new Map((dias ?? []).map((d) => [d.id, d]));
      const dedup = new Map(); // key → contato

      // Hotéis dos dias
      for (const d of (dias ?? [])) {
        if (!d.hotel) continue;
        if (!d.hotel_telefone && !d.hotel_endereco) continue;
        const key = dedupeKey(d.hotel, d.hotel_telefone, d.hotel_endereco);
        if (dedup.has(key)) {
          // mantém o primeiro mas registra que aparece em mais dias
          const existing = dedup.get(key);
          existing.dias.add(d.dia_numero);
          continue;
        }
        dedup.set(key, {
          fonte: "hotel",
          nome: d.hotel,
          categoria: "hotel",
          telefone: d.hotel_telefone ?? null,
          endereco: d.hotel_endereco ?? null,
          cidade: d.cidade ?? null,
          dias: new Set([d.dia_numero]),
        });
      }

      // Atividades com telefone ou endereço
      for (const a of atividades) {
        if (!a.telefone && !a.endereco) continue;
        const dia = diaById.get(a.dia_id);
        const key = dedupeKey(a.titulo, a.telefone, a.endereco);
        if (dedup.has(key)) {
          dedup.get(key).dias.add(dia?.dia_numero);
          continue;
        }
        dedup.set(key, {
          fonte: a.tipo === "hospedagem" ? "hotel" : "atividade",
          nome: a.titulo,
          categoria: tipoAtividadeToCategoria(a.tipo),
          telefone: a.telefone ?? null,
          endereco: a.endereco ?? null,
          cidade: dia?.cidade ?? null,
          dias: new Set([dia?.dia_numero]),
        });
      }

      if (!active) return;
      const arr = Array.from(dedup.values()).map((c) => ({
        ...c,
        dias: Array.from(c.dias).filter(Boolean).sort((x, y) => x - y),
      }));
      // ordena: hotéis primeiro, depois alimentação, depois resto
      const order = { hotel: 0, restaurante: 1, transporte: 2, guia: 3, outro: 4, emergencia: 5 };
      arr.sort((a, b) => (order[a.categoria] ?? 9) - (order[b.categoria] ?? 9));
      setAutoContacts(arr);
    })();
    return () => { active = false; };
  }, [viagemId]);

  // Esconde contatos do roteiro que já estão duplicados nos manuais
  const manualKeys = useMemo(
    () => new Set(items.map((c) => dedupeKey(c.nome, c.telefone, c.endereco))),
    [items]
  );
  const autoFiltered = useMemo(
    () => autoContacts.filter((c) => !manualKeys.has(dedupeKey(c.nome, c.telefone, c.endereco))),
    [autoContacts, manualKeys]
  );

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
    if (res.error) {
      console.error("[Contatos] save erro:", res.error);
      setError(friendlyError(res.error));
      return;
    }
    setEditing(null);
    await reload();
  };

  const toggleFav = async (c) => {
    setItems((prev) => prev.map((x) => x.id === c.id ? { ...x, favorito: !c.favorito } : x));
    const { error } = await supabase.from("contatos").update({ favorito: !c.favorito }).eq("id", c.id);
    if (error) {
      console.error("[Contatos] fav erro:", error);
      setError(friendlyError(error));
    } else {
      await reload();
    }
  };

  const deleteContact = async (c) => {
    const ok = await showConfirm({
      title: `Remover "${c.nome}"?`,
      variant: "danger",
      confirmLabel: "Remover",
    });
    if (!ok) return;
    const { error } = await supabase.from("contatos").delete().eq("id", c.id);
    if (error) {
      console.error("[Contatos] delete erro:", error);
      setError(friendlyError(error));
    } else {
      setItems((prev) => prev.filter((x) => x.id !== c.id));
    }
  };

  const hasAutoContacts = autoFiltered.length > 0;
  const hasManualContacts = items.length > 0;

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

          {!loading && !hasAutoContacts && !hasManualContacts && !editing && (
            <div className="text-center py-8 text-[#6B7280]">
              <BookUser className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <div className="font-display font-bold">Nenhum contato ainda</div>
              <div className="text-sm mt-1">Adicione hotéis, restaurantes, guias…</div>
              <div className="text-[11px] mt-2 text-[#94A3B8]">
                Quando o Jei adicionar hotel/restaurante com telefone ao roteiro, eles aparecem aqui automaticamente.
              </div>
            </div>
          )}

          {/* Seção: contatos do roteiro (auto, read-only) */}
          {hasAutoContacts && (
            <>
              <SectionHeader
                icon={Sparkles}
                title="Do roteiro"
                hint="Hotéis e locais com contato — atualizados automaticamente"
              />
              {autoFiltered.map((c, idx) => (
                <AutoContactCard key={`auto-${idx}`} c={c} />
              ))}
            </>
          )}

          {/* Seção: contatos manuais (editáveis) */}
          {hasManualContacts && (
            <div className={hasAutoContacts ? "pt-2" : ""}>
              <SectionHeader
                icon={BookUser}
                title="Seus contatos"
                hint="Adicione números importantes da viagem"
              />
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

function SectionHeader({ icon: Icon, title, hint }) {
  return (
    <div className="flex items-center gap-2 pt-1 pb-1.5">
      <Icon className="w-3.5 h-3.5" style={{ color: "var(--tv-accent-dark)" }} />
      <div className="font-display font-extrabold text-[11px] uppercase tracking-widest" style={{ color: "var(--tv-accent-dark)" }}>
        {title}
      </div>
      {hint && <div className="text-[10px] text-[#94A3B8] truncate hidden sm:block">— {hint}</div>}
    </div>
  );
}

function AutoContactCard({ c }) {
  const wa = waLink(c.telefone);
  const tel = telLink(c.telefone);
  const map = mapsLink(c.endereco || (c.nome + (c.cidade ? " " + c.cidade : "")));
  const diasTxt = c.dias?.length
    ? c.dias.length > 3
      ? `Dias ${c.dias.slice(0, 3).join(", ")}…`
      : `Dia${c.dias.length > 1 ? "s" : ""} ${c.dias.join(", ")}`
    : null;
  return (
    <div className="card p-3 relative" style={{ borderLeft: "3px solid var(--tv-accent)" }}>
      <div className="flex items-start gap-2">
        <div className="text-xl shrink-0 leading-none mt-0.5">
          {(CAT_LABEL[c.categoria] ?? "📌").split(" ")[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold text-[#1F2937] truncate">{c.nome}</div>
          <div className="text-[11px] font-display font-bold uppercase tracking-wide flex flex-wrap items-center gap-x-2" style={{ color: "var(--tv-accent-dark)" }}>
            <span>{(CAT_LABEL[c.categoria] ?? "Outro").replace(/^\S+\s/, "")}</span>
            {c.cidade && <span className="text-[#94A3B8] normal-case tracking-normal font-bold">· {c.cidade}</span>}
            {diasTxt && <span className="text-[#94A3B8] normal-case tracking-normal font-bold">· {diasTxt}</span>}
          </div>
          {c.telefone && (
            <div className="text-sm text-[#4B5563] mt-1 tabular">{c.telefone}</div>
          )}
          {c.endereco && (
            <div className="text-xs text-[#6B7280] mt-0.5 truncate">{c.endereco}</div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-display font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </a>
            )}
            {tel && (
              <a href={tel} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-display font-bold" style={{ background: "var(--tv-bg-light)", color: "var(--tv-accent-dark)", border: "1px solid var(--tv-card-border)" }}>
                <Phone className="w-3 h-3" /> Ligar
              </a>
            )}
            {map && (
              <a href={map} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-display font-bold bg-blue-100 text-blue-700 hover:bg-blue-200">
                <MapPin className="w-3 h-3" /> Mapa
              </a>
            )}
          </div>
        </div>
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
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-display font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </a>
            )}
            {tel && (
              <a href={tel} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-display font-bold" style={{ background: "var(--tv-bg-light)", color: "var(--tv-accent-dark)", border: "1px solid var(--tv-card-border)" }}>
                <Phone className="w-3 h-3" /> Ligar
              </a>
            )}
            {map && (
              <a href={map} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-display font-bold bg-blue-100 text-blue-700 hover:bg-blue-200">
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
