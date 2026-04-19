import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Rocket, Settings2, Trophy, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import Skeleton from '../components/Skeleton';
import Table from '../components/Table';
import { useToast } from '../components/Toast';
import { formatInteger, formatLongDate } from '../lib/utils';

const TABS = [
  { key: 'overview', label: 'Resumen' },
  { key: 'members', label: 'Miembros' },
  { key: 'leaderboard', label: 'Posiciones' },
  { key: 'draft-history', label: 'Historial de draft' },
  { key: 'settings', label: 'Configuracion' },
];

export default function LeagueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [league, setLeague] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamName, setTeamName] = useState('');

  async function loadLeague() {
    const [leagueResponse, standings] = await Promise.all([
      api.league(id),
      api.leagueLeaderboard(id).catch(() => []),
    ]);
    setLeague(leagueResponse);
    setLeaderboard(standings);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadLeague().catch(() => {});
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [id]);

  const isCommissioner = league?.created_by === user?.user_id;
  const isMember = league?.members?.some((member) => member.user_id === user?.user_id);
  const myTeam = leaderboard.find((team) => team.username === user?.username);
  const memberCount = league?.members?.length || 0;

  const memberColumns = [
    { key: 'username', label: 'Usuario', render: (row) => <span className="font-body font-semibold text-[--color-text]">{row.username}</span> },
    { key: 'role', label: 'Rol' },
    { key: 'joined_at', label: 'Ingreso', render: (row) => formatLongDate(row.joined_at) },
    { key: 'team_name', label: 'Equipo', render: (row) => leaderboard.find((team) => team.username === row.username)?.team_name || '—' },
  ];

  const leaderboardColumns = [
    { key: 'league_rank', label: 'Puesto', render: (row) => <span className="font-stat text-3xl font-black text-[--color-text]">{row.league_rank}</span> },
    { key: 'team_name', label: 'Equipo', render: (row) => <Link to={`/teams/${row.fantasy_team_id}`} className="font-body font-semibold text-[--color-text] hover:text-[--color-accent]">{row.team_name}</Link> },
    { key: 'username', label: 'Usuario' },
    { key: 'active_roster_size', label: 'Activos', align: 'right' },
    { key: 'total_points', label: 'Puntos', align: 'right', render: (row) => <span className="font-stat text-3xl font-black text-[--color-text]">{formatInteger(row.total_points)}</span> },
  ];

  async function handleJoin() {
    try {
      await api.joinLeague(id);
      pushToast({ title: 'Te uniste a la liga', message: 'Ya formas parte de esta sala de playoffs.', tone: 'success' });
      await loadLeague();
    } catch (err) {
      pushToast({ title: 'No se pudo unir', message: err.message, tone: 'error' });
    }
  }

  async function handleStartDraft() {
    try {
      await api.startDraft(id);
      pushToast({ title: 'Draft iniciado', message: 'La sala ya esta activa.', tone: 'success' });
      await loadLeague();
    } catch (err) {
      pushToast({ title: 'No se pudo iniciar el draft', message: err.message, tone: 'error' });
    }
  }

  async function handleCreateTeam(event) {
    event.preventDefault();
    try {
      const team = await api.createTeam(id, { team_name: teamName });
      pushToast({ title: 'Equipo creado', message: `${team.team_name} ya esta en la liga.`, tone: 'success' });
      setTeamModalOpen(false);
      setTeamName('');
      navigate(`/teams/${team.fantasy_team_id}`);
    } catch (err) {
      pushToast({ title: 'No se pudo crear el equipo', message: err.message, tone: 'error' });
    }
  }

  if (!league) {
    return (
      <main className="page-shell mx-auto max-w-7xl space-y-6">
        <Skeleton variant="card" className="h-72" />
        <Skeleton variant="card" className="h-96" />
      </main>
    );
  }

  const statusTone =
    league.draft_status === 'completed' ? 'green' : league.draft_status === 'in_progress' ? 'orange' : 'gray';

  return (
    <main>
      <section
        className="relative overflow-hidden border-b border-[--color-border]"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(10,10,11,0.72), rgba(10,10,11,0.8)), url('https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=1800&q=80')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="mx-auto max-w-7xl px-6 py-12">
          <Link to="/leagues" className="inline-flex items-center gap-2 text-sm text-white/70">
            <ArrowLeft className="h-4 w-4" />
            Volver a ligas
          </Link>

          <div className="mt-8 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/55">Comisionado: @{league.creator_name}</p>
              <h1 className="mt-4 font-display text-5xl uppercase tracking-tight text-white md:text-7xl">{league.league_name}</h1>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge tone={statusTone}>{league.draft_status === 'completed' ? 'completado' : league.draft_status === 'in_progress' ? 'en curso' : 'pendiente'}</Badge>
                <Badge tone="gray">{memberCount}/{league.max_teams} miembros</Badge>
                <Badge tone="gold">{league.scoring_type}</Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {!isMember ? <button type="button" className="button-primary" onClick={handleJoin}>Unirse a liga</button> : null}
              {isMember && !myTeam ? <button type="button" className="button-secondary" onClick={() => setTeamModalOpen(true)}>Crear equipo</button> : null}
              {league.draft_status === 'pending' && isCommissioner ? <button type="button" className="button-primary min-w-[220px]" onClick={handleStartDraft}>Iniciar draft</button> : null}
              {league.draft_status === 'pending' && !isCommissioner ? <button type="button" className="button-secondary" disabled>Esperando draft</button> : null}
              {league.draft_status === 'in_progress' ? <Link to={`/leagues/${id}/draft`} className="button-primary">Ir al draft</Link> : null}
              {league.draft_status === 'completed' && myTeam ? <Link to={`/teams/${myTeam.fantasy_team_id}`} className="button-secondary">Ver roster</Link> : null}
            </div>
          </div>
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
        {league.draft_status === 'pending' && isCommissioner ? (
          <div className="mb-6 rounded-lg border border-[--color-accent]/30 bg-[--color-accent]/8 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-[--color-accent]">Sala lista para iniciar</p>
                <h2 className="mt-2 font-display text-3xl uppercase tracking-wide text-[--color-text]">Activa el draft cuando todos esten dentro</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[--color-text-muted]">Como comisionado, este es el control principal para abrir la sala de picks. Cuando arranque, los managers podran entrar directo al tablero.</p>
              </div>
              <button type="button" className="button-primary min-w-[220px]" onClick={handleStartDraft}>
                Iniciar draft ahora
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === 'overview' ? (
          <div className="grid gap-5 md:grid-cols-3">
            <div className="surface-card p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Miembros</p>
              <p className="mt-4 font-stat text-6xl font-black tracking-tight text-[--color-text]">{memberCount}</p>
            </div>
            <div className="surface-card p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Rondas drafteadas</p>
              <p className="mt-4 font-stat text-6xl font-black tracking-tight text-[--color-text]">{leaderboard.length ? Math.max(...leaderboard.map((team) => team.active_roster_size || 0)) : 0}</p>
            </div>
            <div className="surface-card p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Fecha del draft</p>
              <p className="mt-4 text-lg font-semibold text-[--color-text]">{league.draft_date ? formatLongDate(league.draft_date) : 'Sin programar'}</p>
            </div>
          </div>
        ) : null}

        {activeTab === 'members' ? (
          <div className="space-y-4">
            {isCommissioner ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  pushToast({ title: 'Enlace copiado', message: 'Comparte la URL actual con los managers.', tone: 'success' });
                }}
              >
                <Copy className="h-4 w-4" />
                Copiar enlace
              </button>
            ) : null}
            <Table columns={memberColumns} rows={league.members || []} />
          </div>
        ) : null}

        {activeTab === 'leaderboard' ? (
          leaderboard.length > 0 ? <Table columns={leaderboardColumns} rows={leaderboard} /> : <EmptyState icon={Trophy} title="Todavia no hay posiciones" body="La tabla aparecera cuando existan equipos y empiece a entrar puntuacion." />
        ) : null}

        {activeTab === 'draft-history' ? (
          <EmptyState icon={Rocket} title="No hay historial expuesto" body="El backend actual no devuelve el historial pick por pick de esta liga, asi que esta pestana no inventa datos." />
        ) : null}

        {activeTab === 'settings' ? (
          isCommissioner ? (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="surface-card p-6">
                <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Controles de liga</p>
                <div className="mt-5 space-y-3">
                  <button type="button" className="button-secondary w-full justify-start" disabled>
                    <Settings2 className="h-4 w-4" />
                    Renombrar liga
                  </button>
                  <button type="button" className="button-secondary w-full justify-start" disabled>
                    <Users className="h-4 w-4" />
                    Cambiar maximo de equipos
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-[--color-danger]/40 bg-[--color-danger]/10 p-6">
                <p className="text-xs uppercase tracking-[0.24em] text-[--color-danger]">Acciones de alto riesgo</p>
                <p className="mt-3 text-sm leading-6 text-[--color-text-muted]">El backend no expone endpoints para disolver la liga o rehacer el orden. Estos controles quedan deshabilitados a proposito.</p>
              </div>
            </div>
          ) : (
            <EmptyState icon={Settings2} title="Solo para el comisionado" body="La configuracion de la liga esta restringida a la cuenta comisionada." />
          )
        ) : null}
      </section>

      <Modal open={teamModalOpen} onClose={() => setTeamModalOpen(false)} title="Crear equipo" size="max-w-[420px]">
        <form className="space-y-4" onSubmit={handleCreateTeam}>
          <div className="space-y-2">
            <label className="field-label" htmlFor="team-name">Nombre del equipo</label>
            <input autoFocus id="team-name" className="field w-full" value={teamName} onChange={(event) => setTeamName(event.target.value)} />
          </div>
          <button type="submit" className="button-primary w-full">Crear equipo</button>
        </form>
      </Modal>
    </main>
  );
}
