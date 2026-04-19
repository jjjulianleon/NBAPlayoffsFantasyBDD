import Badge from './Badge';
import RoundChip from './RoundChip';
import TeamLogo from './TeamLogo';
import PlayerAvatar from './PlayerAvatar';
import { getStatusTone, formatDateTime, getPlayerName } from '../lib/utils';
import { getTeamMeta } from '../lib/teamData';

function ScoreRow({ label, score, winner, teamMeta }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <TeamLogo teamId={teamMeta?.teamId} teamAbbr={teamMeta?.abbreviation || label} size="sm" />
        <div>
          <p className="font-display text-lg uppercase tracking-wide text-[--color-text]">{label}</p>
          <p className="text-xs text-[--color-text-muted]">{teamMeta?.fullName || 'Equipo NBA'}</p>
        </div>
      </div>
      <span className={`font-stat text-4xl font-black tracking-tight ${winner ? 'text-[--color-text]' : 'text-[--color-text-muted]'}`}>{score ?? '—'}</span>
    </div>
  );
}

export default function GameCard({ game, onOpen }) {
  const homeMeta = getTeamMeta(game.home_team);
  const awayMeta = getTeamMeta(game.away_team);
  const homeWins = Number(game.home_score) >= Number(game.away_score);

  return (
    <button type="button" onClick={onOpen} className="surface-card group w-full p-5 text-left hover:border-[--color-accent]/50">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RoundChip round={game.playoff_round} />
          <span className="text-xs uppercase tracking-[0.18em] text-[--color-text-muted]">{formatDateTime(game.game_date)}</span>
        </div>
        <Badge tone={getStatusTone(game.status)}>{String(game.status || 'scheduled').toUpperCase()}</Badge>
      </div>

      <div className="mt-5 space-y-4">
        <ScoreRow label={game.home_team} score={game.home_score} winner={homeWins} teamMeta={homeMeta} />
        <ScoreRow label={game.away_team} score={game.away_score} winner={!homeWins} teamMeta={awayMeta} />
      </div>

      {(game.top_home || game.top_away) && (
        <div className="mt-5 border-t border-[--color-border] pt-4">
          <p className="mb-3 text-[10px] font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">Maximos anotadores</p>
          <div className="space-y-2">
            {[game.top_home, game.top_away].filter(Boolean).map((player, index) => (
              <div key={`${player.player_id || index}`} className="flex items-center gap-3 text-sm text-[--color-text-muted]">
                <PlayerAvatar
                  playerId={player.player_id}
                  playerName={getPlayerName(player)}
                  teamAbbr={index === 0 ? game.home_team : game.away_team}
                  size="xs"
                />
                <span className="truncate">{getPlayerName(player)}</span>
                <span className="ml-auto font-stat text-xl font-bold tracking-tight text-[--color-text]">{player.points || player.pts || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </button>
  );
}
