from fastapi import APIRouter, Query, HTTPException
from ..database import get_pool
from .service import build_lineup_recommendation

router = APIRouter(prefix="/api/predictions", tags=["predictions"])


@router.get("/accuracy")
async def prediction_accuracy(limit: int = Query(25, ge=1, le=100)):
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT va.*
        FROM v_prediction_accuracy va
        JOIN players p ON va.player_id = p.player_id
        JOIN nba_teams t ON p.team_id = t.team_id
        WHERE t.playoff_seed IS NOT NULL
        ORDER BY va.mae ASC
        LIMIT $1
    """, limit)
    return [dict(r) for r in rows]


@router.get("/daily-scoring")
async def daily_scoring(
    game_date: str | None = Query(None, description="Fecha YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=200),
):
    pool = await get_pool()
    if game_date:
        rows = await pool.fetch("""
            SELECT * FROM v_daily_scoring
            WHERE game_date = $1::date
            ORDER BY adjusted_fantasy_pts DESC
            LIMIT $2
        """, game_date, limit)
    else:
        rows = await pool.fetch("""
            SELECT * FROM v_daily_scoring
            ORDER BY game_date DESC, adjusted_fantasy_pts DESC
            LIMIT $1
        """, limit)
    return [dict(r) for r in rows]


@router.get("/games/{game_id}")
async def game_box_score(game_id: str):
    """Detalle de un partido con stats de todos los jugadores por equipo."""
    pool = await get_pool()

    # Game metadata
    game = await pool.fetchrow("""
        SELECT g.game_id, g.game_date, g.playoff_round, g.status,
               g.home_score, g.away_score,
               ht.team_id AS home_team_id, ht.abbreviation AS home_team,
               ht.full_name AS home_team_name,
               at.team_id AS away_team_id, at.abbreviation AS away_team,
               at.full_name AS away_team_name
        FROM games g
        JOIN nba_teams ht ON g.home_team_id = ht.team_id
        JOIN nba_teams at ON g.away_team_id = at.team_id
        WHERE g.game_id = $1
    """, game_id)

    if not game:
        raise HTTPException(status_code=404, detail="Partido no encontrado")

    # Player stats for this game
    stats = await pool.fetch("""
        SELECT pgs.player_id,
               p.first_name, p.last_name, p.position, p.jersey_number,
               p.team_id,
               pgs.minutes_played, pgs.points, pgs.rebounds, pgs.assists,
               pgs.steals, pgs.blocks, pgs.turnovers,
               pgs.fg_made, pgs.fg_attempted,
               pgs.three_made, pgs.three_attempted,
               pgs.ft_made, pgs.ft_attempted,
               pgs.plus_minus, pgs.fantasy_points
        FROM player_game_stats pgs
        JOIN players p ON pgs.player_id = p.player_id
        WHERE pgs.game_id = $1
        ORDER BY pgs.points DESC
    """, game_id)

    home_id = game["home_team_id"]
    away_id = game["away_team_id"]
    home_players = [dict(s) for s in stats if s["team_id"] == home_id]
    away_players = [dict(s) for s in stats if s["team_id"] == away_id]

    def aggregate_team(players):
        if not players:
            return None
        return {
            "points": sum(p.get("points", 0) for p in players),
            "rebounds": sum(p.get("rebounds", 0) for p in players),
            "assists": sum(p.get("assists", 0) for p in players),
            "steals": sum(p.get("steals", 0) for p in players),
            "blocks": sum(p.get("blocks", 0) for p in players),
            "turnovers": sum(p.get("turnovers", 0) for p in players),
            "fg_pct": round(
                sum(p.get("fg_made", 0) for p in players)
                / max(sum(p.get("fg_attempted", 0) for p in players), 1) * 100, 1
            ),
            "three_pct": round(
                sum(p.get("three_made", 0) for p in players)
                / max(sum(p.get("three_attempted", 0) for p in players), 1) * 100, 1
            ),
            "ft_pct": round(
                sum(p.get("ft_made", 0) for p in players)
                / max(sum(p.get("ft_attempted", 0) for p in players), 1) * 100, 1
            ),
        }

    return {
        "game": dict(game),
        "home_players": home_players,
        "away_players": away_players,
        "home_team_stats": aggregate_team(home_players),
        "away_team_stats": aggregate_team(away_players),
    }


@router.get("/games")
async def list_games(
    playoff_round: int | None = Query(None, ge=1, le=4),
    limit: int = Query(25, ge=1, le=100),
):
    pool = await get_pool()
    if playoff_round:
        rows = await pool.fetch("""
            SELECT g.game_id, g.game_date, g.playoff_round, g.status,
                   g.home_score, g.away_score,
                   ht.abbreviation AS home_team, at.abbreviation AS away_team
            FROM games g
            JOIN nba_teams ht ON g.home_team_id = ht.team_id
            JOIN nba_teams at ON g.away_team_id = at.team_id
            WHERE g.playoff_round = $1
            ORDER BY g.game_date DESC
            LIMIT $2
        """, playoff_round, limit)
    else:
        rows = await pool.fetch("""
            SELECT g.game_id, g.game_date, g.playoff_round, g.status,
                   g.home_score, g.away_score,
                   ht.abbreviation AS home_team, at.abbreviation AS away_team
            FROM games g
            JOIN nba_teams ht ON g.home_team_id = ht.team_id
            JOIN nba_teams at ON g.away_team_id = at.team_id
            ORDER BY g.game_date DESC
            LIMIT $1
        """, limit)
    return [dict(r) for r in rows]


@router.get("/lineup/{fantasy_team_id}")
async def lineup_recommendation(fantasy_team_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            return await build_lineup_recommendation(conn, fantasy_team_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc))


@router.get("/teams")
async def list_teams():
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT team_id, abbreviation, full_name, conference,
               playoff_seed, is_eliminated, eliminated_round
        FROM nba_teams
        ORDER BY conference, playoff_seed NULLS LAST
    """)
    return [dict(r) for r in rows]
