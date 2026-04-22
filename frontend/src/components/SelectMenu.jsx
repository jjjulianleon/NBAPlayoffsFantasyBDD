import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export default function SelectMenu({
  id,
  label,
  value,
  options,
  onChange,
  className = '',
  menuClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (containerRef.current?.contains(event.target)) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'field flex h-auto min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left !font-black text-[--color-text]',
          open && 'border-[--color-accent] ring-2 ring-[--color-accent]/20',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm text-[--color-text]">{selected?.label}</span>
          {selected?.description ? (
            <span className="mt-1 block truncate text-xs font-medium text-[--color-text-muted]">
              {selected.description}
            </span>
          ) : null}
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-[--color-text-muted] transition-transform duration-200', open && 'rotate-180 text-[--color-accent]')} />
      </button>

      {open ? (
        <div
          className={cn(
            'surface-card absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[80] overflow-hidden border-[--color-border-strong] bg-[linear-gradient(180deg,rgba(20,20,23,0.98),rgba(28,28,33,0.98))] shadow-2xl',
            menuClassName,
          )}
        >
          <div className="border-b border-[--color-border] px-4 py-3">
            <p className="text-[10px] font-body font-semibold uppercase tracking-[0.18em] text-[--color-text-muted]">{label}</p>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || option.label}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-start justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-150',
                    active
                      ? 'bg-[--color-accent]/12 text-[--color-text]'
                      : 'text-[--color-text-muted] hover:bg-[--color-bg-elev-2] hover:text-[--color-text]',
                  )}
                  role="option"
                  aria-selected={active}
                >
                  <div className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', active ? 'font-black text-[--color-text]' : 'font-semibold')}>
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className={cn('mt-1 block truncate text-xs', active ? 'text-[--color-text-muted]' : 'text-[--color-text-dim]')}>
                        {option.description}
                      </span>
                    ) : null}
                  </div>
                  {active ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-[--color-accent]" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
