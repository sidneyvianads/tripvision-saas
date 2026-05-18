import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Plus, Loader2, X, Trash2, Image as ImageIcon } from "lucide-react";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errorMessages";
import { useConfirm } from "../lib/useConfirm";
import { uploadDiarioPhotos, deleteDiarioPost } from "../lib/diarioUpload";
import Avatar from "./Avatar";

const MAX_PHOTOS = 5;

// R22-3: fotos viraram URLs do Storage. Helper resolve foto pra src
// independente do formato armazenado:
//   - string "data:image/..."   → Base64 legacy (até script migração rodar)
//   - string "https://..."      → URL pública (formato novo, retro-compat)
//   - { url, legenda? }         → objeto com URL (formato canônico novo)
//   - { base64, legenda? }      → objeto Base64 legacy (raro mas possível)
// Sempre retorna string vazia ou URL/dataURL válida.
function fotoSrc(foto) {
  if (!foto) return "";
  if (typeof foto === "string") return foto;
  return foto.url || foto.base64 || "";
}

const formatTime = (iso) => {
  try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};
const formatDate = (iso) => {
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(new Date(iso));
  } catch { return ""; }
};

export default function Diario({ trip, user }) {
  const [posts, setPosts] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [composing, setComposing] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const { showConfirm } = useConfirm();

  const reload = async () => {
    const { data, error } = await supabase
      .from("diario")
      .select("id, viagem_id, user_id, dia_numero, texto, fotos, created_at")
      .eq("viagem_id", trip.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[Diario] load erro:", error);
      setError(friendlyError(error));
    } else {
      setPosts(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!trip?.id) return;
    let active = true;
    (async () => { if (active) await reload(); })();

    const channel = supabase
      .channel(`diario-${trip.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "diario", filter: `viagem_id=eq.${trip.id}` },
        () => { reload(); }
      )
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id]);

  // Carrega perfis dos autores
  useEffect(() => {
    const ids = Array.from(new Set(posts.map((p) => p.user_id).filter((id) => id && !profilesById[id])));
    if (!ids.length) return;
    let active = true;
    supabase.from("users").select("id, nome, avatar_cor, avatar_url").in("id", ids).then(({ data }) => {
      if (!active || !data) return;
      setProfilesById((prev) => {
        const next = { ...prev };
        for (const p of data) next[p.id] = p;
        return next;
      });
    });
    return () => { active = false; };
  }, [posts, profilesById]);

  // Agrupa posts por dia (created_at YYYY-MM-DD)
  const byDay = useMemo(() => {
    const groups = new Map();
    for (const p of posts) {
      const k = (p.created_at ?? "").slice(0, 10);
      const arr = groups.get(k) ?? [];
      arr.push(p);
      groups.set(k, arr);
    }
    return Array.from(groups.entries()); // [[dateKey, posts], ...]
  }, [posts]);

  const deletePost = async (p) => {
    if (p.user_id !== user?.id) return;
    const ok = await showConfirm({
      title: "Apagar esse post do diário?",
      variant: "danger",
      confirmLabel: "Apagar",
    });
    if (!ok) return;
    // R22-3: deleta a row primeiro (RLS protege ownership), depois
    // limpa fotos no Storage (best-effort — órfãs no Storage não
    // afetam UX, mas idealmente removidas). Posts legacy com Base64
    // não têm nada no Storage; deleteDiarioPost é silencioso nesse caso.
    const { error } = await supabase.from("diario").delete().eq("id", p.id);
    if (error) {
      console.error("[Diario] delete erro:", error);
      setError(friendlyError(error));
      return;
    }
    deleteDiarioPost(trip.id, p.id).catch((e) => {
      console.warn("[Diario] storage cleanup falhou (post já deletado no DB):", e);
    });
    setPosts((prev) => prev.filter((x) => x.id !== p.id));
  };

  return (
    <div className="px-4 pb-24" style={{ background: "var(--tv-bg-light)", minHeight: "calc(100vh - 180px)" }}>
      <div className="pt-4 pb-2 flex items-center justify-between">
        <div>
          <h2 className="font-display font-extrabold text-[#1F2937] text-lg flex items-center gap-2">
            <Camera className="w-5 h-5" style={{ color: "var(--tv-accent-dark)" }} />
            Diário da viagem
          </h2>
          <p className="text-xs text-[#6B7280]">Compartilhe momentos com o grupo</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--tv-accent)" }} />
        </div>
      )}
      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm mb-3">{error}</div>}

      {!loading && posts.length === 0 && (
        <div className="card p-8 text-center mt-4">
          <Camera className="w-10 h-10 mx-auto mb-2 opacity-40" style={{ color: "var(--tv-accent)" }} />
          <div className="font-display font-bold text-[#1F2937]">Sem posts ainda</div>
          <p className="text-sm text-[#6B7280] mt-1">Toque no <strong>+</strong> pra registrar o primeiro momento.</p>
        </div>
      )}

      {byDay.map(([day, list]) => (
        <section key={day} className="mt-3">
          <div className="text-[11px] font-display font-extrabold uppercase tracking-wide mb-2 px-1" style={{ color: "var(--tv-accent-dark)" }}>
            {formatDate(day)}
          </div>
          <div className="space-y-2">
            {list.map((p) => {
              const author = p.user_id === user?.id ? user : (profilesById[p.user_id] ?? { nome: "Viajante", avatar_cor: "#6366F1" });
              const fotos = Array.isArray(p.fotos) ? p.fotos : [];
              return (
                <article key={p.id} className="card p-3">
                  <div className="flex items-center gap-2">
                    <Avatar user={author} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-extrabold text-[#1F2937] text-sm truncate">{author?.nome ?? "Viajante"}</div>
                      <div className="text-[11px] text-[#9CA3AF]">
                        {formatTime(p.created_at)}{p.dia_numero ? ` · Dia ${p.dia_numero}` : ""}
                      </div>
                    </div>
                    {p.user_id === user?.id && (
                      <button onClick={() => deletePost(p)} className="text-red-400 hover:text-red-600 p-1" aria-label="Apagar">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {p.texto && (
                    <p className="text-sm text-[#1F2937] mt-2 whitespace-pre-wrap break-words">{p.texto}</p>
                  )}
                  {fotos.length > 0 && (
                    <div className={`mt-2 grid gap-1 ${fotos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                      {fotos.slice(0, 4).map((foto, i) => {
                        const src = fotoSrc(foto);
                        if (!src) return null;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setLightbox(src)}
                            className="relative rounded-lg overflow-hidden bg-[#F3F4F6]"
                          >
                            <img src={src} alt="" loading="lazy" className="w-full h-full object-cover aspect-square" />
                            {i === 3 && fotos.length > 4 && (
                              <div className="absolute inset-0 bg-black/50 text-white flex items-center justify-center font-display font-extrabold">
                                +{fotos.length - 4}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <button
        onClick={() => setComposing(true)}
        className="fixed bottom-24 right-6 z-30 btn-primary !px-5 !py-3 inline-flex items-center gap-2 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.20)]"
        aria-label="Novo post"
      >
        <Plus className="w-5 h-5" /> Novo post
      </button>

      {composing && (
        <Composer
          trip={trip}
          user={user}
          onClose={() => setComposing(false)}
          onSaved={() => { setComposing(false); reload(); }}
        />
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center animate-fade-up"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
          <img src={lightbox} alt="" className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

function Composer({ trip, user, onClose, onSaved }) {
  const [texto, setTexto] = useState("");
  // R22-3: fotos guarda objetos { file?, previewUrl } durante composição.
  // file = File API (pra subir no save). previewUrl = ObjectURL local
  // pra mostrar preview imediato. No save:
  // 1. crypto.randomUUID() gera postId
  // 2. uploadDiarioPhotos sobe todos os files → URL[]
  // 3. INSERT em diario { id: postId, fotos: [{ url }, ...] }
  // 4. Revoke todos os ObjectURLs (cleanup memória)
  const [fotos, setFotos] = useState([]);
  const [diaNumero, setDiaNumero] = useState(() => suggestedDay(trip));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Cleanup ObjectURLs no unmount pra não vazar memória.
  useEffect(() => {
    return () => {
      fotos.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePick = (e) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError(null);
    // R22-3: NÃO comprime no client mais — só preview ObjectURL. Compressão
    // + upload acontecem no save. Mantém UX rápido ao adicionar foto
    // (era ~500ms-1s por foto antes; agora <50ms pra criar ObjectURL).
    const slots = Math.max(0, MAX_PHOTOS - fotos.length);
    const toAdd = files.slice(0, slots).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setFotos((prev) => [...prev, ...toAdd]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFoto = (idx) => {
    setFotos((prev) => {
      const removed = prev[idx];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const save = async () => {
    if (!texto.trim() && fotos.length === 0) {
      setError("Escreva algo ou adicione uma foto.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // R22-3: gera postId UUID no client pra usar como path do Storage
      // ANTES do INSERT. crypto.randomUUID disponível em todos os browsers
      // modernos (Chrome 92+, Firefox 95+, Safari 15.4+ — todos cobertos
      // pelo target Vite/React 19).
      const postId = crypto.randomUUID();

      // Upa fotos em paralelo. Se qualquer falhar, todas falham — re-throw.
      const urls = fotos.length
        ? await uploadDiarioPhotos(fotos.map((f) => f.file), trip.id, postId)
        : [];

      // Schema novo: array de objetos { url }. Schema legacy era array
      // de strings Base64 — back-compat no render via fotoSrc().
      const fotosPayload = urls.map((url) => ({ url }));

      const payload = {
        id: postId,
        viagem_id: trip.id,
        user_id: user.id,
        dia_numero: diaNumero ? Number(diaNumero) : null,
        texto: texto.trim() || null,
        fotos: fotosPayload,
      };
      const { error } = await supabase.from("diario").insert(payload);
      if (error) throw error;

      // Cleanup ObjectURLs antes de fechar.
      fotos.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      onSaved();
    } catch (e) {
      console.error("[Diario] save erro:", e);
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 animate-fade-up" onClick={onClose}>
      <div
        className="w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-hidden flex flex-col animate-pop bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white px-4 py-3 flex items-center gap-2" style={{ background: "var(--tv-gradient)" }}>
          <Camera className="w-5 h-5" />
          <div className="font-display font-extrabold flex-1">Novo post</div>
          <button onClick={onClose} className="rounded-full bg-white/20 hover:bg-white/30 p-1.5" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <textarea
            className="input min-h-[100px]"
            placeholder="O que rolou hoje?"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={1000}
          />

          {fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {fotos.map((f, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-[#F3F4F6]">
                  <img src={f.previewUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeFoto(i)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"
                    aria-label="Remover foto"
                    type="button"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={fotos.length >= MAX_PHOTOS || saving}
              className="btn-ghost inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <ImageIcon className="w-4 h-4" />
              {fotos.length >= MAX_PHOTOS ? "Máx 5 fotos" : `Adicionar foto (${fotos.length}/${MAX_PHOTOS})`}
            </button>
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePick} />
          </div>

          <div>
            <label className="text-xs font-display font-bold text-[#6B7280]">Dia da viagem (opcional)</label>
            <input
              type="number"
              min="1"
              max="60"
              className="input mt-1"
              value={diaNumero ?? ""}
              onChange={(e) => setDiaNumero(e.target.value ? Number(e.target.value) : null)}
              placeholder="Ex: 1, 2, 3…"
            />
          </div>

          {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">{error}</div>}
        </div>

        <div className="p-3 border-t border-[#E5E7EB] flex gap-2">
          <button onClick={onClose} disabled={saving} className="btn-ghost flex-1 disabled:opacity-50" type="button">Cancelar</button>
          <button
            onClick={save}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5"
            disabled={saving}
            type="button"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? (fotos.length ? "Enviando…" : "Publicando…") : "Publicar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function suggestedDay(trip) {
  if (!trip?.data_inicio) return null;
  const start = new Date(trip.data_inicio + "T00:00:00").getTime();
  const today = Date.now();
  const dias = Math.floor((today - start) / 86400000) + 1;
  if (dias < 1 || dias > 60) return null;
  return dias;
}
