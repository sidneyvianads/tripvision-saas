import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errorMessages";

// R28-5: persist com optimistic concurrency control (OCC) via coluna
// version. Antes era UPSERT raw — em 2 abas abertas, última a chegar
// sobrescrevia mensagens da outra. Agora:
//
// 1. Mount lê (messages, version) inicial.
// 2. persist(next):
//    a. UPDATE WHERE version = currentVersion, SET messages = next,
//       version = version + 1 (atomic via Postgres MVCC).
//    b. Se affected_rows = 1 → sucesso. Local version++.
//    c. Se affected_rows = 0 → outra aba já bumpou version. Read row
//       atualizada do server, merge naive (concat + dedupe por ts),
//       1 retry com nova version. Se ainda falhar, give up + log.
// 3. Insert row inicial (primeira msg da conversa) usa upsert clássico
//    com version=1 — sem race possível porque PK garante 1 só row.

export function useIaConversa(viagemId, userId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Version atual do row (lida ao mount, bumpada em cada persist).
  // Ref pra ler sync no persist callback sem refrescar deps.
  const versionRef = useRef(1);
  // Track se a row já foi inserida — primeira persist faz INSERT,
  // resto faz UPDATE com OCC.
  const rowExistsRef = useRef(false);

  useEffect(() => {
    // R10-4: setLoading(false) no early return.
    if (!viagemId || !userId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("ia_conversas")
        .select("messages, version")
        .eq("viagem_id", viagemId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.error("[useIaConversa] load erro:", error);
        setError(friendlyError(error));
      }
      const arr = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(arr);
      if (data) {
        versionRef.current = Number(data.version ?? 1);
        rowExistsRef.current = true;
      } else {
        versionRef.current = 1;
        rowExistsRef.current = false;
      }
      setLoading(false);
    })();

    return () => { active = false; };
  }, [viagemId, userId]);

  // Merge naive: concat + dedupe por ts. Mantém a ordem cronológica.
  // Usado quando há conflito de version — fundimos histórico server com
  // mensagens não-persistidas locais.
  const mergeMessages = useCallback((serverMsgs, localMsgs) => {
    const seen = new Set();
    const out = [];
    for (const m of [...(serverMsgs || []), ...(localMsgs || [])]) {
      const key = m?.ts ?? JSON.stringify(m);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    return out.slice(-200);
  }, []);

  const persist = useCallback(async (next) => {
    if (!viagemId || !userId) return;
    const safe = Array.isArray(next) ? next.slice(-200) : [];

    // PRIMEIRA persist (row não existe): INSERT com version=1.
    if (!rowExistsRef.current) {
      const { error } = await supabase
        .from("ia_conversas")
        .insert({
          viagem_id: viagemId,
          user_id: userId,
          messages: safe,
          version: 1,
        });
      if (error) {
        // Race entre 2 abas com row inexistente: a 2a tenta INSERT, bate
        // unique violation (PK viagem_id+user_id). Recupera caindo pro
        // path UPDATE — recarrega version do server e tenta de novo.
        if (/duplicate key|unique constraint|23505/i.test(error.message ?? "")) {
          rowExistsRef.current = true;
          // Continua pro path UPDATE abaixo.
        } else {
          console.error("[useIaConversa] insert erro:", error);
          setError(friendlyError(error));
          return;
        }
      } else {
        rowExistsRef.current = true;
        versionRef.current = 1;
        return;
      }
    }

    // UPDATE com OCC.
    const tryUpdate = async (currentVersion, payload) => {
      const { data, error } = await supabase
        .from("ia_conversas")
        .update({
          messages: payload,
          version: currentVersion + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("viagem_id", viagemId)
        .eq("user_id", userId)
        .eq("version", currentVersion)
        .select("version")
        .maybeSingle();
      return { data, error };
    };

    let result = await tryUpdate(versionRef.current, safe);
    if (result.error) {
      console.error("[useIaConversa] persist erro:", result.error);
      setError(friendlyError(result.error));
      return;
    }
    if (result.data) {
      // sucesso — atualiza version local
      versionRef.current = Number(result.data.version);
      return;
    }

    // affected_rows = 0 → outra aba bumpou version. Re-fetch + merge + 1 retry.
    console.warn("[useIaConversa] version conflict — recarregando + retry");
    const { data: latest, error: refetchErr } = await supabase
      .from("ia_conversas")
      .select("messages, version")
      .eq("viagem_id", viagemId)
      .eq("user_id", userId)
      .maybeSingle();
    if (refetchErr || !latest) {
      console.error("[useIaConversa] refetch falhou no retry:", refetchErr);
      setError(friendlyError(refetchErr ?? new Error("Conflito de sync")));
      return;
    }
    const merged = mergeMessages(latest.messages, safe);
    setMessages(merged);
    versionRef.current = Number(latest.version);
    // Retry único com version atualizada.
    result = await tryUpdate(versionRef.current, merged);
    if (result.error) {
      console.error("[useIaConversa] retry erro:", result.error);
      setError(friendlyError(result.error));
      return;
    }
    if (result.data) {
      versionRef.current = Number(result.data.version);
      return;
    }
    // Segundo conflict — give up. Geralmente só acontece se 3+ abas
    // estão ativas escrevendo em paralelo (cenário raríssimo).
    console.warn("[useIaConversa] segundo conflict — abandonando persist");
    setError("Outra aba está editando essa conversa. Recarregue a página.");
  }, [viagemId, userId, mergeMessages]);

  const reset = useCallback(async () => {
    setMessages([]);
    if (!viagemId || !userId) return;
    await supabase.from("ia_conversas").delete().eq("viagem_id", viagemId).eq("user_id", userId);
    // Após delete, próxima persist precisa fazer INSERT de novo.
    rowExistsRef.current = false;
    versionRef.current = 1;
  }, [viagemId, userId]);

  return { messages, setMessages, persist, reset, loading, error };
}
