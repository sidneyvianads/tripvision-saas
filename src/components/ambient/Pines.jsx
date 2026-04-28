const TREES = [
  { x: 20,  s: 0.8 },
  { x: 70,  s: 1.2 },
  { x: 130, s: 0.9 },
  { x: 195, s: 1.4 },
  { x: 270, s: 0.7 },
  { x: 340, s: 1.1 },
  { x: 420, s: 1.0 },
  { x: 490, s: 0.8 },
  { x: 560, s: 1.3 },
  { x: 640, s: 0.9 },
  { x: 720, s: 1.1 },
  { x: 800, s: 0.75 },
  { x: 870, s: 1.25 },
  { x: 950, s: 0.95 },
  { x: 1030, s: 1.15 },
  { x: 1110, s: 0.85 },
  { x: 1170, s: 1.0 },
];

export default function Pines({ className = "", color = "#0F1B2D" }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1200 100"
      preserveAspectRatio="none"
      className={`absolute inset-x-0 bottom-0 w-full pointer-events-none ${className}`}
    >
      <g fill={color}>
        {TREES.map((t, i) => {
          const w = 14 * t.s;
          const h = 70 * t.s;
          const xL = t.x - w / 2;
          const xR = t.x + w / 2;
          const yBase = 100;
          const yTop = yBase - h;
          return <polygon key={i} points={`${xL},${yBase} ${t.x},${yTop} ${xR},${yBase}`} />;
        })}
      </g>
    </svg>
  );
}
