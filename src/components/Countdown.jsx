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
      <div className="card-dark p-5 mx-4 mt-4 animate-fade-up text-center">
        <div className="text-4xl">🎉</div>
        <div className="font-display font-extrabold text-xl mt-1 text-white">Viagem concluída!</div>
      </div>
    );
  }

  if (now >= startMs) {
    const { days } = diff(endMs);
    return (
      <div className="card-dark p-5 mx-4 mt-4 animate-fade-up">
        <div className="text-3xl">🔥</div>
        <div className="font-display font-extrabold text-xl mt-1 text-white">Em andamento!</div>
        <div className="text-[#7CB9E8] text-sm">{days} {days === 1 ? "dia restante" : "dias restantes"}</div>
      </div>
    );
  }

  const { days, hours, minutes } = diff(startMs);
  return (
    <div className="card-dark p-5 mx-4 mt-4 animate-fade-up overflow-hidden relative">
      <div className="absolute -right-3 -top-3 text-7xl opacity-15 select-none">❄️</div>
      <div className="text-xs font-display font-bold text-[#7CB9E8] uppercase tracking-widest flex items-center gap-1.5">
        <span>❄️</span> Faltam pra viagem
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
        background: "linear-gradient(135deg, #1B4F72 0%, #2E86C1 100%)",
        boxShadow: "inset 0 1px 0 rgba(232, 240, 254, 0.20), 0 4px 12px rgba(15, 27, 45, 0.30)",
      }}
    >
      <div className="font-display font-extrabold text-2xl tabular leading-none text-white">
        {String(value).padStart(2, "0")}
      </div>
      <div className="text-[10px] uppercase tracking-wide font-bold mt-1 text-[#E8F0FE]/85">{label}</div>
    </div>
  );
}
