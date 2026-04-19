import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Search, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import EmptyState from '../components/EmptyState';
import PlayerAvatar from '../components/PlayerAvatar';
import RoundChip from '../components/RoundChip';
import Skeleton from '../components/Skeleton';
import Table from '../components/Table';
import TeamLogo from '../components/TeamLogo';
import { useDebouncedValue } from '../lib/hooks';
import { formatNumber, getPlayerName, getTeamIdFromPlayer } from '../lib/utils';

const POSITIONS = ['G', 'F', 'C', 'G-F', 'F-C'];
const SORTS = [
  { key: 'season_ppg', label: 'PPG ↓' },
  { key: 'season_rpg', label: 'RPG ↓' },
  { key: 'season_apg', label: 'APG ↓' },
  { key: 'avg_stl', label: 'STL ↓' },
  { key: 'avg_blk', label: 'BLK ↓' },
  { key: 'avg_fantasy_pts', label: 'Prom fantasy ↓' },
  { key: 'games_played', label: 'Partidos ↓' },
  { key: 'name', label: 'Name A-Z' },
];

export default function Players() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [enrichment, setEnrichment] = useState({});
  const [search, setSearch] = useState('');
  const [team, setTeam] = useState('');
  const [positions, setPositions] = useState([]);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('season_ppg');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => {
    api.teams().then(setTeams).catch(() => {});
    api.leaderboard('avg_fantasy_pts', 100)
      .then((rows) => {
        setEnrichment(
          Object.fromEntries(
            rows.map((row) => [
              row.player_id,
              {
                avg_fantasy_pts: row.avg_fantasy_pts,
                avg_stl: row.avg_stl,
                avg_blk: row.avg_blk,
                games_played: row.games_played,
              },
            ]),
          ),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function loadPlayers() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) {
          params.set('search', debouncedSearch);
        }
        if (team) {
          params.set('team', team);
        }
        params.set('limit', '50');
        params.set('offset', String(offset));
        const result = await api.players(params.toString());
        setPlayers((current) => (offset === 0 ? result : [...current, ...result]));
      } finally {
        setLoading(false);
      }
    }

    loadPlayers().catch(() => setLoading(false));
  }, [debouncedSearch, team, offset]);

  const filteredPlayers = useMemo(() => {
    let nextPlayers = [...players];

    if (positions.length > 0) {
      nextPlayers = nextPlayers.filter((player) => positions.includes(player.position));
    }

    if (status === 'active') {
      nextPlayers = nextPlayers.filter((player) => !player.is_eliminated);
    } else if (status === 'eliminated') {
      nextPlayers = nextPlayers.filter((player) => player.is_eliminated);
    }

    nextPlayers.sort((left, right) => {
      if (sort === 'name') {
        return getPlayerName(left).localeCompare(getPlayerName(right));
      }

      const leftValue = left[sort] ?? enrichment[left.player_id]?.[sort] ?? 0;
      const rightValue = right[sort] ?? enrichment[right.player_id]?.[sort] ?? 0;
      return Number(rightValue) - Number(leftValue);
    });

    return nextPlayers;
  }, [enrichment, players, positions, sort, status]);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (search.trim()) {
      chips.push({
        key: `search:${search}`,
        label: `Busqueda: ${search}`,
        onRemove: () => {
          setOffset(0);
          setSearch('');
        },
      });
    }
    if (team) {
      const teamMeta = teams.find((item) => item.abbreviation === team);
      chips.push({
        key: `team:${team}`,
        label: `Equipo: ${teamMeta?.abbreviation || team}`,
        onRemove: () => {
          setOffset(0);
          setTeam('');
        },
      });
    }
    positions.forEach((position) => {
      chips.push({
        key: `position:${position}`,
        label: `Posicion: ${position}`,
        onRemove: () => setPositions((current) => current.filter((value) => value !== position)),
      });
    });
    if (status !== 'all') {
      chips.push({
        key: `status:${status}`,
        label: `Estado: ${status === 'active' ? 'Activo' : 'Eliminado'}`,
        onRemove: () => setStatus('all'),
      });
    }
    return chips;
  }, [positions, search, status, team, teams]);

  const columns = [
    { key: 'rank', label: '#', render: (_, index) => <span className="font-stat text-2xl font-black text-[--color-text-dim]">{index + 1}</span> },
    {
      key: 'player',
      label: 'Jugador',
      render: (row) => {
        const teamId = getTeamIdFromPlayer(row);
        const jersey = row.jersey_number && String(row.jersey_number).trim() !== '-' ? `#${row.jersey_number}` : null;
        return (
          <div className="flex items-center gap-3">
            <PlayerAvatar playerId={row.player_id} playerName={getPlayerName(row)} teamId={teamId} teamAbbr={row.team} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-body text-sm font-semibold text-[--color-text]">
                {row.first_name}{' '}
                <span className="font-display uppercase tracking-wide">{row.last_name}</span>
              </p>
              <p className="text-xs text-[--color-text-muted]">{[jersey, row.position || '—'].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'team',
      label: 'Equipo',
      render: (row) => (
        <div className="flex items-center gap-2">
          <TeamLogo teamId={getTeamIdFromPlayer(row)} teamAbbr={row.team} size="xs" />
          <span className="font-display text-lg uppercase tracking-wide text-[--color-text]">{row.team}</span>
        </div>
      ),
    },
    { key: 'position', label: 'Pos', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{row.position || '—'}</span> },
    { key: 'games_played', label: 'GP', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{enrichment[row.player_id]?.games_played ?? '—'}</span> },
    { key: 'season_ppg', label: 'PPG', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(row.season_ppg)}</span> },
    { key: 'season_rpg', label: 'RPG', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(row.season_rpg)}</span> },
    { key: 'season_apg', label: 'APG', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(row.season_apg)}</span> },
    { key: 'avg_stl', label: 'STL', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(enrichment[row.player_id]?.avg_stl ?? 0)}</span> },
    { key: 'avg_blk', label: 'BLK', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-text]">{formatNumber(enrichment[row.player_id]?.avg_blk ?? 0)}</span> },
    { key: 'avg_fantasy_pts', label: 'FPPG', align: 'right', render: (row) => <span className="font-stat text-xl font-black text-[--color-accent]">{formatNumber(enrichment[row.player_id]?.avg_fantasy_pts ?? 0)}</span> },
  ];

  return (
    <main className="min-h-[calc(100vh-4rem)] lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-[--color-border] bg-[--color-bg-elev] p-6 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="space-y-6">
          <div>
            <p className="text-xs font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">Filtros</p>
            <h2 className="mt-2 font-display text-3xl uppercase tracking-wide text-[--color-text]">Explora el pool</h2>
          </div>

          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[--color-text-dim]" />
            <input
              value={search}
              onChange={(event) => {
                setOffset(0);
                setSearch(event.target.value);
              }}
              className="field w-full pl-11"
              placeholder="Buscar jugador..."
            />
          </label>

          <div>
            <p className="field-label mb-3">Filtro por equipo</p>
            <div className="space-y-2">
              {teams.map((item) => (
                <button
                  type="button"
                  key={item.team_id}
                  onClick={() => {
                    setOffset(0);
                    setTeam((current) => (current === item.abbreviation ? '' : item.abbreviation));
                  }}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-150 ${team === item.abbreviation ? 'border-[--color-accent] bg-[--color-accent]/10 text-[--color-text]' : 'border-[--color-border] bg-[--color-bg-elev-2] text-[--color-text-muted] hover:border-[--color-border-strong] hover:text-[--color-text]'}`}
                >
                  <TeamLogo teamId={item.team_id} teamAbbr={item.abbreviation} size="xs" />
                  <div className="min-w-0">
                    <p className="font-body text-sm font-semibold text-inherit">{item.abbreviation}</p>
                    <p className="truncate text-xs text-[--color-text-dim]">{item.full_name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="field-label mb-3">Posicion</p>
            <div className="flex flex-wrap gap-2">
              {POSITIONS.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setPositions((current) => (current.includes(item) ? current.filter((value) => value !== item) : [...current, item]))}
                  className={positions.includes(item) ? 'button-primary' : 'button-secondary'}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="field-label mb-3">Estado en playoffs</p>
            <div className="grid gap-2">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'active', label: 'Activo' },
                { key: 'eliminated', label: 'Eliminado' },
              ].map((item) => (
                <button key={item.key} type="button" onClick={() => setStatus(item.key)} className={status === item.key ? 'button-primary justify-start' : 'button-secondary justify-start'}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSearch('');
              setTeam('');
              setPositions([]);
              setStatus('all');
            }}
            className="button-secondary w-full"
          >
            <RotateCcw className="h-4 w-4" />
            Limpiar filtros
          </button>
        </div>
      </aside>

      <section className="page-shell">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-body font-semibold uppercase tracking-[0.28em] text-[--color-text-muted]">Base de jugadores</p>
            <h1 className="mt-4 font-display text-5xl uppercase tracking-tight text-[--color-text] md:text-6xl">Jugadores</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <RoundChip round={1} />
              <span className="text-sm text-[--color-text-muted]">{filteredPlayers.length} jugadores · filtrado por {team || 'todos los equipos'} {positions.length ? `· ${positions.join(', ')}` : ''}</span>
            </div>
            {activeFilterChips.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    className="inline-flex items-center gap-2 rounded-full border border-[--color-accent]/30 bg-[--color-accent]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[--color-accent] transition-colors duration-150 hover:bg-[--color-accent]/18"
                  >
                    {chip.label}
                    <X className="h-3.5 w-3.5" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setTeam('');
                    setPositions([]);
                    setStatus('all');
                    setOffset(0);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-[--color-border-strong] bg-[--color-bg-elev] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[--color-text-muted] transition-colors duration-150 hover:border-[--color-accent] hover:text-[--color-text]"
                >
                  Limpiar todo
                </button>
              </div>
            ) : null}
          </div>
          <select className="field min-w-[220px]" value={sort} onChange={(event) => setSort(event.target.value)}>
            {SORTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </div>

        {loading && offset === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} variant="row" />)}
          </div>
        ) : filteredPlayers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No hay jugadores con esos filtros."
            body="Limpia los filtros y amplia la busqueda para volver a ver la base completa."
            action={{ label: 'Limpiar filtros', onClick: () => {
              setSearch('');
              setTeam('');
              setPositions([]);
              setStatus('all');
            } }}
          />
        ) : (
          <>
            <Table
              columns={columns}
              rows={filteredPlayers}
              onRowClick={(player) => navigate(`/players/${player.player_id}`)}
              rowClassName={(player) => (Number(player.season_ppg) === 0 ? 'opacity-60' : '')}
            />
            <div className="mt-6 flex justify-center">
              <button type="button" className="button-secondary" onClick={() => setOffset((current) => current + 50)}>
                Mostrar 50 mas
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
