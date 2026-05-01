import { useMemo } from "react";

// Partículas opt-in por tema. Render leve, CSS-only.
// Hard guard: cada partícula só renderiza pra um tema.id específico,
// não confiando apenas em tema.particles. Defesa em profundidade.

export default function TemaParticles({ tema, count = 35, className = "" }) {
  if (!tema?.id) return null;

  // Diagnóstico — útil pra ver na console qual tema chegou aqui
  if (typeof window !== "undefined" && !window.__tvLogged) {
    console.log("[TripVision] TemaParticles tema:", tema.id, "particles:", tema.particles);
    window.__tvLogged = true;
  }

  switch (tema.id) {
    case "montanha":     return tema.particles === "snow"   ? <Snow   count={count} className={className} /> : null;
    case "natureza":     return tema.particles === "leaves" ? <Leaves count={count} className={className} /> : null;
    case "cidade":       return tema.particles === "lights" ? <Stars  count={count} className={className} /> : null;
    case "praia":        return tema.particles === "waves"  ? <Waves              className={className} /> : null;
    case "internacional":
    default:             return null;
  }
}

function Snow({ count, className }) {
  const flakes = useMemo(() => {
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        key: i,
        left: Math.random() * 100,
        delay: -Math.random() * 30,
        duration: 14 + Math.random() * 22,
        size: 0.5 + Math.random() * 0.9,
        sway: -40 + Math.random() * 80,
        glyph: ["❄", "❅", "❆"][Math.floor(Math.random() * 3)],
        opacity: 0.45 + Math.random() * 0.5,
      });
    }
    return out;
  }, [count]);

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden z-0 ${className}`}>
      {flakes.map((f) => (
        <span
          key={f.key}
          className="snowflake"
          style={{
            left: `${f.left}%`,
            animationDelay: `${f.delay}s`,
            animationDuration: `${f.duration}s`,
            fontSize: `${f.size}rem`,
            opacity: f.opacity,
            "--snow-sway": `${f.sway}px`,
          }}
        >{f.glyph}</span>
      ))}
    </div>
  );
}

function Leaves({ count, className }) {
  const leaves = useMemo(() => {
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        key: i,
        left: Math.random() * 100,
        delay: -Math.random() * 20,
        duration: 12 + Math.random() * 18,
        size: 0.7 + Math.random() * 0.8,
        sway: -30 + Math.random() * 60,
        glyph: ["🍃", "🌿"][Math.floor(Math.random() * 2)],
      });
    }
    return out;
  }, [count]);
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden z-0 ${className}`}>
      {leaves.map((l) => (
        <span
          key={l.key}
          className="leaf"
          style={{
            left: `${l.left}%`,
            animationDelay: `${l.delay}s`,
            animationDuration: `${l.duration}s`,
            fontSize: `${l.size}rem`,
            "--leaf-sway": `${l.sway}px`,
          }}
        >{l.glyph}</span>
      ))}
    </div>
  );
}

function Stars({ count, className }) {
  const stars = useMemo(() => {
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        key: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: -Math.random() * 4,
        size: 1 + Math.random() * 2,
      });
    }
    return out;
  }, [count]);
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden z-0 ${className}`}>
      {stars.map((s) => (
        <span
          key={s.key}
          className="star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function Waves({ className }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden z-0 ${className}`}>
      <svg
        viewBox="0 0 1200 140"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 w-full h-24"
        style={{ animation: "wave-drift 18s ease-in-out infinite" }}
      >
        <path
          d="M0 60 Q 200 100 400 60 T 800 60 T 1200 60 V140 H0 Z"
          fill="rgba(255,255,255,0.10)"
        />
        <path
          d="M0 80 Q 200 40 400 80 T 800 80 T 1200 80 V140 H0 Z"
          fill="rgba(255,255,255,0.08)"
        />
      </svg>
    </div>
  );
}
