// R18-1: hook reutilizável de acessibilidade pra modais.
// Extraído de ConfirmModal v2 (R17-1) — mesma lógica, agora compartilhada
// com ShareModal, People, AfiliadoForm e UpgradeModal.
//
// Cuida de:
//   - role/aria via attrs que o caller aplica (dialogRef + titleId retornados)
//   - ESC dispara onClose (respeitando `locked`)
//   - Focus trap: TAB/Shift+TAB cycla entre elementos focáveis dentro do modal
//   - Foco inicial: initialFocusRef se passado, senão primeiro focável
//   - Restore focus: salva activeElement ao abrir, restaura ao fechar
//
// Não cuida (caller decide):
//   - JSX do modal e estilo
//   - Backdrop click (caller liga onClose ou ignora baseado em locked)
//   - aria-hidden no background do app (opcional — caller monta provider
//     próprio se quiser inert; padrão da indústria é dialog element nativo,
//     que ainda tem suporte instável em iOS Safari em 2026)
//
// Uso:
//   const { dialogRef, titleId } = useModalA11y({ isOpen, onClose });
//   return <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
//     <h2 id={titleId}>Título</h2>
//     ...
//   </div>;
//
// Com `locked` (UpgradeModal mid-payment):
//   const { dialogRef, titleId } = useModalA11y({ isOpen, onClose, locked: !!busy });

import { useEffect, useId, useRef } from "react";

function getFocusables(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
}

export function useModalA11y({ isOpen, onClose, initialFocusRef, locked = false } = {}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const prevFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    prevFocusRef.current = typeof document !== "undefined" ? document.activeElement : null;

    // setTimeout 0 garante que o DOM já renderizou + browser captura o
    // clique de open antes de mover foco.
    const t = setTimeout(() => {
      if (initialFocusRef?.current && typeof initialFocusRef.current.focus === "function") {
        try { initialFocusRef.current.focus(); return; } catch { /* fallthrough */ }
      }
      const focusables = getFocusables(dialogRef.current);
      focusables[0]?.focus();
    }, 0);

    const onKey = (e) => {
      if (locked) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === "Tab") {
        const focusables = getFocusables(dialogRef.current);
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
      // Restaura foco se elemento ainda está no DOM e é focável.
      const prev = prevFocusRef.current;
      if (prev && typeof prev.focus === "function" && document.contains(prev)) {
        try { prev.focus(); } catch { /* silent — elemento sumiu mid-cleanup */ }
      }
    };
  // initialFocusRef é ref-stable; mudar a ref mid-open é raro e custaria
  // reatachar listener à toa. onClose normalmente é estável via useCallback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, locked]);

  return { dialogRef, titleId };
}
