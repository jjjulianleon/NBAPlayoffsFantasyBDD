export const TEAM_COLORS = {
  ATL: '#C8102E',
  BOS: '#007A33',
  BKN: '#000000',
  CHA: '#1D1160',
  CHI: '#CE1141',
  CLE: '#860038',
  DAL: '#00538C',
  DEN: '#0E2240',
  DET: '#C8102E',
  GSW: '#1D428A',
  HOU: '#CE1141',
  IND: '#002D62',
  LAC: '#C8102E',
  LAL: '#552583',
  MEM: '#5D76A9',
  MIA: '#98002E',
  MIL: '#00471B',
  MIN: '#0C2340',
  NOP: '#0C2340',
  NYK: '#006BB6',
  OKC: '#007AC1',
  ORL: '#0077C0',
  PHI: '#006BB6',
  PHX: '#1D1160',
  POR: '#E03A3E',
  SAC: '#5A2D81',
  SAS: '#C4CED4',
  TOR: '#CE1141',
  UTA: '#002B5C',
  WAS: '#002B5C',
};

export const NBA_TEAMS = [
  { teamId: 1610612737, abbreviation: 'ATL', fullName: 'Atlanta Hawks' },
  { teamId: 1610612738, abbreviation: 'BOS', fullName: 'Boston Celtics' },
  { teamId: 1610612751, abbreviation: 'BKN', fullName: 'Brooklyn Nets' },
  { teamId: 1610612766, abbreviation: 'CHA', fullName: 'Charlotte Hornets' },
  { teamId: 1610612741, abbreviation: 'CHI', fullName: 'Chicago Bulls' },
  { teamId: 1610612739, abbreviation: 'CLE', fullName: 'Cleveland Cavaliers' },
  { teamId: 1610612742, abbreviation: 'DAL', fullName: 'Dallas Mavericks' },
  { teamId: 1610612743, abbreviation: 'DEN', fullName: 'Denver Nuggets' },
  { teamId: 1610612765, abbreviation: 'DET', fullName: 'Detroit Pistons' },
  { teamId: 1610612744, abbreviation: 'GSW', fullName: 'Golden State Warriors' },
  { teamId: 1610612745, abbreviation: 'HOU', fullName: 'Houston Rockets' },
  { teamId: 1610612754, abbreviation: 'IND', fullName: 'Indiana Pacers' },
  { teamId: 1610612746, abbreviation: 'LAC', fullName: 'LA Clippers' },
  { teamId: 1610612747, abbreviation: 'LAL', fullName: 'Los Angeles Lakers' },
  { teamId: 1610612763, abbreviation: 'MEM', fullName: 'Memphis Grizzlies' },
  { teamId: 1610612748, abbreviation: 'MIA', fullName: 'Miami Heat' },
  { teamId: 1610612749, abbreviation: 'MIL', fullName: 'Milwaukee Bucks' },
  { teamId: 1610612750, abbreviation: 'MIN', fullName: 'Minnesota Timberwolves' },
  { teamId: 1610612740, abbreviation: 'NOP', fullName: 'New Orleans Pelicans' },
  { teamId: 1610612752, abbreviation: 'NYK', fullName: 'New York Knicks' },
  { teamId: 1610612760, abbreviation: 'OKC', fullName: 'Oklahoma City Thunder' },
  { teamId: 1610612753, abbreviation: 'ORL', fullName: 'Orlando Magic' },
  { teamId: 1610612755, abbreviation: 'PHI', fullName: 'Philadelphia 76ers' },
  { teamId: 1610612756, abbreviation: 'PHX', fullName: 'Phoenix Suns' },
  { teamId: 1610612757, abbreviation: 'POR', fullName: 'Portland Trail Blazers' },
  { teamId: 1610612758, abbreviation: 'SAC', fullName: 'Sacramento Kings' },
  { teamId: 1610612759, abbreviation: 'SAS', fullName: 'San Antonio Spurs' },
  { teamId: 1610612761, abbreviation: 'TOR', fullName: 'Toronto Raptors' },
  { teamId: 1610612762, abbreviation: 'UTA', fullName: 'Utah Jazz' },
  { teamId: 1610612764, abbreviation: 'WAS', fullName: 'Washington Wizards' },
];

export function getTeamMeta(teamRef) {
  if (teamRef == null) {
    return null;
  }

  if (typeof teamRef === 'number') {
    return NBA_TEAMS.find((team) => team.teamId === teamRef) ?? null;
  }

  return NBA_TEAMS.find((team) => team.abbreviation === String(teamRef).toUpperCase()) ?? null;
}

export function getTeamColor(teamRef) {
  if (typeof teamRef === 'number') {
    return getTeamColor(getTeamMeta(teamRef)?.abbreviation);
  }

  return TEAM_COLORS[String(teamRef || '').toUpperCase()] ?? '#1C1C21';
}
