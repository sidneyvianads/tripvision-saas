import { useState } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import PhotoPicker from "./PhotoPicker";
import { AVATAR_COLORS } from "../data/types";

export default function Profile({ onClose }) {
  const { user, updateProfile, loading } = useAuth();
  const [nome, setNome] = useState(user?.nome ?? "");
  const [photo, setPhoto] = useState(user?.avatar_url ?? null);
  const [cor, setCor] = useState(user?.avatar_cor ?? "#7CB9E8");
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  const handleSave = async (e) => {
    e?.preventDefault();
    setErr(null);
    try {
      await updateProfile({ nome, avatar_url: photo, avatar_cor: cor });
      setDone(true);
      setTimeout(onClose, 600);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 animate-fade-up" onClick={onClose}>
      <div
        className="w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-hidden flex flex-col animate-pop"
        style={{ background: "linear-gradient(180deg, #E8F0FE 0%, #FFFFFF 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gradient-header text-white px-4 py-3 flex items-center gap-2">
          <div className="text-xl">✏️</div>
          <div className="font-display font-extrabold flex-1">Editar perfil</div>
          <button onClick={onClose} className="p-1 rounded-full bg-white/15 hover:bg-white/25" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex justify-center pt-2">
            <PhotoPicker
              value={photo}
              onChange={setPhoto}
              fallbackCor={cor}
              fallbackInitial={(nome.trim().charAt(0) || "?").toUpperCase()}
              size={104}
              disabled={loading}
            />
          </div>

          <label className="block">
            <span className="text-xs font-display font-bold text-[#1A3A4A]/80">Nome</span>
            <input
              className="input mt-1"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={40}
              required
            />
          </label>

          <div>
            <div className="text-xs font-display font-bold text-[#1A3A4A]/80 mb-1.5">Cor do avatar</div>
            <div className="flex gap-2 flex-wrap">
              {AVATAR_COLORS.map((c) => {
                const active = cor === c.color;
                return (
                  <button
                    type="button"
                    key={c.color}
                    onClick={() => setCor(c.color)}
                    aria-label={c.label}
                    title={c.label}
                    className="w-9 h-9 rounded-full transition-all"
                    style={{
                      background: c.color,
                      outline: active ? `3px solid ${c.color}` : "none",
                      outlineOffset: 2,
                      transform: active ? "scale(1.05)" : "scale(1)",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {err && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">{err}</div>
          )}

          <button type="submit" className="btn-primary w-full inline-flex items-center justify-center gap-2" disabled={loading || done}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? "✅" : <Save className="w-4 h-4" />}
            {done ? "Salvo!" : "Salvar"}
          </button>

          <p className="text-center text-[10px] text-[#1A3A4A]/50">
            Conectado como <span className="font-bold">{user?.email}</span>
          </p>
        </form>
      </div>
    </div>
  );
}
