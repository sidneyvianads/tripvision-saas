import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PricingSection from "../components/PricingSection";
import { useAuth } from "../hooks/useAuth";

export default function PrecosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleChoose = (plano, ciclo = "mensal") => {
    if (!user) { navigate("/welcome?mode=signup"); return; }
    if (plano === "free") { navigate("/"); return; }
    navigate(`/conta?upgrade=${plano}&ciclo=${ciclo}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-app">
      <header
        className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md"
        style={{ background: "rgba(255, 255, 255, 0.92)", borderBottom: "1px solid #E5E7EB" }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="rounded-full p-1.5 hover:bg-[#F3F4F6] text-[#1F2937]">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Link to="/" className="font-display font-extrabold text-[#1F2937] text-lg">🧳 Viajjei</Link>
          <div className="flex-1" />
          {!user && (
            <button onClick={() => navigate("/welcome")} className="text-sm text-[#6B7280] hover:text-[#1F2937] font-display font-bold">
              Entrar
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 pt-24">
        <div className="max-w-3xl mx-auto text-center px-4 mb-4">
          <h1 className="text-3xl sm:text-5xl font-display font-extrabold text-[#1F2937]">Preços</h1>
          <p className="text-[#6B7280] mt-2">Comece grátis. Cresça quando quiser.</p>
        </div>
        <PricingSection onChoose={handleChoose} currentPlan={user?.plano ?? null} />
      </main>
    </div>
  );
}
