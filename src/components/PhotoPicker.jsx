import { useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { fileToResizedDataUrl } from "../lib/supabase";

export default function PhotoPicker({ value, onChange, fallbackCor = "#7CB9E8", fallbackInitial = "?", size = 96, disabled = false }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const handleClick = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 200, 0.7);
      onChange(dataUrl);
    } catch (err) {
      console.error("[TripVision] PhotoPicker:", err);
      setErr("Não consegui processar essa imagem.");
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
          {value ? "trocar" : "foto"}
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
