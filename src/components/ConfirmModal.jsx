// R17-1 + R18-2: modal customizado pra confirm/alert.
// Substitui window.confirm e window.alert nativos (visual quebrado em
// mobile, sem brand, a11y ruim).
//
// API moderna (recomendada via useConfirm hook):
//   variant: "info" | "confirm" | "danger"
//     - info:    1 botão só (OK). Substitui alert().
//     - confirm: 2 botões (Cancelar + Confirmar). Default.
//     - danger:  2 botões, confirm em vermelho. Pra ações destrutivas.
//   message: corpo do modal (preferido). body é alias retro.
//
// API legacy (mantida pra MyTrips/Account que já chamavam direto):
//   body: alias de message
//   confirmVariant: "danger" | "primary"  — mapeado pra variant interno
//
// A11y delegada a useModalA11y (R18-1): role=dialog, aria-modal,
// aria-labelledby, ESC, focus trap, restore focus. Foco inicial é
// configurado AQUI porque depende de variant (cancel em confirm/danger,
// confirm em info — não-destrutivo primeiro).

import { useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { useModalA11y } from "../lib/useModalA11y";

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
  const cancelBtnRef = useRef(null);
  const confirmBtnRef = useRef(null);

  // Resolve variant final (nova API > legacy). Default "confirm".
  const v = variant ?? (confirmVariant === "danger" ? "danger" : "confirm");
  const isInfo = v === "info";

  // Foco inicial: em "info" vai no único botão (confirm); senão no
  // cancel (não-destrutivo). Lockless porque modal de confirm não tem
  // estado de "mid-operation" — busy aqui só desabilita botões mas o
  // user pode escapar via ESC.
  const initialFocusRef = isInfo ? confirmBtnRef : cancelBtnRef;
  const { dialogRef, titleId } = useModalA11y({
    isOpen: open,
    onClose: busy ? undefined : onClose,
    initialFocusRef,
  });

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
        ref={dialogRef}
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
