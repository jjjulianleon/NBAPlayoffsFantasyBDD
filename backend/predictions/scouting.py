from datetime import date

from fastapi import APIRouter, HTTPException
try:
    from openai import AsyncOpenAI
except ImportError:  # pragma: no cover - optional dependency in local setups
    AsyncOpenAI = None

from ..config import OPENAI_API_KEY
from ..database import get_pool
from .service import build_local_scouting_report

router = APIRouter(prefix="/api/scouting", tags=["scouting"])

client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY and AsyncOpenAI else None


@router.get("/{player_id}")
async def get_scouting_report(player_id: int):
    pool = await get_pool()

    # Check cache first (same day)
    cached = await pool.fetchrow(
        "SELECT * FROM scouting_reports WHERE player_id = $1 AND report_date = $2",
        player_id, date.today(),
    )
    if cached:
        return dict(cached)

    # Gather player data
    player = await pool.fetchrow("""
        SELECT p.first_name || ' ' || p.last_name AS name, p.position,
               t.abbreviation AS team, p.season_ppg, p.season_rpg, p.season_apg
        FROM players p JOIN nba_teams t ON p.team_id = t.team_id
        WHERE p.player_id = $1
    """, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Jugador no encontrado")

    # Last 5 games
    games = await pool.fetch("""
        SELECT g.game_date, pgs.points, pgs.rebounds, pgs.assists,
               pgs.steals, pgs.blocks, pgs.turnovers, pgs.fantasy_points
        FROM player_game_stats pgs
        JOIN games g ON pgs.game_id = g.game_id
        WHERE pgs.player_id = $1
        ORDER BY g.game_date DESC LIMIT 5
    """, player_id)

    if not games:
        raise HTTPException(status_code=404, detail="Sin datos de partidos recientes")

    next_matchup = await pool.fetchrow("""
        SELECT g.game_date,
               opp.abbreviation AS opponent_team
        FROM games g
        JOIN players p ON p.player_id = $1
        JOIN nba_teams opp ON opp.team_id = CASE
            WHEN p.team_id = g.home_team_id THEN g.away_team_id
            ELSE g.home_team_id
        END
        WHERE p.team_id IN (g.home_team_id, g.away_team_id)
          AND g.game_date >= CURRENT_DATE
        ORDER BY g.game_date ASC, g.game_id ASC
        LIMIT 1
    """, player_id)

    opponent_history = []
    if next_matchup:
        opponent_history = await pool.fetch("""
            SELECT g.game_date, pgs.points, pgs.rebounds, pgs.assists, pgs.fantasy_points
            FROM player_game_stats pgs
            JOIN games g ON g.game_id = pgs.game_id
            JOIN players p ON p.player_id = pgs.player_id
            JOIN nba_teams opp ON opp.abbreviation = $2
            WHERE pgs.player_id = $1
              AND opp.team_id = CASE
                  WHEN p.team_id = g.home_team_id THEN g.away_team_id
                  ELSE g.home_team_id
              END
            ORDER BY g.game_date DESC
            LIMIT 5
        """, player_id, next_matchup["opponent_team"])

    # Determine streak
    avg_last5 = sum(g["points"] for g in games) / len(games)
    ppg = float(player["season_ppg"])
    if ppg > 0 and avg_last5 > ppg * 1.2:
        streak = "hot"
    elif ppg > 0 and avg_last5 < ppg * 0.8:
        streak = "cold"
    else:
        streak = "neutral"

    games_text = "\n".join(
        f"  {g['game_date']}: {g['points']}pts {g['rebounds']}reb {g['assists']}ast "
        f"{g['steals']}stl {g['blocks']}blk {g['turnovers']}to → {g['fantasy_points']}fpts"
        for g in games
    )

    prompt = f"""Eres un analista de fantasy basketball NBA. Genera un scouting report conciso (3-4 párrafos en español) para:

Jugador: {player['name']} ({player['position']}) - {player['team']}
Promedios temporada: {player['season_ppg']} PPG, {player['season_rpg']} RPG, {player['season_apg']} APG
Racha actual: {streak.upper()}
Últimos 5 partidos:
{games_text}

Incluye: análisis de tendencia, valor fantasy actual, recomendación (comprar/mantener/vender), y predicción para próximos partidos.
Si hay próximo rival proyectado u origen histórico contra ese rival, intégralo explícitamente."""

    if not client:
        report_text = build_local_scouting_report(dict(player), [dict(game) for game in games], streak, dict(next_matchup) if next_matchup else None, [dict(game) for game in opponent_history])
        generated_by = "local-heuristic-v1"
    else:
        try:
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=500,
                temperature=0.7,
            )
            report_text = response.choices[0].message.content
            generated_by = "gpt-4o-mini"
        except Exception:
            report_text = build_local_scouting_report(dict(player), [dict(game) for game in games], streak, dict(next_matchup) if next_matchup else None, [dict(game) for game in opponent_history])
            generated_by = "local-heuristic-v1"

    # Cache in DB
    await pool.execute("""
        INSERT INTO scouting_reports (player_id, report_date, report_text, hot_cold_status, generated_by)
        VALUES ($1, $2, $3, $4::streak_status_enum, $5)
        ON CONFLICT (player_id, report_date) DO UPDATE SET
            report_text = EXCLUDED.report_text,
            hot_cold_status = EXCLUDED.hot_cold_status,
            generated_by = EXCLUDED.generated_by
    """, player_id, date.today(), report_text, streak, generated_by)

    return {
        "player_id": player_id,
        "player_name": player["name"],
        "report_date": str(date.today()),
        "report_text": report_text,
        "hot_cold_status": streak,
        "generated_by": generated_by,
    }
