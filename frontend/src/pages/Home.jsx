import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Flame, Sparkles, Trophy, Users } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth-context';
import RoundChip from '../components/RoundChip';
import Badge from '../components/Badge';
import TeamLogo from '../components/TeamLogo';
import PlayerAvatar from '../components/PlayerAvatar';
import RefreshStatusControl from '../components/RefreshStatusControl';
import Skeleton from '../components/Skeleton';
import { formatDateTime } from '../lib/utils';
import { getTeamMeta } from '../lib/teamData';

const QUICK_LINKS = [
  { title: 'Jugadores en racha', href: '/hot-cold', icon: Flame, body: 'Detecta subidas y bajadas antes que el resto de la liga.' },
  { title: 'Liderato de playoffs', href: '/reports', icon: Trophy, body: 'Revisa a las estrellas con mejor produccion fantasy.' },
  { title: 'Partidos de hoy', href: '/games', icon: CalendarDays, body: 'Consulta la cartelera de playoffs con vista tipo transmision.' },
  { title: 'Mi roster', href: '/leagues', icon: Users, body: 'Entra directo a tus ligas, movimientos y posiciones.' },
];

function FeatureCard({ title, body, children, reverse = false }) {
  return (
    <section className={`grid items-center gap-8 py-16 lg:grid-cols-2 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
      <div className="space-y-5">
        <p className="text-[10px] font-body font-semibold uppercase tracking-[0.28em] text-[--color-accent]">Inteligencia de playoffs</p>
        <h2 className="max-w-2xl font-display text-5xl uppercase leading-[0.95] tracking-tight text-[--color-text] md:text-6xl">{title}</h2>
        <p className="max-w-xl text-base leading-7 text-[--color-text-muted]">{body}</p>
      </div>
      {children}
    </section>
  );
}

function RoundStack() {
  return (
    <div className="surface-card grid grid-flow-dense grid-cols-2 gap-4 p-6">
      {[
        { label: 'Ronda 1', value: 'x1.0', className: 'chip-r1', span: 'col-span-2' },
        { label: 'Semifinales', value: 'x1.25', className: 'chip-semi', span: 'col-span-1' },
        { label: 'Finales de conferencia', value: 'x1.5', className: 'chip-cf', span: 'col-span-1' },
        { label: 'Finales', value: 'x2.0', className: 'chip-finals', span: 'col-span-2' },
      ].map((item) => (
        <div key={item.label} className={`rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-5 ${item.span}`}>
          <span className={`badge ${item.className}`}>{item.label}</span>
          <div className="mt-4 font-stat text-5xl font-black tracking-tight text-[--color-text]">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [health, setHealth] = useState(null);
  const [games, setGames] = useState([]);
  const [hotCold, setHotCold] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState(false);
  const [hotColdLoading, setHotColdLoading] = useState(true);
  const [hotColdError, setHotColdError] = useState(false);
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    api.health()
      .then((response) => {
        setHealth(response);
        setHealthError(false);
      })
      .catch(() => {
        setHealthError(true);
      });

    api.games(null, 8)
      .then((response) => {
        setGames(response);
        setGamesError(false);
      })
      .catch(() => {
        setGames([]);
        setGamesError(true);
      })
      .finally(() => setGamesLoading(false));

    api.hotCold(3)
      .then((response) => {
        setHotCold(response);
        setHotColdError(false);
      })
      .catch(() => {
        setHotCold([]);
        setHotColdError(true);
      })
      .finally(() => setHotColdLoading(false));
  }, []);

  return (
    <main className="overflow-x-hidden">
      <section
        className="relative flex min-h-[520px] items-end overflow-hidden"
      >
        <div
          className="hero-media absolute inset-0 scale-[1.03]"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=2400&q=80')",
          }}
        />
        <div className="hero-overlay absolute inset-0" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,10,11,0.52)_0%,rgba(10,10,11,0.28)_34%,rgba(10,10,11,0.16)_100%)]" />
        <div className="absolute left-6 top-8 z-10 md:left-10">
          <Badge tone="orange">Playoffs NBA 2026</Badge>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-16 pt-28">
          <div className="grid items-center gap-10 xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
            <div className="min-w-0">
              <div className="max-w-5xl">
                <p className="mb-4 text-xs font-body font-semibold uppercase tracking-[0.34em] text-[--color-accent]">Fantasy solo para playoffs</p>
                <h1 className="max-w-5xl text-balance font-display text-[clamp(3.1rem,8vw,7.4rem)] uppercase italic leading-[0.88] tracking-tight text-[--color-text] [text-shadow:0_10px_28px_rgba(0,0,0,0.38)]">
                  Draftea estrellas.
                  <br />
                  <span className="text-[--color-accent]">Gana el anillo.</span>
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-white/88 [text-shadow:0_8px_24px_rgba(0,0,0,0.42)]">
                  Ocho jugadores. Cuatro rondas. Una alineacion campeona. Un sistema con multiplicadores que premia las carreras largas y las decisiones de manager de verdad.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/leagues" className="button-primary">
                  Entrar a mis ligas
                </Link>
                <Link to="/players" className="button-secondary">
                  Ver jugadores
                </Link>
                {healthError || gamesError || hotColdError ? <Badge tone="red">Backend desconectado</Badge> : null}
              </div>

              <div className="mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
                <div className="glass-panel px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/60">Jugadores</p>
                  <p className="font-stat text-4xl font-black tracking-tight text-white">{health?.counts?.players ?? '791'}</p>
                </div>
                <div className="glass-panel px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/60">Partidos</p>
                  <p className="font-stat text-4xl font-black tracking-tight text-white">{health?.counts?.games ?? '3,778'}</p>
                </div>
                <div className="glass-panel px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/60">Box scores</p>
                  <p className="font-stat text-4xl font-black tracking-tight text-white">{health?.counts?.stats ?? '88,603'}</p>
                </div>
              </div>
            </div>

            <div className="w-full xl:self-center xl:justify-self-end xl:-translate-y-8 xl:translate-x-6 2xl:-translate-y-6 2xl:translate-x-10">
              <RefreshStatusControl user={user} />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[--color-border] bg-[--color-bg-elev]">
        <div className="mx-auto flex max-w-7xl gap-0 overflow-x-auto px-0">
          {gamesLoading
            ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} variant="card" className="m-4 min-w-[220px]" />)
            : gamesError
              ? Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="m-4 flex min-h-[188px] min-w-[240px] flex-col justify-between rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-5">
                    <div>
                      <Badge tone="red">API desconectada</Badge>
                      <h3 className="mt-4 font-display text-2xl uppercase tracking-wide text-[--color-text]">Sin feed de partidos</h3>
                      <p className="mt-2 text-sm leading-6 text-[--color-text-muted]">Levanta el backend en el puerto 8000 para cargar esta franja en vivo.</p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[--color-text-dim]">Proxy esperado: localhost:8000</p>
                  </div>
                ))
            : games.map((game) => {
                const homeMeta = getTeamMeta(game.home_team);
                const awayMeta = getTeamMeta(game.away_team);
                const homeWins = Number(game.home_score) >= Number(game.away_score);
                return (
                  <div key={game.game_id} className="min-w-[240px] border-r border-[--color-border] px-4 py-4 first:pl-6 last:pr-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <RoundChip round={game.playoff_round} />
                      <span className="text-xs text-[--color-text-muted]">{formatDateTime(game.game_date)}</span>
                    </div>
                    <div className="space-y-3">
                      {[
                        { label: game.home_team, score: game.home_score, winner: homeWins, meta: homeMeta },
                        { label: game.away_team, score: game.away_score, winner: !homeWins, meta: awayMeta },
                      ].map((team) => (
                        <div key={team.label} className="flex items-center gap-3">
                          <TeamLogo teamId={team.meta?.teamId} teamAbbr={team.label} size="sm" />
                          <span className="font-display text-lg uppercase tracking-wide text-[--color-text]">{team.label}</span>
                          <span className={`ml-auto font-stat text-3xl font-black tracking-tight ${team.winner ? 'text-[--color-text]' : 'text-[--color-text-muted]'}`}>
                            {team.score}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      {String(game.status).toLowerCase() === 'live' ? <span className="live-dot h-2 w-2 rounded-full bg-[--color-accent-hot]" /> : null}
                      <Badge tone={String(game.status).toLowerCase() === 'live' ? 'red' : 'green'}>
                        {String(game.status).toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                );
              })}
        </div>
      </section>

      <section className="page-shell mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-4 py-12 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_LINKS.filter((item) => (item.title === 'Mi roster' ? Boolean(user) : true)).map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.title} to={item.href} className="surface-card group p-5 hover:border-[--color-accent] hover:bg-[--color-bg-elev-2]">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[--color-accent]/12 text-[--color-accent] transition-transform duration-700 group-hover:scale-105">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-display text-2xl uppercase tracking-wide text-[--color-text]">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[--color-text-muted]">{item.body}</p>
              </Link>
            );
          })}
        </div>

        <FeatureCard
          title="Cada minuto de playoffs pesa."
          body="La puntuacion sube de valor a medida que avanza la postemporada. La primera ronda marca la base y luego semis, finales de conferencia y finales multiplican cada punto fantasy."
        >
          <RoundStack />
        </FeatureCard>

        <FeatureCard
          title="Rachas calientes y frias, en tiempo real."
          body="El motor de rachas compara los ultimos cinco partidos de playoffs de cada jugador contra su linea base de temporada y marca variaciones por encima del 20%, para que puedas reaccionar antes del siguiente cierre."
          reverse
        >
          <div className="surface-card p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">Vista previa</p>
                <h3 className="font-display text-3xl uppercase tracking-wide text-[--color-text]">Tablero de racha</h3>
              </div>
              <Link to="/hot-cold" className="button-secondary">
                Ver rachas
              </Link>
            </div>
            <div className="space-y-3">
              {hotColdLoading
                ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} variant="row" />)
                : hotColdError
                  ? (
                    <div className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-5">
                      <Badge tone="red">API desconectada</Badge>
                      <p className="mt-4 text-sm leading-6 text-[--color-text-muted]">No se pudo cargar el motor de rachas porque el backend no responde en el puerto 8000.</p>
                    </div>
                  )
                : hotCold.map((player) => (
                    <div key={player.player_id} className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-4">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar playerId={player.player_id} playerName={player.player_name} teamAbbr={player.team} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-xl uppercase tracking-wide text-[--color-text]">{player.player_name}</p>
                          <p className="text-xs uppercase tracking-[0.18em] text-[--color-text-muted]">{player.team}</p>
                        </div>
                        <span className={`font-stat text-3xl font-black tracking-tight ${player.streak_status === 'hot' ? 'text-[--color-accent-hot]' : player.streak_status === 'cold' ? 'text-[--color-accent-cold]' : 'text-[--color-text-muted]'}`}>
                          {player.pts_pct_change > 0 ? '+' : ''}
                          {player.pts_pct_change}%
                        </span>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </FeatureCard>

        <FeatureCard
          title="Scouting IA en un click."
          body="Los reportes cacheados con GPT-4o-mini convierten la muestra reciente de cinco partidos en un informe claro de front office: tendencia, valor y recomendacion para el siguiente tramo de playoffs."
        >
          <div className="surface-card grid grid-flow-dense grid-cols-2 gap-4 p-6">
            <div className="col-span-2 rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[--color-accent]/12 text-[--color-accent]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[--color-text-muted]">Resumen de scouting</p>
                  <h3 className="font-display text-3xl uppercase tracking-wide text-[--color-text]">Notas accionables</h3>
                </div>
              </div>
              <div className="space-y-3 text-sm leading-6 text-[--color-text-muted]">
                <p>El analisis resume tendencia reciente y contexto real de los ultimos cinco partidos.</p>
                <p>El valor fantasy y la recomendacion aparecen separados para facilitar decisiones rapidas.</p>
                <p>Los reportes quedan cacheados en el servidor para que las siguientes consultas sean rapidas.</p>
              </div>
            </div>
            <div className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[--color-text-muted]">Recomendacion</p>
              <p className="mt-3 font-display text-4xl uppercase tracking-tight text-[--color-text]">Mantener</p>
            </div>
            <div className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[--color-text-muted]">Senal</p>
              <p className="mt-3 font-display text-4xl uppercase tracking-tight text-[--color-accent]">Racha caliente</p>
            </div>
          </div>
        </FeatureCard>
      </section>

      <footer className="border-t border-[--color-border] bg-[--color-bg-elev]">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 md:grid-cols-3">
          <div>
            <p className="font-display text-2xl uppercase tracking-[0.2em] text-[--color-text]">Playoff Hoops</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[--color-text-muted]">Fantasy de basketball para los playoffs NBA con multiplicadores, rachas y scouting rapido.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-[--color-text-muted]">
            <span>Acerca</span>
            <span>Datos</span>
            <span>Creditos</span>
            <span>Contacto</span>
          </div>
          <div className="text-sm text-[--color-text-muted]">
            Datos Kaggle · eoinamoore/historical-nba-data-and-player-box-scores
          </div>
        </div>
      </footer>
    </main>
  );
}
