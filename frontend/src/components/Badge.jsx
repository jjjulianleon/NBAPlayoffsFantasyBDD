import { cn } from '../lib/utils';

const TONES = {
  orange: 'badge-orange',
  red: 'badge-red',
  blue: 'badge-blue',
  green: 'badge-green',
  gold: 'badge-gold',
  gray: 'badge-gray',
};

export default function Badge({ tone = 'gray', className = '', children }) {
  return <span className={cn('badge', TONES[tone] ?? TONES.gray, className)}>{children}</span>;
}
