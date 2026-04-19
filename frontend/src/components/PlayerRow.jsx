import { ChevronRight } from 'lucide-react';
import PlayerAvatar from './PlayerAvatar';
import TeamLogo from './TeamLogo';
import { getTeamColor } from '../lib/teamData';
import { formatNumber, formatPercent, getPlayerName, getTeamAbbr, getTeamIdFromPlayer } from '../lib/utils';

export default function PlayerRow({ player, onClick, trailing, compact = false }) {
  const teamAbbr = getTeamAbbr(player);
  const teamId = getTeamIdFromPlayer(player);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-[--color-border] bg-[--color-bg-elev] px-4 py-3 text-left transition-colors duration-150 hover:border-[--color-border-strong] hover:bg-[--color-bg-elev-2]"
      style={{ borderLeftWidth: 3, borderLeftColor: getTeamColor(teamAbbr) }}
    >
      <PlayerAvatar playerId={player.player_id} playerName={getPlayerName(player)} teamId={teamId} teamAbbr={teamAbbr} size={compact ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-display text-lg uppercase tracking-wide text-[--color-text]">{getPlayerName(player)}</p>
          <TeamLogo teamId={teamId} teamAbbr={teamAbbr} size="xs" />
          <span className="text-xs font-body font-semibold uppercase tracking-[0.18em] text-[--color-text-muted]">{teamAbbr}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-[--color-text-muted]">
          <span>{player.position || '—'}</span>
          <span className="font-stat text-base font-bold tracking-tight text-[--color-text]">{formatNumber(player.season_ppg || player.avg_pts || player.last5_ppg || 0)}</span>
          <span>PPG</span>
          {player.pts_pct_change != null ? (
            <span className={Number(player.pts_pct_change) >= 0 ? 'text-[--color-success]' : 'text-[--color-danger]'}>
              {formatPercent(player.pts_pct_change)}
            </span>
          ) : null}
        </div>
      </div>
      {trailing}
      <ChevronRight className="h-4 w-4 shrink-0 text-[--color-text-dim] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[--color-text]" />
    </button>
  );
}
