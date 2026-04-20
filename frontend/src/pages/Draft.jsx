import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Search } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import DraftClock from '../components/DraftClock';
import EmptyState from '../components/EmptyState';
import PlayerAvatar from '../components/PlayerAvatar';
import RoundChip from '../components/RoundChip';
import Skeleton from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { cn, formatNumber, getPlayerName, ROSTER_SLOTS } from '../lib/utils';
import { getTeamColor } from '../lib/teamData';

function FilterSelect({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (containerRef.current?.contains(event.target)) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'field flex w-full items-center justify-between gap-3 px-4 text-left !font-black text-[--color-text]',
          open && 'border-[--color-accent] ring-2 ring-[--color-accent]/20',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span className="min-w-0 truncate">{selected.label}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-[--color-text-muted] transition-transform duration-200', open && 'rotate-180 text-[--color-accent]')} />
      </button>

      {open ? (
        <div className="surface-card absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden border-[--color-border-strong] bg-[linear-gradient(180deg,rgba(20,20,23,0.98),rgba(28,28,33,0.98))] shadow-2xl">
          <div className="border-b border-[--color-border] px-4 py-3">
            <p className="text-[10px] font-body font-semibold uppercase tracking-[0.18em] text-[--color-text-muted]">{label}</p>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || option.label}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150',
                    active
                      ? 'bg-[--color-accent]/12 text-[--color-text]'
                      : 'text-[--color-text-muted] hover:bg-[--color-bg-elev-2] hover:text-[--color-text]',
                  )}
                  role="option"
                  aria-selected={active}
                >
                  <span className={cn('truncate text-sm', active ? 'font-black' : 'font-semibold')}>{option.label}</span>
                  {active ? <Check className="h-4 w-4 shrink-0 text-[--color-accent]" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DraftCard({ player, draftedBy, onDraft, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onDraft(player)}
      className={`group relative h-[126px] overflow-hidden rounded-lg border border-[--color-border] bg-[--color-bg-elev] p-2.5 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[--color-accent] ${disabled ? 'cursor-not-allowed grayscale' : ''}`}
      style={{ borderLeftWidth: 3, borderLeftColor: getTeamColor(player.team) }}
    >
      <div className="absolute inset-y-0 right-0 w-[40%] opacity-30 transition-transform duration-500 ease-out group-hover:scale-105">
        <PlayerAvatar playerId={player.player_id} playerName={getPlayerName(player)} teamAbbr={player.team} size="xl" className="h-full w-full rounded-none object-cover object-top ring-0" />
      </div>
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="max-w-[62%]">
          <RoundChip round={player.is_eliminated ? 4 : 1} className="px-2 py-0.5 text-[9px] tracking-[0.14em]" />
          <h3 className="mt-2 font-display text-[1.18rem] uppercase leading-[0.92] tracking-[0.015em] text-[--color-text]">
            {player.first_name}
            <br />
            {player.last_name}
          </h3>
          <p className="mt-1 text-[8px] uppercase tracking-[0.14em] text-[--color-text-muted]">{player.team} · {player.position}</p>
        </div>

        <div className="relative z-10">
          <div className="flex gap-2 text-[7px] uppercase tracking-[0.1em] text-[--color-text-muted]">
            <div>
              <span className="block">PPG</span>
              <span className="font-stat text-[0.95rem] font-black leading-none text-[--color-text]">{formatNumber(player.season_ppg)}</span>
            </div>
            <div>
              <span className="block">RPG</span>
              <span className="font-stat text-[0.95rem] font-black leading-none text-[--color-text]">{formatNumber(player.season_rpg)}</span>
            </div>
            <div>
              <span className="block">APG</span>
              <span className="font-stat text-[0.95rem] font-black leading-none text-[--color-text]">{formatNumber(player.season_apg)}</span>
            </div>
          </div>
          {draftedBy ? (
            <div className="mt-1 text-[8px] uppercase tracking-[0.12em] text-[--color-text-muted]">Drafteado por {draftedBy}</div>
          ) : (
            <span className="mt-1 inline-flex rounded-md bg-[--color-accent] px-2 py-1 text-[8px] font-body font-bold uppercase tracking-[0.12em] text-black">
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
  const [draftState, setDraftState] = useState(null);
  const [myRoster, setMyRoster] = useState([]);
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [hideDrafted, setHideDrafted] = useState(true);
  const [loading, setLoading] = useState(true);

  async function loadDraftRoom({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
    }
    try {
      const [draftResponse, playerPool] = await Promise.all([
        api.draftState(id),
        api.players('limit=100'),
      ]);

      const myTeam = draftResponse.teams?.find((team) => team.username === user?.username);
      const roster = myTeam ? await api.roster(myTeam.fantasy_team_id).catch(() => []) : [];

      setDraftState(draftResponse);
      setMyRoster(roster);
      setPlayers(playerPool);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadDraftRoom().catch(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [id, user?.username]);

  useEffect(() => {
    if (!draftState || draftState.draft_status !== 'in_progress') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      loadDraftRoom({ silent: true }).catch(() => {});
    }, 4000);

    return () => window.clearInterval(interval);
  }, [draftState, id, user?.username]);

  const draftedMap = useMemo(() => {
    return Object.fromEntries(
      (draftState?.history || []).map((pick) => [pick.player_id, pick.team_name || 'Equipo']),
    );
  }, [draftState]);

  const teams = draftState?.teams || [];
  const board = draftState?.board || [];
  const onTheClock = draftState?.on_the_clock || null;
  const myTeam = teams.find((team) => team.username === user?.username);
  const isMyTurn = Boolean(
    draftState?.draft_status === 'in_progress' &&
    onTheClock &&
    myTeam &&
    onTheClock.fantasy_team_id === myTeam.fantasy_team_id,
  );
  const myRosterMap = useMemo(
    () => Object.fromEntries(myRoster.map((player) => [player.roster_slot, player])),
    [myRoster],
  );
  const teamOptions = useMemo(
    () => [
      { value: '', label: 'Todos los equipos' },
      ...[...new Set(players.map((player) => player.team))]
        .filter(Boolean)
        .sort()
        .map((team) => ({ value: team, label: team })),
    ],
    [players],
  );
  const positionOptions = useMemo(
    () => [
      { value: '', label: 'Todas las posiciones' },
      ...['G', 'F', 'C', 'G-F', 'F-C'].map((position) => ({ value: position, label: position })),
    ],
    [],
  );

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

  if (!draftState || teams.length === 0) {
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

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_300px] 2xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="surface-card p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">En el reloj</p>
          <div className="mt-4">
            <DraftClock startedAt={draftState.draft_date} />
            <p className="mt-4 font-display text-2xl uppercase tracking-wide text-[--color-text]">
              {draftState.draft_status === 'completed' ? 'Draft completado' : onTheClock?.team_name || 'Esperando equipos'}
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[--color-text-muted]">
              {draftState.current_round ? `Ronda ${draftState.current_round} · Pick ${draftState.next_pick_number ?? draftState.total_picks}` : 'Sin picks todavia'}
            </p>
          </div>

          <div className="mt-8 space-y-2">
            {board.map((pick) => {
              const draftedPlayer = pick.player_id ? pick : null;
              const isCurrent = draftState.draft_status === 'in_progress' && pick.pick_number === draftState.next_pick_number;
              return (
                <div key={`${pick.fantasy_team_id}-${pick.pick_number}`} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${isCurrent ? 'border-[--color-accent] bg-[--color-accent]/10' : 'border-[--color-border] bg-[--color-bg-elev-2]'}`}>
                  <span className="font-stat text-2xl font-black text-[--color-text]">{pick.pick_number}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-body text-sm font-semibold ${isCurrent ? 'text-[--color-text]' : 'text-[--color-text-muted]'}`}>{pick.team_name}</p>
                    {draftedPlayer ? (
                      <div className="mt-1 flex items-center gap-2 text-xs text-[--color-text-muted]">
                        <PlayerAvatar playerId={draftedPlayer.player_id} playerName={draftedPlayer.player_name} teamAbbr={draftedPlayer.nba_team} size="xs" />
                        <span className="truncate">{draftedPlayer.player_name}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-[--color-text-dim]">En espera</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="surface-card p-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[--color-text-dim]" />
                <input className="field w-full pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar jugador..." />
              </label>
              <FilterSelect label="Equipos" value={teamFilter} options={teamOptions} onChange={setTeamFilter} />
              <FilterSelect label="Posiciones" value={positionFilter} options={positionOptions} onChange={setPositionFilter} />
              <button
                type="button"
                className={hideDrafted ? 'button-primary md:col-span-2 xl:col-span-3 !font-black' : 'button-secondary md:col-span-2 xl:col-span-3 !font-black'}
                onClick={() => setHideDrafted((value) => !value)}
              >
                Ocultar drafteados
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {visiblePlayers.map((player) => (
              <DraftCard
                key={player.player_id}
                player={player}
                draftedBy={draftedMap[player.player_id]}
                disabled={Boolean(draftedMap[player.player_id]) || !myTeam || myRoster.length >= 8 || !isMyTurn || draftState.draft_status !== 'in_progress'}
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
              const player = myRosterMap[slot];
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

          {myTeam && draftState.draft_status === 'in_progress' ? (
            <div className="mt-6 rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] px-4 py-3 text-sm text-[--color-text-muted]">
              {isMyTurn ? 'Es tu turno. Selecciona un jugador del pool.' : `En el reloj: ${onTheClock?.team_name || 'esperando'}.`}
            </div>
          ) : null}

          {draftState.created_by === user?.user_id ? (
            <button type="button" className="button-primary mt-6 w-full !font-black" onClick={completeDraft} disabled={draftState.total_picks < draftState.total_slots || draftState.draft_status !== 'in_progress'}>
              Completar draft
            </button>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
