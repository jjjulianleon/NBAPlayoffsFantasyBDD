import { useEffect, useState } from 'react';
import { LogOut, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { api } from '../api';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { formatLongDate, formatInteger, getInitials } from '../lib/utils';

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { pushToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => {
    if (!user) {
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const [me, myLeagues] = await Promise.all([api.me(), api.leagues()]);
        setProfile(me);
        setEmail(me.email || '');
        setLeagues(myLeagues);
      } finally {
        setLoading(false);
      }
    }

    const timeout = window.setTimeout(() => {
      load().catch(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [user]);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await api.updateProfile({ email });
      pushToast({ title: 'Perfil actualizado', message: 'Tus cambios se guardaron correctamente.', tone: 'success' });
      const refreshed = await api.me();
      setProfile(refreshed);
    } catch (err) {
      pushToast({ title: 'No se pudo actualizar', message: err.message, tone: 'error' });
    }
  }

  if (!user) {
    return (
      <main className="page-shell mx-auto max-w-4xl">
        <EmptyState icon={LogOut} title="Debes iniciar sesion" body="Tu perfil depende de la sesion JWT. Ingresa primero para verlo o editarlo." />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="page-shell mx-auto max-w-5xl space-y-6">
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-96" />
      </main>
    );
  }

  return (
    <main className="page-shell mx-auto max-w-5xl">
      <header className="surface-card flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-5">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[--color-accent] font-stat text-5xl font-black tracking-tight text-black">
            {getInitials(profile?.username || user.username)}
          </div>
          <div>
            <p className="text-xs font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">Perfil</p>
            <h1 className="mt-2 font-display text-5xl uppercase tracking-tight text-[--color-text]">{profile?.username || user.username}</h1>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[--color-text-muted]">Total de ligas</p>
            <p className="font-stat text-4xl font-black tracking-tight text-[--color-text]">{formatInteger(leagues.length)}</p>
          </div>
          {profile?.created_at ? (
            <div className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[--color-text-muted]">Miembro desde</p>
              <p className="text-sm font-semibold text-[--color-text]">{formatLongDate(profile.created_at)}</p>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <form onSubmit={handleSubmit} className="surface-card p-8">
          <div className="mb-6">
            <p className="text-xs font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">Identidad</p>
            <h2 className="mt-2 font-display text-3xl uppercase tracking-wide text-[--color-text]">Configuracion de cuenta</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="field-label" htmlFor="profile-email">Email</label>
              <input id="profile-email" type="email" className="field w-full" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="field-label">Username</label>
              <div className="field flex items-center">{profile?.username || user.username}</div>
            </div>
            <button type="submit" className="button-primary">
              <Save className="h-4 w-4" />
              Guardar cambios
            </button>
          </div>
        </form>

        <aside className="space-y-6">
          <div className="surface-card p-6">
            <p className="text-xs font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">Actividad en ligas</p>
            <div className="mt-4 space-y-3">
              {leagues.length === 0 ? <p className="text-sm text-[--color-text-muted]">Todavia no tienes ligas activas.</p> : leagues.map((league) => (
                <div key={league.league_id} className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] px-4 py-3">
                  <p className="font-body font-semibold text-[--color-text]">{league.league_name}</p>
                  <p className="text-xs text-[--color-text-muted]">{league.member_count}/{league.max_teams} teams</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[--color-danger]/40 bg-[--color-danger]/10 p-6">
            <p className="text-xs font-body font-semibold uppercase tracking-[0.24em] text-[--color-danger]">Zona sensible</p>
            <h3 className="mt-2 font-display text-2xl uppercase tracking-wide text-[--color-text]">Cerrar sesion</h3>
            <p className="mt-2 text-sm text-[--color-text-muted]">Cierra la sesion actual y te devuelve a la pantalla de ingreso.</p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-[--color-danger]/40 px-4 py-3 text-xs font-body font-bold uppercase tracking-[0.2em] text-[--color-danger] transition-colors duration-150 hover:bg-[--color-danger]/12"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
