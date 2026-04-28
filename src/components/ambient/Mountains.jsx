export default function Mountains({ className = "", color = "#7CB9E8" }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1200 200"
      preserveAspectRatio="none"
      className={`absolute inset-x-0 bottom-0 w-full pointer-events-none ${className}`}
    >
      <path
        d="M0 200 L60 110 L150 160 L260 60 L360 130 L470 70 L590 140 L710 50 L830 120 L960 80 L1080 130 L1200 90 L1200 200 Z"
        fill={color}
        opacity="0.18"
      />
      <path
        d="M0 200 L80 145 L180 175 L290 105 L400 165 L530 110 L660 155 L790 95 L900 145 L1040 115 L1200 155 L1200 200 Z"
        fill={color}
        opacity="0.10"
      />
    </svg>
  );
}
