import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./hooks/useAuth";
import OfflineBanner from "./components/OfflineBanner";
import { initSentry, captureException } from "./lib/sentry";
import { initAnalytics } from "./lib/analytics";

initSentry();
initAnalytics();

// Catch global de erros não tratados — manda pro Sentry (stub loga em console).
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    captureException(e.error ?? new Error(e.message), { source: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    captureException(e.reason ?? new Error("unhandled rejection"), { source: "unhandledrejection" });
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OfflineBanner />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
