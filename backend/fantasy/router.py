from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel

from ..database import get_pool
from ..auth.utils import get_current_user

router = APIRouter(prefix="/api/fantasy", tags=["fantasy"])


# ---------- Schemas ----------

class CreateLeague(BaseModel):
    league_name: str
    max_teams: int = 8
    scoring_type: str = "points"


class CreateTeam(BaseModel):
    team_name: str


class DraftPick(BaseModel):
    player_id: int


class RosterAction(BaseModel):
    player_id: int
    roster_slot: str = "BN1"


# ---------- Leagues ----------

@router.post("/leagues", status_code=status.HTTP_201_CREATED)
async def create_league(body: CreateLeague, user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """INSERT INTO leagues (league_name, created_by, max_teams, scoring_type)
                   VALUES ($1, $2, $3, $4::scoring_type_enum) RETURNING league_id""",
                body.league_name, user["user_id"], body.max_teams, body.scoring_type,
            )
            league_id = row["league_id"]
            await conn.execute(
                """INSERT INTO league_members (league_id, user_id, role)
                   VALUES ($1, $2, 'commissioner')""",
                league_id, user["user_id"],
            )
    return {"league_id": league_id, "league_name": body.league_name}


@router.get("/leagues")
async def list_leagues(user=Depends(get_current_user)):
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT l.league_id, l.league_name, l.max_teams, l.draft_status, l.scoring_type,
               l.created_at, l.draft_date,
               COUNT(lm.member_id) AS member_count
        FROM leagues l
        JOIN league_members lm ON l.league_id = lm.league_id
        WHERE l.league_id IN (SELECT league_id FROM league_members WHERE user_id = $1)
        GROUP BY l.league_id
        ORDER BY l.created_at DESC
    """, user["user_id"])
    return [dict(r) for r in rows]


@router.get("/leagues/{league_id}")
async def get_league(league_id: int, user=Depends(get_current_user)):
    pool = await get_pool()
    league = await pool.fetchrow("""
        SELECT l.*, u.username AS creator_name
        FROM leagues l
        JOIN users u ON l.created_by = u.user_id
        WHERE l.league_id = $1
    """, league_id)
    if not league:
        raise HTTPException(status_code=404, detail="Liga no encontrada")

    members = await pool.fetch("""
        SELECT lm.member_id, lm.role, lm.joined_at, u.username, u.user_id
        FROM league_members lm
        JOIN users u ON lm.user_id = u.user_id
        WHERE lm.league_id = $1
    """, league_id)

    return {**dict(league), "members": [dict(m) for m in members]}


@router.post("/leagues/{league_id}/join")
async def join_league(league_id: int, user=Depends(get_current_user)):
    pool = await get_pool()
    league = await pool.fetchrow("SELECT max_teams FROM leagues WHERE league_id = $1", league_id)
    if not league:
        raise HTTPException(status_code=404, detail="Liga no encontrada")

    count = await pool.fetchval(
        "SELECT COUNT(*) FROM league_members WHERE league_id = $1", league_id
    )
    if count >= league["max_teams"]:
        raise HTTPException(status_code=400, detail="Liga llena")

    try:
        await pool.execute(
            "INSERT INTO league_members (league_id, user_id) VALUES ($1, $2)",
            league_id, user["user_id"],
        )
    except Exception:
        raise HTTPException(status_code=409, detail="Ya eres miembro de esta liga")

    return {"message": "Te uniste a la liga"}


@router.get("/leagues/{league_id}/leaderboard")
async def league_leaderboard(league_id: int):
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT * FROM v_league_leaderboard
        WHERE league_id = $1
        ORDER BY league_rank
    """, league_id)
    return [dict(r) for r in rows]


# ---------- Fantasy Teams ----------

@router.post("/leagues/{league_id}/teams", status_code=status.HTTP_201_CREATED)
async def create_team(league_id: int, body: CreateTeam, user=Depends(get_current_user)):
    pool = await get_pool()
    member = await pool.fetchrow(
        "SELECT member_id FROM league_members WHERE league_id = $1 AND user_id = $2",
        league_id, user["user_id"],
    )
    if not member:
        raise HTTPException(status_code=403, detail="No eres miembro de esta liga")

    try:
        row = await pool.fetchrow(
            """INSERT INTO fantasy_teams (team_name, user_id, league_id)
               VALUES ($1, $2, $3) RETURNING fantasy_team_id""",
            body.team_name, user["user_id"], league_id,
        )
    except Exception:
        raise HTTPException(status_code=409, detail="Ya tienes un equipo en esta liga")

    return {"fantasy_team_id": row["fantasy_team_id"], "team_name": body.team_name}


