from fastapi import APIRouter, Query
from ..database import get_pool

router = APIRouter(prefix="/api/players", tags=["players"])


@router.get("/")
async def list_players(
    team: str | None = Query(None, description="Filtrar por abbreviation de equipo"),
    position: str | None = Query(None, description="Filtrar por posicion (G, F, C, G-F, F-C)"),
    search: str | None = Query(None, description="Buscar por nombre"),
    include_eliminated: bool = Query(False, description="Incluir jugadores de equipos eliminados"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    pool = await get_pool()
    conditions = []
    params = []
    idx = 1

    if not include_eliminated:
        conditions.append("NOT t.is_eliminated")
    if team:
        conditions.append(f"t.abbreviation = ${idx}")
        params.append(team.upper())
        idx += 1
    if position:
        conditions.append(f"p.position = ${idx}")
        params.append(position.upper())
        idx += 1
    if search:
        conditions.append(f"(p.first_name || ' ' || p.last_name) ILIKE ${idx}")
        params.append(f"%{search}%")
        idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    rows = await pool.fetch(f"""
        SELECT p.player_id, p.first_name, p.last_name, p.position,
               p.jersey_number, p.is_active,
               p.season_ppg, p.season_rpg, p.season_apg,
               t.abbreviation AS team, t.full_name AS team_name,
               t.is_eliminated
        FROM players p
        JOIN nba_teams t ON p.team_id = t.team_id
        {where}
        ORDER BY p.season_ppg DESC
        LIMIT ${idx} OFFSET ${idx + 1}
    """, *params, limit, offset)
    return [dict(r) for r in rows]


@router.get("/hot-cold")
async def hot_cold_players(limit: int = Query(20, ge=1, le=100)):
    pool = await get_pool()
    per_cat = max(limit // 3, 10)
    rows = await pool.fetch("""
        (SELECT * FROM v_hot_cold_players
         WHERE streak_status = 'hot'
         ORDER BY pts_pct_change DESC NULLS LAST
         LIMIT $1)
        UNION ALL
        (SELECT * FROM v_hot_cold_players
         WHERE streak_status = 'cold'
           AND last5_ppg > 0
         ORDER BY season_ppg DESC NULLS LAST
         LIMIT $1)
        UNION ALL
        (SELECT * FROM v_hot_cold_players
         WHERE streak_status = 'neutral'
         ORDER BY season_ppg DESC NULLS LAST
         LIMIT $1)
    """, per_cat)
    return [dict(r) for r in rows]


@router.get("/leaderboard")
async def player_leaderboard(
    stat: str = Query("avg_fantasy_pts", description="Campo para ordenar"),
    include_eliminated: bool = Query(False, description="Incluir equipos eliminados"),
    limit: int = Query(25, ge=1, le=100),
):
    allowed = {"avg_pts", "avg_reb", "avg_ast", "avg_stl", "avg_blk", "avg_fantasy_pts", "total_fantasy_pts", "games_played"}
    if stat not in allowed:
        stat = "avg_fantasy_pts"
    pool = await get_pool()
    elim_clause = "" if include_eliminated else "AND NOT is_eliminated"
    rows = await pool.fetch(f"""
        SELECT * FROM v_player_performance
        WHERE games_played > 0 {elim_clause}
        ORDER BY {stat} DESC
        LIMIT $1
    """, limit)
    return [dict(r) for r in rows]


@router.get("/{player_id}")
async def get_player(player_id: int):
    pool = await get_pool()
    player = await pool.fetchrow("""
        SELECT p.*, t.abbreviation AS team, t.full_name AS team_name, t.is_eliminated,
               (SELECT ROUND(AVG(steals)::numeric, 1) FROM player_game_stats WHERE player_id = p.player_id) AS season_spg,
               (SELECT ROUND(AVG(blocks)::numeric, 1) FROM player_game_stats WHERE player_id = p.player_id) AS season_bpg
        FROM players p
        JOIN nba_teams t ON p.team_id = t.team_id
        WHERE p.player_id = $1
    """, player_id)
    if not player:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Jugador no encontrado")
    return dict(player)


@router.get("/{player_id}/games")
async def player_game_log(player_id: int, limit: int = Query(20, ge=1, le=100)):
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT g.game_date, g.playoff_round,
               ht.abbreviation || ' vs ' || at.abbreviation AS matchup,
               pgs.minutes_played, pgs.points, pgs.rebounds, pgs.assists,
               pgs.steals, pgs.blocks, pgs.turnovers, pgs.three_made,
               pgs.fg_made, pgs.fg_attempted, pgs.ft_made, pgs.ft_attempted,
               pgs.plus_minus, pgs.fantasy_points
        FROM player_game_stats pgs
        JOIN games g ON pgs.game_id = g.game_id
        JOIN nba_teams ht ON g.home_team_id = ht.team_id
        JOIN nba_teams at ON g.away_team_id = at.team_id
        WHERE pgs.player_id = $1
        ORDER BY g.game_date DESC
        LIMIT $2
    """, player_id, limit)
    return [dict(r) for r in rows]
