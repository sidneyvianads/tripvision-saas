import { Loader2 } from "lucide-react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Suspense, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { PENDING_INVITE_KEY } from "./hooks/useInviteToken";
import { captureCupomFromUrl } from "./lib/cupom";
import { captureOrigemFromUrl } from "./lib/origem";
import Landing from "./pages/Landing";
import Welcome from "./pages/Welcome";
import MyTrips from "./pages/MyTrips";
import OfflineBanner from "./components/OfflineBanner";
import PaywallGate from "./components/PaywallGate";
import { lazyWithRetry } from "./lib/lazyWithRetry";

// Rotas pesadas → split em chunks separados
// R10-7: lazyWithRetry trata ChunkLoadError em deploy novo (force reload).
const NewTrip = lazyWithRetry(() => import("./pages/NewTrip"));
const TripView = lazyWithRetry(() => import("./pages/TripView"));
const AdminTrip = lazyWithRetry(() => import("./pages/AdminTrip"));
const ChooseFlow = lazyWithRetry(() => import("./pages/ChooseFlow"));
const PrecosPage = lazyWithRetry(() => import("./pages/PrecosPage"));
const AssinaturaSucesso = lazyWithRetry(() => import("./pages/AssinaturaSucesso"));
const AssinaturaPendente = lazyWithRetry(() => import("./pages/AssinaturaPendente"));
const Account = lazyWithRetry(() => import("./pages/Account"));
const AdminAfiliados = lazyWithRetry(() => import("./pages/AdminAfiliados"));
const AfiliadoPainel = lazyWithRetry(() => import("./pages/AfiliadoPainel"));
const AcceptInvite = lazyWithRetry(() => import("./pages/AcceptInvite"));

const TermosPage = lazyWithRetry(() => import("./pages/LegalPages").then((m) => ({ default: m.TermosPage })));
const PrivacidadePage = lazyWithRetry(() => import("./pages/LegalPages").then((m) => ({ default: m.PrivacidadePage })));

export default function App() {
  const { user, isRecovering } = useAuth();
  const navigate = useNavigate();

  // Durante PASSWORD_RECOVERY o user tem session válida (criada pelo link
  // do email) mas ainda precisa trocar a senha. Se redirecionarmos /welcome
  // pra / agora, o user nunca vê o form de nova senha e a senha velha (do
  // email comprometido) continua válida. effectiveUser=null deixa Welcome
  // continuar renderizado até clearRecovering() ser chamado.
  const effectiveUser = isRecovering ? null : user;

  // Captura ?cupom=X e ?utm_source=X da URL e guarda em localStorage.
  // Usado no signUp pra preencher users.origem + users.afiliado_id.
  useEffect(() => {
    const c = captureCupomFromUrl();
    if (c) console.log("[Viajjei] cupom de afiliado capturado:", c);
    const o = captureOrigemFromUrl();
    if (o) console.log("[Viajjei] origem capturada:", o);
  }, []);

  // R14-4: pendência de invite-token entre /welcome e /aceitar-convite.
  // AcceptInvite redireciona pra /welcome?invite=TOKEN quando o user não
  // está logado. Welcome guarda o token em sessionStorage e completa o
  // signin/signup. Quando user vira não-null, voltamos pra /aceitar-convite
  // pra finalizar. sessionStorage (não local): morre ao fechar a aba —
  // evita que um convite cancelado fique pendurado.
  useEffect(() => {
    if (!effectiveUser) return;
    let token;
    try { token = window.sessionStorage.getItem(PENDING_INVITE_KEY); } catch {}
    if (!token) return;
    try { window.sessionStorage.removeItem(PENDING_INVITE_KEY); } catch {}
    navigate(`/aceitar-convite?token=${encodeURIComponent(token)}`, { replace: true });
  }, [effectiveUser, navigate]);

  return (
    <>
      <OfflineBanner />
      <Suspense fallback={<FullscreenLoader />}>
        <Routes>
        {/* Landing pública / dashboard logado.
            R31-B: dashboard exige plano ativo via PaywallGate. */}
        <Route path="/" element={effectiveUser ? <PaywallGate><MyTrips /></PaywallGate> : <Landing />} />

        {/* Auth — durante PASSWORD_RECOVERY mantém Welcome (não redireciona) */}
        <Route path="/welcome" element={effectiveUser ? <Navigate to="/" replace /> : <Welcome />} />

        {/* App autenticado — PaywallGate envolve cada rota. Sem plano ativo,
            redireciona pra /assinatura/pendente. /assinatura/sucesso e
            /assinatura/pendente NÃO ficam atrás do gate (back_url do MP
            e a própria tela de paywall precisam ser acessíveis). */}
        <Route path="/v/new" element={effectiveUser ? <PaywallGate><NewTrip /></PaywallGate> : <Navigate to="/welcome" replace />} />
        <Route path="/v/:slug/start" element={effectiveUser ? <PaywallGate><ChooseFlow /></PaywallGate> : <Navigate to="/welcome" replace />} />
        <Route path="/v/:slug" element={effectiveUser ? <PaywallGate><TripView /></PaywallGate> : <Navigate to="/welcome" replace />} />
        <Route path="/v/:slug/admin" element={effectiveUser ? <PaywallGate><AdminTrip /></PaywallGate> : <Navigate to="/welcome" replace />} />
        <Route path="/conta" element={effectiveUser ? <Account /> : <Navigate to="/welcome" replace />} />
        <Route path="/assinatura/sucesso" element={effectiveUser ? <AssinaturaSucesso /> : <Navigate to="/welcome" replace />} />
        <Route path="/assinatura/pendente" element={effectiveUser ? <AssinaturaPendente /> : <Navigate to="/welcome" replace />} />

        {/* Admin (owner-only — guard interno) */}
        <Route path="/admin/afiliados" element={effectiveUser ? <AdminAfiliados /> : <Navigate to="/welcome" replace />} />

        {/* Painel público de afiliado */}
        <Route path="/afiliado/:cupom" element={<AfiliadoPainel />} />

        {/* R14-4: aceitar convite. AcceptInvite redireciona internamente
            pra /welcome?invite=token se não-logado. */}
        <Route path="/aceitar-convite" element={<AcceptInvite />} />

        {/* Páginas públicas */}
        <Route path="/precos" element={<PrecosPage />} />
        <Route path="/termos" element={<TermosPage />} />
        <Route path="/privacidade" element={<PrivacidadePage />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-app text-center p-6">
      <div>
        <div className="text-6xl mb-3">🧭</div>
        <h1 className="text-2xl text-[#1F2937]">Página não encontrada</h1>
        <a href="/" className="text-ice mt-2 inline-block">Voltar pra home</a>
      </div>
    </div>
  );
}

export function FullscreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-app">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--tv-accent, #6366F1)" }} />
    </div>
  );
}
