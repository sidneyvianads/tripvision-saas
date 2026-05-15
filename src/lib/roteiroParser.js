import { supabase } from "./supabase";

const ROTEIRO_TAG_RE = /<roteiro_update>([\s\S]*?)<\/roteiro_update>/i;
const VIAGEM_TAG_RE  = /<viagem_update>([\s\S]*?)<\/viagem_update>/i;

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

// Extrai <viagem_update> da resposta do Jei e retorna { cleanText, viagemUpdate, raw }.
// O JSON dentro tem formato { "action": "update_viagem", "fields": { ... } }.
// Retornamos só `fields` em viagemUpdate.fields pra simplificar o consumo.
export function parseViagemUpdate(text) {
  if (typeof text !== "string") return { cleanText: "", viagemUpdate: null, raw: null };
  const match = text.match(VIAGEM_TAG_RE);
  if (!match) return { cleanText: text, viagemUpdate: null, raw: null };

  const cleanText = text.replace(VIAGEM_TAG_RE, "").trim();
  const raw = match[1].trim();

  try {
    const parsed = JSON.parse(raw);
    const action = parsed?.action ?? "update_viagem";
    const fields = (action === "update_viagem" && parsed?.fields && typeof parsed.fields === "object")
      ? parsed.fields
      : null;
    if (!fields) {
      console.warn("[roteiroParser] <viagem_update> sem fields válidos:", raw.slice(0, 200));
      return { cleanText, viagemUpdate: null, raw };
    }
    return { cleanText, viagemUpdate: { action, fields }, raw };
  } catch (e) {
    console.error("[roteiroParser] JSON inválido em <viagem_update>:", e, raw.slice(0, 200));
    return { cleanText, viagemUpdate: null, raw };
  }
}

// Sanitiza e aplica UPDATE em viagens. Só aceita campos conhecidos.
// Retorna { ok, patch, error } — patch é o objeto efetivamente aplicado (já
// normalizado, pra mostrar na confirmação).
const VIAGEM_ALLOWED = new Set([
  "adultos", "criancas", "bebes", "num_pessoas",
  "data_inicio", "data_fim",
  "cidades", "descricao",
]);

function clampInt(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function isISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function sanitizeViagemPatch(fields) {
  const patch = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (!VIAGEM_ALLOWED.has(k)) continue;
    if (v === null) { patch[k] = null; continue; }

    if (k === "adultos") {
      const n = clampInt(v, 0, 50);
      if (n != null) patch[k] = n;
    } else if (k === "criancas") {
      const n = clampInt(v, 0, 30);
      if (n != null) patch[k] = n;
    } else if (k === "bebes") {
      const n = clampInt(v, 0, 20);
      if (n != null) patch[k] = n;
    } else if (k === "num_pessoas") {
      const n = clampInt(v, 1, 100);
      if (n != null) patch[k] = n;
    } else if (k === "data_inicio" || k === "data_fim") {
      if (isISODate(v)) patch[k] = v;
    } else if (k === "cidades") {
      if (Array.isArray(v)) {
        patch[k] = v.map((c) => String(c).trim()).filter(Boolean).slice(0, 20);
      }
    } else if (k === "descricao") {
      if (typeof v === "string") patch[k] = v.trim().slice(0, 1000);
    }
  }
  // Coerência: se mudou adultos/criancas/bebes mas não num_pessoas, recalcula
  if (patch.adultos != null || patch.criancas != null || patch.bebes != null) {
    if (patch.num_pessoas == null) {
      // não temos os valores antigos aqui — caller pode resolver depois
    }
  }
  return patch;
}

