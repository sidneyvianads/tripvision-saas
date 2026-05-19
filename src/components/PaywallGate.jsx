// R31-A: gate que envolve rotas autenticadas. Se o user não tem acesso
// pago (plano expired/pending/null OU plano_expires_at no passado),
// redireciona pra /assinatura/pendente em vez de renderizar o conteúdo.
//
// IMPORTANTE: confia em hasActiveAccess(user) — mesma função usada
// internamente pelo app pra liberar features pagas. owner sempre passa.
// Os 4 users 'grupo' antigos sem mp_preapproval_id (ativados via SQL)
// têm plano_expires_at futuro, então passam — comportamento correto.

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { hasActiveAccess } from "../data/plans";

export default function PaywallGate({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/welcome" replace />;
  if (!hasActiveAccess(user)) {
    // Preserva pra onde o user tentou ir, pra retornar pós-checkout.
    return (
      <Navigate
        to="/assinatura/pendente"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return children;
}
