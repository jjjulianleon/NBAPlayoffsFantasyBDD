import { ArrowRight } from 'lucide-react';

export default function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="surface-card flex min-h-72 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[--color-border-strong] bg-[--color-bg-elev-2]">
        {Icon ? <Icon className="h-8 w-8 text-[--color-accent]" /> : null}
      </div>
      <div className="space-y-2">
        <h3 className="font-display text-2xl uppercase tracking-wide text-[--color-text]">{title}</h3>
        <p className="max-w-md text-sm text-[--color-text-muted]">{body}</p>
      </div>
      {action ? (
        <button type="button" onClick={action.onClick} className="button-secondary inline-flex items-center gap-2">
          {action.label}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
