import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, BrainCircuit, Plus, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth-context';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import PlayerAvatar from '../components/PlayerAvatar';
import SelectMenu from '../components/SelectMenu';
import Skeleton from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { formatDateTime, formatInteger, formatNumber, formatRelativeTime, getInitials, ROSTER_SLOTS } from '../lib/utils';

export default function TeamRoster() {
  const { id } = useParams();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [roster, setRoster] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('BN1');
  const [lineup, setLineup] = useState(null);
  const [lineupLoading, setLineupLoading] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [movePlayer, setMovePlayer] = useState(null);
  const [moveTargetSlot, setMoveTargetSlot] = useState('BN1');
  const [moveLoading, setMoveLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);

  const loadRoster = useCallback(async () => {
    setLoading(true);
    try {
      const [rosterResult, transactionResult] = await Promise.all([
        api.roster(id),
        api.rosterTransactions(id),
      ]);
      setRoster(rosterResult);
      setTransactions(transactionResult);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadRoster().catch(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [id, loadRoster]);

  const loadLineup = useCallback(async () => {
    setLineupLoading(true);
    try {
      const result = await api.lineup(id);
      setLineup(result);
    } catch (err) {
      pushToast({ title: 'No se pudo calcular alineacion', message: err.message, tone: 'error' });
    } finally {
      setLineupLoading(false);
    }
  }, [id, pushToast]);

  useEffect(() => {
    if (roster.length > 0) {
      const timeout = window.setTimeout(() => {
        loadLineup().catch(() => {});
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [roster.length, loadLineup]);

  const rosterMap = useMemo(() => Object.fromEntries(roster.map((item) => [item.roster_slot, item])), [roster]);
  const moveSlotOptions = useMemo(
    () => ROSTER_SLOTS.map((slot) => {
      const occupant = rosterMap[slot];
      const samePlayer = occupant?.player_id === movePlayer?.player_id;

      return {
        value: slot,
        label: slot,
        description: samePlayer ? 'Slot actual' : occupant ? `Swap con ${occupant.player_name}` : 'Slot libre',
      };
    }),
    [movePlayer?.player_id, rosterMap],
  );
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

  function openMoveModal(player) {
    setMovePlayer(player);
    setMoveTargetSlot(player.roster_slot);
    setMoveModalOpen(true);
  }

  async function moveRosterPlayer() {
    if (!movePlayer || moveTargetSlot === movePlayer.roster_slot) {
      setMoveModalOpen(false);
      return;
    }

    setMoveLoading(true);
    try {
      await api.moveRosterPlayer(id, movePlayer.player_id, moveTargetSlot);
      pushToast({ title: 'Roster actualizado', message: `${movePlayer.player_name} ahora va en ${moveTargetSlot}.`, tone: 'success' });
      setMoveModalOpen(false);
      await loadRoster();
      await loadLineup();
    } catch (err) {
      pushToast({ title: 'No se pudo mover', message: err.message, tone: 'error' });
    } finally {
      setMoveLoading(false);
    }
  }

  async function applySuggestedLineup() {
    setApplyLoading(true);
    try {
      // Send the assignments the user already sees so the backend applies
      // exactly what was displayed, regardless of any data refresh that may
      // have run between loading the recommendation and clicking apply.
      const assignments = lineup?.lineup
        ?.filter((p) => p.recommended_slot)
        .map((p) => ({ player_id: p.player_id, slot: p.recommended_slot }));
      const result = await api.applySuggestedLineup(id, assignments);
      pushToast({
        title: 'Alineacion aplicada',
        message: `${result.starters} titulares y ${result.bench} suplentes reordenados automaticamente.`,
        tone: 'success',
      });
      await loadRoster();
      await loadLineup();
    } catch (err) {
      pushToast({ title: 'No se pudo aplicar la alineacion', message: err.message, tone: 'error' });
    } finally {
      setApplyLoading(false);
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
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button type="button" className="button-secondary" onClick={() => openMoveModal(player)}>
                        <ArrowRightLeft className="h-4 w-4" />
                        Mover de slot
                      </button>
                      <button type="button" className="inline-flex items-center gap-2 text-sm text-[--color-danger]" onClick={() => dropPlayer(player.player_id)}>
                        <Trash2 className="h-4 w-4" />
                        Soltar jugador
                      </button>
                    </div>
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
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Alineacion sugerida (ML)</p>
            <h3 className="mt-2 font-display text-3xl uppercase tracking-wide text-[--color-text]">Lineup recomendado para R1</h3>
            <p className="mt-2 text-sm text-[--color-text-muted]">
              Blend heuristico: 50% ultimos 5 + 30% historial vs rival + 20% temporada.
              Oponente segun bracket (seed 1-8, 2-7, 3-6, 4-5).
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {isOwner ? (
              <button type="button" className="button-primary" onClick={applySuggestedLineup} disabled={applyLoading || lineupLoading || !lineup?.suggested_changes}>
                <BrainCircuit className="h-4 w-4" />
                {applyLoading ? 'Aplicando...' : 'Aplicar alineacion sugerida'}
              </button>
            ) : null}
            <button type="button" className="button-secondary" onClick={loadLineup} disabled={lineupLoading || applyLoading}>
              <BrainCircuit className="h-4 w-4" />
              {lineupLoading ? 'Calculando...' : 'Recalcular'}
            </button>
          </div>
        </div>

        {lineup?.lineup?.length ? (
          <div className="mt-6 space-y-3">
            <div className="rounded-lg border border-[--color-border] bg-[--color-bg] px-4 py-3 text-sm text-[--color-text-muted]">
              Cambios sugeridos: <span className="font-semibold text-[--color-text]">{lineup.suggested_changes}</span>. Los titulares recomendados ocupan 6 slots: G1, G2, F1, F2, C y UTIL.
            </div>
            {lineup.validation ? (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-[--color-border] bg-[--color-bg] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">Titulares actuales</p>
                  <p className="mt-2 font-stat text-3xl font-black text-[--color-text]">{formatNumber(lineup.validation.current_projected_total)}</p>
                </div>
                <div className="rounded-lg border border-[--color-border] bg-[--color-bg] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">Titulares sugeridos</p>
                  <p className="mt-2 font-stat text-3xl font-black text-[--color-accent]">{formatNumber(lineup.validation.recommended_projected_total)}</p>
                </div>
                <div className="rounded-lg border border-[--color-border] bg-[--color-bg] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">Ganancia proyectada</p>
                  <p className="mt-2 font-stat text-3xl font-black text-[--color-text]">{formatNumber(lineup.validation.projected_gain)}</p>
                </div>
                <div className="rounded-lg border border-[--color-border] bg-[--color-bg] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">Alertas de validacion</p>
                  <p className="mt-2 text-sm text-[--color-text-muted]">
                    {lineup.validation.forced_out_of_position} fuera de posicion, {lineup.validation.forced_unavailable_starters} sin rival activo.
                  </p>
                </div>
              </div>
            ) : null}
            {lineup.decision_commentary ? (
              <div className="rounded-lg border border-[--color-border] bg-[--color-bg] px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">Por que esta prediccion</p>
                  <Badge tone={lineup.decision_commentary_generated_by && lineup.decision_commentary_generated_by !== 'local-heuristic-v1' ? 'green' : 'gray'}>
                    {lineup.decision_commentary_generated_by && lineup.decision_commentary_generated_by !== 'local-heuristic-v1' ? 'OpenAI' : 'Local'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[--color-text-muted]">{lineup.decision_commentary}</p>
              </div>
            ) : null}
            {lineup.lineup.map((p) => {
              const tone = p.recommended_role === 'starter' ? 'green' : 'gray';
              const label = p.recommended_role === 'starter' ? 'Titular' : 'Banca';
              return (
                <article key={p.player_id} className="flex flex-col gap-3 rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <PlayerAvatar playerId={p.player_id} playerName={p.player_name} teamAbbr={p.team} size="md" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-body font-semibold text-[--color-text]">{p.player_name}</p>
                        <Badge tone={tone}>{label}</Badge>
                        <Badge tone={p.availability === 'active' ? 'green' : 'red'}>
                          {p.availability === 'active' ? 'Activo' : 'Sin rival'}
                        </Badge>
                        <Badge tone="gray">Actual: {p.roster_slot}</Badge>
                        {p.recommended_slot ? <Badge tone={p.needs_change ? 'orange' : 'green'}>Sugerido: {p.recommended_slot}</Badge> : null}
                        {!p.slot_fit && p.recommended_slot ? <Badge tone="orange">Fuera de posicion</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-[--color-text-muted]">
                        {p.team} · {p.position} {p.opponent ? `· vs ${p.opponent} (R1)` : '· sin rival (equipo eliminado)'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 md:text-right">
                    <div className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">Proy. FP</p>
                      <p className="font-stat text-2xl font-black text-[--color-accent]">{formatNumber(p.predicted_fantasy_pts)}</p>
                    </div>
                    <div className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">Proy. PTS</p>
                      <p className="font-stat text-2xl font-black text-[--color-text]">{formatNumber(p.predicted_points)}</p>
                    </div>
                    <div className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">Conf.</p>
                      <p className="font-stat text-2xl font-black text-[--color-text]">{formatNumber(p.confidence)}</p>
                    </div>
                    <div className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[--color-text-muted]">Juegos vs</p>
                      <p className="font-stat text-2xl font-black text-[--color-text]">{p.sample_vs_opp}</p>
                    </div>
                    {isOwner && p.needs_change && p.recommended_slot ? (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => {
                          const currentPlayer = roster.find((player) => player.player_id === p.player_id);
                          if (currentPlayer) {
                            setMovePlayer(currentPlayer);
                            setMoveTargetSlot(p.recommended_slot);
                            setMoveModalOpen(true);
                          }
                        }}
                      >
                        Mover a {p.recommended_slot}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState icon={BrainCircuit} title={lineupLoading ? 'Calculando proyecciones...' : 'Sin proyeccion disponible'} body="El modelo todavia no devolvio resultados para este roster." />
          </div>
        )}
      </section>

      <section className="mt-8 surface-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[--color-text-muted]">Movimientos recientes</p>
            <p className="mt-2 text-sm text-[--color-text-muted]">Ultimas altas y bajas registradas sobre este roster.</p>
          </div>
          <Badge tone="gray">{transactions.length} eventos</Badge>
        </div>

        {transactions.length ? (
          <div className="mt-6 space-y-3">
            {transactions.map((transaction) => {
              const isAdd = transaction.transaction_type === 'add';
              return (
                <article
                  key={transaction.transaction_id}
                  className="flex flex-col gap-4 rounded-lg border border-[--color-border] bg-[--color-bg-elev-2] px-4 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-4">
                    <PlayerAvatar
                      playerId={transaction.player_id}
                      playerName={transaction.player_name}
                      teamAbbr={transaction.nba_team}
                      size="md"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-body font-semibold text-[--color-text]">{transaction.player_name}</p>
                        <Badge tone={isAdd ? 'green' : 'red'}>{isAdd ? 'Alta' : 'Baja'}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-[--color-text-muted]">
                        {transaction.nba_team} · {transaction.position}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm text-[--color-text-muted] md:text-right">
                    <p className="font-medium text-[--color-text]">{formatDateTime(transaction.transaction_date)}</p>
                    <p className="mt-1">{formatRelativeTime(transaction.transaction_date) || 'ahora'}</p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              icon={Plus}
              title="Sin movimientos registrados"
              body="Este equipo todavia no tiene altas o bajas posteriores al armado del roster."
            />
          </div>
        )}
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

      <Modal open={moveModalOpen} onClose={() => setMoveModalOpen(false)} title={movePlayer ? `Mover jugador · ${movePlayer.player_name}` : 'Mover jugador'} size="max-w-[520px]">
        {movePlayer ? (
          <div className="space-y-4">
            <p className="text-sm text-[--color-text-muted]">
              Slot actual: <span className="font-semibold text-[--color-text]">{movePlayer.roster_slot}</span>. Si el slot destino ya tiene jugador, el backend hará swap automáticamente.
            </p>
            <div className="space-y-2">
              <label className="field-label" htmlFor="move-slot">Slot destino</label>
              <SelectMenu
                id="move-slot"
                label="Slot destino"
                value={moveTargetSlot}
                options={moveSlotOptions}
                onChange={setMoveTargetSlot}
              />
            </div>
            <button type="button" className="button-primary w-full" onClick={moveRosterPlayer} disabled={moveLoading}>
              <ArrowRightLeft className="h-4 w-4" />
              {moveLoading ? 'Moviendo...' : 'Confirmar cambio'}
            </button>
          </div>
        ) : null}
      </Modal>
    </main>
  );
}
