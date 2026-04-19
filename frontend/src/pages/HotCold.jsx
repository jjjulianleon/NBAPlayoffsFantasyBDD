import { useEffect, useState } from 'react';
import { Flame, Snowflake, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PlayerRow from '../components/PlayerRow';
import Skeleton from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { formatNumber, formatPercent } from '../lib/utils';

export default function HotCold() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNeutral, setShowNeutral] = useState(false);

  useEffect(() => {
    api.hotCold(50)
      .then(setPlayers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hot = players.filter((player) => player.streak_status === 'hot').slice(0, 10);
  const cold = players.filter((player) => player.streak_status === 'cold').slice(0, 10);
  const neutral = players.filter((player) => player.streak_status === 'neutral').slice(0, 20);

  function renderList(list, tone, Icon, title) {
    return (
      <article className={`surface-card rounded-lg border-l-4 ${tone === 'hot' ? 'border-l-[--color-accent-hot]' : 'border-l-[--color-accent-cold]'} p-6`}>
        <div className="mb-5 flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tone === 'hot' ? 'bg-[--color-accent-hot]/12 text-[--color-accent-hot]' : 'bg-[--color-accent-cold]/12 text-[--color-accent-cold]'}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">Umbral ±20%</p>
            <h2 className="font-display text-3xl uppercase tracking-wide text-[--color-text]">{title}</h2>
          </div>
        </div>

        <div className="space-y-3">
          {list.map((player) => (
            <PlayerRow
              key={player.player_id}
              player={player}
              onClick={() => navigate(`/players/${player.player_id}`)}
              trailing={
                <div className="text-right">
                  <div className={`font-stat text-3xl font-black tracking-tight ${tone === 'hot' ? 'text-[--color-accent-hot]' : 'text-[--color-accent-cold]'}`}>
                    {formatPercent(player.pts_pct_change)}
                  </div>
                  <div className="text-xs text-[--color-text-muted]">
                    Season {formatNumber(player.season_ppg)} → Last5 {formatNumber(player.last5_ppg)}
                  </div>
                </div>
              }
            />
          ))}
        </div>
      </article>
    );
  }

  return (
    <main className="page-shell mx-auto max-w-7xl">
      <header className="pb-8 pt-4">
        <p className="text-xs font-body font-semibold uppercase tracking-[0.28em] text-[--color-text-muted]">Seguimiento de rachas</p>
        <h1 className="mt-4 font-display text-5xl uppercase tracking-tight text-[--color-text] md:text-6xl">
          <span className="text-[--color-accent-hot]">Calientes</span> &amp; <span className="text-[--color-accent-cold]">Frios</span>
        </h1>
        <p className="mt-3 text-base text-[--color-text-muted]">Ultimos 5 partidos vs promedio de temporada. Umbral: +/-20%.</p>
      </header>

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2">
          <Skeleton variant="card" className="h-[520px]" />
          <Skeleton variant="card" className="h-[520px]" />
        </div>
      ) : players.length === 0 ? (
        <EmptyState icon={Zap} title="Todavia no hay datos de rachas" body="Cuando el backend entregue las senales de jugadores calientes y frios, este tablero se llenara automaticamente." />
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            {renderList(hot, 'hot', Flame, 'Lista caliente')}
            {renderList(cold, 'cold', Snowflake, 'Lista fria')}
          </div>

          <section className="mt-8 surface-card p-6">
            <div className="flex flex-col items-start justify-between gap-4 border-b border-[--color-border] pb-4 md:flex-row md:items-center">
              <div>
                <p className="text-[10px] font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">Zona neutral</p>
                <h2 className="font-display text-3xl uppercase tracking-wide text-[--color-text]">Produccion estable</h2>
              </div>
              <button type="button" className="button-secondary" onClick={() => setShowNeutral((value) => !value)}>
                {showNeutral ? 'Ocultar neutrales' : 'Mostrar 20 neutrales'}
              </button>
            </div>

            {showNeutral ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {neutral.map((player) => (
                  <PlayerRow key={player.player_id} player={player} onClick={() => navigate(`/players/${player.player_id}`)} compact />
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-[--color-text-muted]">Los jugadores neutrales quedan plegados por defecto para destacar primero los cambios mas fuertes.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
