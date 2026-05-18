// R17-2: hook pra disparar ConfirmModal imperativo via Promise<boolean>.
//
// Padrão Provider + Context pra haver UM modal global montado no topo
// da árvore — não precisa instanciar <ConfirmModal> em cada componente.
//
// Uso:
//   const { showConfirm, showAlert } = useConfirm();
//
//   const ok = await showConfirm({
//     title: "Apagar viagem?",
//     message: "Não dá pra desfazer.",
//     variant: "danger",
//     confirmLabel: "Apagar",
//   });
//   if (ok) { /* prossegue */ }
//
//   await showAlert("Operação concluída.");
//   await showAlert("PDF gerado!", { title: "Pronto" });
//
// Resolve Promise:
//   - true  → user clicou Confirmar
//   - false → user clicou Cancelar / X / ESC / backdrop
//
// Concorrência: se showConfirm/Alert é chamado com modal já aberto,
// resolve o anterior com false (cancel) e abre o novo. Evita Promise
// pendurada vazando.

import { createContext, useCallback, useContext, useRef, useState } from "react";
import ConfirmModal from "../components/ConfirmModal";

const ConfirmContext = createContext(null);

const INITIAL = {
  open: false,
  title: "",
  message: "",
  variant: "confirm",
  confirmLabel: "Confirmar",
  cancelLabel: "Cancelar",
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(INITIAL);
  const resolverRef = useRef(null);

  // Resolve pendente (se houver) com `value` e limpa.
  const settle = useCallback((value) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState((s) => ({ ...s, open: false }));
    r?.(value);
  }, []);

  const showConfirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      // Se já existe modal aberto, cancela o anterior (resolve false)
      // antes de abrir o novo. Senão a Promise antiga fica pendurada.
      if (resolverRef.current) {
        const prev = resolverRef.current;
        resolverRef.current = null;
        prev(false);
      }
      resolverRef.current = resolve;
      setState({
        open: true,
        title: opts.title ?? "",
        message: opts.message ?? opts.body ?? "",
        variant: opts.variant ?? "confirm",
        confirmLabel: opts.confirmLabel ?? "Confirmar",
        cancelLabel: opts.cancelLabel ?? "Cancelar",
      });
    });
  }, []);

  const showAlert = useCallback((message, opts = {}) => {
    return showConfirm({
      title: opts.title ?? "",
      message,
      variant: "info",
      confirmLabel: opts.confirmLabel ?? "OK",
    });
  }, [showConfirm]);

  return (
    <ConfirmContext.Provider value={{ showConfirm, showAlert }}>
      {children}
      <ConfirmModal
        open={state.open}
        title={state.title}
        message={state.message}
        variant={state.variant}
        confirmLabel={state.confirmLabel}
        cancelLabel={state.cancelLabel}
        onConfirm={() => settle(true)}
        onClose={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm precisa de <ConfirmProvider> acima na árvore.");
  }
  return ctx;
}
