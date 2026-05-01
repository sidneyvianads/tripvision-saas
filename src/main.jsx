import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./hooks/useAuth";
import OfflineBanner from "./components/OfflineBanner";

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
