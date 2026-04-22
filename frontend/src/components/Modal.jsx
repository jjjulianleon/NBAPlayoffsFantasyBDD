import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'max-w-xl',
  scrollable = false,
  panelClassName = '',
  bodyClassName = '',
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/78 px-4 py-8">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar modal" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'modal-panel relative z-[71] w-full rounded-[20px] border border-[--color-border-strong] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] outline-none',
          size,
          scrollable && 'flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden',
          panelClassName,
        )}
        style={{ background: 'linear-gradient(180deg, rgba(28,28,33,0.98) 0%, rgba(20,20,23,1) 100%)' }}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl uppercase tracking-wide text-[--color-text]">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar modal">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={cn(scrollable && 'min-h-0 flex-1 overflow-y-auto', bodyClassName)}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
