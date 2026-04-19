import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, Trophy, User2, X } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { cn, getCurrentPlayoffPhase, getInitials } from '../lib/utils';

const LINKS = [
  { to: '/players', label: 'Jugadores' },
  { to: '/hot-cold', label: 'Rachas' },
  { to: '/games', label: 'Partidos' },
  { to: '/reports', label: 'Reportes' },
  { to: '/leagues', label: 'Mis ligas' },
];

function LogoMark() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[--color-accent]/15 text-[--color-accent] ring-1 ring-[--color-accent]/30">
      <Trophy className="h-5 w-5" />
    </div>
  );
}

function NavLink({ to, label, active, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center rounded-md px-4 text-sm font-body font-semibold uppercase tracking-[0.14em] transition-colors duration-150',
        active
          ? 'border-b-2 border-[--color-accent] pb-[6px] text-[--color-text]'
          : 'text-[--color-text-muted] hover:bg-[--color-bg-elev-2] hover:text-[--color-text]',
      )}
    >
      {label}
    </Link>
  );
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const playoffPhase = getCurrentPlayoffPhase();

  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[--color-border] bg-[--color-bg-elev]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <LogoMark />
            <div className="min-w-0">
              <div className="whitespace-nowrap font-display text-sm uppercase tracking-[0.14em] text-[--color-text] sm:text-base md:text-lg md:tracking-[0.2em]">Playoff Hoops</div>
              <div className="hidden whitespace-nowrap text-[10px] font-body uppercase tracking-[0.22em] text-[--color-text-dim] md:block">
                {health?.counts?.players ? `${health.counts.players} jugadores` : 'Fantasy de playoffs'}
              </div>
            </div>
          </Link>
          <div className={cn('hidden px-3 py-1 text-xs font-body font-semibold uppercase tracking-[0.16em] xl:inline-flex', 'badge', playoffPhase.toneClassName)}>
            {playoffPhase.label} · {playoffPhase.sublabel}
          </div>
        </div>

        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((item) => (
            <NavLink key={item.to} to={item.to} label={item.label} active={location.pathname.startsWith(item.to)} />
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="icon-button lg:hidden" onClick={() => setDrawerOpen((value) => !value)} aria-label="Abrir navegación">
            {drawerOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {user ? (
            <>
              <button type="button" className="icon-button hidden md:inline-flex" aria-label="Notificaciones">
                <Bell className="h-4 w-4" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  className="inline-flex items-center gap-3 rounded-full border border-[--color-border] bg-[--color-bg-elev-2] px-2 py-2 text-left transition-colors duration-150 hover:border-[--color-border-strong] focus:ring-2 focus:ring-[--color-accent] focus:ring-offset-2 focus:ring-offset-[--color-bg] focus:outline-none"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[--color-accent] font-stat text-xl font-black tracking-tight text-black">
                    {getInitials(user.username)}
                  </span>
                  <span className="hidden pr-3 font-body text-sm font-semibold text-[--color-text] sm:block">{user.username}</span>
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 mt-2 w-56 rounded-lg border border-[--color-border] bg-[--color-bg-elev] p-2 shadow-2xl">
                    <Link to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[--color-text-muted] hover:bg-[--color-bg-elev-2] hover:text-[--color-text]">
                      <User2 className="h-4 w-4" />
                      Perfil
                    </Link>
                    <Link to="/leagues" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[--color-text-muted] hover:bg-[--color-bg-elev-2] hover:text-[--color-text]">
                      <Trophy className="h-4 w-4" />
                      Mis ligas
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                        navigate('/login');
                      }}
                      className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[--color-danger] hover:bg-[--color-danger]/10"
                    >
                      <X className="h-4 w-4" />
                      Cerrar sesion
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link to="/login" className="button-secondary">
                Ingresar
              </Link>
              <Link to="/leagues" className="button-primary">
                Unirse a liga
              </Link>
            </div>
          )}
        </div>
      </div>

      {drawerOpen ? (
        <div className="border-t border-[--color-border] bg-[--color-bg-elev] px-4 py-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                label={item.label}
                active={location.pathname.startsWith(item.to)}
                onClick={() => {
                  setDrawerOpen(false);
                  setMenuOpen(false);
                }}
              />
            ))}
            {!user ? (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Link to="/login" className="button-secondary text-center">
                  Ingresar
                </Link>
                <Link to="/register" className="button-primary text-center">
                  Registrarse
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
