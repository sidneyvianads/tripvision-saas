import { X } from "lucide-react";

export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  confirmVariant = "primary",
  onConfirm,
  onClose,
}) {
  if (!open) return null;

  const confirmClass = confirmVariant === "danger"
    ? "bg-red-600 hover:bg-red-700 text-white"
    : "btn-primary";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 animate-fade-up"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl bg-white max-h-[80vh] overflow-hidden flex flex-col animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="flex-1">
            <h3 className="font-display font-extrabold text-[#1F2937] text-lg">{title}</h3>
            <p className="text-[#4B5563] text-sm mt-2">{body}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[#F3F4F6]" aria-label="Fechar">
            <X className="w-4 h-4 text-[#6B7280]" />
          </button>
        </div>
        <div className="px-5 pb-5 pt-4 flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost">
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm(); }}
            className={`px-4 py-2.5 rounded-xl font-display font-extrabold text-sm ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
