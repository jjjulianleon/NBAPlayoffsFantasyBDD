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
    throw new Error(err.detail || `HTTP ${res.status}`);
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
  joinLeague: (id) => request(`/fantasy/leagues/${id}/join`, { method: 'POST' }),
  leagueLeaderboard: (id) => request(`/fantasy/leagues/${id}/leaderboard`),
  createTeam: (leagueId, data) =>
    request(`/fantasy/leagues/${leagueId}/teams`, { method: 'POST', body: JSON.stringify(data) }),
  roster: (teamId) => request(`/fantasy/teams/${teamId}/roster`),
  startDraft: (leagueId) => request(`/fantasy/leagues/${leagueId}/draft/start`, { method: 'POST' }),
  draftPick: (leagueId, playerId) =>
    request(`/fantasy/leagues/${leagueId}/draft/pick`, { method: 'POST', body: JSON.stringify({ player_id: playerId }) }),
  completeDraft: (leagueId) =>
    request(`/fantasy/leagues/${leagueId}/draft/complete`, { method: 'POST' }),
  addPlayer: (teamId, playerId, slot = 'BN1') =>
    request(`/fantasy/teams/${teamId}/roster/add`, { method: 'POST', body: JSON.stringify({ player_id: playerId, roster_slot: slot }) }),
  dropPlayer: (teamId, playerId) =>
    request(`/fantasy/teams/${teamId}/roster/${playerId}`, { method: 'DELETE' }),

  // Data
  dailyScoring: (date, limit = 50) =>
    request(`/predictions/daily-scoring?${date ? `game_date=${date}&` : ''}limit=${limit}`),
  games: (round, limit = 25) =>
    request(`/predictions/games?${round ? `playoff_round=${round}&` : ''}limit=${limit}`),
  gameDetail: (gameId) => request(`/predictions/games/${gameId}`),
  teams: () => request('/predictions/teams'),
  health: () => request('/health'),

  // Profile
  updateProfile: (data) => request('/auth/me', { method: 'PUT', body: JSON.stringify(data) }),

  // Scouting
  scoutingReport: (playerId) => request(`/scouting/${playerId}`),
};
