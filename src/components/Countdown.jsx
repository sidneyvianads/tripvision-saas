import { useEffect, useState } from "react";

function diff(target) {
  const v = Math.max(0, target - Date.now());
  const days = Math.floor(v / 86400000);
  const hours = Math.floor((v / 3600000) % 24);
  const minutes = Math.floor((v / 60000) % 60);
  return { days, hours, minutes };
}

export default function Countdown({ start, end }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!start) return null;

  const startMs = new Date(start + "T00:00:00").getTime();
  const endMs = end ? new Date(end + "T23:59:59").getTime() : startMs + 86400000;
  const now = Date.now();

  if (now > endMs) {
    return (
      <div
        className="p-5 mx-4 mt-4 animate-fade-up text-center rounded-2xl text-white"
        style={{ background: "var(--tv-gradient)", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.10)" }}
      >
        <div className="text-4xl">🎉</div>
        <div className="font-display font-extrabold text-xl mt-1">Viagem concluída!</div>
      </div>
    );
  }

  if (now >= startMs) {
    const { days } = diff(endMs);
    return (
      <div
        className="p-5 mx-4 mt-4 animate-fade-up rounded-2xl text-white"
        style={{ background: "var(--tv-gradient)", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.10)" }}
      >
        <div className="text-3xl">🔥</div>
        <div className="font-display font-extrabold text-xl mt-1">Em andamento!</div>
        <div className="text-white/85 text-sm">{days} {days === 1 ? "dia restante" : "dias restantes"}</div>
      </div>
    );
  }

  const { days, hours, minutes } = diff(startMs);
  return (
    <div
      className="p-5 mx-4 mt-4 animate-fade-up overflow-hidden relative rounded-2xl text-white"
      style={{ background: "var(--tv-gradient)", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.10)" }}
    >
      <div className="text-xs font-display font-bold text-white/85 uppercase tracking-widest flex items-center gap-1.5">
        <span>⏳</span> Faltam pra viagem
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Box value={days} label={days === 1 ? "dia" : "dias"} />
        <Box value={hours} label="h" />
        <Box value={minutes} label="min" />
      </div>
    </div>
  );
}

function Box({ value, label }) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{
        background: "rgba(255, 255, 255, 0.18)",
        backdropFilter: "blur(4px)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.20)",
      }}
    >
      <div className="font-display font-extrabold text-2xl tabular leading-none text-white">
        {String(value).padStart(2, "0")}
      </div>
      <div className="text-[10px] uppercase tracking-wide font-bold mt-1 text-white/80">{label}</div>
    </div>
  );
}
