import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import PlayerAvatar from '../components/PlayerAvatar';
import Skeleton from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { formatInteger, formatNumber, getInitials, ROSTER_SLOTS } from '../lib/utils';

export default function TeamRoster() {
  const { id } = useParams();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('BN1');

  async function loadRoster() {
    setLoading(true);
    try {
      const result = await api.roster(id);
      setRoster(result);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadRoster().catch(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [id]);

  const rosterMap = useMemo(() => Object.fromEntries(roster.map((item) => [item.roster_slot, item])), [roster]);
  const isOwner = roster[0]?.username === user?.username;
  const totalPoints = roster.reduce((sum, item) => sum + Number(item.season_ppg || 0), 0);

  async function openAddModal(slot) {
    setSelectedSlot(slot);
    setModalOpen(true);
    const result = await api.players('limit=50');
    setAvailablePlayers(result);
  }

  async function addPlayer(playerId) {
    try {
      await api.addPlayer(id, playerId, selectedSlot);
      pushToast({ title: 'Jugador agregado', message: `Se agrego al slot ${selectedSlot}.`, tone: 'success' });
      setModalOpen(false);
      await loadRoster();
    } catch (err) {
      pushToast({ title: 'No se pudo agregar', message: err.message, tone: 'error' });
    }
  }

  async function dropPlayer(playerId) {
    try {
      await api.dropPlayer(id, playerId);
      pushToast({ title: 'Jugador eliminado', message: 'El roster fue actualizado.', tone: 'success' });
      await loadRoster();
    } catch (err) {
      pushToast({ title: 'No se pudo eliminar', message: err.message, tone: 'error' });
    }
  }

  if (loading) {
    return (
      <main className="page-shell mx-auto max-w-7xl space-y-6">
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-[520px]" />
      </main>
    );
  }

  if (roster.length === 0) {
    return (
      <main className="page-shell mx-auto max-w-6xl">
        <EmptyState icon={Plus} title="El roster esta vacio" body="Crea o draftea jugadores en este equipo antes de usar este tablero." />
      </main>
    );
  }

  return (
    <main className="page-shell mx-auto max-w-7xl">
      <header className="surface-card flex flex-col gap-6 p-8 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <Link to={roster[0]?.league_id ? `/leagues/${roster[0].league_id}` : '/leagues'} className="inline-flex items-center gap-2 text-sm text-[--color-text-muted]">
            <ArrowLeft className="h-4 w-4" />
            Volver a la liga
          </Link>
          <h1 className="mt-4 font-display text-5xl uppercase tracking-tight text-[--color-text]">{roster[0]?.team_name || 'Equipo'}</h1>
          <p className="mt-2 text-sm text-[--color-text-muted]">Managed by {roster[0]?.username}</p>
        </div>
        <div className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] px-5 py-4">
          <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Puntos estimados</p>
          <p className="font-stat text-6xl font-black tracking-tight text-[--color-text]">{formatInteger(totalPoints)}</p>
        </div>
      </header>

      <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {ROSTER_SLOTS.map((slot) => {
          const player = rosterMap[slot];
          return (
            <article key={slot} className={`surface-card p-5 ${player ? '' : 'border-dashed'}`}>
              <p className="text-xs font-body font-semibold uppercase tracking-[0.24em] text-[--color-text-muted]">{slot}</p>
              {player ? (
                <div className="mt-5">
                  <PlayerAvatar playerId={player.player_id} playerName={player.player_name} teamAbbr={player.nba_team} size="lg" />
                  <h2 className="mt-4 font-display text-2xl uppercase tracking-wide text-[--color-text]">{player.player_name}</h2>
                  <p className="mt-1 text-sm text-[--color-text-muted]">{player.nba_team} · {player.position}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-[--color-border] bg-[--color-bg-elev-2] px-3 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">PPG</p>
                      <p className="font-stat text-2xl font-black text-[--color-text]">{formatNumber(player.season_ppg)}</p>
                    </div>
                    <div className="rounded-md border border-[--color-border] bg-[--color-bg-elev-2] px-3 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">RPG</p>
                      <p className="font-stat text-2xl font-black text-[--color-text]">{formatNumber(player.season_rpg)}</p>
                    </div>
                    <div className="rounded-md border border-[--color-border] bg-[--color-bg-elev-2] px-3 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">APG</p>
                      <p className="font-stat text-2xl font-black text-[--color-text]">{formatNumber(player.season_apg)}</p>
                    </div>
                  </div>
                  {isOwner ? (
                    <button type="button" className="mt-5 inline-flex items-center gap-2 text-sm text-[--color-danger]" onClick={() => dropPlayer(player.player_id)}>
                      <Trash2 className="h-4 w-4" />
                      Soltar jugador
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="mt-5 flex min-h-56 flex-col items-start justify-between rounded-lg border border-dashed border-[--color-border-strong] bg-[--color-bg-elev-2] p-5">
                  <div>
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[--color-border] bg-[--color-bg] text-[--color-text-dim]">
                      <span className="font-stat text-3xl font-black">{getInitials(slot)}</span>
                    </div>
                    <h2 className="mt-4 font-display text-2xl uppercase tracking-wide text-[--color-text]">Slot libre</h2>
                    <p className="mt-2 text-sm text-[--color-text-muted]">Agrega un agente libre o espera la siguiente ventana de movimientos.</p>
                  </div>
                  {isOwner ? <button type="button" className="button-secondary" onClick={() => openAddModal(slot)}>Agregar agente libre</button> : null}
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="mt-8 surface-card p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Movimientos recientes</p>
        <p className="mt-3 text-sm text-[--color-text-muted]">El endpoint actual del roster no devuelve el historial de transacciones, asi que este panel es solo informativo.</p>
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Agregar jugador · ${selectedSlot}`} size="max-w-3xl">
        <div className="grid gap-3 md:grid-cols-2">
          {availablePlayers.map((player) => (
            <button
              key={player.player_id}
              type="button"
              onClick={() => addPlayer(player.player_id)}
              className="surface-card flex items-center gap-3 p-4 text-left hover:border-[--color-accent]"
            >
              <PlayerAvatar playerId={player.player_id} playerName={player.first_name + ' ' + player.last_name} teamAbbr={player.team} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-body font-semibold text-[--color-text]">{player.first_name} {player.last_name}</p>
                <p className="text-xs text-[--color-text-muted]">{player.team} · {player.position}</p>
              </div>
              <Plus className="h-4 w-4 text-[--color-accent]" />
            </button>
          ))}
        </div>
      </Modal>
    </main>
  );
}
