import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0c] text-zinc-100 flex items-center justify-center p-6 font-mono">
          <div className="max-w-xl w-full bg-[#121215] border border-rose-900/60 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
              <div className="p-2 bg-rose-950/80 border border-rose-700/60 rounded-lg text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white uppercase tracking-wider">
                  Application Exception Intercepted
                </h1>
                <p className="text-xs text-zinc-400 font-sans">
                  The UI encountered an unexpected runtime error.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-rose-300 font-semibold bg-rose-950/40 border border-rose-900/40 p-3 rounded">
                {this.state.error?.toString() || 'Unknown Error'}
              </p>

              {this.state.errorInfo?.componentStack && (
                <details className="bg-zinc-950 border border-zinc-800 rounded p-2 text-[11px] text-zinc-400 overflow-x-auto">
                  <summary className="cursor-pointer text-zinc-300 font-bold mb-1">
                    Component Stack Trace
                  </summary>
                  <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                </details>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-zinc-800">
              <span className="text-[11px] text-zinc-500">WRP Control Plane Engine</span>
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded flex items-center gap-2 transition-colors shadow-md"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Application</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
