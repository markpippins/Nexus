import React, { useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let _addToast: ((message: string, type: ToastType) => void) | null = null;
let _toastId = 0;

export function showToast(message: string, type: ToastType = 'error') {
  _addToast?.(message, type);
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
  error: <XCircle className="w-4 h-4 text-rose-400 shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
  info: <CheckCircle className="w-4 h-4 text-blue-400 shrink-0" />,
};

const BG: Record<ToastType, string> = {
  success: 'bg-emerald-950/90 border-emerald-800/60 text-emerald-200',
  error: 'bg-rose-950/90 border-rose-800/60 text-rose-200',
  warning: 'bg-amber-950/90 border-amber-800/60 text-amber-200',
  info: 'bg-blue-950/90 border-blue-800/60 text-blue-200',
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  }, []);

  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border shadow-lg font-mono text-xs animate-in fade-in slide-in-from-bottom-2 ${BG[t.type]}`}
        >
          {ICONS[t.type]}
          <span className="flex-1 break-words">{t.message}</span>
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="text-current opacity-50 hover:opacity-100 shrink-0 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
};
