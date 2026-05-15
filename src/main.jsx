import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./hooks/useAuth";
import OfflineBanner from "./components/OfflineBanner";
import ErrorBoundary from "./components/ErrorBoundary";
import { initSentry, captureException } from "./lib/sentry";
import { initAnalytics } from "./lib/analytics";

initSentry();
initAnalytics();

// Filtro: descarta erros de extensões/scripts third-party do browser que
// não temos como reproduzir nem corrigir. Sem isso, Sentry futuro vai
// inundar com ruído de extensões dos users.
function shouldReport(source) {
  if (!source) return true;
  const noisy = [
    "chrome-extension://",
    "moz-extension://",
    "safari-extension://",
    "safari-web-extension://",
    "webkit-masked-url://",
  ];
  return !noisy.some((p) => source.startsWith(p));
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    if (!shouldReport(e.filename)) return;
    captureException(e.error ?? new Error(e.message), {
      source: "window.onerror",
      filename: e.filename,
      lineno: e.lineno,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    // Promise rejection não tem filename direto, mas a stack ajuda a filtrar.
    const stack = e.reason?.stack ?? "";
    if (stack && /\b(chrome|moz|safari)-extension:/.test(stack)) return;
    captureException(e.reason ?? new Error("unhandled rejection"), { source: "unhandledrejection" });
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <OfflineBanner />
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
