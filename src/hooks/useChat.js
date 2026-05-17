import { useCallback, useEffect, useRef, useState } from "react";
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

  // R12-1: refs pra ler messages e bufferar reactions órfãs.
  // - messagesRef: leitura síncrona no callback do realtime SEM setter aninhado
  //   (R11-2 introduziu setMessages(prev => { setReactionsByMsg(); return prev; })
  //   que dobra em StrictMode dev).
  // - pendingReactionsRef: buffer pra reactions que chegam ANTES do INSERT do
  //   message correspondente (postgres realtime não garante ordem entre
  //   tabelas). Quando o message chega, drenamos as órfãs pra ele.
  const messagesRef = useRef([]);
  const pendingReactionsRef = useRef([]);

  // Mantém messagesRef em sync com state. Effect sem deps roda a cada
  // render — pattern canônico pra refs de leitura síncrona.
  useEffect(() => {
    messagesRef.current = messages;
  });

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

    // R11-2 + R12-1: 1 channel consolidado, leitura via refs (sem setter aninhado).
    //
    // R12-1: postgres realtime NÃO garante ordem de INSERT entre tabelas.
    // Reaction pode chegar ANTES do message correspondente. Pré-R12, reaction
    // era descartada silenciosamente (filtro `prevMsgs.some`). Agora: se a
    // msg ainda não está no state, bufferamos em pendingReactionsRef e
    // drenamos quando o INSERT da msg chegar.
    const chatChannel = supabase
      .channel(`chat-${viagemId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `viagem_id=eq.${viagemId}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          // Drena buffer de reactions órfãs cuja msg acabou de chegar.
          const orphans = pendingReactionsRef.current.filter(
            (r) => r.message_id === payload.new.id
          );
          if (orphans.length) {
            pendingReactionsRef.current = pendingReactionsRef.current.filter(
              (r) => r.message_id !== payload.new.id
            );
            setReactionsByMsg((prev) => {
              const arr = prev[payload.new.id] ?? [];
              const merged = [...arr];
              for (const r of orphans) {
                if (!merged.some((x) => x.id === r.id)) merged.push(r);
              }
              return { ...prev, [payload.new.id]: merged };
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions" },
        (payload) => {
          const r = payload.new;
          // Lê messages via ref (sync, sem setter aninhado anti-pattern).
          const isOurMsg = messagesRef.current.some((m) => m.id === r.message_id);
          if (!isOurMsg) {
            // Reaction órfã: msg pode ainda não ter chegado OU é de viagem alheia.
            // Bufferamos COM cap pra evitar leak ilimitado. RLS já filtra
            // payload de outras viagens no servidor, então normalmente o
            // buffer só pega o caso "msg chega depois" (race real-time).
            if (pendingReactionsRef.current.length < 100) {
              pendingReactionsRef.current.push(r);
            }
            return;
          }
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
          // Limpa também do buffer de órfãs (se ainda não foi aplicada).
          pendingReactionsRef.current = pendingReactionsRef.current.filter(
            (r) => r.id !== old.id
          );
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
      supabase.removeChannel(chatChannel);
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
