import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useChat(viagemId) {
  const [messages, setMessages] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!viagemId) return;
    let active = true;

    async function loadInitial() {
      const { data, error } = await supabase
        .from("messages")
        .select("id, viagem_id, user_id, content, created_at")
        .eq("viagem_id", viagemId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!active) return;
      if (error) setError(error.message);
      else setMessages([...(data ?? [])].reverse());
      setLoading(false);
    }
    loadInitial();

    const channel = supabase
      .channel(`messages-${viagemId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `viagem_id=eq.${viagemId}` },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]
          );
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [viagemId]);

  useEffect(() => {
    const missing = Array.from(
      new Set(messages.map((m) => m.user_id).filter((id) => id && !profilesById[id]))
    );
    if (missing.length === 0) return;
    let active = true;
    supabase
      .from("users")
      .select("id, nome, avatar_cor, avatar_url")
      .in("id", missing)
      .then(({ data }) => {
        if (!active || !data) return;
        setProfilesById((prev) => {
          const next = { ...prev };
          for (const p of data) next[p.id] = p;
          return next;
        });
      });
    return () => { active = false; };
  }, [messages, profilesById]);

  const sendMessage = useCallback(async (content, userId) => {
    if (!content?.trim() || !userId || !viagemId) return;
    const { error } = await supabase
      .from("messages")
      .insert({ viagem_id: viagemId, user_id: userId, content: content.trim() });
    if (error) setError(error.message);
  }, [viagemId]);

  return { messages, profilesById, loading, error, sendMessage };
}
