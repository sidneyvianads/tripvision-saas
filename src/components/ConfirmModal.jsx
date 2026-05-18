// R17-1: modal customizado pra confirm/alert. Substitui window.confirm e
// window.alert nativos (visual quebrado em mobile, sem brand, a11y ruim).
//
// API moderna (recomendada via useConfirm hook):
//   variant: "info" | "confirm" | "danger"
//     - info:    1 botão só (OK). Substitui alert().
//     - confirm: 2 botões (Cancelar + Confirmar). Default.
//     - danger:  2 botões, confirm em vermelho. Pra ações destrutivas.
//   message: corpo do modal (preferido). body é alias retro.
//
// API legacy (mantida pra não quebrar callers diretos em MyTrips/Account):
//   body: alias de message
//   confirmVariant: "danger" | "primary"  — mapeado pra variant interno
//
// Acessibilidade:
//   - role="dialog" + aria-modal="true" + aria-labelledby
//   - Foco inicial em Cancelar (não-destrutivo) ou no único botão em "info"
//   - ESC dispara onClose (se não busy)
//   - Backdrop click dispara onClose (se não busy)
//   - Focus trap dentro do modal
//   - Restaura foco pro elemento que abriu quando fecha

import { useEffect, useId, useRef } from "react";
import { X, Loader2 } from "lucide-react";

export default function ConfirmModal({
  open,
  title,
  body,
  message,
  variant,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  confirmVariant,
  onConfirm,
  onClose,
  busy = false,
}) {
  const titleId = useId();
  const modalRef = useRef(null);
  const cancelBtnRef = useRef(null);
  const confirmBtnRef = useRef(null);
  // Guarda quem tinha foco antes do modal abrir, pra restaurar no close.
  const prevFocusRef = useRef(null);

  // Resolve a variant final (nova API > legacy). Default "confirm".
  const v = variant ?? (confirmVariant === "danger" ? "danger" : "confirm");
  const isInfo = v === "info";

  // Effect só roda quando 'open' muda (toggle). Faz focus inicial,
  // listener ESC, focus trap, e restore no cleanup.
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = typeof document !== "undefined" ? document.activeElement : null;
    const targetBtn = isInfo ? confirmBtnRef.current : cancelBtnRef.current;
    // setTimeout 0 garante que o DOM já renderizou + browser captura.
    const t = setTimeout(() => { targetBtn?.focus(); }, 0);

    const onKey = (e) => {
      if (busy) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      // Focus trap mínimo: TAB com ou sem shift cycla entre os botões/X.
      if (e.key === "Tab") {
        const root = modalRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
      // Restaura foco SE o elemento ainda está no DOM e é focável.
      const prev = prevFocusRef.current;
      if (prev && typeof prev.focus === "function" && document.contains(prev)) {
        try { prev.focus(); } catch { /* silent */ }
      }
    };
  // open + isInfo determinam comportamento; onClose/busy lidos via ref do callback acima.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isInfo]);

  if (!open) return null;

  const confirmClass = v === "danger"
    ? "bg-red-600 hover:bg-red-700 text-white"
    : "btn-primary";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 animate-fade-up"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl bg-white max-h-[80vh] overflow-hidden flex flex-col animate-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="flex-1">
            <h3 id={titleId} className="font-display font-extrabold text-[#1F2937] text-lg">{title}</h3>
            {(message ?? body) && (
              <p className="text-[#4B5563] text-sm mt-2 whitespace-pre-wrap">{message ?? body}</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded-full hover:bg-[#F3F4F6] disabled:opacity-40"
            aria-label="Fechar"
          >
            <X className="w-4 h-4 text-[#6B7280]" />
          </button>
        </div>
        <div className="px-5 pb-5 pt-4 flex gap-2 justify-end">
          {!isInfo && (
            <button
              ref={cancelBtnRef}
              onClick={onClose}
              className="btn-ghost"
              disabled={busy}
              type="button"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            onClick={() => { if (!busy) onConfirm?.(); }}
            disabled={busy}
            type="button"
            className={`px-4 py-2.5 rounded-xl font-display font-extrabold text-sm inline-flex items-center gap-1.5 disabled:opacity-60 ${confirmClass}`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
