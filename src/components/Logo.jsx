// Wordmark inline SVG do Viajjei. Render inline pra evitar request extra
// e permitir cor responsiva (tema branco em fundos escuros).

export default function Logo({ size = 28, white = false, withTagline = false, className = "" }) {
  const ink   = white ? "#FFFFFF" : "#0F172A";
  const accent = white ? "#FB923C" : "#F97316";
  const tagline = white ? "#CBD5E1" : "#94A3B8";
  // Aspect ratio = 300:80 sem tagline; 300:80 sempre, mas o texto da tagline aparece dentro.
  const height = size;
  const width  = (300 / 80) * height;
  return (
    <svg
      viewBox="0 0 300 80"
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label="Viajjei"
      style={{ display: "inline-block" }}
    >
      <path d="M112 4 Q138 -10 164 4" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      <text y="52" fontFamily="'Nunito', system-ui, sans-serif" letterSpacing="-1">
        <tspan x="0" fontSize="44" fontWeight="400" fill={ink}>via</tspan>
        <tspan fontSize="44" fontWeight="800" fill={accent}>jj</tspan>
        <tspan fontSize="44" fontWeight="400" fill={ink}>ei</tspan>
      </text>
      {withTagline && (
        <text x="150" y="72" textAnchor="middle" fontFamily="'DM Sans', system-ui, sans-serif" fontSize="10" fill={tagline} letterSpacing="5">
          SEMPRE JUNTOS
        </text>
      )}
    </svg>
  );
}
