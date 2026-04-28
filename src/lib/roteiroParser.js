import { supabase } from "./supabase";

const ROTEIRO_TAG_RE = /<roteiro_update>([\s\S]*?)<\/roteiro_update>/i;

export function parseRoteiroUpdate(text) {
  if (typeof text !== "string") return { cleanText: "", updates: null, raw: null };
  const match = text.match(ROTEIRO_TAG_RE);
  if (!match) return { cleanText: text, updates: null, raw: null };

  const cleanText = text.replace(ROTEIRO_TAG_RE, "").trim();
  const raw = match[1].trim();

  let updates = null;
  try {
    const parsed = JSON.parse(raw);
    updates = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.updates) ? parsed.updates : null);
  } catch (e) {
    console.error("[roteiroParser] JSON inválido em <roteiro_update>:", e, raw.slice(0, 200));
    return { cleanText, updates: null, raw };
  }

  return { cleanText, updates, raw };
}

const VALID_TIPOS = new Set(["transporte", "passeio", "alimentacao", "hospedagem", "livre"]);
const VALID_STATUS = new Set(["confirmado", "aberto", "pendente"]);

function safeTipo(t) { return VALID_TIPOS.has(t) ? t : "passeio"; }
function safeStatus(s) { return VALID_STATUS.has(s) ? s : "confirmado"; }

async function getDiaId(viagemId, dia_numero) {
  const { data, error } = await supabase
    .from("roteiro_dias")
    .select("id")
    .eq("viagem_id", viagemId)
    .eq("dia_numero", dia_numero)
    .maybeSingle();
  if (error) {
    console.error("[roteiroParser] getDiaId error:", error);
    return null;
  }
  return data?.id ?? null;
}

async function nextOrdem(diaId) {
  const { data } = await supabase
    .from("roteiro_atividades")
    .select("ordem")
    .eq("dia_id", diaId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.ordem ?? -1) + 1;
}

const ALLOWED_DIA_FIELDS = new Set([
  "data", "weekday", "titulo", "cidade", "hotel",
  "hotel_telefone", "hotel_endereco", "alerta", "cover_emoji",
]);
const ALLOWED_ATIVIDADE_FIELDS = new Set([
  "horario", "titulo", "descricao", "tipo", "preco",
  "status", "endereco", "telefone", "maps_url", "ordem",
]);

export async function applyRoteiroUpdates(viagemId, updates) {
  if (!viagemId || !Array.isArray(updates) || updates.length === 0) return [];
  const results = [];

  for (const u of updates) {
    try {
      switch (u.action) {
        case "add_day": {
          const payload = {
            viagem_id: viagemId,
            dia_numero: Number(u.dia_numero),
            data: u.data ?? null,
            weekday: u.weekday ?? null,
            titulo: u.titulo ?? null,
            cidade: u.cidade ?? null,
            hotel: u.hotel ?? null,
            hotel_telefone: u.hotel_telefone ?? null,
            hotel_endereco: u.hotel_endereco ?? null,
            alerta: u.alerta ?? null,
            cover_emoji: u.cover_emoji ?? "📍",
          };
          const { error } = await supabase
            .from("roteiro_dias")
            .upsert(payload, { onConflict: "viagem_id,dia_numero" });
          results.push({ action: "add_day", dia_numero: payload.dia_numero, titulo: payload.titulo, success: !error, error: error?.message });
          break;
        }

        case "add_activity": {
          const diaId = await getDiaId(viagemId, Number(u.dia_numero));
          if (!diaId) {
            results.push({ action: "add_activity", dia_numero: u.dia_numero, success: false, error: "Dia não encontrado." });
            break;
          }
          const ordem = u.ordem != null ? Number(u.ordem) : await nextOrdem(diaId);
          const payload = {
            dia_id: diaId,
            horario: u.horario ?? null,
            titulo: (u.titulo ?? "").trim(),
            descricao: u.descricao ?? null,
            tipo: safeTipo(u.tipo),
            preco: u.preco ?? null,
            status: safeStatus(u.status),
            endereco: u.endereco ?? null,
            telefone: u.telefone ?? null,
            maps_url: u.maps_url ?? null,
            ordem,
          };
          if (!payload.titulo) {
            results.push({ action: "add_activity", success: false, error: "Atividade sem título." });
            break;
          }
          const { error } = await supabase.from("roteiro_atividades").insert(payload);
          results.push({
            action: "add_activity",
            dia_numero: Number(u.dia_numero),
            horario: payload.horario,
            titulo: payload.titulo,
            tipo: payload.tipo,
            success: !error,
            error: error?.message,
          });
          break;
        }

        case "update_day": {
          const field = u.field;
          if (!ALLOWED_DIA_FIELDS.has(field)) {
            results.push({ action: "update_day", success: false, error: `Campo inválido: ${field}` });
            break;
          }
          const { error } = await supabase
            .from("roteiro_dias")
            .update({ [field]: u.value ?? null })
            .eq("viagem_id", viagemId)
            .eq("dia_numero", Number(u.dia_numero));
          results.push({ action: "update_day", dia_numero: Number(u.dia_numero), field, success: !error, error: error?.message });
          break;
        }

        case "update_activity": {
          const field = u.field;
          if (!ALLOWED_ATIVIDADE_FIELDS.has(field)) {
            results.push({ action: "update_activity", success: false, error: `Campo inválido: ${field}` });
            break;
          }
          const diaId = await getDiaId(viagemId, Number(u.dia_numero));
          if (!diaId) {
            results.push({ action: "update_activity", success: false, error: "Dia não encontrado." });
            break;
          }
          const { error } = await supabase
            .from("roteiro_atividades")
            .update({ [field]: field === "tipo" ? safeTipo(u.value) : field === "status" ? safeStatus(u.value) : u.value })
            .eq("dia_id", diaId)
            .eq("ordem", Number(u.ordem));
          results.push({ action: "update_activity", dia_numero: Number(u.dia_numero), ordem: Number(u.ordem), field, success: !error, error: error?.message });
          break;
        }

        case "remove_activity": {
          const diaId = await getDiaId(viagemId, Number(u.dia_numero));
          if (!diaId) {
            results.push({ action: "remove_activity", success: false, error: "Dia não encontrado." });
            break;
          }
          const { error } = await supabase
            .from("roteiro_atividades")
            .delete()
            .eq("dia_id", diaId)
            .eq("ordem", Number(u.ordem));
          results.push({ action: "remove_activity", dia_numero: Number(u.dia_numero), ordem: Number(u.ordem), success: !error, error: error?.message });
          break;
        }

        case "remove_day": {
          const { error } = await supabase
            .from("roteiro_dias")
            .delete()
            .eq("viagem_id", viagemId)
            .eq("dia_numero", Number(u.dia_numero));
          results.push({ action: "remove_day", dia_numero: Number(u.dia_numero), success: !error, error: error?.message });
          break;
        }

        default:
          results.push({ action: u.action, success: false, error: "Action desconhecida." });
      }
    } catch (err) {
      console.error("[roteiroParser] apply error:", err, u);
      results.push({ action: u.action, success: false, error: err.message });
    }
  }

  return results;
}

export function summarizeUpdates(results) {
  const added = results.filter((r) => r.action === "add_activity" && r.success);
  const days = results.filter((r) => r.action === "add_day" && r.success);
  const updated = results.filter((r) => /^update_/.test(r.action) && r.success);
  const removed = results.filter((r) => /^remove_/.test(r.action) && r.success);
  const errors = results.filter((r) => !r.success);
  return { added, days, updated, removed, errors };
}
