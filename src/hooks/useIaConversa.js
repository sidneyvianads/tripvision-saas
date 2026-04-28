import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Persiste o histórico de planejamento por (viagem, user) na tabela ia_conversas.
// Usa upsert (UNIQUE viagem_id, user_id) pra simplificar.

export function useIaConversa(viagemId, userId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!viagemId || !userId) return;
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("ia_conversas")
        .select("messages")
        .eq("viagem_id", viagemId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!active) return;
      if (error) setError(error.message);
      const arr = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(arr);
      setLoading(false);
    })();

    return () => { active = false; };
  }, [viagemId, userId]);

  const persist = useCallback(async (next) => {
    if (!viagemId || !userId) return;
    const safe = Array.isArray(next) ? next.slice(-200) : [];
    const { error } = await supabase
      .from("ia_conversas")
      .upsert(
        {
          viagem_id: viagemId,
          user_id: userId,
          messages: safe,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "viagem_id,user_id" }
      );
    if (error) setError(error.message);
  }, [viagemId, userId]);

  const reset = useCallback(async () => {
    setMessages([]);
    if (!viagemId || !userId) return;
    await supabase.from("ia_conversas").delete().eq("viagem_id", viagemId).eq("user_id", userId);
  }, [viagemId, userId]);

  return { messages, setMessages, persist, reset, loading, error };
}
