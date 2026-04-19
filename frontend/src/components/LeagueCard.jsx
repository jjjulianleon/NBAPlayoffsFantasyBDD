import { Link } from 'react-router-dom';
import { Medal, Users } from 'lucide-react';
import Badge from './Badge';
import { formatInteger } from '../lib/utils';

const MEDAL_TONES = ['gold', 'gray', 'orange'];

export default function LeagueCard({ league, preview = [] }) {
  const tone =
    league.draft_status === 'completed' ? 'green' : league.draft_status === 'in_progress' ? 'orange' : 'gray';

  return (
    <article className="surface-card flex h-full flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">Liga fantasy</p>
          <h3 className="mt-2 font-display text-3xl uppercase tracking-wide text-[--color-text]">{league.league_name}</h3>
        </div>
        <Badge tone={tone}>{league.draft_status === 'completed' ? 'completado' : league.draft_status === 'in_progress' ? 'en curso' : 'pendiente'}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-3">
          <p className="text-[10px] font-body font-semibold uppercase tracking-[0.2em] text-[--color-text-muted]">Miembros</p>
          <div className="mt-2 flex items-end gap-2">
            <Users className="h-4 w-4 text-[--color-accent]" />
            <span className="font-stat text-3xl font-black tracking-tight text-[--color-text]">
              {formatInteger(league.member_count)}
            </span>
            <span className="pb-1 text-xs text-[--color-text-muted]">/ {league.max_teams}</span>
          </div>
        </div>
        <div className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-3">
          <p className="text-[10px] font-body font-semibold uppercase tracking-[0.2em] text-[--color-text-muted]">Puntuacion</p>
          <p className="mt-2 font-display text-xl uppercase tracking-wide text-[--color-text]">{league.scoring_type}</p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">Mini tabla</p>
        {preview.length > 0 ? (
          preview.slice(0, 3).map((team, index) => (
            <div key={team.fantasy_team_id} className="flex items-center gap-3 rounded-md border border-[--color-border] bg-[--color-bg-elev-2] px-3 py-2">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[--color-bg] ring-1 ring-[--color-border]"
                style={{
                  color:
                    MEDAL_TONES[index] === 'gold'
                      ? 'var(--color-accent-gold)'
                      : MEDAL_TONES[index] === 'orange'
                        ? 'var(--color-accent)'
                        : 'var(--color-text-muted)',
                }}
              >
                <Medal className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-sm font-semibold text-[--color-text]">{team.team_name}</p>
                <p className="truncate text-xs text-[--color-text-muted]">@{team.username}</p>
              </div>
              <span className="font-stat text-2xl font-black tracking-tight text-[--color-text]">{formatInteger(team.total_points)}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-[--color-text-muted]">Todavia no hay posiciones. Completa el draft primero.</p>
        )}
      </div>

      <Link to={`/leagues/${league.league_id}`} className="button-secondary mt-auto text-center">
        Abrir liga
      </Link>
    </article>
  );
}
