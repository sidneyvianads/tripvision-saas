import { useCallback, useEffect, useState } from "react";
import { supabase, randomSlug } from "../lib/supabase";
import { trackTripCreated } from "../lib/analytics";

const TRIP_COLS = "id, owner_id, nome, slug, data_inicio, data_fim, cidades, num_pessoas, adultos, criancas, bebes, viaje_segura, descricao, cover_emoji, cor_tema, tema, created_at";

export function useTrips(userId) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!userId) {
      setTrips([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: memberships, error: memErr } = await supabase
      .from("viagem_membros")
      .select("viagem_id, role, viagem:viagens(" + TRIP_COLS + ")")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false });
    if (memErr) {
      setError(memErr.message);
      setLoading(false);
      return;
    }
    const list = (memberships ?? [])
      .filter((m) => m.viagem)
      .map((m) => ({ ...m.viagem, role: m.role }));
    setTrips(list);
    setLoading(false);
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  const createTrip = useCallback(async ({
    nome, data_inicio, data_fim, cidades, descricao,
    adultos, criancas, bebes, viaje_segura,
    num_pessoas, // mantido pra retrocompat: se vier sem breakdown, usa esse total
    cover_emoji, cor_tema, tema,
  }) => {
    if (!userId) throw new Error("Não logado.");
    let slug;
    for (let i = 0; i < 5; i++) {
      slug = randomSlug(8);
      const { data: existing } = await supabase.from("viagens").select("id").eq("slug", slug).maybeSingle();
      if (!existing) break;
    }
    const ad = Math.max(0, Number(adultos ?? 0));
    const cr = Math.max(0, Number(criancas ?? 0));
    const be = Math.max(0, Number(bebes ?? 0));
    // num_pessoas é total calculado pra retrocompat com PDF/cards antigos
    const total = ad + cr + be > 0 ? ad + cr + be : (num_pessoas ? Number(num_pessoas) : null);

    const { data, error } = await supabase
      .from("viagens")
      .insert({
        owner_id: userId,
        nome: nome.trim(),
        slug,
        data_inicio: data_inicio || null,
        data_fim: data_fim || null,
        cidades: Array.isArray(cidades) ? cidades.map((c) => c.trim()).filter(Boolean) : [],
        adultos: ad,
        criancas: cr,
        bebes: be,
        viaje_segura: !!viaje_segura,
        num_pessoas: total,
        descricao: descricao?.trim() || null,
        cover_emoji: cover_emoji ?? "🧳",
        cor_tema: cor_tema ?? "#6366F1",
        tema: tema ?? "cidade",
      })
      .select(TRIP_COLS)
      .single();
    if (error) throw new Error(error.message);
    trackTripCreated(data.id, {
      nome: data.nome,
      cidades_count: (data.cidades ?? []).length,
      tem_datas: !!(data.data_inicio && data.data_fim),
      num_pessoas: data.num_pessoas,
      tema: data.tema,
      viaje_segura: data.viaje_segura,
    });
    await reload();
    return data;
  }, [userId, reload]);

  const deleteTrip = useCallback(async (tripId) => {
    if (!userId) throw new Error("Não logado.");
    const { error } = await supabase.from("viagens").delete().eq("id", tripId).eq("owner_id", userId);
    if (error) throw new Error(error.message);
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
  }, [userId]);

  return { trips, loading, error, reload, createTrip, deleteTrip };
}

export function useTrip(slug, userId) {
  const [trip, setTrip] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);

    const { data: t, error: tErr } = await supabase
      .from("viagens")
      .select(TRIP_COLS)
      .eq("slug", slug)
      .maybeSingle();
    if (tErr) {
      setError(tErr.message);
      setLoading(false);
      return;
    }
    if (!t) {
      setError("Viagem não encontrada.");
      setLoading(false);
      return;
    }
    setTrip(t);

    if (userId) {
      const { data: m } = await supabase
        .from("viagem_membros")
        .select("role")
        .eq("viagem_id", t.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (m) {
        setRole(m.role);
      } else {
        const { data: nm } = await supabase
          .from("viagem_membros")
          .insert({ viagem_id: t.id, user_id: userId, role: "membro" })
          .select("role")
          .single();
        setRole(nm?.role ?? "membro");
      }
    } else {
      setRole(null);
    }
    setLoading(false);
  }, [slug, userId]);

  useEffect(() => { reload(); }, [reload]);

  return { trip, role, loading, error, reload, isAdmin: role === "admin" };
}

export async function updateTrip(tripId, patch) {
  const { data, error } = await supabase
    .from("viagens")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", tripId)
    .select(TRIP_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}
