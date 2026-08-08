import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Catches render/lifecycle errors in its subtree and shows a themed
 * fallback with the error message and a "Try Again" button instead of
 * letting React unmount the whole tree. Wrap tab content in App.tsx so a
 * data-shape drift from any backend can never blank the entire dashboard.
 *
 * NOTE: this project has no @types/react — react's Component resolves as
 * implicit any via allowJs, so we extend it through an any cast to keep the
 * class-component API while satisfying the loose typechecker. Runtime
 * behavior is unaffected: React detects the error-boundary lifecycle
 * methods on the class prototype.
 */
export class ErrorBoundary extends (React.Component as any) {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: any) {
    console.error(`[ErrorBoundary] ${this.props.label || 'component'} crashed:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 text-center bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl space-y-3">
          <div className="text-sm font-bold text-[var(--text-primary)]">
            {this.props.label || 'This view'} failed to render
          </div>
          <p className="text-sm font-mono text-[var(--text-muted)] break-all max-w-2xl mx-auto">
            {this.state.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-4 py-1.5 rounded-lg text-sm font-bold bg-[var(--accent-color)] text-slate-950 hover:bg-[var(--accent-hover)] transition cursor-pointer"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
