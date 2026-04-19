import { useEffect, useState } from 'react';
import { Brackets, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import LeagueCard from '../components/LeagueCard';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import { useToast } from '../components/Toast';

export default function Leagues() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [leagues, setLeagues] = useState([]);
  const [leaderboards, setLeaderboards] = useState({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ league_name: '', max_teams: 8, scoring_type: 'points' });
  const [joinLeagueId, setJoinLeagueId] = useState('');
  const [error, setError] = useState('');

  async function loadLeagues() {
    setLoading(true);
    try {
      const result = await api.leagues();
      setLeagues(result);

      const previews = await Promise.all(
        result.map(async (league) => {
          try {
            const leaderboard = await api.leagueLeaderboard(league.league_id);
            return [league.league_id, leaderboard];
          } catch {
            return [league.league_id, []];
          }
        }),
      );

      setLeaderboards(Object.fromEntries(previews));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadLeagues().catch(() => {});
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setError('');
    try {
      const league = await api.createLeague(createForm);
      pushToast({ title: 'Liga creada', message: `${createForm.league_name} ya esta lista para invitar managers.`, tone: 'success' });
      setCreateOpen(false);
      setCreateForm({ league_name: '', max_teams: 8, scoring_type: 'points' });
      navigate(`/leagues/${league.league_id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleJoin(event) {
    event.preventDefault();
    setError('');
    try {
      await api.joinLeague(joinLeagueId);
      pushToast({ title: 'Te uniste a la liga', message: `Entraste a la liga #${joinLeagueId}.`, tone: 'success' });
      setJoinOpen(false);
      setJoinLeagueId('');
      await loadLeagues();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="page-shell mx-auto max-w-7xl">
      <header className="flex flex-col gap-5 pb-8 pt-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-body font-semibold uppercase tracking-[0.28em] text-[--color-text-muted]">Operacion fantasy</p>
          <h1 className="mt-4 font-display text-5xl uppercase tracking-tight text-[--color-text] md:text-6xl">Mis ligas</h1>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className="button-primary">
          <Plus className="h-4 w-4" />
          Nueva liga
        </button>
      </header>

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} variant="card" className="h-[360px]" />)}
        </div>
      ) : leagues.length === 0 ? (
        <EmptyState
          icon={Brackets}
          title="Todavia no entras a ninguna liga."
          body="Crea una liga como comisionado o unete a una existente usando su identificador numerico."
          action={{ label: 'Crear liga', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <>
          <div className="mb-6 flex justify-end">
            <button type="button" onClick={() => setJoinOpen(true)} className="button-secondary">
              <Search className="h-4 w-4" />
              Unirse a liga
            </button>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {leagues.map((league) => (
              <LeagueCard key={league.league_id} league={league} preview={leaderboards[league.league_id] || []} />
            ))}
          </div>
        </>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Crear liga" size="max-w-[420px]">
        <form className="space-y-4" onSubmit={handleCreate}>
          {error ? <div className="rounded-md border border-[--color-danger]/40 bg-[--color-danger]/10 px-4 py-3 text-sm text-[--color-danger]">{error}</div> : null}
          <div className="space-y-2">
            <label className="field-label" htmlFor="league-name">Nombre de la liga</label>
            <input autoFocus id="league-name" className="field w-full" value={createForm.league_name} onChange={(event) => setCreateForm((current) => ({ ...current, league_name: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="field-label" htmlFor="league-size">Maximo de equipos: {createForm.max_teams}</label>
            <input id="league-size" type="range" min="4" max="12" className="w-full accent-[--color-accent]" value={createForm.max_teams} onChange={(event) => setCreateForm((current) => ({ ...current, max_teams: Number(event.target.value) }))} />
          </div>
          <div className="space-y-2">
            <span className="field-label">Tipo de puntuacion</span>
            <div className="grid grid-cols-2 gap-2">
              {['points', 'categories'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCreateForm((current) => ({ ...current, scoring_type: type }))}
                  className={createForm.scoring_type === type ? 'button-primary w-full' : 'button-secondary w-full'}
                >
                  {type === 'points' ? 'Puntos' : 'Categorias'}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="button-primary w-full">Crear liga</button>
        </form>
      </Modal>

      <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Unirse a liga" size="max-w-[420px]">
        <form className="space-y-4" onSubmit={handleJoin}>
          {error ? <div className="rounded-md border border-[--color-danger]/40 bg-[--color-danger]/10 px-4 py-3 text-sm text-[--color-danger]">{error}</div> : null}
          <div className="space-y-2">
            <label className="field-label" htmlFor="join-league">ID de liga</label>
            <input autoFocus id="join-league" className="field w-full" value={joinLeagueId} onChange={(event) => setJoinLeagueId(event.target.value)} placeholder="Ingresa el ID numerico de la liga" />
          </div>
          <button type="submit" className="button-primary w-full">Unirse</button>
        </form>
      </Modal>
    </main>
  );
}