// Aplica o update de viagem. Recebe o objeto vindo de parseViagemUpdate
// + a viagem atual (pra resolver num_pessoas como soma quando ausente).
export async function applyViagemUpdate(viagemId, viagemUpdate, currentTrip = null) {
  if (!viagemUpdate?.fields) return { ok: false, error: "Update sem fields." };
  const patch = sanitizeViagemPatch(viagemUpdate.fields);
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nenhum campo válido pra atualizar." };

  // Recalcula num_pessoas como soma quando o user mexeu no breakdown e não
  // passou o total explicitamente.
  const touchedBreakdown = ["adultos", "criancas", "bebes"].some((k) => k in patch);
  if (touchedBreakdown && patch.num_pessoas == null && currentTrip) {
    const ad = patch.adultos ?? currentTrip.adultos ?? 0;
    const cr = patch.criancas ?? currentTrip.criancas ?? 0;
    const be = patch.bebes ?? currentTrip.bebes ?? 0;
    const total = ad + cr + be;
    if (total > 0) patch.num_pessoas = total;
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("viagens")
    .update(patch)
    .eq("id", viagemId)
    .select()
    .single();
  if (error) {
    console.error("[applyViagemUpdate] erro:", error);
    return { ok: false, error: error.message, patch };
  }
  return { ok: true, patch, trip: data };
}

// Resume um patch em texto humano pra exibir no card de confirmação.
export function summarizeViagemPatch(patch) {
  if (!patch) return "";
  const parts = [];
  if (patch.adultos != null) parts.push(`${patch.adultos} ${patch.adultos === 1 ? "adulto" : "adultos"}`);
  if (patch.criancas != null) parts.push(`${patch.criancas} ${patch.criancas === 1 ? "criança" : "crianças"}`);
  if (patch.bebes != null) parts.push(`${patch.bebes} ${patch.bebes === 1 ? "bebê" : "bebês"}`);
  if (patch.num_pessoas != null && !patch.adultos && !patch.criancas && !patch.bebes) {
    parts.push(`${patch.num_pessoas} pessoas`);
  }
  if (patch.data_inicio) parts.push(`início ${patch.data_inicio}`);
  if (patch.data_fim) parts.push(`fim ${patch.data_fim}`);
  if (patch.cidades) parts.push(`cidades: ${patch.cidades.join(", ")}`);
  if (patch.descricao) parts.push("descrição atualizada");
  return parts.join(" · ");
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

// Garante que o dia exista. Se não existir, cria com defaults mínimos.
// Retorna { diaId, created } — created=true se foi criado agora.
async function ensureDia(viagemId, dia_numero, defaults = {}) {
  let id = await getDiaId(viagemId, dia_numero);
  if (id) return { diaId: id, created: false };

  const payload = {
    viagem_id: viagemId,
    dia_numero: Number(dia_numero),
    titulo: defaults.titulo ?? `Dia ${dia_numero}`,
    cover_emoji: defaults.cover_emoji ?? "📍",
    data: defaults.data ?? null,
    cidade: defaults.cidade ?? null,
    hotel: defaults.hotel ?? null,
  };
  const { data, error } = await supabase
    .from("roteiro_dias")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    console.error("[roteiroParser] ensureDia create error:", error);
    return { diaId: null, created: false };
  }
  console.log(`[Viajjei] auto-criou Dia ${dia_numero} (id ${data.id})`);
  return { diaId: data.id, created: true };
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
          // Pra suportar undo: só consideramos "criado" se NÃO existia antes.
          // Upsert + select retorna sempre o id, mas só guardamos pra undo se created.
          const existedBefore = await getDiaId(viagemId, Number(u.dia_numero));
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
          const { data: row, error } = await supabase
            .from("roteiro_dias")
            .upsert(payload, { onConflict: "viagem_id,dia_numero" })
            .select("id")
            .single();
          results.push({
            action: "add_day",
            dia_numero: payload.dia_numero,
            titulo: payload.titulo,
            success: !error,
            error: error?.message,
            created_id: !existedBefore && row?.id ? row.id : null,
          });
          break;
        }

        case "add_activity": {
          // Auto-cria o dia se a IA mandou add_activity sem add_day antes.
          const ensured = await ensureDia(viagemId, Number(u.dia_numero));
          const diaId = ensured.diaId;
          if (!diaId) {
            results.push({ action: "add_activity", dia_numero: u.dia_numero, success: false, error: "Não consegui criar/encontrar o dia." });
            break;
          }
          if (ensured.created) {
            results.push({ action: "add_day", dia_numero: Number(u.dia_numero), titulo: `Dia ${u.dia_numero}`, success: true, _auto: true });
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
          const { data: actRow, error } = await supabase
            .from("roteiro_atividades")
            .insert(payload)
            .select("id")
            .single();
          results.push({
            action: "add_activity",
            dia_numero: Number(u.dia_numero),
            horario: payload.horario,
            titulo: payload.titulo,
            tipo: payload.tipo,
            success: !error,
            error: error?.message,
            created_id: actRow?.id ?? null,
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
            results.push({ action: "update_activity", dia_numero: Number(u.dia_numero), success: false, error: "Dia não encontrado." });
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

        case "replace_day": {
          // Sobrescreve um dia inteiro de uma vez: o dia + array de atividades.
          // Se o dia já existe, apaga atividades antigas (cascade do delete do
          // dia) e recria. Útil pra LLMs que preferem mandar 1 update por dia
          // em vez de N tags (add_day + add_activity × N).
          const dn = Number(u.dia_numero);
          const existingDiaId = await getDiaId(viagemId, dn);
          if (existingDiaId) {
            await supabase.from("roteiro_dias").delete().eq("id", existingDiaId);
          }
          const dayPayload = {
            viagem_id: viagemId,
            dia_numero: dn,
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
          const { data: dayRow, error: dayErr } = await supabase
            .from("roteiro_dias")
            .insert(dayPayload)
            .select("id")
            .single();
          if (dayErr || !dayRow) {
            results.push({ action: "replace_day", dia_numero: dn, success: false, error: dayErr?.message ?? "Não consegui criar o dia." });
            break;
          }
          results.push({
            action: "replace_day",
            dia_numero: dn,
            titulo: dayPayload.titulo,
            success: true,
            // Só marca created_id se o dia NÃO existia antes (pra undo).
            created_id: existingDiaId ? null : dayRow.id,
          });
          // Atividades embedded
          const atividades = Array.isArray(u.atividades) ? u.atividades : [];
          for (let i = 0; i < atividades.length; i++) {
            const a = atividades[i];
            const titulo = (a?.titulo ?? "").trim();
            if (!titulo) {
              results.push({ action: "add_activity", dia_numero: dn, success: false, error: "Atividade sem título." });
              continue;
            }
            const actPayload = {
              dia_id: dayRow.id,
              horario: a.horario ?? null,
              titulo,
              descricao: a.descricao ?? null,
              tipo: safeTipo(a.tipo),
              preco: a.preco ?? null,
              status: safeStatus(a.status),
              endereco: a.endereco ?? null,
              telefone: a.telefone ?? null,
              maps_url: a.maps_url ?? null,
              ordem: a.ordem != null ? Number(a.ordem) : (i + 1),
            };
            const { data: actRow, error: actErr } = await supabase
              .from("roteiro_atividades")
              .insert(actPayload)
              .select("id")
              .single();
            results.push({
              action: "add_activity",
              dia_numero: dn,
              titulo: actPayload.titulo,
              success: !actErr,
              error: actErr?.message,
              created_id: actRow?.id ?? null,
            });
          }
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

// Desfaz inserções de um applyRoteiroUpdates anterior.
// Só remove o que FOI inserido (created_id presente). Update/remove não tem undo.
export async function undoRoteiroUpdates(results) {
  if (!Array.isArray(results)) return { activities: 0, days: 0, errors: [] };
  const actIds = results.filter((r) => r.action === "add_activity" && r.created_id).map((r) => r.created_id);
  const dayIds = results.filter((r) => r.action === "add_day" && r.created_id).map((r) => r.created_id);
  const errors = [];

  // Apaga atividades primeiro (pra evitar cascade do dia)
  if (actIds.length) {
    const { error } = await supabase.from("roteiro_atividades").delete().in("id", actIds);
    if (error) errors.push(error.message);
  }
  if (dayIds.length) {
    const { error } = await supabase.from("roteiro_dias").delete().in("id", dayIds);
    if (error) errors.push(error.message);
  }
  return { activities: actIds.length, days: dayIds.length, errors };
}

export function summarizeUpdates(results) {
  const added = results.filter((r) => r.action === "add_activity" && r.success);
  const days = results.filter((r) => r.action === "add_day" && r.success);
  const updated = results.filter((r) => /^update_/.test(r.action) && r.success);
  const removed = results.filter((r) => /^remove_/.test(r.action) && r.success);
  const errors = results.filter((r) => !r.success);
  return { added, days, updated, removed, errors };
}
