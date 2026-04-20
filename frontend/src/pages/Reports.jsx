import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, Download, Flame, ListOrdered, ShieldCheck, Table2, Trophy } from 'lucide-react';
import { api } from '../api';
import Table from '../components/Table';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import PlayerAvatar from '../components/PlayerAvatar';
import { useToast } from '../components/Toast';
import { formatDateLabel, formatInteger, formatNumber } from '../lib/utils';

const REPORTS = [
  { key: 'standings', title: 'Posiciones de liga', icon: Trophy, body: 'Tabla pensada para comisionado segun la liga seleccionada.' },
  { key: 'season', title: 'Promedios de temporada', icon: BarChart3, body: 'Vista de rendimiento de jugadores ordenada por produccion fantasy.' },
  { key: 'streaks', title: 'Seguimiento de rachas', icon: Flame, body: 'Cortes de jugadores calientes y frios en la muestra mas reciente.' },
  { key: 'roster', title: 'Analizador de roster', icon: ListOrdered, body: 'Detalle del roster del primer equipo disponible en tu liga seleccionada.' },
  { key: 'daily', title: 'Puntuacion diaria fantasy', icon: Table2, body: 'Resultados fantasy ajustados por el sistema de multiplicadores.' },
  { key: 'accuracy', title: 'Precision del modelo (MAE)', icon: ShieldCheck, body: 'Mide que tan cerca quedaron las predicciones guardadas frente al resultado real.' },
];

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { pushToast } = useToast();
  const [leagues, setLeagues] = useState([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportData, setReportData] = useState({});
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const leagueList = await api.leagues();
        setLeagues(leagueList);
        const leagueId = leagueList[0]?.league_id ? String(leagueList[0].league_id) : '';
        setSelectedLeagueId(leagueId);

        const [season, streaks, daily, games, accuracy] = await Promise.all([
          api.leaderboard('avg_fantasy_pts', 50),
          api.hotCold(50),
          api.dailyScoring(null, 50),
          api.games(null, 20),
          api.predictionAccuracy(50),
        ]);

        let standings = [];
        let roster = [];
        if (leagueId) {
          standings = await api.leagueLeaderboard(leagueId);
          const firstTeamId = standings[0]?.fantasy_team_id;
          roster = firstTeamId ? await api.roster(firstTeamId) : [];
        }

        setReportData({ standings, season, streaks, roster, daily, games, accuracy });
      } finally {
        setLoading(false);
      }
    }

    load().catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedLeagueId) {
      return;
    }

    async function loadLeagueReports() {
      try {
        const standings = await api.leagueLeaderboard(selectedLeagueId);
        const firstTeamId = standings[0]?.fantasy_team_id;
        const roster = firstTeamId ? await api.roster(firstTeamId) : [];
        setReportData((current) => ({ ...current, standings, roster }));
      } catch {
        setReportData((current) => ({ ...current, standings: [], roster: [] }));
      }
    }

    loadLeagueReports();
  }, [selectedLeagueId]);

  function openReport(key) {
    setSelectedReport(key);
  }

  async function reloadAccuracy() {
    const accuracy = await api.predictionAccuracy(50);
    setReportData((current) => ({ ...current, accuracy }));
  }

  async function handleBackfillPredictions() {
    setBackfilling(true);
    try {
      const result = await api.backfillPredictions();
      await reloadAccuracy();
      pushToast({
        title: 'Predicciones generadas',
        message: `${result.generated_rows} filas procesadas para ${result.model_version}.`,
        tone: 'success',
      });
    } catch (error) {
      pushToast({
        title: 'No se pudo generar el baseline',
        message: error.message,
        tone: 'error',
      });
    } finally {
      setBackfilling(false);
    }
  }

  const seasonColumns = [
    { key: 'player_name', label: 'Jugador', render: (row) => <div className="flex items-center gap-3"><PlayerAvatar playerId={row.player_id} playerName={row.player_name} teamAbbr={row.team} size="sm" /><span className="font-body font-semibold text-[--color-text]">{row.player_name}</span></div> },
    { key: 'team', label: 'Equipo' },
    { key: 'games_played', label: 'GP', align: 'right' },
    { key: 'avg_pts', label: 'PPG', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(row.avg_pts)}</span> },
    { key: 'avg_fantasy_pts', label: 'FPPG', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-accent]">{formatNumber(row.avg_fantasy_pts)}</span> },
  ];

  const standingsColumns = [
    { key: 'league_rank', label: 'Puesto', render: (row) => <span className="font-stat text-2xl font-black text-[--color-text]">{row.league_rank}</span> },
    { key: 'team_name', label: 'Equipo', render: (row) => <span className="font-body font-semibold text-[--color-text]">{row.team_name}</span> },
    { key: 'username', label: 'Usuario' },
    { key: 'active_roster_size', label: 'Activos', align: 'right' },
    { key: 'total_points', label: 'Puntos', align: 'right', render: (row) => <span className="font-stat text-2xl font-black text-[--color-text]">{formatInteger(row.total_points)}</span> },
  ];

  const streakColumns = [
    { key: 'player_name', label: 'Jugador', render: (row) => <div className="flex items-center gap-3"><PlayerAvatar playerId={row.player_id} playerName={row.player_name} teamAbbr={row.team} size="sm" /><span className="font-body font-semibold text-[--color-text]">{row.player_name}</span></div> },
    { key: 'team', label: 'Equipo' },
    { key: 'season_ppg', label: 'Temporada', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(row.season_ppg)}</span> },
    { key: 'last5_ppg', label: 'Ult. 5', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(row.last5_ppg)}</span> },
    { key: 'pts_pct_change', label: 'Delta', align: 'right', render: (row) => <span className={`font-stat text-xl font-black ${Number(row.pts_pct_change) >= 0 ? 'text-[--color-success]' : 'text-[--color-danger]'}`}>{row.pts_pct_change}%</span> },
  ];

  const rosterColumns = [
    { key: 'roster_slot', label: 'Slot', render: (row) => <span className="font-stat text-xl font-black text-[--color-accent]">{row.roster_slot}</span> },
    { key: 'player_name', label: 'Jugador', render: (row) => <div className="flex items-center gap-3"><PlayerAvatar playerId={row.player_id} playerName={row.player_name} teamAbbr={row.nba_team} size="sm" /><span className="font-body font-semibold text-[--color-text]">{row.player_name}</span></div> },
    { key: 'nba_team', label: 'NBA' },
    { key: 'season_ppg', label: 'PPG', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(row.season_ppg)}</span> },
    { key: 'acquired_via', label: 'Via' },
  ];

  const dailyColumns = [
    { key: 'game_date', label: 'Fecha', render: (row) => formatDateLabel(row.game_date) },
    { key: 'player_name', label: 'Jugador', render: (row) => <div className="flex items-center gap-3"><PlayerAvatar playerId={row.player_id} playerName={row.player_name} teamAbbr={row.team} size="sm" /><span className="font-body font-semibold text-[--color-text]">{row.player_name}</span></div> },
    { key: 'matchup', label: 'Cruce' },
    { key: 'points', label: 'PTS', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{row.points}</span> },
    { key: 'adjusted_fantasy_pts', label: 'FPTS aj.', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-accent]">{formatNumber(row.adjusted_fantasy_pts)}</span> },
  ];

  const accuracyColumns = [
    { key: 'player_name', label: 'Jugador', render: (row) => <div className="flex items-center gap-3"><PlayerAvatar playerId={row.player_id} playerName={row.player_name} size="sm" /><span className="font-body font-semibold text-[--color-text]">{row.player_name}</span></div> },
    { key: 'model_version', label: 'Modelo' },
    { key: 'predictions_made', label: 'Pred.', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatInteger(row.predictions_made)}</span> },
    { key: 'mae', label: 'MAE', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-accent]">{formatNumber(row.mae)}</span> },
    { key: 'avg_predicted', label: 'Pred. avg', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(row.avg_predicted)}</span> },
    { key: 'avg_actual', label: 'Real avg', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(row.avg_actual)}</span> },
    { key: 'avg_confidence', label: 'Conf.', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(row.avg_confidence)}</span> },
  ];

  const reportTable = {
    standings: { title: 'Posiciones de liga', columns: standingsColumns, rows: reportData.standings || [] },
    season: { title: 'Promedios de temporada', columns: seasonColumns, rows: reportData.season || [] },
    streaks: { title: 'Seguimiento de rachas', columns: streakColumns, rows: reportData.streaks || [] },
    roster: { title: 'Analizador de roster', columns: rosterColumns, rows: reportData.roster || [] },
    daily: { title: 'Puntuacion diaria fantasy', columns: dailyColumns, rows: reportData.daily || [] },
    accuracy: { title: 'Precision del modelo', columns: accuracyColumns, rows: reportData.accuracy || [] },
  }[selectedReport];

  return (
    <main className="page-shell mx-auto max-w-7xl">
      <header className="pb-8 pt-4">
        <p className="text-xs font-body font-semibold uppercase tracking-[0.28em] text-[--color-text-muted]">Vistas SQL y tablas analiticas</p>
        <h1 className="mt-4 font-display text-5xl uppercase tracking-tight text-[--color-text] md:text-6xl">Reportes</h1>
      </header>

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} variant="card" className="h-72" />)}
        </div>
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <span className="field-label">Liga seleccionada</span>
            <select className="field min-w-[240px]" value={selectedLeagueId} onChange={(event) => setSelectedLeagueId(event.target.value)}>
              {leagues.length === 0 ? <option value="">No hay ligas disponibles</option> : leagues.map((league) => <option key={league.league_id} value={league.league_id}>{league.league_name}</option>)}
            </select>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {REPORTS.map((report) => {
              const Icon = report.icon;
              const heroValue =
                report.key === 'standings' ? `${reportData.standings?.length || 0}` :
                report.key === 'season' ? formatNumber(reportData.season?.[0]?.avg_fantasy_pts || 0) :
                report.key === 'streaks' ? `${reportData.streaks?.filter((item) => item.streak_status === 'hot').length || 0}` :
                report.key === 'roster' ? `${reportData.roster?.length || 0}` :
                report.key === 'daily' ? formatNumber(reportData.daily?.[0]?.adjusted_fantasy_pts || 0) :
                formatNumber(reportData.accuracy?.[0]?.mae || 0);

              return (
                <article key={report.key} className="surface-card flex flex-col gap-5 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[--color-accent]/12 text-[--color-accent]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">{report.title}</p>
                    <div className="mt-3 font-stat text-5xl font-black tracking-tight text-[--color-text]">{heroValue}</div>
                    <p className="mt-3 text-sm leading-6 text-[--color-text-muted]">{report.body}</p>
                  </div>
                  <button type="button" className="button-secondary mt-auto" onClick={() => openReport(report.key)}>
                    Abrir reporte
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}

      <Modal open={Boolean(selectedReport)} onClose={() => setSelectedReport(null)} title={reportTable?.title || 'Precision del modelo'} size="max-w-6xl">
        {reportTable ? (
          <div className="space-y-4">
            {reportTable.rows.length > 0 ? (
              <>
                <div className="flex flex-wrap justify-end gap-3">
                  {selectedReport === 'accuracy' ? (
                    <button type="button" className="button-secondary" onClick={handleBackfillPredictions} disabled={backfilling}>
                      {backfilling ? 'Actualizando modelo...' : 'Recalcular baseline'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() =>
                      downloadCsv(
                        `${selectedReport}.csv`,
                        [
                          reportTable.columns.map((column) => column.label),
                          ...reportTable.rows.map((row) => reportTable.columns.map((column) => row[column.key] ?? '')),
                        ],
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </button>
                </div>
                <Table columns={reportTable.columns} rows={reportTable.rows} sortable />
              </>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="No hay filas disponibles"
                body="Todavia no existen predicciones guardadas que puedan compararse contra resultados reales en esta base."
                action={selectedReport === 'accuracy' && !backfilling ? {
                  label: backfilling ? 'Generando...' : 'Generar baseline',
                  onClick: handleBackfillPredictions,
                } : undefined}
              />
            )}
          </div>
        ) : null}
      </Modal>
    </main>
  );
}
