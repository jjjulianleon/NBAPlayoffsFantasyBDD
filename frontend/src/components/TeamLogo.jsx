import { useState } from 'react';
import { getTeamMeta, getTeamColor } from '../lib/teamData';

const SIZES = {
  xs: 20,
  sm: 28,
  md: 44,
  lg: 64,
};

export default function TeamLogo({ teamId, teamAbbr, size = 'sm', className = '' }) {
  const [hasError, setHasError] = useState(false);
  const meta = getTeamMeta(teamId || teamAbbr);
  const dimension = SIZES[size] ?? SIZES.sm;
  const background = getTeamColor(teamAbbr || meta?.abbreviation);

  if (!meta || hasError) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-full ring-1 ring-[--color-border] ${className}`}
        style={{ width: dimension, height: dimension, backgroundColor: background }}
        aria-label={`Logo alternativo de ${meta?.fullName || teamAbbr || 'equipo'}`}
      >
        <span className="font-display text-[10px] uppercase text-white">{meta?.abbreviation || teamAbbr || 'NBA'}</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full ring-1 ring-[--color-border] ${className}`}
      style={{ width: dimension, height: dimension, backgroundColor: 'var(--color-bg-elev-2)' }}
    >
      <img
        src={`https://cdn.nba.com/logos/nba/${meta.teamId}/primary/L/logo.svg`}
        alt={`${meta.fullName} logo`}
        loading="lazy"
        decoding="async"
        className="h-[72%] w-[72%] object-contain"
        onError={() => setHasError(true)}
      />
    </div>
  );
}
