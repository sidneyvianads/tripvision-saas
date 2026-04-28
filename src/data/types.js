export const ACTIVITY_TYPES = {
  transporte:  { color: "#3498DB", bg: "#D6EAF8", icon: "🚗", label: "Transporte" },
  passeio:     { color: "#27AE60", bg: "#D5F5E3", icon: "✨", label: "Passeio" },
  alimentacao: { color: "#E8834A", bg: "#FDEBD0", icon: "🔥", label: "Refeição" },
  hospedagem:  { color: "#8E44AD", bg: "#EBDEF0", icon: "🏨", label: "Hotel" },
  livre:       { color: "#7CB9E8", bg: "#E8F0FE", icon: "❄️", label: "Livre" },
};

export const STATUS_OPTIONS = ["confirmado", "aberto", "pendente"];
export const TYPE_OPTIONS = Object.keys(ACTIVITY_TYPES);

export const AVATAR_COLORS = [
  { color: "#7CB9E8", label: "Azul gelo" },
  { color: "#2E86C1", label: "Azul montanha" },
  { color: "#27AE60", label: "Verde pinheiro" },
  { color: "#E8834A", label: "Laranja lareira" },
  { color: "#D4A574", label: "Dourado" },
  { color: "#8E44AD", label: "Roxo" },
];

export const TRIP_THEMES = [
  { color: "#7CB9E8", icon: "❄️",  label: "Inverno" },
  { color: "#27AE60", icon: "🌲",  label: "Serra" },
  { color: "#E8834A", icon: "🌅",  label: "Praia" },
  { color: "#8E44AD", icon: "🏛️",  label: "Cidade" },
  { color: "#D4A574", icon: "🏜️",  label: "Sertão" },
  { color: "#3498DB", icon: "🌊",  label: "Litoral" },
];
