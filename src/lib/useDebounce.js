// R19-1: debounce simples pra inputs de busca.
// Retorna o valor depois de `delay` ms sem mudança. Usado em busca/filter.
//
//   const [query, setQuery] = useState("");
//   const debouncedQuery = useDebounce(query, 300);
//   useEffect(() => { fetchData(debouncedQuery); }, [debouncedQuery]);

import { useEffect, useState } from "react";

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
