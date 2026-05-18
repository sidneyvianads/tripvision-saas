import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Plus, X, Minus, Shield } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import { TEMAS, TEMA_KEYS, suggestTemaByCidades, getTema, emojiForCidade } from "../data/themes";
import { temaCssVars } from "../lib/applyTema";
import { needsSubscription } from "../data/plans";
import { friendlyError } from "../lib/errorMessages";

export default function NewTrip() {
  const { user } = useAuth();
  const { createTrip } = useTrips(user?.id);
  const navigate = useNavigate();

  // Guarda: sem assinatura ativa não cria viagem
  useEffect(() => {
    if (needsSubscription(user)) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [cidadeInput, setCidadeInput] = useState("");
  const [cidades, setCidades] = useState([]);
  const [adultos, setAdultos] = useState(2);
  const [criancas, setCriancas] = useState(0);
  const [bebes, setBebes] = useState(0);
  const [viajeSegura, setViajeSegura] = useState(false);
  // soloAsked: usuário já respondeu o prompt "Viajando solo?" — evita re-perguntar
  const [soloAsked, setSoloAsked] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [temaId, setTemaId] = useState("cidade");
  const [temaTouched, setTemaTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const totalPessoas = adultos + criancas + bebes;
  // Mostra o prompt solo enquanto for 1 adulto sem crianças/bebês e o user ainda não respondeu
  const showSoloPrompt = adultos === 1 && criancas === 0 && bebes === 0 && !soloAsked;

  // Se a composição mudar pra mais de 1 pessoa, reseta a flag de Viaje Segura
  // (ele é específico pra viagem solo)
  useEffect(() => {
    if (totalPessoas > 1 && viajeSegura) setViajeSegura(false);
    if (totalPessoas > 1 && soloAsked) setSoloAsked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPessoas]);

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
    if (adultos < 1) return setErr("Pelo menos 1 adulto na viagem.");
    setBusy(true);
    setErr(null);
    try {
      const trip = await createTrip({
        nome,
        data_inicio: dataInicio,
        data_fim: dataFim,
        cidades,
        adultos,
        criancas,
        bebes,
        viaje_segura: viajeSegura,
        descricao,
        cover_emoji: emojiForCidade(cidades[0]) ?? tema.emoji,
        cor_tema: tema.accent,
        tema: temaId,
      });
      navigate(`/v/${trip.slug}/start`);
    } catch (e) {
      console.error("[NewTrip] criar viagem erro:", e);
      setErr(friendlyError(e));
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

            <div>
              <div className="text-xs font-display font-bold text-[#6B7280] mb-2">Quem vai?</div>
              <div className="space-y-2.5">
                <PeopleRow
                  emoji="👥"
                  label="Adultos"
                  hint="13 anos ou mais"
                  value={adultos}
                  onChange={setAdultos}
                  min={1}
                  max={30}
                />
                <PeopleRow
                  emoji="👧"
                  label="Crianças"
                  hint="3 a 12 anos"
                  value={criancas}
                  onChange={setCriancas}
                  min={0}
                  max={20}
                />
                <PeopleRow
                  emoji="👶"
                  label="Bebês"
                  hint="até 2 anos"
                  value={bebes}
                  onChange={setBebes}
                  min={0}
                  max={10}
                />
              </div>

              {/* Prompt Viaje Segura: aparece quando é 1 adulto sem crianças/bebês */}
              {showSoloPrompt && (
                <div className="mt-3 rounded-2xl p-4 animate-pop"
                     style={{ background: "linear-gradient(135deg, #FDF4FF 0%, #FAE8FF 100%)", border: "1.5px solid #E9D5FF" }}>
                  <div className="font-display font-extrabold text-[#581C87] text-sm">
                    Viajando solo? 🌟
                  </div>
                  <div className="text-[#7C3AED]/85 text-[12px] mt-1">
                    Pra te dar dicas mais relevantes, conta pra mim:
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => { setViajeSegura(true); setSoloAsked(true); }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-display font-extrabold text-sm text-white transition active:scale-[0.98]"
                      style={{ background: "linear-gradient(135deg, #DB2777 0%, #BE185D 100%)", boxShadow: "0 4px 12px rgba(219, 39, 119, 0.35)" }}
                    >
                      <Shield className="w-4 h-4" /> Sim, sou mulher
                    </button>
                    <button
                      type="button"
                      onClick={() => { setViajeSegura(false); setSoloAsked(true); }}
                      className="flex-1 inline-flex items-center justify-center px-3 py-2.5 rounded-xl font-display font-extrabold text-sm border-2 transition hover:bg-[#F8FAFC]"
                      style={{ borderColor: "#E2E8F0", color: "#0F172A", background: "white" }}
                    >
                      Sim, sou homem
                    </button>
                    <button
                      type="button"
                      onClick={() => { setViajeSegura(false); setSoloAsked(true); }}
                      className="flex-1 inline-flex items-center justify-center px-3 py-2.5 rounded-xl font-display font-bold text-xs text-[#64748B] hover:text-[#0F172A] transition"
                    >
                      Prefiro não dizer
                    </button>
                  </div>
                </div>
              )}

              {/* Confirmação Viaje Segura ativo */}
              {viajeSegura && !showSoloPrompt && (
                <div className="mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2"
                     style={{ background: "linear-gradient(135deg, #FDF4FF 0%, #FAE8FF 100%)", border: "1px solid #E9D5FF" }}>
                  <Shield className="w-4 h-4 text-[#BE185D] shrink-0" />
                  <div className="flex-1 min-w-0 text-[12px] text-[#581C87] font-display font-bold">
                    🛡️ Viaje Segura ativado — o Jei vai priorizar segurança em todas as sugestões
                  </div>
                  <button
                    type="button"
                    onClick={() => setViajeSegura(false)}
                    className="text-[11px] text-[#7C3AED] hover:underline font-display font-bold"
                    aria-label="Desativar"
                  >
                    desativar
                  </button>
                </div>
              )}
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

function PeopleRow({ emoji, label, hint, value, onChange, min, max }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#F8FAFC] px-3 py-2">
      <span className="text-2xl" aria-hidden="true">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="font-display font-extrabold text-[#0F172A] text-sm leading-tight">{label}</div>
        <div className="text-[11px] text-[#64748B]">{hint}</div>
      </div>
      <Stepper value={value} onChange={onChange} min={min} max={max} />
    </div>
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
