from datetime import date

from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI

from ..config import OPENAI_API_KEY
from ..database import get_pool

router = APIRouter(prefix="/api/scouting", tags=["scouting"])

client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


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

Incluye: análisis de tendencia, valor fantasy actual, recomendación (comprar/mantener/vender), y predicción para próximos partidos."""

    if not client:
        raise HTTPException(status_code=503, detail="OpenAI API key no configurada")

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=500,
        temperature=0.7,
    )
    report_text = response.choices[0].message.content

    # Cache in DB
    await pool.execute("""
        INSERT INTO scouting_reports (player_id, report_date, report_text, hot_cold_status, generated_by)
        VALUES ($1, $2, $3, $4::streak_status_enum, 'gpt-4o-mini')
        ON CONFLICT (player_id, report_date) DO UPDATE SET
            report_text = EXCLUDED.report_text,
            hot_cold_status = EXCLUDED.hot_cold_status
    """, player_id, date.today(), report_text, streak)

    return {
        "player_id": player_id,
        "player_name": player["name"],
        "report_date": str(date.today()),
        "report_text": report_text,
        "hot_cold_status": streak,
        "generated_by": "gpt-4o-mini",
    }
