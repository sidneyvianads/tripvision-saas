import { useEffect, useState } from "react";

function diff(target, now) {
  const v = Math.max(0, target - now);
  const days = Math.floor(v / 86400000);
  const hours = Math.floor((v / 3600000) % 24);
  const minutes = Math.floor((v / 60000) % 60);
  return { days, hours, minutes };
}

export default function Countdown({ start, end }) {
  // R13-1: `now` é state em vez de Date.now() inline durante render.
  // React 19 concurrent rendering pode descartar e reexecutar um render
  // (transitions, Suspense suspended-then-resumed); chamar uma função
  // impura como Date.now() faz o output diferir entre a tentativa
  // descartada e a final → diffing inconsistente, possíveis layout
  // shifts ou hydration mismatches. O tick já existia pra forçar
  // re-render — agora ele também é o ÚNICO ponto que lê o clock.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // R25-2: pausa o interval quando tab fica oculto.
    // Sem isso, browsers (especialmente mobile) deixam o setInterval
    // rodando em background — drena bateria sem benefício (user não
    // está vendo). visibilitychange evento garante retomar quando
    // o user voltar pra aba.
    // `start` da prop existe no escopo externo — usar nomes diferentes
    // pros helpers do interval pra não shadowar.
    let intervalId = null;
    const tick = () => setNow(Date.now());
    const startTimer = () => {
      if (intervalId != null) return;
      tick(); // sync imediato — se voltou de hidden há horas, contador
              // estava desatualizado
      intervalId = setInterval(tick, 60_000);
    };
    const stopTimer = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const onVisChange = () => {
      if (typeof document !== "undefined" && document.hidden) stopTimer();
      else startTimer();
    };

    // Bootstrap: respeita estado atual (SSR-safe via typeof document).
    if (typeof document === "undefined" || !document.hidden) startTimer();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisChange);
    }

    return () => {
      stopTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisChange);
      }
    };
  }, []);

  if (!start) return null;

  const startMs = new Date(start + "T00:00:00").getTime();
  const endMs = end ? new Date(end + "T23:59:59").getTime() : startMs + 86400000;

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
    const { days } = diff(endMs, now);
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

  const { days, hours, minutes } = diff(startMs, now);
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
