import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[60] text-white text-[12px] font-display font-bold flex items-center justify-center gap-2 py-1.5 safe-top"
      style={{ background: "#DC2626" }}
    >
      <WifiOff className="w-3.5 h-3.5" />
      Sem conexão — dados podem estar desatualizados.
    </div>
  );
}
