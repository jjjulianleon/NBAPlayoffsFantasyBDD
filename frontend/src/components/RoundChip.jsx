import { cn, getRoundConfig } from '../lib/utils';

export default function RoundChip({ round, className = '' }) {
  const config = getRoundConfig(round);
  return <span className={cn('badge', config.className, className)}>{config.label}</span>;
}
