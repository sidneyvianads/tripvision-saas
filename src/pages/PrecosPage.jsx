import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PricingSection from "../components/PricingSection";
import { useAuth } from "../hooks/useAuth";
import Snow from "../components/ambient/Snow";

export default function PrecosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleChoose = (plano) => {
    if (!user) { navigate("/welcome?mode=signup"); return; }
    if (plano === "free") { navigate("/"); return; }
    navigate("/conta?upgrade=" + plano);
  };

  return (
    <div className="min-h-screen flex flex-col gradient-night relative overflow-hidden">
      <Snow count={40} />
      <header
        className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md"
        style={{ background: "rgba(15, 27, 45, 0.85)", borderBottom: "1px solid rgba(124, 185, 232, 0.18)" }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to={user ? "/" : "/"} className="rounded-full p-1.5 hover:bg-white/10 text-[#E8F0FE]">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Link to="/" className="font-display font-extrabold text-[#E8F0FE] text-lg">❄️ TripVision</Link>
          <div className="flex-1" />
          {!user && (
            <button onClick={() => navigate("/welcome")} className="text-sm text-[#7CB9E8] font-display font-bold">
              Entrar
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 pt-24 relative z-10">
        <div className="max-w-3xl mx-auto text-center px-4 mb-4">
          <h1 className="text-3xl sm:text-5xl font-display font-extrabold text-snow">Preços</h1>
          <p className="text-[#E8F0FE]/75 mt-2">Comece grátis. Cresça quando quiser.</p>
        </div>
        <PricingSection onChoose={handleChoose} currentPlan={user?.plano ?? null} />
      </main>
    </div>
  );
}
