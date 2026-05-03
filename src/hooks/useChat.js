import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useUnreadCount(viagemId, userId) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!viagemId || !userId) return;
    let active = true;

    const fetchCount = async () => {
      const { data: m } = await supabase
        .from("viagem_membros")
        .select("last_seen_chat")
        .eq("viagem_id", viagemId)
        .eq("user_id", userId)
        .maybeSingle();
      const lastSeen = m?.last_seen_chat;
      let q = supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("viagem_id", viagemId)
        .neq("user_id", userId);
      if (lastSeen) q = q.gt("created_at", lastSeen);
      const { count: c } = await q;
      if (active) setCount(c ?? 0);
    };

    fetchCount();

    const channel = supabase
      .channel(`unread-${viagemId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `viagem_id=eq.${viagemId}` },
        (p) => {
          if (p.new.user_id !== userId) setCount((n) => n + 1);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [viagemId, userId]);

  const markSeen = useCallback(async () => {
    if (!viagemId || !userId) return;
    setCount(0);
    await supabase
      .from("viagem_membros")
      .update({ last_seen_chat: new Date().toISOString() })
      .eq("viagem_id", viagemId)
      .eq("user_id", userId);
  }, [viagemId, userId]);

  return { count, markSeen };
}

export function useChat(viagemId) {
  const [messages, setMessages] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  // reactions: { [message_id]: [{id, user_id, emoji}, ...] }
  const [reactionsByMsg, setReactionsByMsg] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!viagemId) return;
    let active = true;

    async function loadInitial() {
      const { data, error } = await supabase
        .from("messages")
        .select("id, viagem_id, user_id, content, created_at, reply_to, is_system")
        .eq("viagem_id", viagemId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!active) return;
      if (error) setError(error.message);
      else setMessages([...(data ?? [])].reverse());
      setLoading(false);

      // Load reactions for these messages
      const ids = (data ?? []).map((m) => m.id);
      if (ids.length) {
        const { data: rx } = await supabase
          .from("reactions")
          .select("id, message_id, user_id, emoji")
          .in("message_id", ids);
        if (active && rx) {
          const grouped = {};
          for (const r of rx) {
            (grouped[r.message_id] = grouped[r.message_id] || []).push(r);
          }
          setReactionsByMsg(grouped);
        }
      }
    }
    loadInitial();

    const msgChannel = supabase
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

    const rxChannel = supabase
      .channel(`reactions-${viagemId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions" },
        (payload) => {
          const r = payload.new;
          setReactionsByMsg((prev) => {
            const arr = prev[r.message_id] ?? [];
            if (arr.some((x) => x.id === r.id)) return prev;
            return { ...prev, [r.message_id]: [...arr, r] };
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "reactions" },
        (payload) => {
          const old = payload.old;
          if (!old?.id) return;
          setReactionsByMsg((prev) => {
            const next = { ...prev };
            for (const mid of Object.keys(next)) {
              const filtered = next[mid].filter((r) => r.id !== old.id);
              if (filtered.length !== next[mid].length) next[mid] = filtered;
            }
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(rxChannel);
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

  const sendMessage = useCallback(async (content, userId, replyTo = null) => {
    if (!content?.trim() || !userId || !viagemId) return;
    const payload = { viagem_id: viagemId, user_id: userId, content: content.trim() };
    if (replyTo) payload.reply_to = replyTo;
    const { error } = await supabase.from("messages").insert(payload);
    if (error) setError(error.message);
  }, [viagemId]);

  const toggleReaction = useCallback(async (messageId, userId, emoji) => {
    if (!messageId || !userId || !emoji) return;
    const arr = reactionsByMsg[messageId] ?? [];
    const existing = arr.find((r) => r.user_id === userId && r.emoji === emoji);
    if (existing) {
      // optimistic remove
      setReactionsByMsg((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).filter((r) => r.id !== existing.id),
      }));
      const { error } = await supabase.from("reactions").delete().eq("id", existing.id);
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase
        .from("reactions")
        .insert({ message_id: messageId, user_id: userId, emoji })
        .select("id, message_id, user_id, emoji")
        .single();
      if (error) { setError(error.message); return; }
      if (data) {
        setReactionsByMsg((prev) => {
          const arr2 = prev[messageId] ?? [];
          if (arr2.some((r) => r.id === data.id)) return prev;
          return { ...prev, [messageId]: [...arr2, data] };
        });
      }
    }
  }, [reactionsByMsg]);

  return { messages, profilesById, reactionsByMsg, loading, error, sendMessage, toggleReaction };
}
