// R29-2: extraído do Welcome.jsx.
//
// Etapa 2 do signup: usuário escolhe qual influenciador o indicou (pra
// receber desconto e o afiliado ganhar comissão). Lista vinda de
// afiliados table (ativo=true).
//
// Pré-seleção via ?cupom=URL: se a URL trouxe um cupom (capturado pelo
// captureCupomFromUrl em App.jsx), pré-seleciona o afiliado correspondente.
//
// Pode pular (botão "Ninguém me indicou"): clearStoredCupom + onContinue.
//
// API:
//   <InfluencerStep selected={afiliado} onSelect={fn} onContinue={fn} onBack={fn} />

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, AtSign } from "lucide-react";
import { supabase, runPublicQuery } from "../../lib/supabase";
import { friendlyError } from "../../lib/errorMessages";
import { getStoredCupom, clearStoredCupom } from "../../lib/cupom";
import { StepIndicator, colorFromName, initialsFromName } from "./_shared";

export default function InfluencerStep({ selected, onSelect, onContinue, onBack }) {
  const [afiliados, setAfiliados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cupom da URL (?cupom=X) — usado pra pré-selecionar
  const initialCupom = useMemo(() => (selected?.cupom ?? getStoredCupom() ?? "").toUpperCase(), [selected]);

  // R11-4: refs capturam props atuais (selected/onSelect/onContinue)
  // sem prender o closure do effect com valores stale. Antes, o effect
  // tinha `[]` deps + `if (!selected && initialCupom)` — o `selected`
  // era do mount. Se o user clicasse em outro afiliado durante o load
  // da lista, o auto-select de cupom URL chegava DEPOIS e sobrescrevia
  // a escolha manual.
  const selectedRef = useRef(selected);
  const onSelectRef = useRef(onSelect);
  const onContinueRef = useRef(onContinue);
  useEffect(() => {
    selectedRef.current = selected;
    onSelectRef.current = onSelect;
    onContinueRef.current = onContinue;
  });

  useEffect(() => {
    let active = true;
    // R37: timeout defensivo. Em Safari ITP, supabase.from(..).select(..)
    // pode travar silenciosamente porque o supabase-js tenta ler o JWT do
    // localStorage antes do request HTTP — se storage trava, a promise
    // nunca resolve. Sem isso, spinner ficava infinito e o user tinha
    // que recarregar (perdendo todos os dados do form). Agora: 5s pra
    // responder, ou destrava com error + botão "Pular" ainda funcional.
    const TIMEOUT_MS = 5000;
    const ac = new AbortController();
    const timeoutId = setTimeout(() => {
      if (active) {
        console.warn(`[InfluencerStep] afiliados load timeout (${TIMEOUT_MS}ms) — destravando UI com botão Pular`);
        setError("Lista de influenciadores indisponível agora. Você pode pular esta etapa.");
        setLoading(false);
        ac.abort();
      }
    }, TIMEOUT_MS);

    (async () => {
      try {
        // .abortSignal não é suportado em todas as versões do supabase-js;
        // o timeoutId acima é o seguro pra UI. AbortController fica como
        // dica pro client cancelar a request se conseguir.
        // R39: runPublicQuery faz retry uma vez se o erro for de auth
        // (PGRST301/302/42501). Cobre token revogado no servidor que
        // o purge eager não detectou — limpa session e tenta como anon.
        const { data, error: err } = await runPublicQuery(() =>
          supabase
            .from("afiliados")
            .select("id, nome, instagram, cupom, desconto_percent, foto_url")
            .eq("ativo", true)
            .order("nome")
            .abortSignal(ac.signal)
        );
        if (!active) return;
        clearTimeout(timeoutId);
        if (err) {
          console.error("[Welcome] afiliados load erro:", err);
          setError(friendlyError(err));
          setLoading(false);
          return;
        }
        const list = data ?? [];
        setAfiliados(list);
        setLoading(false);

        // Lista vazia → não tem o que mostrar nessa etapa, pula direto pro plano
        if (list.length === 0) {
          onContinueRef.current?.();
          return;
        }

        // Pré-seleciona pelo cupom da URL (se algum afiliado da lista bater).
        // Lê selected MAIS RECENTE via ref pra não sobrescrever escolha manual.
        if (!selectedRef.current && initialCupom) {
          const match = list.find((a) => a.cupom?.toUpperCase() === initialCupom);
          if (match) onSelectRef.current?.(match);
        }
      } catch (e) {
        // R37: throw síncrono do supabase-js (raro mas possível em
        // browsers com storage corrompido). Destrava UI igual ao timeout.
        if (!active) return;
        clearTimeout(timeoutId);
        console.error("[InfluencerStep] afiliados load exception:", e);
        setError(friendlyError(e));
        setLoading(false);
      }
    })();
    return () => {
      active = false;
      clearTimeout(timeoutId);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-6 space-y-4 animate-pop">
      <StepIndicator step={2} />

      <div className="text-center">
        <div className="text-4xl mb-1">🎟️</div>
        <h2 className="font-display font-extrabold text-[#1F2937] text-xl">
          Quem te indicou?
        </h2>
        <p className="text-[#6B7280] text-sm mt-1">
          Escolha o influenciador que falou do Viajjei pra você.
        </p>
      </div>

      {/* Banner: pré-selecionado por URL */}
      {selected && initialCupom && (
        <div
          className="rounded-2xl p-3 animate-pop"
          style={{ background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)", border: "1.5px solid #6EE7B7" }}
        >
          <div className="text-emerald-900 text-[13px] font-display font-bold">
            ✅ Você foi indicado por <strong>{selected.nome}</strong>! Confirme abaixo ou troque a seleção.
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-[#F97316]" />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">
          Não consegui carregar a lista de influenciadores: {error}
        </div>
      ) : (
        <ul className="space-y-2 max-h-[420px] overflow-y-auto -mr-2 pr-2">
          {afiliados.map((af) => {
            const isSelected = selected?.id === af.id;
            const desconto = Number(af.desconto_percent ?? 0);
            return (
              <li key={af.id}>
                <button
                  type="button"
                  onClick={() => onSelect(isSelected ? null : af)}
                  className="w-full text-left rounded-2xl p-3 flex items-center gap-3 transition active:scale-[0.99]"
                  style={{
                    background: "white",
                    border: isSelected ? "2px solid #F97316" : "1.5px solid #E2E8F0",
                    boxShadow: isSelected ? "0 8px 24px rgba(249, 115, 22, 0.20)" : "0 1px 3px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <InfluencerAvatar af={af} />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold text-[#0F172A] truncate">{af.nome}</div>
                    {af.instagram && (
                      <div className="text-[12px] text-[#64748B] truncate inline-flex items-center gap-1">
                        <AtSign className="w-3 h-3" /> {af.instagram.replace(/^@/, "")}
                      </div>
                    )}
                    {desconto > 0 && (
                      <div className="mt-1">
                        <span
                          className="inline-block text-[10px] px-2 py-0.5 rounded-full font-display font-extrabold uppercase tracking-widest"
                          style={{ background: "#FFF7ED", color: "#9A3412", border: "1px solid #FED7AA" }}
                        >
                          {desconto.toFixed(0)}% off no 1º mês
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[11px] font-display font-extrabold px-3 py-1.5 rounded-full whitespace-nowrap"
                    style={{
                      background: isSelected ? "#F97316" : "#F1F5F9",
                      color: isSelected ? "white" : "#475569",
                    }}
                  >
                    {isSelected ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> Escolhido</span> : "Escolher"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Confirmação pós-seleção */}
      {selected && (
        <div className="text-center text-[13px] font-display font-bold text-emerald-700">
          ✅ Indicado por {selected.nome}!
        </div>
      )}

      {/* CTAs */}
      {selected ? (
        <button
          type="button"
          onClick={onContinue}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
          style={{ background: "#F97316" }}
        >
          Continuar <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => { clearStoredCupom(); onContinue(); }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-display font-extrabold text-sm border-2 transition hover:bg-[#F8FAFC]"
          style={{ borderColor: "#E2E8F0", color: "#0F172A", background: "white" }}
        >
          Ninguém me indicou — Pular <ArrowRight className="w-4 h-4" />
        </button>
      )}

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-[#64748B] hover:text-[#0F172A] font-display font-bold w-full text-center pt-1"
      >
        ← Voltar
      </button>
    </div>
  );
}

function InfluencerAvatar({ af }) {
  const size = 48;
  if (af.foto_url) {
    return (
      <img
        src={af.foto_url}
        alt={af.nome}
        width={size}
        height={size}
        loading="lazy"
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, background: "#F1F5F9" }}
        onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "flex"; }}
        draggable={false}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 text-white font-display font-extrabold"
      style={{ width: size, height: size, background: colorFromName(af.nome), fontSize: 18 }}
    >
      {initialsFromName(af.nome)}
    </div>
  );
}
