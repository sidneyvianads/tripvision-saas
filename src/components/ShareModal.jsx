import { useEffect, useRef, useState } from "react";
import { X, Copy, Check, Download, Share2 } from "lucide-react";
import QRCode from "qrcode";

export default function ShareModal({ open, onClose, trip }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const shareUrl = `${window.location.origin}/v/${trip.slug}`;
  const cidades = trip.cidades?.length ? trip.cidades.join(", ") : "uma viagem incrível";
  const emoji = trip.cover_emoji ?? "🧳";
  const shareText = `Entra no app da nossa viagem pra ${cidades}! ${emoji}\n${shareUrl}`;

  return <ShareModalInner
    canvasRef={canvasRef}
    shareUrl={shareUrl}
    shareText={shareText}
    trip={trip}
    onClose={onClose}
    copied={copied}
    setCopied={setCopied}
  />;
}

function ShareModalInner({ canvasRef, shareUrl, shareText, trip, onClose, copied, setCopied }) {
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, shareUrl, {
      width: 220,
      margin: 1,
      color: { dark: "#1F2937", light: "#FFFFFF" },
    }).catch((e) => console.error("[ShareModal] QR error:", e));
  // R13-3: canvasRef incluso pra silenciar exhaustive-deps. Ref é estável
  // (objeto identity nunca muda), então adicionar não causa re-execução
  // extra do effect — só satisfaz o lint.
  }, [shareUrl, canvasRef]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      prompt("Copie essa mensagem:", shareText);
    }
  };

  const shareNative = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: trip.nome, text: shareText, url: shareUrl }); }
      catch { /* cancelado */ }
    } else {
      copyText();
    }
  };

  const downloadQR = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `qr-${trip.slug}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 animate-fade-up" onClick={onClose}>
      <div
        className="w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col animate-pop bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white px-4 py-3 flex items-center gap-2" style={{ background: "var(--tv-gradient)" }}>
          <Share2 className="w-5 h-5" />
          <div className="font-display font-extrabold flex-1">Compartilhar viagem</div>
          <button onClick={onClose} className="rounded-full bg-white/20 hover:bg-white/30 p-1.5" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-center">
            <div className="text-sm text-[#4B5563] mb-3">
              Escaneie o QR ou compartilhe o link.
            </div>
            <div className="inline-block p-3 rounded-2xl border-2" style={{ borderColor: "var(--tv-card-border)" }}>
              <canvas ref={canvasRef} aria-label="QR code do link" />
            </div>
            <button
              onClick={downloadQR}
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-display font-bold bg-white border hover:bg-gray-50"
              style={{ borderColor: "var(--tv-card-border)", color: "var(--tv-accent-dark)" }}
            >
              <Download className="w-3.5 h-3.5" />
              Salvar QR
            </button>
          </div>

          <div className="rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] p-3">
            <div className="text-[11px] font-display font-bold uppercase tracking-wide text-[#6B7280] mb-1">Link</div>
            <div className="text-sm text-[#1F2937] break-all">{shareUrl}</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={copyText}
              type="button"
              className="btn-ghost inline-flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copiado!" : "Copiar texto"}
            </button>
            <button
              onClick={shareNative}
              type="button"
              className="btn-primary inline-flex items-center justify-center gap-1.5"
            >
              <Share2 className="w-4 h-4" /> Compartilhar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
