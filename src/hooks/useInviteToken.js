// R29-5: hook que captura ?invite=TOKEN da URL e persiste em sessionStorage.
//
// Fluxo (R14-4): AcceptInvite.jsx detecta que o user clicou no link de convite
// mas não está logado, e redireciona pra /welcome?invite=TOKEN. Esse hook
// grava o TOKEN em sessionStorage com a chave "viajjei:pending_invite". Depois
// que o user loga ou cria conta, o App.jsx lê esse storage e redireciona de
// volta pra /aceitar-convite/<token>, terminando o flow.
//
// Por que sessionStorage (não localStorage): some ao fechar a aba. Evita que
// um convite expirado fique "pendurado" se o user nunca terminar o login.

import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export const PENDING_INVITE_KEY = "viajjei:pending_invite";

export function useInviteToken() {
  const [params] = useSearchParams();
  useEffect(() => {
    const invite = params.get("invite");
    if (!invite) return;
    try { window.sessionStorage.setItem(PENDING_INVITE_KEY, invite); } catch {}
  }, [params]);
}
