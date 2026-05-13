// Logo do Viajjei — PNG oficial servido de /public/logo-viajjei.png.
// Aspect ratio nativo do arquivo: 800 × 442 (1.81:1).
//
// Props:
//   size  — altura em px (default 32). Largura calculada pelo aspect ratio.
//   white — em fundos escuros, aplica filtro invert pra texto branco (a curva
//           laranja desbota um pouco; é a melhor opção sem manter dois PNGs).
//   className — extra classes pro <img>.

const ASPECT = 800 / 442; // ≈ 1.810

export default function Logo({ size = 32, white = false, className = "" }) {
  const height = size;
  const width = Math.round(height * ASPECT);
  return (
    <img
      src="/logo-viajjei.png"
      alt="Viajjei"
      width={width}
      height={height}
      className={className}
      style={{
        display: "inline-block",
        height,
        width,
        // Em fundo escuro, vira silhueta branca (perde o laranja, mas fica legível).
        filter: white ? "brightness(0) invert(1)" : undefined,
      }}
      draggable={false}
    />
  );
}
