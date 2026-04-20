import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Radar, BarChart3 } from 'lucide-react';
import { api } from '../api';
import GameCard from '../components/GameCard';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import RoundChip from '../components/RoundChip';
import TeamLogo from '../components/TeamLogo';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import PlayerAvatar from '../components/PlayerAvatar';
import { formatDateLabel, formatNumber, getPlayerName } from '../lib/utils';
import { getTeamMeta } from '../lib/teamData';

const ROUND_FILTERS = [
  { key: 'all', label: 'Todas', round: null, className: 'chip-gray' },
  { key: '1', label: 'R1', round: 1, className: 'chip-r1' },
  { key: '2', label: 'Semis', round: 2, className: 'chip-semi' },
  { key: '3', label: 'CF', round: 3, className: 'chip-cf' },
  { key: '4', label: 'Finales', round: 4, className: 'chip-finals' },
];

function extractTeamStatBlock(detail, side) {
  return (
    detail?.[`${side}_team_stats`] ||
    detail?.[`${side}TeamStats`] ||
    detail?.team_stats?.[side] ||
    detail?.teamStats?.[side] ||
    null
  );
}

function extractPlayerRows(detail, side) {
  const direct =
    detail?.[`${side}_players`] ||
    detail?.[`${side}Players`] ||
    detail?.players?.[side] ||
    detail?.player_stats?.[side] ||
    detail?.playerStats?.[side];

  if (Array.isArray(direct)) {
    return direct;
  }

  const flatRows = detail?.player_stats || detail?.playerStats || detail?.box_score || detail?.boxScore;
  if (Array.isArray(flatRows)) {
    return flatRows.filter((row) => row.team === side || row.side === side || row.team_side === side);
  }

  return [];
}

function getStatEntries(stats) {
  if (!stats || typeof stats !== 'object') {
    return [];
  }

  const labels = {
    points: 'PTS',
    pts: 'PTS',
    rebounds: 'REB',
    reb: 'REB',
    assists: 'AST',
    ast: 'AST',
    steals: 'STL',
    stl: 'STL',
    blocks: 'BLK',
    blk: 'BLK',
    turnovers: 'TO',
    plus_minus: '+/-',
    fg_pct: 'FG%',
    three_pct: '3P%',
    ft_pct: 'FT%',
    offensive_rebounds: 'OREB',
    defensive_rebounds: 'DREB',
  };

  return Object.entries(labels)
    .filter(([key]) => stats[key] != null)
    .slice(0, 8)
    .map(([key, label]) => ({
      key,
      label,
      value: typeof stats[key] === 'number' ? formatNumber(stats[key]) : stats[key],
    }));
}

