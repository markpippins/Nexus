import React, { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

let _showConfirm: ((message: string) => Promise<boolean>) | null = null;

export function showConfirm(message: string): Promise<boolean> {
  if (_showConfirm) return _showConfirm(message);
  // Fallback to window.confirm if the dialog isn't mounted yet
  return Promise.resolve(window.confirm(message));
}

export const ConfirmDialog: React.FC = () => {
  const [state, setState] = useState<ConfirmState | null>(null);

  const show = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ message, resolve });
    });
  }, []);

  useEffect(() => {
    _showConfirm = show;
    return () => { _showConfirm = null; };
  }, [show]);

  const handleResult = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  if (!state) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-amber-950/50 border border-amber-800/40 shrink-0 mt-0.5">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Confirm</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{state.message}</p>
          </div>
          <button
            onClick={() => handleResult(false)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => handleResult(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] hover:border-[var(--border-subtle)] transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => handleResult(true)}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[var(--accent-color)] text-slate-950 transition cursor-pointer"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
