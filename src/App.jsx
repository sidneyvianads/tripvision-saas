import { Loader2 } from "lucide-react";
import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { captureCupomFromUrl } from "./lib/cupom";
import { captureOrigemFromUrl } from "./lib/origem";
import Landing from "./pages/Landing";
import Welcome from "./pages/Welcome";
import MyTrips from "./pages/MyTrips";
import OfflineBanner from "./components/OfflineBanner";

// Rotas pesadas → split em chunks separados
const NewTrip = lazy(() => import("./pages/NewTrip"));
const TripView = lazy(() => import("./pages/TripView"));
const AdminTrip = lazy(() => import("./pages/AdminTrip"));
const ChooseFlow = lazy(() => import("./pages/ChooseFlow"));
const PrecosPage = lazy(() => import("./pages/PrecosPage"));
const LegalPages = lazy(() => import("./pages/LegalPages"));
const AssinaturaSucesso = lazy(() => import("./pages/AssinaturaSucesso"));
const Account = lazy(() => import("./pages/Account"));
const AdminAfiliados = lazy(() => import("./pages/AdminAfiliados"));
const AfiliadoPainel = lazy(() => import("./pages/AfiliadoPainel"));

const TermosPage = lazy(() => import("./pages/LegalPages").then((m) => ({ default: m.TermosPage })));
const PrivacidadePage = lazy(() => import("./pages/LegalPages").then((m) => ({ default: m.PrivacidadePage })));

export default function App() {
  const { user, isRecovering } = useAuth();

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

  return (
    <>
      <OfflineBanner />
      <Suspense fallback={<FullscreenLoader />}>
        <Routes>
        {/* Landing pública / dashboard logado */}
        <Route path="/" element={effectiveUser ? <MyTrips /> : <Landing />} />

        {/* Auth — durante PASSWORD_RECOVERY mantém Welcome (não redireciona) */}
        <Route path="/welcome" element={effectiveUser ? <Navigate to="/" replace /> : <Welcome />} />

        {/* App autenticado */}
        <Route path="/v/new" element={effectiveUser ? <NewTrip /> : <Navigate to="/welcome" replace />} />
        <Route path="/v/:slug/start" element={effectiveUser ? <ChooseFlow /> : <Navigate to="/welcome" replace />} />
        <Route path="/v/:slug" element={effectiveUser ? <TripView /> : <Navigate to="/welcome" replace />} />
        <Route path="/v/:slug/admin" element={effectiveUser ? <AdminTrip /> : <Navigate to="/welcome" replace />} />
        <Route path="/conta" element={effectiveUser ? <Account /> : <Navigate to="/welcome" replace />} />
        <Route path="/assinatura/sucesso" element={effectiveUser ? <AssinaturaSucesso /> : <Navigate to="/welcome" replace />} />

        {/* Admin (owner-only — guard interno) */}
        <Route path="/admin/afiliados" element={effectiveUser ? <AdminAfiliados /> : <Navigate to="/welcome" replace />} />

        {/* Painel público de afiliado */}
        <Route path="/afiliado/:cupom" element={<AfiliadoPainel />} />

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
