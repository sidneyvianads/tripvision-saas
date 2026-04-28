import { Loader2 } from "lucide-react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Welcome from "./pages/Welcome";
import MyTrips from "./pages/MyTrips";
import NewTrip from "./pages/NewTrip";
import TripView from "./pages/TripView";
import AdminTrip from "./pages/AdminTrip";

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/welcome" element={user ? <Navigate to="/" replace /> : <Welcome />} />
      <Route path="/" element={user ? <MyTrips /> : <Navigate to="/welcome" replace />} />
      <Route path="/v/new" element={user ? <NewTrip /> : <Navigate to="/welcome" replace />} />
      <Route path="/v/:slug" element={user ? <TripView /> : <Navigate to="/welcome" replace />} />
      <Route path="/v/:slug/admin" element={user ? <AdminTrip /> : <Navigate to="/welcome" replace />} />
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
        <a href="/" className="text-ice mt-2 inline-block">Voltar pra Minhas Viagens</a>
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
