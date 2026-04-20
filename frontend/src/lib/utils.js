import { getTeamMeta } from './teamData';

export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function formatNumber(value, digits = 1) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return '0.0';
  }

  return numeric.toFixed(digits);
}

export function formatInteger(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US').format(Math.round(numeric));
}

export function formatPercent(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) {
    return '—';
  }

  const numeric = Number(value);
  const fixed = numeric.toFixed(digits);
  return `${numeric > 0 ? '+' : ''}${fixed}%`;
}

export function formatDateLabel(value, options = {}) {
  if (!value) {
    return 'Por definir';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('es-ES', {
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) {
    return 'Por definir';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('es-ES', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatRelativeTime(value) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const elapsed = Date.now() - timestamp;
  if (elapsed < 0) {
    return 'ahora';
  }

  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) {
    return 'ahora';
  }
  if (minutes < 60) {
    return `hace ${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `hace ${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export function formatLongDate(value) {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function getRoundConfig(round) {
  const numeric = Number(round);

  switch (numeric) {
    case 1:
      return { label: 'R1', longLabel: 'Ronda 1', className: 'chip-r1' };
    case 2:
      return { label: 'SEMIS', longLabel: 'Semifinales', className: 'chip-semi' };
    case 3:
      return { label: 'CF', longLabel: 'Finales de Conferencia', className: 'chip-cf' };
    case 4:
      return { label: 'FINALES', longLabel: 'Finales', className: 'chip-finals' };
    default:
      return { label: 'TODAS', longLabel: 'Todas las rondas', className: 'chip-gray' };
  }
}

export function getStatusTone(status) {
  if (!status) {
    return 'gray';
  }

  const normalized = String(status).toLowerCase();
  if (normalized.includes('live') || normalized.includes('in_progress')) {
    return 'red';
  }
  if (normalized.includes('final') || normalized.includes('completed')) {
    return 'green';
  }
  if (normalized.includes('pending') || normalized.includes('scheduled')) {
    return 'gray';
  }
  return 'orange';
}

export function getPlayerName(player) {
  if (!player) {
    return 'Jugador desconocido';
  }

  if (player.player_name) {
    return player.player_name;
  }

  return [player.first_name, player.last_name].filter(Boolean).join(' ').trim();
}

export function getPlayerLastName(player) {
  const name = getPlayerName(player).trim().split(/\s+/);
  return name[name.length - 1] ?? '';
}

export function getInitials(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function getTeamAbbr(player) {
  return player?.team || player?.nba_team || player?.abbreviation || '';
}

export function getTeamIdFromPlayer(player) {
  if (player?.team_id) {
    return player.team_id;
  }

  return getTeamMeta(getTeamAbbr(player))?.teamId ?? null;
}

export function normalizeScoutingText(report) {
  if (!report) {
    return [];
  }

  return String(report)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export const ROSTER_SLOTS = ['G1', 'G2', 'F1', 'F2', 'C', 'UTIL', 'BN1', 'BN2'];

export function getCurrentPlayoffPhase(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);

  if (Number.isNaN(date.getTime())) {
    return {
      label: 'Playoffs NBA',
      sublabel: 'Calendario 2026',
      toneClassName: 'badge-orange',
    };
  }

  const windows = [
    {
      start: new Date('2026-04-14T00:00:00'),
      end: new Date('2026-04-18T00:00:00'),
      label: 'Play-In',
      toneClassName: 'badge-blue',
    },
    {
      start: new Date('2026-04-18T00:00:00'),
      end: new Date('2026-05-04T00:00:00'),
      label: 'Primera Ronda',
      toneClassName: 'badge-gray',
    },
    {
      start: new Date('2026-05-04T00:00:00'),
      end: new Date('2026-05-19T00:00:00'),
      label: 'Semifinales',
      toneClassName: 'badge-blue',
    },
    {
      start: new Date('2026-05-19T00:00:00'),
      end: new Date('2026-06-03T00:00:00'),
      label: 'Finales de Conferencia',
      toneClassName: 'badge-gold',
    },
    {
      start: new Date('2026-06-03T00:00:00'),
      end: new Date('2026-06-20T00:00:00'),
      label: 'Finales NBA',
      toneClassName: 'badge-orange',
    },
  ];

  const activeWindow = windows.find((window) => date >= window.start && date < window.end);
  const sublabel = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' })
    .format(date)
    .replace('.', '');

  if (activeWindow) {
    return {
      label: activeWindow.label,
      sublabel,
      toneClassName: activeWindow.toneClassName,
    };
  }

  return {
    label: date < new Date('2026-04-14T00:00:00') ? 'Temporada Regular' : 'Postemporada Cerrada',
    sublabel,
    toneClassName: 'badge-orange',
  };
}
