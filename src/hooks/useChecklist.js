import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errorMessages";

export function useChecklist(viagemId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!viagemId) return;
    let active = true;

    const load = async () => {
      const { data, error } = await supabase
        .from("checklist")
        .select("*")
        .eq("viagem_id", viagemId)
        .order("ordem", { ascending: true });
      if (!active) return;
      if (error) {
        console.error("[useChecklist] load erro:", error);
        setError(friendlyError(error));
      } else {
        setItems(data ?? []);
      }
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`checklist-${viagemId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "checklist", filter: `viagem_id=eq.${viagemId}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setItems((prev) => prev.map((i) => (i.id === payload.new.id ? payload.new : i)));
          } else if (payload.eventType === "INSERT") {
            setItems((prev) => [...prev, payload.new].sort((a, b) => a.ordem - b.ordem));
          } else if (payload.eventType === "DELETE") {
            setItems((prev) => prev.filter((i) => i.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [viagemId]);

  const toggle = useCallback(async (item, user) => {
    if (!user) return;
    const next = !item.concluido;
    if (next && typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(50); } catch {}
    }
    const updates = {
      concluido: next,
      concluido_por: next ? user.id : null,
      concluido_at: next ? new Date().toISOString() : null,
    };
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...updates, _by_nome: next ? user.nome : null } : i)));
    const { error } = await supabase.from("checklist").update(updates).eq("id", item.id);
    if (error) {
      console.error("[useChecklist] toggle erro:", error);
      setError(friendlyError(error));
    }
  }, []);

  const addItem = useCallback(async ({ titulo, categoria, prazo, responsavel_id }) => {
    if (!viagemId) return;
    const ordem = items.length ? Math.max(...items.map((i) => i.ordem)) + 1 : 0;
    const { data, error } = await supabase
      .from("checklist")
      .insert({
        viagem_id: viagemId,
        titulo: titulo.trim(),
        categoria: categoria || null,
        prazo: prazo || null,
        responsavel_id: responsavel_id || null,
        ordem,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }, [viagemId, items]);

  const deleteItem = useCallback(async (id) => {
    const { error } = await supabase.from("checklist").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }, []);

  return { items, loading, error, toggle, addItem, deleteItem };
}
