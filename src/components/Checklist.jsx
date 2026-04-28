import { useState } from "react";
import { Check, Plus, Trash2, Loader2 } from "lucide-react";
import { useChecklist } from "../hooks/useChecklist";

export default function Checklist({ viagemId, user, isAdmin }) {
  const { items, loading, error, toggle, addItem, deleteItem } = useChecklist(viagemId);
  const [newTitle, setNewTitle] = useState("");
  const [newCat, setNewCat] = useState("antes");
  const [adding, setAdding] = useState(false);

  const total = items.length;
  const done = items.filter((i) => i.concluido).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const cats = Array.from(new Set(items.map((i) => i.categoria).filter(Boolean)));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await addItem({ titulo: newTitle, categoria: newCat });
      setNewTitle("");
    } catch (e) { alert("Erro: " + e.message); }
    finally { setAdding(false); }
  };

  return (
    <div className="px-4 pb-6">
      <div className="card p-4 mt-4">
        <div className="flex items-baseline justify-between">
          <div className="font-display font-extrabold text-base text-[#0F1B2D]">Progresso</div>
          <div className="text-sm text-[#1A3A4A]/70">
            <span className="font-display font-extrabold text-[#2E86C1] tabular">{done}</span>
            <span className="text-[#1A3A4A]/50"> / {total} concluídos</span>
          </div>
        </div>
        <div className="mt-3 h-3 rounded-full overflow-hidden" style={{ background: "rgba(124, 185, 232, 0.18)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, #7CB9E8 0%, #2E86C1 ${Math.max(40, 100 - pct)}%, #27AE60 100%)`,
            }}
          />
        </div>
      </div>

      <form onSubmit={handleAdd} className="card p-3 mt-3 flex gap-2">
        <input
          className="input flex-1"
          placeholder="Novo item…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={120}
        />
        <select className="input" style={{ maxWidth: 130 }} value={newCat} onChange={(e) => setNewCat(e.target.value)}>
          <option value="antes">📋 Antes</option>
          <option value="durante">⛽ Durante</option>
          <option value="depois">📷 Depois</option>
        </select>
        <button type="submit" className="btn-fire !px-3 inline-flex items-center" disabled={!newTitle.trim() || adding}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </button>
      </form>

      {loading && <div className="text-center text-[#7CB9E8]/70 text-sm py-8">Carregando…</div>}
      {error && <div className="text-center text-red-300 text-sm py-2">{error}</div>}

      {!loading && items.length === 0 && (
        <div className="text-center text-[#7CB9E8]/60 text-sm py-10">
          Nenhum item ainda. Use o campo acima pra adicionar. ❄️
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
  return ({
    antes: "📋 Antes da viagem",
    durante: "⛽ Durante a viagem",
    depois: "📷 Depois da viagem",
  })[cat] ?? `📌 ${cat}`;
}

function Section({ title, list, toggle, user, isAdmin, onDelete }) {
  return (
    <section className="mt-5">
      <div className="font-display font-extrabold text-base text-[#E8F0FE] px-1 mb-2">{title}</div>
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
                    border: `2px solid ${item.concluido ? "#27AE60" : "rgba(124, 185, 232, 0.4)"}`,
                  }}
                >
                  {item.concluido && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                </span>
              </button>
              <button onClick={() => toggle(item, user)} className="flex-1 min-w-0 text-left">
                <div className={`text-sm ${item.concluido ? "text-[#1A3A4A]/40 line-through" : "text-[#0F1B2D]"}`}>
                  {item.titulo}
                </div>
                {item.concluido && item._by_nome && (
                  <div className="text-xs text-[#1A3A4A]/50 mt-0.5">✓ por {item._by_nome}</div>
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
