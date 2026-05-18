// Avatar do usuário: foto + fallback colorido com inicial.
//
// R21-2: avatar_url aceita 2 formatos durante a migração:
//   - "https://..." → URL pública do Supabase Storage (formato novo)
//   - "data:image/..." → Base64 inline legacy (até o script de migração rodar)
//
// img src nativo aceita ambos, então não precisa ramificar — só
// adicionamos onError pra cair pro fallback quando a URL estiver quebrada
// (Storage offline, foto deletada mas users.avatar_url ainda referencia).

import { useState } from "react";

export default function Avatar({ user, size = 36, className = "", style = {} }) {
  const [failed, setFailed] = useState(false);
  const initial = ((user?.nome ?? "?").trim().charAt(0) || "?").toUpperCase();
  const cor = user?.avatar_cor ?? "#7CB9E8";
  const baseStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    ...style,
  };

  if (user?.avatar_url && !failed) {
    return (
      <img
        src={user.avatar_url}
        alt={user?.nome ?? ""}
        loading="lazy"
        onError={() => setFailed(true)}
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
