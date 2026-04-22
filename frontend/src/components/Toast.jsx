/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  function pushToast({ title, message, tone = 'info' }) {
    const id = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, title, message, tone }]);
    return id;
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  const value = useMemo(
    () => ({
      pushToast,
      dismissToast,
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-full max-w-sm flex-col gap-3">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const Icon = ICONS[toast.tone] ?? ICONS.info;

  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(toast.id), 4000);
    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast.id]);

  return (
    <div
      className="pointer-events-auto animate-toast-in rounded-[18px] border border-[--color-border-strong] p-4 shadow-[0_20px_45px_rgba(0,0,0,0.38)] backdrop-blur-xl"
      style={{ background: 'linear-gradient(180deg, rgba(24,24,28,0.94) 0%, rgba(14,14,17,0.96) 100%)' }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full border border-white/8 bg-[rgba(255,255,255,0.04)] p-2 text-[--color-accent] backdrop-blur-md">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm font-semibold text-[--color-text] [text-shadow:0_1px_0_rgba(0,0,0,0.2)]">{toast.title}</p>
          {toast.message ? <p className="mt-1 text-sm leading-6 text-white/78">{toast.message}</p> : null}
        </div>
        <button type="button" className="icon-button h-8 w-8" onClick={() => onDismiss(toast.id)} aria-label="Cerrar notificacion">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de ToastProvider');
  }
  return context;
}
