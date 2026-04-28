import { useMemo } from "react";

export default function Stars({ count = 50, className = "" }) {
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
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden z-0 ${className}`}
    >
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