function TeamStatCard({ label, stats }) {
  return (
    <div className="game-detail-card col-span-12 rounded-[22px] border border-[--color-border-strong] bg-[linear-gradient(180deg,rgba(28,28,33,0.98),rgba(18,18,22,0.98))] p-4 md:col-span-6">
      <div className="mb-4 flex items-center gap-3">
        <BarChart3 className="h-4 w-4 text-[--color-accent]" />
        <p className="text-[10px] uppercase tracking-[0.22em] text-[--color-text-muted]">Stats de {label}</p>
      </div>
      {getStatEntries(stats).length ? (
        <div className="grid grid-cols-2 gap-3">
          {getStatEntries(stats).map((stat) => (
            <div key={stat.key} className="game-detail-stat rounded-[18px] border border-[--color-border] bg-[rgba(10,10,11,0.9)] px-3 py-3 transition-[transform,border-color,box-shadow,background-color] duration-500 ease-out hover:-translate-y-0.5 hover:border-[--color-border-strong] hover:bg-[rgba(14,14,17,0.98)] hover:shadow-[0_16px_28px_rgba(0,0,0,0.22)]">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-dim]">{stat.label}</p>
              <p className="font-stat text-4xl font-black tracking-tight text-[--color-text]">{stat.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-[--color-text-muted]">El endpoint respondio sin bloque agregado de stats de equipo para este lado.</p>
      )}
    </div>
  );
}

function PlayerStatRows({ title, players }) {
  if (!players.length) {
    return null;
  }

  return (
    <div className="game-detail-card rounded-[22px] border border-[--color-border-strong] bg-[linear-gradient(180deg,rgba(28,28,33,0.98),rgba(18,18,22,0.98))] p-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-[--color-text-muted]">{title}</p>
      <div className="mt-4 space-y-3">
        {players.slice(0, 8).map((player, index) => (
          <div
            key={player.player_id || player.player_name || index}
            className="game-detail-row group flex items-center gap-3 rounded-[18px] border border-[--color-border] bg-[rgba(10,10,11,0.9)] px-3 py-3 transition-[transform,border-color,background-color,box-shadow] duration-500 ease-out hover:-translate-y-0.5 hover:border-[--color-border-strong] hover:bg-[rgba(16,16,19,0.98)] hover:shadow-[0_16px_30px_rgba(0,0,0,0.18)]"
          >
            <PlayerAvatar playerId={player.player_id} playerName={getPlayerName(player)} teamAbbr={player.team || player.team_abbr || player.abbreviation} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-body text-sm font-semibold text-[--color-text]">{getPlayerName(player)}</p>
              <p className="text-xs uppercase tracking-[0.18em] text-[--color-text-dim]">
                {[
                  player.minutes_played || player.minutes || null,
                  player.position || null,
                ].filter(Boolean).join(' · ') || 'Rotacion'}
              </p>
            </div>
            <div className="flex items-center gap-4 text-right">
              {[
                ['PTS', player.points ?? player.pts],
                ['REB', player.rebounds ?? player.reb],
                ['AST', player.assists ?? player.ast],
              ]
                .filter(([, value]) => value != null)
                .map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-dim]">{label}</p>
                    <p className="font-stat text-2xl font-black tracking-tight text-[--color-text]">{value}</p>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreboardHero({ game, homeMeta, awayMeta }) {
  const rows = [
    { meta: homeMeta, label: game.home_team, score: game.home_score, sideLabel: 'Local' },
    { meta: awayMeta, label: game.away_team, score: game.away_score, sideLabel: 'Visita' },
  ];

  return (
    <div className="game-detail-hero col-span-12 overflow-hidden rounded-[24px] border border-[--color-border-strong] bg-[linear-gradient(135deg,rgba(28,28,33,0.98),rgba(12,12,15,1))]">
      <div className="border-b border-[--color-border] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <RoundChip round={game.playoff_round} />
          <Badge tone="gray">{String(game.status).toUpperCase()}</Badge>
          <span className="text-xs uppercase tracking-[0.18em] text-[--color-text-muted]">
            {formatDateLabel(game.game_date, { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-2">
        {rows.map((team, index) => (
          <div key={team.label} className={`px-5 py-5 ${index === 0 ? 'border-b border-[--color-border] md:border-b-0 md:border-r' : ''}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[--color-border] bg-[rgba(10,10,11,0.9)]">
                  <TeamLogo teamId={team.meta?.teamId} teamAbbr={team.label} size="md" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[--color-text-dim]">{team.sideLabel}</p>
                  <p className="truncate font-display text-4xl uppercase tracking-tight text-[--color-text]">{team.label}</p>
                  <p className="truncate text-sm text-[--color-text-muted]">{team.meta?.fullName || 'Equipo NBA'}</p>
                </div>
              </div>
              <p className="font-stat text-7xl font-black tracking-tight text-[--color-text]">{team.score ?? '—'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpandedGame({ game, detail, detailLoading }) {
  const homeMeta = getTeamMeta(game.home_team);
  const awayMeta = getTeamMeta(game.away_team);
  const homeTeamStats = extractTeamStatBlock(detail, 'home');
  const awayTeamStats = extractTeamStatBlock(detail, 'away');
  const homePlayers = extractPlayerRows(detail, 'home');
  const awayPlayers = extractPlayerRows(detail, 'away');

  return (
    <div className="game-detail-scroll max-h-[78vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-12 grid-flow-dense gap-4">
        <ScoreboardHero game={game} homeMeta={homeMeta} awayMeta={awayMeta} />

        {detailLoading ? (
          <>
            <div className="col-span-12 md:col-span-6"><Skeleton variant="card" className="h-72 rounded-[22px]" /></div>
            <div className="col-span-12 md:col-span-6"><Skeleton variant="card" className="h-72 rounded-[22px]" /></div>
            <div className="col-span-12 md:col-span-6"><Skeleton variant="card" className="h-[360px] rounded-[22px]" /></div>
            <div className="col-span-12 md:col-span-6"><Skeleton variant="card" className="h-[360px] rounded-[22px]" /></div>
          </>
        ) : homeTeamStats || awayTeamStats || homePlayers.length || awayPlayers.length ? (
          <>
            <TeamStatCard label={homeMeta?.fullName || game.home_team} stats={homeTeamStats} />
            <TeamStatCard label={awayMeta?.fullName || game.away_team} stats={awayTeamStats} />
            <div className="col-span-12 md:col-span-6">
              <PlayerStatRows title={`Jugadores · ${homeMeta?.fullName || game.home_team}`} players={homePlayers} />
            </div>
            <div className="col-span-12 md:col-span-6">
              <PlayerStatRows title={`Jugadores · ${awayMeta?.fullName || game.away_team}`} players={awayPlayers} />
            </div>
          </>
        ) : (
          <div className="game-detail-card col-span-12 rounded-[22px] border border-[--color-border-strong] bg-[linear-gradient(180deg,rgba(28,28,33,0.98),rgba(18,18,22,0.98))] p-5">
            <p className="text-sm leading-6 text-[--color-text-muted]">
              Este partido no tiene box score detallado disponible en la base actual, asi que el modal muestra solo el resumen general del marcador.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Games() {
  const [round, setRound] = useState('all');
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const active = ROUND_FILTERS.find((item) => item.key === round);
    api.games(active?.round ?? null, 50)
      .then(setGames)
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, [round]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedGame?.game_id) {
      setDetail(null);
      setDetailLoading(false);
      return undefined;
    }

    setDetailLoading(true);
    setDetail(null);

    api.gameDetail(selectedGame.game_id)
      .then((response) => {
        if (!cancelled) {
          setDetail(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedGame]);

  const groupedGames = useMemo(() => {
    return games.reduce((groups, game) => {
      const key = formatDateLabel(game.game_date, { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(game);
      return groups;
    }, {});
  }, [games]);

  return (
    <main className="page-shell mx-auto max-w-7xl">
      <header className="flex flex-col gap-6 pb-8 pt-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-body font-semibold uppercase tracking-[0.28em] text-[--color-text-muted]">Calendario de transmision</p>
          <h1 className="mt-4 font-display text-5xl uppercase tracking-tight text-[--color-text] md:text-6xl">Partidos de playoffs</h1>
        </div>

        <div className="flex flex-col gap-4 xl:items-end">
          <div className="flex flex-wrap gap-2">
            {ROUND_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => {
                  setLoading(true);
                  setRound(filter.key);
                }}
                className={`badge ${round === filter.key ? filter.className : 'badge-gray'}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[--color-border] bg-[--color-bg-elev] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[--color-text-muted]">
            <CalendarRange className="h-4 w-4" />
            Ultimos 30 dias
          </div>
        </div>
      </header>

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} variant="card" className="h-60" />)}
        </div>
      ) : games.length === 0 ? (
        <EmptyState icon={Radar} title="No se encontraron partidos" body="Cambia el filtro de ronda o espera a que el backend devuelva filas de prediccion." />
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedGames).map(([date, items]) => (
            <section key={date} className="space-y-4">
              <div className="sticky top-20 z-10 inline-flex rounded-full border border-[--color-border] bg-[--color-bg]/90 px-4 py-2 text-sm font-display uppercase tracking-[0.24em] text-[--color-text-muted] backdrop-blur-xl">
                {date}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {items.map((game) => (
                  <GameCard key={game.game_id} game={game} onOpen={() => setSelectedGame(game)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal open={Boolean(selectedGame)} onClose={() => setSelectedGame(null)} title="Resumen del partido" size="max-w-6xl">
        {selectedGame ? <ExpandedGame game={selectedGame} detail={detail} detailLoading={detailLoading} /> : null}
      </Modal>
    </main>
  );
}
