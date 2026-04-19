import { cn } from '../lib/utils';

const VARIANTS = {
  row: 'h-16 w-full rounded-lg',
  card: 'h-48 w-full rounded-lg',
  avatar: 'h-12 w-12 rounded-full',
};

export default function Skeleton({ variant = 'row', className = '' }) {
  return <div className={cn('skeleton', VARIANTS[variant] ?? VARIANTS.row, className)} aria-hidden="true" />;
}
