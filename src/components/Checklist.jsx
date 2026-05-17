import { useState } from "react";
import { Check, Plus, Trash2, Loader2, Sparkles } from "lucide-react";
import { useChecklist } from "../hooks/useChecklist";
import { getLimits } from "../data/plans";
import UpgradeModal from "./UpgradeModal";

const CATEGORIAS = [
  { value: "antes",       label: "📋 Antes" },
  { value: "durante",     label: "⛽ Durante" },
  { value: "depois",      label: "📷 Depois" },
  { value: "malas",       label: "🎒 Malas" },
  { value: "documentos",  label: "📄 Documentos" },
  { value: "ingressos",   label: "🎫 Ingressos" },
  { value: "reservas",    label: "🛎️ Reservas" },
];

const CAT_LABELS = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]));

function diasAteData(prazo) {
  if (!prazo) return null;
  const ms = new Date(prazo + "T23:59:59").getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export default function Checklist({ viagemId, user, isAdmin }) {
  const { items, loading, error, toggle, addItem, deleteItem } = useChecklist(viagemId);
  const [newTitle, setNewTitle] = useState("");
  const [newCat, setNewCat] = useState("antes");
  const [newPrazo, setNewPrazo] = useState("");
  const [adding, setAdding] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const limits = getLimits(user?.plano);
  const atLimit = limits.checklist != null && items.length >= limits.checklist;

  const total = items.length;
  const done = items.filter((i) => i.concluido).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const cats = Array.from(new Set(items.map((i) => i.categoria).filter(Boolean)));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    if (atLimit) { setShowUpgrade(true); return; }
    setAdding(true);
    try {
      await addItem({ titulo: newTitle, categoria: newCat, prazo: newPrazo || null });
      setNewTitle("");
      setNewPrazo("");
    } catch (e) { alert("Erro: " + e.message); }
    finally { setAdding(false); }
  };

  return (
    <div className="px-4 pb-6">
      <div className="card p-4 mt-4">
        <div className="flex items-baseline justify-between">
          <div className="font-display font-extrabold text-base text-[#1F2937]">Progresso</div>
          <div className="text-sm text-[#6B7280]">
            <span className="font-display font-extrabold tabular" style={{ color: "var(--tv-accent-dark)" }}>{done}</span>
            <span className="text-[#9CA3AF]"> / {total} concluídos</span>
          </div>
        </div>
        <div className="mt-3 h-3 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: pct >= 100 ? "#27AE60" : "var(--tv-gradient)",
            }}
          />
        </div>
      </div>

      <form onSubmit={handleAdd} className="card p-3 mt-3 space-y-2">
        <input
          className="input"
          placeholder={atLimit ? `Limite Free: ${limits.checklist} itens. Assine pra ilimitado.` : "Novo item…"}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onFocus={() => { if (atLimit) setShowUpgrade(true); }}
          maxLength={120}
        />
        <div className="flex gap-2">
          <select className="input flex-1" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input
            type="date"
            className="input flex-1"
            value={newPrazo}
            onChange={(e) => setNewPrazo(e.target.value)}
            placeholder="Prazo (opcional)"
            title="Prazo (opcional)"
          />
          <button type="submit" className="btn-amber !px-3 inline-flex items-center" disabled={!newTitle.trim() || adding}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : atLimit ? <Sparkles className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </form>

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} reason="checklist" user={user} />

      {loading && <div className="text-center text-[#6B7280] text-sm py-8">Carregando…</div>}
      {error && <div className="text-center text-red-600 text-sm py-2">{error}</div>}

      {!loading && items.length === 0 && (
        <div className="text-center text-[#6B7280] text-sm py-10">
          Nenhum item ainda. Use o campo acima pra adicionar.
        </div>
      )}

      {cats.length > 0
        ? cats.map((cat) => (
            <Section key={cat} title={catLabel(cat)} list={items.filter((i) => i.categoria === cat)} toggle={toggle} user={user} isAdmin={isAdmin} onDelete={deleteItem} />
          ))
        : items.length > 0 && (
          <Section title="Itens" list={items} toggle={toggle} user={user} isAdmin={isAdmin} onDelete={deleteItem} />
        )
      }
    </div>
  );
}

function catLabel(cat) {
  return CAT_LABELS[cat] ?? `📌 ${cat}`;
}

function PrazoBadge({ prazo }) {
  const dias = diasAteData(prazo);
  if (dias == null) return null;
  let text, color, bg;
  if (dias < 0) { text = "vencido"; color = "#991B1B"; bg = "#FEE2E2"; }
  else if (dias === 0) { text = "vence hoje"; color = "#92400E"; bg = "#FEF3C7"; }
  else if (dias <= 3) { text = `${dias} dia${dias === 1 ? "" : "s"}`; color = "#92400E"; bg = "#FEF3C7"; }
  else if (dias <= 7) { text = `${dias} dias`; color = "#374151"; bg = "#F3F4F6"; }
  else { text = `${dias} dias`; color = "#6B7280"; bg = "#F9FAFB"; }
  return (
    <span className="badge mt-1 inline-flex items-center gap-1" style={{ background: bg, color }}>
      ⏰ {text}
    </span>
  );
}

function Section({ title, list, toggle, user, isAdmin, onDelete }) {
  return (
    <section className="mt-5">
      <div className="font-display font-extrabold text-base text-[#1F2937] px-1 mb-2">{title}</div>
      <ul className="space-y-2">
        {list.map((item) => (
          <li key={item.id}>
            <div className="card p-3 flex items-start gap-3">
              <button
                onClick={() => toggle(item, user)}
                className="active:scale-95 transition shrink-0 mt-0.5"
                aria-label={item.concluido ? "Desmarcar" : "Marcar"}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                  style={{
                    background: item.concluido ? "#27AE60" : "white",
                    border: `2px solid ${item.concluido ? "#27AE60" : "var(--tv-accent)"}`,
                  }}
                >
                  {item.concluido && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                </span>
              </button>
              <button onClick={() => toggle(item, user)} className="flex-1 min-w-0 text-left">
                <div className={`text-sm ${item.concluido ? "text-[#9CA3AF] line-through" : "text-[#1F2937]"}`}>
                  {item.titulo}
                </div>
                {item.prazo && !item.concluido && <PrazoBadge prazo={item.prazo} />}
                {item.concluido && item._by_nome && (
                  <div className="text-xs text-[#9CA3AF] mt-0.5">✓ por {item._by_nome}</div>
                )}
              </button>
              {isAdmin && (
                <button
                  onClick={() => { if (confirm("Remover esse item?")) onDelete(item.id); }}
                  className="text-red-400 hover:text-red-600 p-1 shrink-0"
                  aria-label="Remover"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
