import { Loader2 } from "lucide-react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Welcome from "./pages/Welcome";
import MyTrips from "./pages/MyTrips";
import NewTrip from "./pages/NewTrip";
import TripView from "./pages/TripView";
import AdminTrip from "./pages/AdminTrip";
import ChooseFlow from "./pages/ChooseFlow";
import Landing from "./pages/Landing";
import PrecosPage from "./pages/PrecosPage";
import { TermosPage, PrivacidadePage } from "./pages/LegalPages";
import AssinaturaSucesso from "./pages/AssinaturaSucesso";
import Account from "./pages/Account";

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Landing pública / dashboard logado */}
      <Route path="/" element={user ? <MyTrips /> : <Landing />} />

      {/* Auth */}
      <Route path="/welcome" element={user ? <Navigate to="/" replace /> : <Welcome />} />

      {/* App autenticado */}
      <Route path="/v/new" element={user ? <NewTrip /> : <Navigate to="/welcome" replace />} />
      <Route path="/v/:slug/start" element={user ? <ChooseFlow /> : <Navigate to="/welcome" replace />} />
      <Route path="/v/:slug" element={user ? <TripView /> : <Navigate to="/welcome" replace />} />
      <Route path="/v/:slug/admin" element={user ? <AdminTrip /> : <Navigate to="/welcome" replace />} />
      <Route path="/conta" element={user ? <Account /> : <Navigate to="/welcome" replace />} />
      <Route path="/assinatura/sucesso" element={user ? <AssinaturaSucesso /> : <Navigate to="/welcome" replace />} />

      {/* Páginas públicas */}
      <Route path="/precos" element={<PrecosPage />} />
      <Route path="/termos" element={<TermosPage />} />
      <Route path="/privacidade" element={<PrivacidadePage />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center gradient-winter text-center p-6">
      <div>
        <div className="text-6xl mb-3">🧭</div>
        <h1 className="text-2xl text-snow">Página não encontrada</h1>
        <a href="/" className="text-ice mt-2 inline-block">Voltar pra home</a>
      </div>
    </div>
  );
}

export function FullscreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center gradient-winter">
      <Loader2 className="w-8 h-8 animate-spin text-[#7CB9E8]" />
    </div>
  );
}
