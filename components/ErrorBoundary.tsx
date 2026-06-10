import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  // @ts-ignore
  props!: Props;

  // @ts-ignore
  setState!: (state: Partial<State> | ((state: State) => Partial<State>)) => void;

  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-slate-900 border border-rose-500/30 rounded-xl my-4 text-slate-100 max-w-4xl mx-auto shadow-2xl">
          <div className="flex items-center gap-3 border-b border-rose-500/20 pb-4 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h2 className="text-lg font-black text-rose-400 uppercase tracking-tight">Error en Módulo</h2>
              <p className="text-xs text-slate-400 mt-0.5">{this.props.fallbackTitle || "Ocurrió una excepción durante el renderizado."}</p>
            </div>
          </div>
          
          <div className="p-4 bg-black/50 border border-slate-800 rounded-lg text-xs font-mono text-rose-300 space-y-2 overflow-auto max-h-60 custom-scrollbar">
            <p className="font-bold text-sm text-rose-400">{this.state.error && this.state.error.toString()}</p>
            {this.state.errorInfo && (
              <pre className="text-[10px] text-slate-405 leading-normal select-text whitespace-pre-wrap">
                {this.state.errorInfo.componentStack}
              </pre>
            )}
          </div>
          
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-rose-900/30"
            >
              Recargar Aplicación
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all border border-slate-700"
            >
              Intentar Recuperar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