@router.get("/teams/{team_id}/roster")
async def get_roster(team_id: int):
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT * FROM v_roster_detail
        WHERE fantasy_team_id = $1
        ORDER BY roster_slot
    """, team_id)
    return [dict(r) for r in rows]


# ---------- Draft ----------

@router.post("/leagues/{league_id}/draft/start")
async def start_draft(league_id: int, user=Depends(get_current_user)):
    pool = await get_pool()
    league = await pool.fetchrow(
        "SELECT draft_status, created_by FROM leagues WHERE league_id = $1", league_id
    )
    if not league:
        raise HTTPException(status_code=404, detail="Liga no encontrada")
    if league["created_by"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Solo el comisionado puede iniciar el draft")
    if league["draft_status"] != "pending":
        raise HTTPException(status_code=400, detail="El draft ya fue iniciado o completado")

    await pool.execute(
        "UPDATE leagues SET draft_status = 'in_progress', draft_date = NOW() WHERE league_id = $1",
        league_id,
    )
    return {"message": "Draft iniciado"}


@router.post("/leagues/{league_id}/draft/pick")
async def make_pick(league_id: int, body: DraftPick, user=Depends(get_current_user)):
    pool = await get_pool()

    league = await pool.fetchrow(
        "SELECT draft_status FROM leagues WHERE league_id = $1", league_id
    )
    if not league or league["draft_status"] != "in_progress":
        raise HTTPException(status_code=400, detail="El draft no esta activo")

    team = await pool.fetchrow(
        "SELECT fantasy_team_id FROM fantasy_teams WHERE league_id = $1 AND user_id = $2",
        league_id, user["user_id"],
    )
    if not team:
        raise HTTPException(status_code=403, detail="No tienes equipo en esta liga")

    # Get next pick number
    last_pick = await pool.fetchval(
        "SELECT COALESCE(MAX(pick_number), 0) FROM draft_picks WHERE league_id = $1", league_id
    )
    next_pick = last_pick + 1
    teams_in_league = await pool.fetchval(
        "SELECT COUNT(*) FROM fantasy_teams WHERE league_id = $1", league_id
    )
    if not teams_in_league:
        raise HTTPException(status_code=400, detail="No hay equipos en la liga todavia")
    round_number = (next_pick - 1) // teams_in_league + 1

    # Count current roster size
    roster_size = await pool.fetchval(
        "SELECT COUNT(*) FROM roster_players WHERE fantasy_team_id = $1",
        team["fantasy_team_id"],
    )
    slots = ["G1", "G2", "F1", "F2", "C", "UTIL", "BN1", "BN2"]
    if roster_size >= len(slots):
        raise HTTPException(status_code=400, detail="Tu roster esta lleno")
    slot = slots[roster_size]

    async with pool.acquire() as conn:
        async with conn.transaction():
            try:
                await conn.execute(
                    """INSERT INTO draft_picks (league_id, fantasy_team_id, player_id, round_number, pick_number)
                       VALUES ($1, $2, $3, $4, $5)""",
                    league_id, team["fantasy_team_id"], body.player_id, round_number, next_pick,
                )
            except Exception:
                raise HTTPException(status_code=409, detail="Jugador ya drafteado en esta liga")

            await conn.execute(
                """INSERT INTO roster_players (fantasy_team_id, player_id, roster_slot, acquired_via)
                   VALUES ($1, $2, $3::roster_slot_enum, 'draft')""",
                team["fantasy_team_id"], body.player_id, slot,
            )

            await conn.execute(
                """INSERT INTO transactions (fantasy_team_id, player_id, transaction_type)
                   VALUES ($1, $2, 'add')""",
                team["fantasy_team_id"], body.player_id,
            )

    return {"pick_number": next_pick, "round": round_number, "player_id": body.player_id, "slot": slot}


@router.post("/leagues/{league_id}/draft/complete")
async def complete_draft(league_id: int, user=Depends(get_current_user)):
    pool = await get_pool()
    league = await pool.fetchrow(
        "SELECT draft_status, created_by FROM leagues WHERE league_id = $1", league_id
    )
    if not league or league["created_by"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Solo el comisionado puede completar el draft")

    await pool.execute(
        "UPDATE leagues SET draft_status = 'completed' WHERE league_id = $1", league_id
    )
    return {"message": "Draft completado"}


# ---------- Roster management (post-draft) ----------

@router.post("/teams/{team_id}/roster/add")
async def add_player(team_id: int, body: RosterAction, user=Depends(get_current_user)):
    pool = await get_pool()
    team = await pool.fetchrow(
        "SELECT fantasy_team_id, user_id FROM fantasy_teams WHERE fantasy_team_id = $1",
        team_id,
    )
    if not team or team["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="No es tu equipo")

    async with pool.acquire() as conn:
        async with conn.transaction():
            try:
                await conn.execute(
                    """INSERT INTO roster_players (fantasy_team_id, player_id, roster_slot, acquired_via)
                       VALUES ($1, $2, $3::roster_slot_enum, 'free_agent')""",
                    team_id, body.player_id, body.roster_slot,
                )
            except Exception:
                raise HTTPException(status_code=409, detail="Jugador ya en tu roster o slot ocupado")

            await conn.execute(
                """INSERT INTO transactions (fantasy_team_id, player_id, transaction_type)
                   VALUES ($1, $2, 'add')""",
                team_id, body.player_id,
            )
    return {"message": "Jugador agregado"}


@router.delete("/teams/{team_id}/roster/{player_id}")
async def drop_player(team_id: int, player_id: int, user=Depends(get_current_user)):
    pool = await get_pool()
    team = await pool.fetchrow(
        "SELECT user_id FROM fantasy_teams WHERE fantasy_team_id = $1", team_id
    )
    if not team or team["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="No es tu equipo")

    async with pool.acquire() as conn:
        async with conn.transaction():
            deleted = await conn.execute(
                "DELETE FROM roster_players WHERE fantasy_team_id = $1 AND player_id = $2",
                team_id, player_id,
            )
            if deleted == "DELETE 0":
                raise HTTPException(status_code=404, detail="Jugador no esta en tu roster")

            await conn.execute(
                """INSERT INTO transactions (fantasy_team_id, player_id, transaction_type)
                   VALUES ($1, $2, 'drop')""",
                team_id, player_id,
            )
    return {"message": "Jugador dropeado"}
