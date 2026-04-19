import { useState } from 'react';
import { getInitials, getPlayerName } from '../lib/utils';
import { getTeamColor } from '../lib/teamData';

const SIZES = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 72,
  xl: 128,
};

export default function PlayerAvatar({
  playerId,
  playerName,
  size = 'md',
  teamId,
  teamAbbr,
  className = '',
}) {
  const [hasError, setHasError] = useState(false);
  const dimension = SIZES[size] ?? SIZES.md;
  const resolvedName = playerName || `Jugador ${playerId}`;
  const background = getTeamColor(teamAbbr || teamId);

  if (!playerId || hasError) {
    return (
      <div
        className={`inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-[--color-border-strong] ${className}`}
        style={{ width: dimension, height: dimension, backgroundColor: background }}
        aria-label={`Avatar alternativo de ${resolvedName}`}
      >
        <span className="font-display text-xs uppercase tracking-wide text-white">{getInitials(getPlayerName({ player_name: resolvedName }))}</span>
      </div>
    );
  }

  return (
    <img
      src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${playerId}.png`}
      alt={`Foto de ${resolvedName}`}
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 rounded-full object-cover object-top ring-2 ${className}`}
      style={{ width: dimension, height: dimension, backgroundColor: background, borderColor: background }}
      onError={() => setHasError(true)}
    />
  );
}
