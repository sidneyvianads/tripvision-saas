// R19-1: paginação acessível reutilizável pro AdminAfiliados (3 tabs).
//
// API:
//   <Pagination
//     currentPage={1}
//     totalCount={1234}
//     pageSize={25}
//     onPageChange={(p) => setPage(p)}
//     onPageSizeChange={(s) => setPageSize(s)}       // opcional
//     pageSizeOptions={[25, 50, 100]}                // opcional
//     variant="full"                                  // "full" | "simple"
//     label="afiliados"                               // pra screen reader e legenda
//   />
//
// variant="simple": só prev/next + texto "X de Y" (footer de tabela)
// variant="full":   primeira/prev/jump/next/última + size selector + total
//
// Acessibilidade:
//   - role="navigation" + aria-label
//   - Botões com aria-label descritivo ("Próxima página", "Página 3")
//   - Estado disabled correto nos extremos
//   - Input de jump-to-page com label visível

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export default function Pagination({
  currentPage = 1,
  totalCount = 0,
  pageSize = 25,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  variant = "full",
  label = "registros",
}) {
  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const start = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalCount);

  const go = (p) => {
    const clamped = Math.max(1, Math.min(p, totalPages));
    if (clamped !== safePage) onPageChange?.(clamped);
  };

  return (
    <nav role="navigation" aria-label={`Paginação de ${label}`} className="flex flex-wrap items-center gap-2 text-sm py-3">
      <div className="text-[#64748B] text-xs flex-1 min-w-[140px]">
        {totalCount === 0 ? (
          <>Sem {label}.</>
        ) : (
          <>
            <strong className="font-display font-bold text-[#0F172A]">{start}</strong>
            <span>–</span>
            <strong className="font-display font-bold text-[#0F172A]">{end}</strong>
            <span> de </span>
            <strong className="font-display font-bold text-[#0F172A]">{totalCount}</strong>
            <span> {label}</span>
          </>
        )}
      </div>

      {variant === "full" && pageSizeOptions && onPageSizeChange && (
        <label className="inline-flex items-center gap-1.5 text-xs text-[#64748B]">
          <span>Mostrar</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
            className="input !py-1 !px-2 text-xs"
            aria-label="Itens por página"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
      )}

      <div className="inline-flex items-center gap-0.5">
        {variant === "full" && (
          <button
            type="button"
            onClick={() => go(1)}
            disabled={safePage <= 1}
            aria-label="Primeira página"
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronsLeft className="w-4 h-4 text-[#64748B]" />
          </button>
        )}
        <button
          type="button"
          onClick={() => go(safePage - 1)}
          disabled={safePage <= 1}
          aria-label="Página anterior"
          className="p-1.5 rounded-lg hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4 text-[#64748B]" />
        </button>

        {variant === "full" ? (
          <JumpToPage page={safePage} totalPages={totalPages} onJump={go} />
        ) : (
          <span className="px-2 text-xs text-[#64748B]" aria-live="polite">
            Pág. <strong className="text-[#0F172A]">{safePage}</strong> de {totalPages}
          </span>
        )}

        <button
          type="button"
          onClick={() => go(safePage + 1)}
          disabled={safePage >= totalPages}
          aria-label="Próxima página"
          className="p-1.5 rounded-lg hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4 text-[#64748B]" />
        </button>
        {variant === "full" && (
          <button
            type="button"
            onClick={() => go(totalPages)}
            disabled={safePage >= totalPages}
            aria-label="Última página"
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronsRight className="w-4 h-4 text-[#64748B]" />
          </button>
        )}
      </div>
    </nav>
  );
}

// Input editável de "página X de Y" — controlled buffer pra user poder
// digitar sem trocar a página a cada keystroke; commit no Enter ou blur.
function JumpToPage({ page, totalPages, onJump }) {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => { setDraft(String(page)); }, [page]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onJump(n);
    else setDraft(String(page));
  };

  return (
    <span className="inline-flex items-center gap-1 px-2 text-xs text-[#64748B]" aria-live="polite">
      <span>Pág.</span>
      <input
        type="number"
        min={1}
        max={totalPages}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        className="w-12 text-center input !py-0.5 !px-1 text-xs tabular"
        aria-label={`Pular pra página (atual ${page} de ${totalPages})`}
      />
      <span>de {totalPages}</span>
    </span>
  );
}
