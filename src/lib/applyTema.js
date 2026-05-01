import { getTema } from "../data/themes";

// Retorna um style object com CSS vars do tema.
// Use no container raiz da viagem: <div style={temaCssVars(temaId)}>
export function temaCssVars(temaId) {
  const t = getTema(temaId);
  return {
    "--tv-accent": t.accent,
    "--tv-accent-dark": t.accentDark,
    "--tv-bg-light": t.bgLight,
    "--tv-card-border": t.cardBorder,
    "--tv-gradient": t.gradient,
  };
}
