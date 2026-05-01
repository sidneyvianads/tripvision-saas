import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Plus, X, Minus } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import { TEMAS, TEMA_KEYS, suggestTemaByCidades, getTema } from "../data/themes";
import { temaCssVars } from "../lib/applyTema";

export default function NewTrip() {
  const { user } = useAuth();
  const { createTrip } = useTrips(user?.id);
  const navigate = useNavigate();

  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [cidadeInput, setCidadeInput] = useState("");
  const [cidades, setCidades] = useState([]);
  const [numPessoas, setNumPessoas] = useState(2);
  const [descricao, setDescricao] = useState("");
  const [temaId, setTemaId] = useState("cidade");
  const [temaTouched, setTemaTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const addCidade = () => {
    const c = cidadeInput.trim();
    if (!c) return;
    if (!cidades.includes(c)) setCidades([...cidades, c]);
    setCidadeInput("");
  };
  const removeCidade = (c) => setCidades(cidades.filter((x) => x !== c));

  // Auto-sugerir tema baseado nas cidades, enquanto o user não escolheu manualmente
  useEffect(() => {
    if (temaTouched) return;
    if (cidades.length === 0) return;
    const sugestao = suggestTemaByCidades(cidades);
    if (sugestao !== temaId) setTemaId(sugestao);
  }, [cidades, temaTouched, temaId]);

  const tema = getTema(temaId);

  // Calcular dias automaticamente (item 14)
  const numDias = useMemo(() => {
    if (!dataInicio || !dataFim) return null;
    if (dataFim < dataInicio) return null;
    const a = new Date(dataInicio + "T00:00:00").getTime();
    const b = new Date(dataFim + "T00:00:00").getTime();
    const dias = Math.round((b - a) / 86400000) + 1;
    return dias > 0 ? dias : null;
  }, [dataInicio, dataFim]);

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
        cover_emoji: tema.emoji,
        cor_tema: tema.accent,
        tema: temaId,
      });
      navigate(`/v/${trip.slug}/start`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-app" style={temaCssVars(temaId)}>
      <header className="bg-white safe-top" style={{ borderBottom: "1px solid #E5E7EB" }}>
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <Link to="/" className="rounded-full bg-[#F3F4F6] hover:bg-[#E5E7EB] p-2" aria-label="Voltar">
            <ArrowLeft className="w-4 h-4 text-[#1F2937]" />
          </Link>
          <div className="flex-1">
            <div className="font-display font-extrabold text-lg leading-tight text-[#1F2937]">Nova viagem</div>
            <div className="text-[#6B7280] text-xs">Preencha o básico — você refina depois</div>
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
                <input
                  type="date"
                  className="input"
                  value={dataFim}
                  min={dataInicio || undefined}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </Field>
            </div>

            {numDias != null && (
              <div className="text-[12px] text-[#6B7280]">
                <strong className="text-tema">{numDias}</strong> {numDias === 1 ? "dia" : "dias"} de viagem
              </div>
            )}

            <Field label="Cidades">
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={cidadeInput}
                  onChange={(e) => setCidadeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCidade(); } }}
                  placeholder="Ex: Gramado, Canela…"
                />
                <button type="button" onClick={addCidade} className="btn-amber inline-flex items-center gap-1" aria-label="Adicionar cidade">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {cidades.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {cidades.map((c) => (
                    <span key={c} className="badge bg-[#F3F4F6] text-[#374151] inline-flex items-center gap-1">
                      {c}
                      <button type="button" onClick={() => removeCidade(c)} aria-label={`Remover ${c}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Field>

            <Field label="Pessoas">
              <Stepper value={numPessoas} onChange={setNumPessoas} min={1} max={50} />
            </Field>

            <Field label="Descrição (opcional)">
              <textarea
                className="input min-h-[72px]"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                maxLength={400}
                placeholder="Tipo de viagem, observações, expectativas…"
              />
            </Field>

            <Field label="Clima da viagem">
              <div className="scroll-x-snap scrollbar-hide -mx-1 px-1">
                {TEMA_KEYS.map((k) => {
                  const t = TEMAS[k];
                  const active = temaId === k;
                  return (
                    <button
                      type="button"
                      key={k}
                      onClick={() => { setTemaId(k); setTemaTouched(true); }}
                      className={`chip ${active ? "chip-active" : ""}`}
                    >
                      {t.chip}
                    </button>
                  );
                })}
              </div>
              <div
                className="mt-2 rounded-xl p-3 text-white relative overflow-hidden"
                style={{ background: tema.gradient, minHeight: 60 }}
              >
                <div className="font-display font-extrabold text-sm flex items-center gap-2">
                  <span className="text-xl">{tema.emoji}</span>
                  <span>{tema.label}</span>
                </div>
                <div className="text-white/80 text-[11px] mt-0.5">
                  Aplica esse visual na sua viagem (gradient, cor de acento, partículas).
                </div>
              </div>
            </Field>
          </div>

          {err && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">
              {err}
            </div>
          )}

          <button
            type="submit"
            className="btn-tema w-full inline-flex items-center justify-center gap-2"
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
      <span className="text-xs font-display font-bold text-[#6B7280]">
        {label}{required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Stepper({ value, onChange, min = 1, max = 99 }) {
  const dec = () => onChange(Math.max(min, Number(value) - 1));
  const inc = () => onChange(Math.min(max, Number(value) + 1));
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white p-1">
      <button type="button" onClick={dec} disabled={Number(value) <= min} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F3F4F6] disabled:opacity-40">
        <Minus className="w-4 h-4 text-[#1F2937]" />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="w-12 text-center bg-transparent outline-none font-display font-extrabold text-[#1F2937] tabular"
      />
      <button type="button" onClick={inc} disabled={Number(value) >= max} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F3F4F6] disabled:opacity-40">
        <Plus className="w-4 h-4 text-[#1F2937]" />
      </button>
    </div>
  );
}
