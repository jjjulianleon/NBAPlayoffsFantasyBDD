const BASE = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error del servidor' }));
    const error = new Error(err.detail || `HTTP ${res.status}`);
    error.status = res.status;
    error.detail = err.detail;
    throw error;
  }
  return res.json();
}

export const api = {
  // Auth
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),

  // Players
  players: (params = '') => request(`/players/?${params}`),
  player: (id) => request(`/players/${id}`),
  playerGames: (id, limit = 20) => request(`/players/${id}/games?limit=${limit}`),
  hotCold: (limit = 20) => request(`/players/hot-cold?limit=${limit}`),
  leaderboard: (stat = 'avg_fantasy_pts', limit = 25) =>
    request(`/players/leaderboard?stat=${stat}&limit=${limit}`),

  // Fantasy
  createLeague: (data) => request('/fantasy/leagues', { method: 'POST', body: JSON.stringify(data) }),
  leagues: () => request('/fantasy/leagues'),
  league: (id) => request(`/fantasy/leagues/${id}`),
  updateLeague: (id, data) => request(`/fantasy/leagues/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLeague: (id) => request(`/fantasy/leagues/${id}`, { method: 'DELETE' }),
  joinLeague: (id) => request(`/fantasy/leagues/${id}/join`, { method: 'POST' }),
  leagueLeaderboard: (id) => request(`/fantasy/leagues/${id}/leaderboard`),
  createTeam: (leagueId, data) =>
    request(`/fantasy/leagues/${leagueId}/teams`, { method: 'POST', body: JSON.stringify(data) }),
  roster: (teamId) => request(`/fantasy/teams/${teamId}/roster`),
  rosterTransactions: (teamId, limit = 15) => request(`/fantasy/teams/${teamId}/transactions?limit=${limit}`),
  draftState: (leagueId) => request(`/fantasy/leagues/${leagueId}/draft`),
  reseedDraft: (leagueId) => request(`/fantasy/leagues/${leagueId}/draft/reseed`, { method: 'POST' }),
  startDraft: (leagueId) => request(`/fantasy/leagues/${leagueId}/draft/start`, { method: 'POST' }),
  draftPick: (leagueId, playerId) =>
    request(`/fantasy/leagues/${leagueId}/draft/pick`, { method: 'POST', body: JSON.stringify({ player_id: playerId }) }),
  completeDraft: (leagueId) =>
    request(`/fantasy/leagues/${leagueId}/draft/complete`, { method: 'POST' }),
  addPlayer: (teamId, playerId, slot = 'BN1') =>
    request(`/fantasy/teams/${teamId}/roster/add`, { method: 'POST', body: JSON.stringify({ player_id: playerId, roster_slot: slot }) }),
  moveRosterPlayer: (teamId, playerId, targetSlot) =>
    request(`/fantasy/teams/${teamId}/roster/move`, { method: 'POST', body: JSON.stringify({ player_id: playerId, target_slot: targetSlot }) }),
  applySuggestedLineup: (teamId) =>
    request(`/fantasy/teams/${teamId}/roster/apply-lineup`, { method: 'POST' }),
  dropPlayer: (teamId, playerId) =>
    request(`/fantasy/teams/${teamId}/roster/${playerId}`, { method: 'DELETE' }),

  // Data
  dailyScoring: (date, limit = 50) =>
    request(`/predictions/daily-scoring?${date ? `game_date=${date}&` : ''}limit=${limit}`),
  predictionAccuracy: (limit = 25) =>
    request(`/predictions/accuracy?limit=${limit}`),
  games: (round, limit = 25) =>
    request(`/predictions/games?${round ? `playoff_round=${round}&` : ''}limit=${limit}`),
  gameDetail: (gameId) => request(`/predictions/games/${gameId}`),
  teams: () => request('/predictions/teams'),
  lineup: (teamId) => request(`/predictions/lineup/${teamId}`),
  health: () => request('/health'),

  // Profile
  updateProfile: (data) => request('/auth/me', { method: 'PUT', body: JSON.stringify(data) }),

  // Scouting
  scoutingReport: (playerId) => request(`/scouting/${playerId}`),
  playerExposure: (playerId) => request(`/fantasy/players/${playerId}/exposure`),

  // Admin / refresh
  refreshStatus: () => request('/admin/refresh/status'),
  triggerRefresh: () => request('/admin/refresh', { method: 'POST' }),
  predictionsStatus: () => request('/admin/predictions/status'),
  backfillPredictions: () => request('/admin/predictions/backfill', { method: 'POST' }),
};
