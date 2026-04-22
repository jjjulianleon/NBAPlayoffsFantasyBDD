import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, BrainCircuit, NotebookTabs, Radar, ShieldAlert } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import PlayerAvatar from '../components/PlayerAvatar';
import RoundChip from '../components/RoundChip';
import Skeleton from '../components/Skeleton';
import StatBlock from '../components/StatBlock';
import Table from '../components/Table';
import TeamLogo from '../components/TeamLogo';
import { formatDateLabel, formatDateTime, formatNumber, formatPercent, getPlayerName, normalizeScoutingText } from '../lib/utils';
import { getTeamColor } from '../lib/teamData';

const TABS = [
  { key: 'overview', label: 'Resumen' },
  { key: 'game-log', label: 'Registro' },
  { key: 'scouting', label: 'Scouting IA' },
  { key: 'fantasy-impact', label: 'Impacto fantasy' },
];

function Sparkline({ games }) {
  if (games.length === 0) {
    return null;
  }

  const points = games.map((game) => Number(game.fantasy_points) || 0);
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const width = 500;
  const height = 160;
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
      <defs>
        <linearGradient id="sparkline" x1="0%" x2="100%">
          <stop offset="0%" stopColor="var(--color-accent)" />
          <stop offset="100%" stopColor="var(--round-cf)" />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke="url(#sparkline)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export default function PlayerDetail() {
  const { id } = useParams();
  const [player, setPlayer] = useState(null);
  const [games, setGames] = useState([]);
  const [limit, setLimit] = useState(20);
  const [activeTab, setActiveTab] = useState('overview');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [streaks, setStreaks] = useState([]);
  const [exposure, setExposure] = useState([]);

  useEffect(() => {
    api.player(id).then(setPlayer).catch(() => {});
    api.playerGames(id, limit).then(setGames).catch(() => {});
    api.hotCold(100).then(setStreaks).catch(() => {});
    api.playerExposure(id).then(setExposure).catch(() => setExposure([]));
  }, [id, limit]);

  const streak = useMemo(() => {
    const match = streaks.find((item) => Number(item.player_id) === Number(id));
    if (match) {
      return match;
    }
    if (!player || games.length === 0) {
      return null;
    }
    const lastFive = games.slice(0, 5);
    const average = lastFive.reduce((sum, game) => sum + Number(game.points || 0), 0) / Math.max(lastFive.length, 1);
    const season = Number(player.season_ppg || 0);
    const delta = season ? ((average - season) / season) * 100 : 0;
    return {
      streak_status: delta > 20 ? 'hot' : delta < -20 ? 'cold' : 'neutral',
      pts_pct_change: delta.toFixed(0),
      last5_ppg: average,
      season_ppg: player.season_ppg,
    };
  }, [games, id, player, streaks]);

  const activeReport = report && Number(report.player_id) === Number(id) ? report : null;
  const scoutingParagraphs = normalizeScoutingText(activeReport?.report_text);
  const teamColor = getTeamColor(player?.team);
  const lastFiveAverage = games.slice(0, 5).reduce((sum, game) => sum + Number(game.points || 0), 0) / Math.max(games.slice(0, 5).length, 1);
  const topGame = Math.max(...games.map((game) => Number(game.fantasy_points) || 0), 0);

  const gameColumns = [
    { key: 'game_date', label: 'Fecha', render: (row) => formatDateLabel(row.game_date, { month: 'short', day: 'numeric', year: 'numeric' }) },
    { key: 'playoff_round', label: 'Ronda', render: (row) => <RoundChip round={row.playoff_round} /> },
    { key: 'matchup', label: 'Cruce' },
    { key: 'minutes_played', label: 'MIN', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{row.minutes_played}</span> },
    { key: 'points', label: 'PTS', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{row.points}</span> },
    { key: 'rebounds', label: 'REB', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{row.rebounds}</span> },
    { key: 'assists', label: 'AST', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{row.assists}</span> },
    { key: 'steals', label: 'STL', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{row.steals}</span> },
    { key: 'blocks', label: 'BLK', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{row.blocks}</span> },
    { key: 'three_made', label: '3PM', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{row.three_made}</span> },
    { key: 'fg', label: 'FG', align: 'right', render: (row) => <span className="text-sm text-[--color-text]">{row.fg_made}/{row.fg_attempted}</span> },
    { key: 'ft', label: 'FT', align: 'right', render: (row) => <span className="text-sm text-[--color-text]">{row.ft_made}/{row.ft_attempted}</span> },
    { key: 'plus_minus', label: '+/-', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{row.plus_minus}</span> },
    { key: 'fantasy_points', label: 'FP', align: 'right', render: (row) => <span className="font-stat text-2xl font-black text-[--color-accent]">{formatNumber(row.fantasy_points)}</span> },
  ];

  async function loadScouting() {
    setReportLoading(true);
    try {
      const response = await api.scoutingReport(id);
      setReport(response);
    } catch (err) {
      setReport({ report_text: err.message });
    } finally {
      setReportLoading(false);
    }
  }

  if (!player) {
    return (
      <main className="page-shell mx-auto max-w-7xl space-y-6">
        <Skeleton variant="card" className="h-96" />
        <Skeleton variant="card" className="h-80" />
      </main>
    );
  }

  return (
    <main>
      <section
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${teamColor} 0%, var(--color-bg) 70%)` }}
      >
        <div className="mx-auto flex min-h-[360px] max-w-7xl items-end px-6 pb-10 pt-12">
          <div className="relative z-10 max-w-xl">
            <Link to="/players" className="mb-6 inline-flex items-center gap-2 text-sm text-white/72">
              <ArrowLeft className="h-4 w-4" />
              Volver a jugadores
            </Link>
            <div className="flex items-center gap-3 text-sm text-white/72">
              <TeamLogo teamId={player.team_id} teamAbbr={player.team} size="sm" />
              <span>{player.team_name}</span>
              <span className="font-stat text-3xl tracking-tight">#{player.jersey_number || '—'}</span>
            </div>
            <h1 className="mt-6 font-display text-4xl italic uppercase leading-none text-white/80 md:text-5xl">{player.first_name}</h1>
            <h2 className="font-display text-6xl uppercase leading-none tracking-tight text-white md:text-8xl">{player.last_name}</h2>
            <p className="mt-4 text-base text-white/72">
              {player.position || 'Posicion no disponible'}
            </p>
            <div className="mt-6">
              {streak?.streak_status === 'hot' ? (
                <Badge tone="red">En alza +{streak.pts_pct_change}%</Badge>
              ) : streak?.streak_status === 'cold' ? (
                <Badge tone="blue">En baja {streak.pts_pct_change}%</Badge>
              ) : (
                <Badge tone="gray">Estable</Badge>
              )}
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-0 right-0 hidden h-[360px] w-[360px] md:block">
            <PlayerAvatar playerId={player.player_id} playerName={getPlayerName(player)} teamId={player.team_id} teamAbbr={player.team} size="xl" className="h-full w-full rounded-none object-contain ring-0" />
          </div>
        </div>
      </section>

      <section className="border-y border-[--color-border] bg-[--color-bg-elev]">
        <div className="mx-auto grid max-w-7xl gap-4 px-6 py-6 md:grid-cols-5">
          <StatBlock label="PPG" value={formatNumber(player.season_ppg)} />
          <StatBlock label="RPG" value={formatNumber(player.season_rpg)} />
          <StatBlock label="APG" value={formatNumber(player.season_apg)} />
          <StatBlock label="SPG" value={formatNumber(player.season_spg)} />
          <StatBlock label="BPG" value={formatNumber(player.season_bpg)} />
        </div>
      </section>

      <section className="border-b border-[--color-border] px-6">
        <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-1 py-4 font-body text-sm font-semibold uppercase tracking-[0.18em] ${activeTab === tab.key ? 'border-[--color-accent] text-[--color-text]' : 'border-transparent text-[--color-text-muted]'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="page-shell mx-auto max-w-7xl">
        {activeTab === 'overview' ? (
          <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
            <div className="surface-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Arco de temporada</p>
                  <h3 className="mt-2 font-display text-3xl uppercase tracking-wide text-[--color-text]">Tendencia fantasy</h3>
                </div>
                  <Badge tone="orange">{games.length} partidos cargados</Badge>
              </div>
              <div className="mt-6 rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-4">
                <Sparkline games={[...games].reverse()} />
              </div>
              <p className="mt-4 text-sm leading-6 text-[--color-text-muted]">
                Promedio de {formatNumber(lastFiveAverage)} puntos en sus ultimos 5 partidos de playoffs, comparado con una base de {formatNumber(player.season_ppg)} puntos por juego en la temporada.
              </p>
            </div>

            <div className="space-y-6">
              <div className="surface-card p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Tendencias</p>
                <div className="mt-4 space-y-4">
                  <StatBlock label="Ult. 5 PPG" value={formatNumber(lastFiveAverage)} />
                  <StatBlock label="PPG temp." value={formatNumber(player.season_ppg)} />
                  <StatBlock label="Dif. %" value={formatPercent(streak?.pts_pct_change)} deltaPct={streak?.pts_pct_change} />
                </div>
              </div>
              <div className="surface-card p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Disponibilidad</p>
                <div className="mt-4">
                  {player.is_eliminated ? (
                    <>
                      <Badge tone="red">Fuera de competencia</Badge>
                      <p className="mt-3 text-sm leading-6 text-[--color-danger]">Su equipo fue eliminado. Ya no es elegible para ligas activas de playoffs.</p>
                    </>
                  ) : (
                    <>
                      <Badge tone="green">Activo</Badge>
                      <p className="mt-3 text-sm leading-6 text-[--color-text-muted]">Sigue vivo en el cuadro y mantiene todo su valor para multiplicadores de playoffs.</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'game-log' ? (
          <div className="space-y-5">
            <Table
              columns={gameColumns}
              rows={games}
              rowClassName={(row) => (Number(row.fantasy_points) === topGame ? 'border-l-2 border-l-[--color-accent]' : '')}
            />
            <div className="flex justify-center">
              <button type="button" className="button-secondary" onClick={() => setLimit((current) => current + 20)}>
                Mostrar mas partidos
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === 'scouting' ? (
          <div className="surface-card p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Scouting IA</p>
                <h3 className="mt-2 font-display text-3xl uppercase tracking-wide text-[--color-text]">Sala de reportes</h3>
              </div>
              <button type="button" className="button-primary" onClick={loadScouting} disabled={reportLoading}>
                <BrainCircuit className="h-4 w-4" />
                {reportLoading ? 'Generando...' : 'Generar reporte'}
              </button>
            </div>

            {reportLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton variant="row" />
                <Skeleton variant="row" />
                <Skeleton variant="row" />
              </div>
            ) : activeReport ? (
              <div className="mt-6 rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={activeReport.hot_cold_status === 'hot' ? 'red' : activeReport.hot_cold_status === 'cold' ? 'blue' : 'gray'}>
                    {activeReport.hot_cold_status === 'hot' ? 'caliente' : activeReport.hot_cold_status === 'cold' ? 'frio' : 'neutral'}
                  </Badge>
                  {activeReport.generated_by ? <Badge tone="orange">{activeReport.generated_by}</Badge> : null}
                </div>
                <div className="mt-5 space-y-4 text-sm leading-7 text-[--color-text-muted]">
                  {scoutingParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
                <div className="mt-6 rounded-md border border-[--color-border] bg-[--color-bg] px-4 py-3 text-xs uppercase tracking-[0.18em] text-[--color-text-muted]">
                  Generado por {activeReport.generated_by || 'modelo local'}. Valida siempre con tu propio criterio.
                </div>
              </div>
            ) : (
              <EmptyState icon={NotebookTabs} title="Todavia no hay reporte" body="La primera consulta puede tardar unos segundos porque el servidor genera y cachea el analisis." />
            )}
          </div>
        ) : null}

        {activeTab === 'fantasy-impact' ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="surface-card p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Presencia en tus ligas</p>
              {exposure.length ? (
                <div className="mt-6 space-y-3">
                  {exposure.map((entry) => (
                    <article key={`${entry.league_id}-${entry.fantasy_team_id}-${entry.roster_slot}`} className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="green">En roster</Badge>
                        <Badge tone="gray">{entry.roster_slot}</Badge>
                        <Badge tone="orange">{entry.acquired_via === 'draft' ? 'Draft' : 'Free agent'}</Badge>
                      </div>
                      <h3 className="mt-4 font-display text-2xl uppercase tracking-wide text-[--color-text]">{entry.team_name}</h3>
                      <p className="mt-1 text-sm text-[--color-text-muted]">{entry.league_name}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[--color-text-muted]">
                        <span>Agregado {formatDateTime(entry.acquired_at)}</span>
                        <span>{entry.draft_status === 'completed' ? 'Draft cerrado' : entry.draft_status}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link to={`/leagues/${entry.league_id}`} className="button-secondary">
                          Ver liga
                        </Link>
                        <Link to={`/teams/${entry.fantasy_team_id}`} className="button-secondary">
                          Ver roster
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-6">
                  <EmptyState
                    icon={ShieldAlert}
                    title="No aparece en tus ligas"
                    body="Este jugador no esta en ninguno de tus equipos fantasy actuales."
                  />
                </div>
              )}
            </div>
            <div className="surface-card p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Impacto por ronda</p>
              <div className="mt-6 grid gap-3">
                {[1, 2, 3, 4].map((round) => (
                  <div key={round} className="flex items-center justify-between rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] px-4 py-4">
                    <RoundChip round={round} />
                    <span className="font-stat text-3xl font-black tracking-tight text-[--color-text]">
                      {formatNumber(Number(player.season_ppg || 0) * [1, 1.25, 1.5, 2][round - 1])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
