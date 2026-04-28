export default function Avatar({ user, size = 36, className = "", style = {} }) {
  const initial = ((user?.nome ?? "?").trim().charAt(0) || "?").toUpperCase();
  const cor = user?.avatar_cor ?? "#7CB9E8";
  const baseStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    ...style,
  };

  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user?.nome ?? ""}
        loading="lazy"
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={baseStyle}
        draggable={false}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${className}`}
      style={{ ...baseStyle, background: cor, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
