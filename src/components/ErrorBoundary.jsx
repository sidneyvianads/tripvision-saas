import { Component } from "react";
import { captureException } from "../lib/sentry";

// Captura erros síncronos em qualquer componente filho e renderiza fallback.
// Sem isso, um throw num componente derruba a árvore inteira (tela branca).
// Sentry futuro captura via window.onerror mas perde o componentStack do
// React — aqui passamos errorInfo.componentStack pra ter rastro completo.
//
// Uso: <ErrorBoundary><App/></ErrorBoundary> em main.jsx.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    captureException(error, {
      source: "ErrorBoundary",
      componentStack: errorInfo?.componentStack ?? null,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-app">
        <div className="max-w-md w-full text-center">
          <div className="text-6xl mb-4">😿</div>
          <h1 className="font-display font-extrabold text-2xl text-[#0F172A] mb-2">
            Algo deu errado
          </h1>
          <p className="text-[#64748B] mb-6 text-sm">
            A página teve um problema inesperado. Você pode tentar recarregar ou voltar pra home.
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Recarregar
            </button>
            <button
              onClick={() => { this.handleReset(); window.location.href = "/"; }}
              className="px-4 py-2.5 rounded-xl font-display font-bold border"
              style={{ borderColor: "#E5E7EB", color: "#374151", background: "white" }}
            >
              Ir pra home
            </button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-6 text-left text-xs text-[#9CA3AF]">
              <summary className="cursor-pointer">Detalhes (dev only)</summary>
              <pre className="mt-2 overflow-auto bg-[#F8FAFC] p-2 rounded">
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
