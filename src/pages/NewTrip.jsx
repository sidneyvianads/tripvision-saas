import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Plus, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import { TRIP_THEMES } from "../data/types";
import Mountains from "../components/ambient/Mountains";

export default function NewTrip() {
  const { user } = useAuth();
  const { createTrip } = useTrips(user?.id);
  const navigate = useNavigate();

  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [cidadeInput, setCidadeInput] = useState("");
  const [cidades, setCidades] = useState([]);
  const [numPessoas, setNumPessoas] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tema, setTema] = useState(TRIP_THEMES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const addCidade = () => {
    const c = cidadeInput.trim();
    if (!c) return;
    if (!cidades.includes(c)) setCidades([...cidades, c]);
    setCidadeInput("");
  };
  const removeCidade = (c) => setCidades(cidades.filter((x) => x !== c));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nome.trim()) return setErr("Dê um nome pra sua viagem.");
    if (dataInicio && dataFim && dataFim < dataInicio) return setErr("Data fim antes da data início.");
    setBusy(true);
    setErr(null);
    try {
      const trip = await createTrip({
        nome,
        data_inicio: dataInicio,
        data_fim: dataFim,
        cidades,
        num_pessoas: numPessoas ? Number(numPessoas) : null,
        descricao,
        cover_emoji: tema.icon,
        cor_tema: tema.color,
      });
      navigate(`/v/${trip.slug}/admin`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col gradient-winter">
      <header className="gradient-header text-white safe-top relative overflow-hidden">
        <Mountains className="h-16" color="#7CB9E8" />
        <div className="px-4 pt-4 pb-5 flex items-center gap-3 relative z-10">
          <Link to="/" className="rounded-full bg-white/15 hover:bg-white/25 p-2" aria-label="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <div className="font-display font-extrabold text-lg leading-tight">Nova viagem ❄️</div>
            <div className="text-[#7CB9E8] text-xs">Preencha o básico — você refina depois</div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-24">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl mx-auto">
          <div className="card p-4 space-y-3">
            <Field label="Nome da viagem" required>
              <input
                className="input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Serra Catarinense em julho"
                maxLength={80}
                autoFocus
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Início">
                <input type="date" className="input" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </Field>
              <Field label="Fim">
                <input type="date" className="input" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </Field>
            </div>

            <Field label="Cidades">
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={cidadeInput}
                  onChange={(e) => setCidadeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCidade(); } }}
                  placeholder="Ex: Gramado, Canela…"
                />
                <button type="button" onClick={addCidade} className="btn-fire inline-flex items-center gap-1">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {cidades.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {cidades.map((c) => (
                    <span key={c} className="badge bg-[#E8F0FE] text-[#1A3A4A] inline-flex items-center gap-1">
                      {c}
                      <button type="button" onClick={() => removeCidade(c)} aria-label={`Remover ${c}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Pessoas">
                <input
                  type="number"
                  min="1"
                  max="999"
                  className="input"
                  value={numPessoas}
                  onChange={(e) => setNumPessoas(e.target.value)}
                  placeholder="Ex: 8"
                />
              </Field>
              <Field label="Tema">
                <select
                  className="input"
                  value={tema.color}
                  onChange={(e) => setTema(TRIP_THEMES.find((t) => t.color === e.target.value) ?? TRIP_THEMES[0])}
                >
                  {TRIP_THEMES.map((t) => (
                    <option key={t.color} value={t.color}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Descrição (opcional)">
              <textarea
                className="input min-h-[72px]"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                maxLength={400}
                placeholder="Tipo de viagem, observações, expectativas…"
              />
            </Field>
          </div>

          {err && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">
              {err}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full inline-flex items-center justify-center gap-2"
            disabled={busy}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Criar viagem
          </button>
        </form>
      </main>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-xs font-display font-bold text-[#1A3A4A]/80">
        {label}{required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
