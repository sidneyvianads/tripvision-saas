// R21-3: PhotoPicker agora suporta 2 modos:
//
// Modo "Base64" (default, retro-compat — Welcome signup):
//   <PhotoPicker value={url|base64} onChange={(dataUrl) => ...} />
//   Lê o arquivo, resiza, retorna Base64 via onChange.
//   Usado durante signup quando o user ainda não existe.
//
// Modo "Storage upload" (novo — Account/Profile):
//   <PhotoPicker uploadFor={userId} value={publicUrl} onChange={(url) => ...} />
//   Lê o arquivo, resiza, upa pro bucket 'avatars/{userId}/avatar.webp',
//   retorna a URL pública via onChange. Mostra spinner durante upload.
//
// Compatibilidade: ambos modos chamam onChange com string. O caller
// não precisa saber qual é (Base64 ou URL) — só passa pra users.avatar_url.

import { useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { fileToResizedDataUrl } from "../lib/supabase";
import { uploadAvatar } from "../lib/avatarUpload";
import { friendlyError } from "../lib/errorMessages";

export default function PhotoPicker({
  value,
  onChange,
  fallbackCor = "#7CB9E8",
  fallbackInitial = "?",
  size = 96,
  disabled = false,
  uploadFor = null,  // R21-3: se setado, upa pro Storage em vez de Base64
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const handleClick = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (import.meta.env.DEV) console.log("[Viajjei] PhotoPicker file selected:", { hasFile: !!file, name: file?.name, type: file?.type, fileSize: file?.size, mode: uploadFor ? "upload" : "base64" });
    if (!file) return;
    // HEIC/HEIF (iOS default) — Canvas API não decodifica em Chrome/Firefox.
    if (/heic|heif/i.test(file.type) || /\.heic$|\.heif$/i.test(file.name)) {
      setErr("Formato HEIC não suportado. Salve como JPG/PNG e tente de novo.");
      console.warn("[Viajjei] PhotoPicker: HEIC rejeitado");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      if (uploadFor) {
        // R21-3: upload pro Storage. uploadAvatar valida + resize + upload.
        const { url } = await uploadAvatar(uploadFor, file);
        onChange(url);
      } else {
        // Legacy: Base64 inline. Usado em Welcome signup (user ainda não existe).
        const dataUrl = await fileToResizedDataUrl(file, 200, 0.7);
        if (import.meta.env.DEV) console.log("[Viajjei] PhotoPicker resized base64:", { fileSize: file.size, base64Length: dataUrl.length });
        onChange(dataUrl);
      }
    } catch (err) {
      console.error("[Viajjei] PhotoPicker erro:", err);
      setErr(`Não consegui processar essa imagem. ${friendlyError(err)}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        className="relative rounded-full overflow-hidden transition-transform active:scale-95 disabled:opacity-60"
        style={{
          width: size,
          height: size,
          background: fallbackCor,
          boxShadow: "0 0 0 3px rgba(124, 185, 232, 0.30), 0 4px 16px rgba(15, 27, 45, 0.30)",
        }}
        aria-label={value ? "Trocar foto" : "Adicionar foto"}
      >
        {value ? (
          <img src={value} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : (
          <span
            className="w-full h-full flex items-center justify-center text-white font-display font-extrabold"
            style={{ fontSize: size * 0.4 }}
          >
            {fallbackInitial}
          </span>
        )}

        <span
          className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1 text-white text-[10px] font-display font-bold"
          style={{ background: "rgba(15, 27, 45, 0.65)" }}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
          {busy ? "enviando…" : value ? "trocar" : "foto"}
        </span>
      </button>

      {value && !busy && (
        <button
          type="button"
          onClick={handleClear}
          className="text-[11px] inline-flex items-center gap-1 text-[#7CB9E8] hover:underline"
        >
          <X className="w-3 h-3" /> Remover foto
        </button>
      )}

      {err && <div className="text-xs text-red-300">{err}</div>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
