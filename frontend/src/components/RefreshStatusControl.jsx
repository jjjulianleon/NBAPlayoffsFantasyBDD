import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock3, Hand, Lock, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { cn, formatDateTime, formatRelativeTime } from '../lib/utils';
import { useToast } from './Toast';

const POLL_INTERVAL_MS = 3000;
const FRESH_WINDOW_MS = 6 * 60 * 60 * 1000;
const STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

function truncateError(message, maxLength = 140) {
  if (!message) {
    return 'Sin detalles adicionales.';
  }

  const normalized = String(message).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) {
    return 'No disponible';
  }

  return `${Math.round(Number(seconds))}s`;
}

function getTriggerMeta(trigger) {
  if (trigger === 'auto') {
    return {
      Icon: Clock3,
      label: 'Automática',
      helper: 'Programada por el sistema',
    };
  }

  if (trigger === 'manual') {
    return {
      Icon: Hand,
      label: 'Manual',
      helper: 'Lanzada por un usuario',
    };
  }

  return {
    Icon: Clock3,
    label: 'Sin origen',
    helper: 'Todavía no hay ejecuciones registradas',
  };
}

function getStatusMeta(state) {
  if (!state) {
    return {
      badgeClassName: 'badge-gray',
      badgeLabel: 'Cargando',
      headline: 'Cargando estado…',
      helperText: 'Consultando el último estado disponible.',
      lastRunLabel: 'Sin datos',
      actionLabel: 'Actualizar datos',
      canTrigger: false,
      isRunning: false,
      isLoading: true,
      isError: false,
      errorText: null,
    };
  }

  const isRunning = state.status === 'running';
  const isError = state.status === 'error';
  const hasFinished = Boolean(state.finished_at);
  const hasStarted = Boolean(state.started_at);
  const isNeverRun = state.status === 'idle' && !hasFinished && !hasStarted;
  const lastRunAt = state.finished_at ?? state.started_at ?? null;
  const age = lastRunAt ? Date.now() - new Date(lastRunAt).getTime() : null;
  const isFresh = state.status === 'success' && age != null && age < FRESH_WINDOW_MS;
  const isStale = (state.status === 'success' && age != null && age >= STALE_WINDOW_MS) || isNeverRun;

  if (isRunning) {
    return {
      badgeClassName: 'badge-orange',
      badgeLabel: 'En curso',
      headline: 'Actualizando datos…',
      helperText: state.started_at ? `Inicio ${formatRelativeTime(state.started_at)}` : 'Sincronizando estadísticas desde Kaggle.',
      lastRunLabel: state.started_at ? formatRelativeTime(state.started_at) : 'Ahora',
      actionLabel: 'Actualizando…',
      canTrigger: false,
      isRunning: true,
      isLoading: false,
      isError: false,
      errorText: null,
    };
  }

  if (isError) {
    return {
      badgeClassName: 'badge-red',
      badgeLabel: 'Error',
      headline: 'Error al actualizar',
      helperText: lastRunAt ? `Último intento ${formatRelativeTime(lastRunAt)}` : 'La sincronización falló.',
      lastRunLabel: lastRunAt ? formatRelativeTime(lastRunAt) : 'Sin registro',
      actionLabel: 'Reintentar ahora',
      canTrigger: true,
      isRunning: false,
      isLoading: false,
      isError: true,
      errorText: truncateError(state.last_error),
    };
  }

  if (isNeverRun) {
    return {
      badgeClassName: 'badge-orange',
      badgeLabel: 'Pendiente',
      headline: 'Datos sin sincronizar',
      helperText: 'Todavía no existe una descarga completada.',
      lastRunLabel: 'Nunca',
      actionLabel: 'Actualizar datos',
      canTrigger: true,
      isRunning: false,
      isLoading: false,
      isError: false,
      errorText: null,
    };
  }

  if (isFresh) {
    return {
      badgeClassName: 'badge-green',
      badgeLabel: 'Al día',
      headline: 'Datos al día',
      helperText: `Última actualización ${formatRelativeTime(lastRunAt)}`,
      lastRunLabel: formatRelativeTime(lastRunAt) ?? 'Hace un momento',
      actionLabel: 'Actualizar de nuevo',
      canTrigger: true,
      isRunning: false,
      isLoading: false,
      isError: false,
      errorText: null,
    };
  }

  return {
    badgeClassName: isStale ? 'badge-orange' : 'badge-gray',
    badgeLabel: isStale ? 'Desactualizado' : 'Estable',
    headline: isStale ? 'Actualización pendiente' : 'Datos disponibles',
    helperText: `Última actualización ${formatRelativeTime(lastRunAt)}`,
    lastRunLabel: formatRelativeTime(lastRunAt) ?? 'Sin fecha',
    actionLabel: 'Actualizar ahora',
    canTrigger: true,
    isRunning: false,
    isLoading: false,
    isError: false,
    errorText: null,
  };
}

