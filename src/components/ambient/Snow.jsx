import { useMemo } from "react";

const GLYPHS = ["❄", "❅", "❆", "•"];

export default function Snow({ count = 60, className = "" }) {
  const flakes = useMemo(() => {
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        key: i,
        left: Math.random() * 100,
        delay: -Math.random() * 30,
        duration: 14 + Math.random() * 22,
        size: 0.55 + Math.random() * 0.95,
        sway: -40 + Math.random() * 80,
        glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        opacity: 0.45 + Math.random() * 0.5,
      });
    }
    return out;
  }, [count]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden z-0 ${className}`}
    >
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
        >
          {f.glyph}
        </span>
      ))}
    </div>
  );
}
