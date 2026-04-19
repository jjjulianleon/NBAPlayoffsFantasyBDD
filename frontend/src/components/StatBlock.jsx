import { cn, formatPercent } from '../lib/utils';

export default function StatBlock({ label, value, deltaPct, className = '' }) {
  const delta =
    deltaPct == null
      ? null
      : Number(deltaPct) > 0
        ? 'text-[--color-success]'
        : Number(deltaPct) < 0
          ? 'text-[--color-danger]'
          : 'text-[--color-text-muted]';

  return (
    <div className={cn('stat-block', className)}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {deltaPct != null ? <span className={cn('text-xs font-body font-semibold', delta)}>{formatPercent(deltaPct)}</span> : null}
    </div>
  );
}