function GuestRefreshCard() {
  return (
    <aside className="surface-card relative w-full overflow-hidden border-[--color-border-strong] bg-[linear-gradient(180deg,rgba(20,20,23,0.96),rgba(28,28,33,0.92))] p-5 shadow-2xl">
      <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-[--color-accent]/12 blur-2xl" />
      <div className="relative">
        <div className="badge badge-gray inline-flex gap-2">
          <Lock className="h-3 w-3" />
          Estado privado
        </div>
        <h3 className="mt-4 max-w-[16ch] font-display text-3xl uppercase leading-[0.92] tracking-[0.04em] text-[--color-text]">
          Sincronización de datos NBA
        </h3>
        <p className="mt-3 max-w-[34ch] text-sm leading-6 text-[--color-text-muted]">
          Inicia sesión para ver la última descarga, saber si los datos están frescos y lanzar una actualización manual.
        </p>
      </div>
    </aside>
  );
}

export default function RefreshStatusControl({ user }) {
  const { pushToast } = useToast();
  const [state, setState] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef(null);
  const mountedRef = useRef(false);
  const latestStateRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyState = useCallback(
    (next) => {
      const previous = latestStateRef.current;

      if (previous?.status === 'running' && next?.status === 'success') {
        pushToast({
          tone: 'success',
          title: 'Datos actualizados',
          message: `Tomó ${Math.round(next.duration_seconds || 0)}s`,
        });
      }

      if (previous?.status === 'running' && next?.status === 'error') {
        pushToast({
          tone: 'error',
          title: 'Error al actualizar',
          message: truncateError(next.last_error),
        });
      }

      latestStateRef.current = next;
      if (mountedRef.current) {
        setState(next);
      }

      if (next?.status !== 'running') {
        stopPolling();
      }

      return next;
    },
    [pushToast, stopPolling],
  );

  const fetchStatus = useCallback(async () => {
    if (!user) {
      return null;
    }

    try {
      const next = await api.refreshStatus();
      return applyState(next);
    } catch {
      return null;
    }
  }, [applyState, user]);

  const startPolling = useCallback(() => {
    if (pollRef.current || !user) {
      return;
    }

    pollRef.current = window.setInterval(() => {
      fetchStatus();
    }, POLL_INTERVAL_MS);
  }, [fetchStatus, user]);

  useEffect(() => {
    mountedRef.current = true;

    if (user) {
      fetchStatus().then((next) => {
        if (next?.status === 'running') {
          startPolling();
        }
      });
    } else {
      latestStateRef.current = null;
      setState(null);
      stopPolling();
    }

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [fetchStatus, startPolling, stopPolling, user]);

  async function handleTrigger() {
    if (!user || submitting || state?.status === 'running') {
      return;
    }

    setSubmitting(true);

    try {
      await api.triggerRefresh();
      const next = await fetchStatus();
      startPolling();

      if (next?.status !== 'running') {
        await fetchStatus();
      }
    } catch (error) {
      if (error.status === 409) {
        pushToast({
          tone: 'info',
          title: 'Ya hay un refresh en curso',
          message: 'Espera a que termine la sincronización actual.',
        });
        const next = await fetchStatus();
        if (next?.status === 'running') {
          startPolling();
        }
      } else {
        pushToast({
          tone: 'error',
          title: 'No se pudo iniciar la actualización',
          message: truncateError(error.message),
        });
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }

  const statusMeta = useMemo(() => getStatusMeta(state), [state]);
  const triggerMeta = useMemo(() => getTriggerMeta(state?.trigger), [state?.trigger]);
  const TriggerIcon = triggerMeta.Icon;
  const lastRunAt = state?.finished_at ?? state?.started_at ?? null;

  if (!user) {
    return <GuestRefreshCard />;
  }

  return (
    <aside className="surface-card relative w-full overflow-hidden border-[--color-border-strong] bg-[linear-gradient(180deg,rgba(20,20,23,0.96),rgba(28,28,33,0.92))] p-5 shadow-2xl">
      <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,_rgb(249_115_22_/_0.18),_transparent_70%)]" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-body font-semibold uppercase tracking-[0.2em] text-[--color-text-muted]">Estado de datos</p>
            <h3 className="mt-3 max-w-[15ch] font-display text-3xl uppercase leading-[0.92] tracking-[0.04em] text-[--color-text]">
              {statusMeta.headline}
            </h3>
            <p className="mt-3 max-w-[34ch] text-sm leading-6 text-[--color-text-muted]">{statusMeta.helperText}</p>
          </div>
          <div className={cn('badge shrink-0', statusMeta.badgeClassName)}>{statusMeta.badgeLabel}</div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-[--color-border] bg-[--color-bg-elev-2] p-4">
            <p className="text-[10px] font-body font-semibold uppercase tracking-[0.16em] text-[--color-text-muted]">Última actualización</p>
            <p className="mt-2 font-stat text-[2.2rem] font-black leading-none tracking-tight text-[--color-text]">
              {statusMeta.isLoading ? '...' : statusMeta.lastRunLabel}
            </p>
            <p className="mt-2 text-xs text-[--color-text-dim]">{lastRunAt ? formatDateTime(lastRunAt) : 'Sin ejecución previa'}</p>
          </div>

          <div className="rounded-2xl border border-[--color-border] bg-[--color-bg-elev-2] p-4">
            <p className="text-[10px] font-body font-semibold uppercase tracking-[0.16em] text-[--color-text-muted]">Origen</p>
            <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[--color-text]">
              <TriggerIcon className="h-4 w-4 text-[--color-accent]" />
              <span>{triggerMeta.label}</span>
            </div>
            <p className="mt-2 text-xs text-[--color-text-dim]">{triggerMeta.helper}</p>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-[--color-border] bg-[--color-bg-elev-2] p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-body font-semibold uppercase tracking-[0.16em] text-[--color-text-muted]">Duración</p>
              <p className="mt-2 text-sm font-semibold text-[--color-text]">
                {state?.status === 'running' ? 'En progreso' : formatDuration(state?.duration_seconds)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleTrigger}
              disabled={!statusMeta.canTrigger || submitting}
              className={cn(
                'button-secondary px-4 py-2 text-[10px]',
                (!statusMeta.canTrigger || submitting) && 'cursor-not-allowed opacity-60 hover:translate-y-0',
              )}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', (statusMeta.isRunning || submitting) && 'animate-spin')} />
              {statusMeta.actionLabel}
            </button>
          </div>
        </div>

        {statusMeta.isError ? (
          <div className="mt-3 rounded-2xl border border-[--color-danger]/35 bg-[--color-danger]/8 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[--color-danger]" />
              <div>
                <p className="text-[10px] font-body font-semibold uppercase tracking-[0.16em] text-[--color-danger]">Último error</p>
                <p className="mt-1 text-sm text-[--color-text]">{statusMeta.errorText}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
