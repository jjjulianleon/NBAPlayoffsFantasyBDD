import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import DraftClock from '../components/DraftClock';
import EmptyState from '../components/EmptyState';
import PlayerAvatar from '../components/PlayerAvatar';
import RoundChip from '../components/RoundChip';
import Skeleton from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { formatNumber, getPlayerName, ROSTER_SLOTS } from '../lib/utils';
import { getTeamColor } from '../lib/teamData';

function DraftCard({ player, draftedBy, onDraft, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onDraft(player)}
      className={`group relative h-[170px] overflow-hidden rounded-lg border border-[--color-border] bg-[--color-bg-elev] p-4 text-left transition-colors duration-150 hover:border-[--color-accent] ${disabled ? 'cursor-not-allowed grayscale' : ''}`}
      style={{ borderLeftWidth: 3, borderLeftColor: getTeamColor(player.team) }}
    >
      <div className="absolute inset-y-0 right-0 w-1/2 opacity-55">
        <PlayerAvatar playerId={player.player_id} playerName={getPlayerName(player)} teamAbbr={player.team} size="xl" className="h-full w-full rounded-none object-cover ring-0" />
      </div>
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <RoundChip round={player.is_eliminated ? 4 : 1} />
          <h3 className="mt-4 max-w-[70%] font-display text-2xl uppercase leading-none tracking-wide text-[--color-text]">
            {player.first_name}
            <br />
            {player.last_name}
          </h3>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[--color-text-muted]">{player.team} · {player.position}</p>
        </div>

        <div className="relative z-10">
          <div className="flex gap-4 text-xs text-[--color-text-muted]">
            <div>
              <span className="block">PPG</span>
              <span className="font-stat text-2xl font-black text-[--color-text]">{formatNumber(player.season_ppg)}</span>
            </div>
            <div>
              <span className="block">RPG</span>
              <span className="font-stat text-2xl font-black text-[--color-text]">{formatNumber(player.season_rpg)}</span>
            </div>
            <div>
              <span className="block">APG</span>
              <span className="font-stat text-2xl font-black text-[--color-text]">{formatNumber(player.season_apg)}</span>
            </div>
          </div>
          {draftedBy ? (
            <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[--color-text-muted]">Drafteado por {draftedBy}</div>
          ) : (
            <span className="mt-3 inline-flex rounded-md bg-[--color-accent] px-3 py-2 text-xs font-body font-bold uppercase tracking-[0.18em] text-black">
              Draftear
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Draft() {
  const { id } = useParams();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [league, setLeague] = useState(null);
  const [teams, setTeams] = useState([]);
  const [rosters, setRosters] = useState({});
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [hideDrafted, setHideDrafted] = useState(true);
  const [loading, setLoading] = useState(true);

  async function loadDraftRoom() {
    setLoading(true);
    try {
      const [leagueResponse, standings, playerPool] = await Promise.all([
        api.league(id),
        api.leagueLeaderboard(id).catch(() => []),
        api.players('limit=100'),
      ]);

      const rosterEntries = await Promise.all(
        standings.map(async (team) => {
          try {
            const roster = await api.roster(team.fantasy_team_id);
            return [team.fantasy_team_id, roster];
          } catch {
            return [team.fantasy_team_id, []];
          }
        }),
      );

      setLeague(leagueResponse);
      setTeams(standings);
      setRosters(Object.fromEntries(rosterEntries));
      setPlayers(playerPool);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadDraftRoom().catch(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [id]);

  const draftedMap = useMemo(() => {
    const entries = [];
    Object.entries(rosters).forEach(([teamId, roster]) => {
      roster.forEach((player) => {
        entries.push([player.player_id, teams.find((team) => team.fantasy_team_id === Number(teamId))?.team_name || 'Equipo']);
      });
    });
    return Object.fromEntries(entries);
  }, [rosters, teams]);

  const totalDrafted = Object.values(rosters).reduce((sum, roster) => sum + roster.length, 0);
  const totalSlots = teams.length * 8;
  const currentPickIndex = totalSlots ? totalDrafted % Math.max(teams.length, 1) : 0;
  const onTheClock = teams[currentPickIndex];
  const myTeam = teams.find((team) => team.username === user?.username);
  const myRoster = myTeam ? rosters[myTeam.fantasy_team_id] || [] : [];

  const visiblePlayers = players
    .filter((player) => (search ? getPlayerName(player).toLowerCase().includes(search.toLowerCase()) : true))
    .filter((player) => (teamFilter ? player.team === teamFilter : true))
    .filter((player) => (positionFilter ? player.position === positionFilter : true))
    .filter((player) => (hideDrafted ? !draftedMap[player.player_id] : true));

  async function draftPlayer(player) {
    try {
      await api.draftPick(id, player.player_id);
      pushToast({ title: 'Pick enviado', message: `${getPlayerName(player)} fue agregado a tu equipo.`, tone: 'success' });
      await loadDraftRoom();
    } catch (err) {
      pushToast({ title: 'Fallo el draft', message: err.message, tone: 'error' });
    }
  }

  async function completeDraft() {
    try {
      await api.completeDraft(id);
      pushToast({ title: 'Draft completado', message: 'El draft de la liga se cerro correctamente.', tone: 'success' });
      await loadDraftRoom();
    } catch (err) {
      pushToast({ title: 'No se pudo completar', message: err.message, tone: 'error' });
    }
  }

  if (loading) {
    return (
      <main className="page-shell mx-auto max-w-7xl space-y-6">
        <Skeleton variant="card" className="h-40" />
        <Skeleton variant="card" className="h-[720px]" />
      </main>
    );
  }

  if (!league || teams.length === 0) {
    return (
      <main className="page-shell mx-auto max-w-6xl">
        <EmptyState icon={Search} title="Sala de draft no disponible" body="Primero crea equipos para que el tablero tenga orden y objetivos de roster." />
      </main>
    );
  }

  return (
    <main className="page-shell mx-auto max-w-[1440px]">
      <div className="mb-6">
        <Link to={`/leagues/${id}`} className="inline-flex items-center gap-2 text-sm text-[--color-text-muted]">
          <ArrowLeft className="h-4 w-4" />
          Volver a la liga
        </Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr_360px]">
        <aside className="surface-card p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">En el reloj</p>
          <div className="mt-4">
            <DraftClock startedAt={league.draft_date} />
            <p className="mt-4 font-display text-2xl uppercase tracking-wide text-[--color-text]">{onTheClock?.team_name || 'Esperando equipos'}</p>
          </div>

          <div className="mt-8 space-y-2">
            {Array.from({ length: totalSlots }).map((_, index) => {
              const team = teams[index % teams.length];
              const roster = rosters[team.fantasy_team_id] || [];
              const draftedPlayer = roster[Math.floor(index / teams.length)];
              const isCurrent = index === totalDrafted;
              return (
                <div key={`${team.fantasy_team_id}-${index}`} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${isCurrent ? 'border-[--color-accent] bg-[--color-accent]/10' : 'border-[--color-border] bg-[--color-bg-elev-2]'}`}>
                  <span className="font-stat text-2xl font-black text-[--color-text]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-body text-sm font-semibold ${isCurrent ? 'text-[--color-text]' : 'text-[--color-text-muted]'}`}>{team.team_name}</p>
                    {draftedPlayer ? (
                      <div className="mt-1 flex items-center gap-2 text-xs text-[--color-text-muted]">
                        <PlayerAvatar playerId={draftedPlayer.player_id} playerName={draftedPlayer.player_name} teamAbbr={draftedPlayer.nba_team} size="xs" />
                        <span className="truncate">{draftedPlayer.player_name}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-[--color-text-dim]">Proximo pick</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="space-y-5">
          <div className="surface-card p-5">
            <div className="grid gap-3 md:grid-cols-[1fr_180px_140px_auto]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[--color-text-dim]" />
                <input className="field w-full pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar jugador..." />
              </label>
              <select className="field" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
                <option value="">Todos los equipos</option>
                {[...new Set(players.map((player) => player.team))].filter(Boolean).sort().map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
              <select className="field" value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
                <option value="">Todas las posiciones</option>
                {['G', 'F', 'C', 'G-F', 'F-C'].map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
              <button type="button" className={hideDrafted ? 'button-primary' : 'button-secondary'} onClick={() => setHideDrafted((value) => !value)}>
                Ocultar drafteados
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visiblePlayers.map((player) => (
              <DraftCard
                key={player.player_id}
                player={player}
                draftedBy={draftedMap[player.player_id]}
                disabled={Boolean(draftedMap[player.player_id]) || !myTeam || myRoster.length >= 8}
                onDraft={draftPlayer}
              />
            ))}
          </div>
        </section>

        <aside className="surface-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Mi roster</p>
              <h2 className="mt-2 font-display text-3xl uppercase tracking-wide text-[--color-text]">{myTeam?.team_name || 'Sin equipo'}</h2>
            </div>
            <span className="font-stat text-4xl font-black tracking-tight text-[--color-text]">{myRoster.length} / 8</span>
          </div>

          <div className="mt-6 space-y-3">
            {ROSTER_SLOTS.map((slot, index) => {
              const player = myRoster[index];
              return (
                <div key={slot} className={`rounded-lg border px-4 py-3 ${player ? 'border-[--color-border] bg-[--color-bg-elev-2]' : 'border-dashed border-[--color-border-strong] bg-[--color-bg]'}`}>
                  <div className="flex items-center gap-3">
                    <span className="font-stat text-2xl font-black text-[--color-accent]">{slot}</span>
                    {player ? (
                      <>
                        <PlayerAvatar playerId={player.player_id} playerName={player.player_name} teamAbbr={player.nba_team} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-body text-sm font-semibold text-[--color-text]">{player.player_name}</p>
                          <p className="text-xs text-[--color-text-muted]">{formatNumber(player.season_ppg)} PPG</p>
                        </div>
                      </>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="font-body text-sm font-semibold text-[--color-text-muted]">Slot vacio</p>
                        <p className="text-xs text-[--color-text-dim]">{index === myRoster.length ? 'Siguiente en llenar' : 'Esperando el flujo del draft'}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {league.created_by === user?.user_id ? (
            <button type="button" className="button-primary mt-6 w-full" onClick={completeDraft} disabled={totalDrafted < totalSlots}>
              Completar draft
            </button>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
