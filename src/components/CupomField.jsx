import { useEffect, useState } from "react";
import { Tag, Check, X, Loader2 } from "lucide-react";
import { validateCupom, getStoredCupom, setStoredCupom } from "../lib/cupom";

// Campo de cupom inline com validação automática.
// Notifica o pai via onApplied(afiliado) sempre que o cupom muda de estado.
export default function CupomField({ onApplied, autoOpen = false }) {
  const [cupom, setCupom] = useState(() => getStoredCupom());
  const [open, setOpen] = useState(autoOpen || !!cupom);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(cupom ? "pending" : "idle"); // idle | pending | ok | invalid
  const [afiliado, setAfiliado] = useState(null);

  // Valida quando o componente monta com cupom guardado, ou quando user digita.
  useEffect(() => {
    if (!cupom) { setState("idle"); setAfiliado(null); onApplied?.(null); return; }
    let active = true;
    setBusy(true); setState("pending");
    validateCupom(cupom).then((res) => {
      if (!active) return;
      if (res.ok) {
        setState("ok"); setAfiliado(res.afiliado);
        setStoredCupom(cupom);
        onApplied?.(res.afiliado);
      } else {
        setState("invalid"); setAfiliado(null);
        onApplied?.(null);
      }
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cupom]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] text-[#64748B] hover:text-[#0F172A] font-display font-bold inline-flex items-center gap-1"
      >
        <Tag className="w-3.5 h-3.5" /> Tem cupom de desconto?
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-display font-extrabold uppercase tracking-wide text-[#64748B]">
        Cupom (opcional)
      </label>
      <div className="relative">
        <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
        <input
          type="text"
          className="input pl-10 uppercase tracking-wider"
          placeholder="EX: JOAO5"
          value={cupom}
          onChange={(e) => setCupom(e.target.value.toUpperCase().slice(0, 30))}
          maxLength={30}
        />
        {busy && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#94A3B8]" />}
      </div>
      {state === "ok" && afiliado && (
        <div className="text-[12px] text-emerald-700 font-display font-bold inline-flex items-center gap-1">
          <Check className="w-3.5 h-3.5" /> Cupom de <strong>{afiliado.nome}</strong> aplicado!
        </div>
      )}
      {state === "invalid" && (
        <div className="text-[12px] text-red-600 font-display font-bold inline-flex items-center gap-1">
          <X className="w-3.5 h-3.5" /> Cupom inválido.
        </div>
      )}
    </div>
  );
}
