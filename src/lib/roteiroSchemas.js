// Schemas Zod pras tags <roteiro_update> e <viagem_update> emitidas pelo Jei.
// Quando o LLM erra o JSON (string em vez de int, campo errado, action
// desconhecida), antes a gente mandava direto pro Supabase e tomava erro
// de constraint que o usuário não entendia. Agora valida antes — falha
// vira `success:false` no result com motivo claro.
//
// Zod é o motor da validação. Coerções acontecem aqui (string "1" → 1).
// As fns retornam { ok, value, error } — caller decide o que fazer.

import { z } from "zod";

// ─────────────── roteiro_update ───────────────

const DiaNumero = z.coerce.number().int().min(1).max(60);
const Ordem = z.coerce.number().int().min(0).max(100);
const Tipo = z.enum(["transporte", "passeio", "alimentacao", "hospedagem", "livre"]).catch("passeio");
const Status = z.enum(["confirmado", "aberto", "pendente"]).catch("confirmado");
const NullableStr = z.union([z.string().trim().min(1), z.null(), z.undefined()]).transform((v) => v || null);

const AtividadeInline = z.object({
  horario: NullableStr.optional(),
  titulo: z.string().trim().min(1, "Atividade sem título"),
  descricao: NullableStr.optional(),
  tipo: Tipo.optional(),
  preco: NullableStr.optional(),
  status: Status.optional(),
  endereco: NullableStr.optional(),
  telefone: NullableStr.optional(),
  maps_url: NullableStr.optional(),
  ordem: Ordem.optional(),
}).passthrough();

const AddDay = z.object({
  action: z.literal("add_day"),
  dia_numero: DiaNumero,
  data: NullableStr.optional(),
  weekday: NullableStr.optional(),
  titulo: NullableStr.optional(),
  cidade: NullableStr.optional(),
  hotel: NullableStr.optional(),
  hotel_telefone: NullableStr.optional(),
  hotel_endereco: NullableStr.optional(),
  alerta: NullableStr.optional(),
  cover_emoji: NullableStr.optional(),
}).passthrough();

const AddActivity = z.object({
  action: z.literal("add_activity"),
  dia_numero: DiaNumero,
  horario: NullableStr.optional(),
  titulo: z.string().trim().min(1, "Atividade sem título"),
  descricao: NullableStr.optional(),
  tipo: Tipo.optional(),
  preco: NullableStr.optional(),
  status: Status.optional(),
  endereco: NullableStr.optional(),
  telefone: NullableStr.optional(),
  maps_url: NullableStr.optional(),
  ordem: Ordem.optional(),
}).passthrough();

const UpdateDay = z.object({
  action: z.literal("update_day"),
  dia_numero: DiaNumero,
  field: z.string().min(1),
  value: z.any(),
}).passthrough();

const UpdateActivity = z.object({
  action: z.literal("update_activity"),
  dia_numero: DiaNumero,
  ordem: Ordem,
  field: z.string().min(1),
  value: z.any(),
}).passthrough();

const RemoveActivity = z.object({
  action: z.literal("remove_activity"),
  dia_numero: DiaNumero,
  ordem: Ordem,
}).passthrough();

const RemoveDay = z.object({
  action: z.literal("remove_day"),
  dia_numero: DiaNumero,
}).passthrough();

const ReplaceDay = z.object({
  action: z.literal("replace_day"),
  dia_numero: DiaNumero,
  data: NullableStr.optional(),
  weekday: NullableStr.optional(),
  titulo: NullableStr.optional(),
  cidade: NullableStr.optional(),
  hotel: NullableStr.optional(),
  hotel_telefone: NullableStr.optional(),
  hotel_endereco: NullableStr.optional(),
  alerta: NullableStr.optional(),
  cover_emoji: NullableStr.optional(),
  atividades: z.array(AtividadeInline).default([]),
}).passthrough();

export const RoteiroUpdate = z.discriminatedUnion("action", [
  AddDay, AddActivity, UpdateDay, UpdateActivity, RemoveActivity, RemoveDay, ReplaceDay,
]);

// Valida um único update. Retorna { ok, value, error } sem throw.
export function validateRoteiroUpdate(raw) {
  const res = RoteiroUpdate.safeParse(raw);
  if (res.success) return { ok: true, value: res.data };
  const issue = res.error?.issues?.[0];
  const where = issue?.path?.join(".") || "(?)";
  const msg = issue?.message || "JSON inválido";
  return { ok: false, error: `${where}: ${msg}`, action: raw?.action };
}

// ─────────────── viagem_update ───────────────

const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve ser YYYY-MM-DD");

const ViagemFields = z.object({
  adultos: z.coerce.number().int().min(0).max(50).optional(),
  criancas: z.coerce.number().int().min(0).max(30).optional(),
  bebes: z.coerce.number().int().min(0).max(20).optional(),
  num_pessoas: z.union([z.coerce.number().int().min(1).max(100), z.null()]).optional(),
  data_inicio: z.union([ISODate, z.null()]).optional(),
  data_fim: z.union([ISODate, z.null()]).optional(),
  cidades: z.array(z.string().trim().min(1)).max(30).optional(),
  descricao: z.string().trim().max(2000).optional(),
}).passthrough();

export const ViagemUpdate = z.object({
  action: z.literal("update_viagem"),
  fields: ViagemFields,
}).passthrough();

export function validateViagemUpdate(raw) {
  const res = ViagemUpdate.safeParse(raw);
  if (res.success) return { ok: true, value: res.data };
  const issue = res.error?.issues?.[0];
  const where = issue?.path?.join(".") || "(?)";
  const msg = issue?.message || "JSON inválido";
  return { ok: false, error: `${where}: ${msg}` };
}
