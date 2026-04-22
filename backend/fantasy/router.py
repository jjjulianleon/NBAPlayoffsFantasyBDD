from datetime import timedelta
from random import SystemRandom

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..database import get_pool
from ..auth.utils import get_current_user
from ..predictions.service import BENCH_SLOTS, STARTER_SLOTS, build_lineup_recommendation

router = APIRouter(prefix="/api/fantasy", tags=["fantasy"])

DRAFT_SLOTS = ["G1", "G2", "F1", "F2", "C", "UTIL", "BN1", "BN2"]
_random = SystemRandom()


# ---------- Schemas ----------

class CreateLeague(BaseModel):
    league_name: str
    max_teams: int = 8
    scoring_type: str = "points"


class CreateTeam(BaseModel):
    team_name: str


class UpdateLeague(BaseModel):
    league_name: str | None = None
    max_teams: int | None = None


class DraftPick(BaseModel):
    player_id: int


class RosterAction(BaseModel):
    player_id: int
    roster_slot: str = "BN1"


class MoveRosterPlayer(BaseModel):
    player_id: int
    target_slot: str


async def _get_draft_teams(conn, league_id: int) -> list[dict]:
    rows = await conn.fetch("""
        SELECT ft.fantasy_team_id, ft.team_name, ft.user_id, ft.rank_in_league, ft.created_at, u.username
        FROM fantasy_teams ft
        JOIN users u ON ft.user_id = u.user_id
        WHERE ft.league_id = $1
        ORDER BY COALESCE(ft.rank_in_league, 999999) ASC, ft.created_at ASC, ft.fantasy_team_id ASC
    """, league_id)
    teams = [dict(row) for row in rows]
    for index, team in enumerate(teams, start=1):
        team["draft_position"] = index
    return teams


def _snake_team_for_pick(teams: list[dict], pick_number: int) -> tuple[int | None, dict | None]:
    if not teams or pick_number < 1:
        return None, None

    team_count = len(teams)
    round_number = ((pick_number - 1) // team_count) + 1
    round_index = (pick_number - 1) % team_count
    if round_number % 2 == 0:
        round_index = team_count - 1 - round_index
    return round_number, teams[round_index]


async def _get_draft_history(conn, league_id: int) -> list[dict]:
    rows = await conn.fetch("""
        SELECT dp.pick_number, dp.round_number, dp.picked_at,
               ft.fantasy_team_id, ft.team_name, ft.user_id,
               u.username,
               p.player_id,
               p.first_name || ' ' || p.last_name AS player_name,
               p.position,
               t.abbreviation AS nba_team
        FROM draft_picks dp
        JOIN fantasy_teams ft ON dp.fantasy_team_id = ft.fantasy_team_id
        JOIN users u ON ft.user_id = u.user_id
        JOIN players p ON dp.player_id = p.player_id
        JOIN nba_teams t ON p.team_id = t.team_id
        WHERE dp.league_id = $1
        ORDER BY dp.pick_number ASC
    """, league_id)
    return [dict(row) for row in rows]


async def _build_draft_state(conn, league_id: int) -> dict:
    league = await conn.fetchrow("""
        SELECT league_id, league_name, draft_status, draft_date, created_by
        FROM leagues
        WHERE league_id = $1
    """, league_id)
    if not league:
        raise HTTPException(status_code=404, detail="Liga no encontrada")

    teams = await _get_draft_teams(conn, league_id)
    history = await _get_draft_history(conn, league_id)
    history_by_pick = {row["pick_number"]: row for row in history}
    team_count = len(teams)
    slots_per_team = len(DRAFT_SLOTS)
    total_slots = team_count * slots_per_team
    total_picks = len(history)
    next_pick_number = total_picks + 1 if total_picks < total_slots else None
    current_round, on_the_clock = _snake_team_for_pick(teams, next_pick_number) if next_pick_number else (None, None)

    roster_sizes = {}
    if teams:
        size_rows = await conn.fetch("""
            SELECT fantasy_team_id, COUNT(*) AS roster_size
            FROM roster_players
            WHERE fantasy_team_id = ANY($1::int[])
              AND released_at IS NULL
            GROUP BY fantasy_team_id
        """, [team["fantasy_team_id"] for team in teams])
        roster_sizes = {row["fantasy_team_id"]: row["roster_size"] for row in size_rows}

    for team in teams:
        team["roster_size"] = roster_sizes.get(team["fantasy_team_id"], 0)

    board = []
    for pick_number in range(1, total_slots + 1):
        round_number, slot_team = _snake_team_for_pick(teams, pick_number)
        board.append({
            "pick_number": pick_number,
            "round_number": round_number,
            "fantasy_team_id": slot_team["fantasy_team_id"] if slot_team else None,
            "team_name": slot_team["team_name"] if slot_team else None,
            "user_id": slot_team["user_id"] if slot_team else None,
            "username": slot_team["username"] if slot_team else None,
            **(history_by_pick.get(pick_number) or {}),
        })

    return {
        **dict(league),
        "slots_per_team": slots_per_team,
        "team_count": team_count,
        "total_slots": total_slots,
        "total_picks": total_picks,
        "next_pick_number": next_pick_number,
        "current_round": current_round,
        "on_the_clock": on_the_clock,
        "teams": teams,
        "history": history,
        "board": board,
    }


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


@router.put("/leagues/{league_id}")
async def update_league(league_id: int, body: UpdateLeague, user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            league = await conn.fetchrow("""
                SELECT league_id, league_name, max_teams, created_by
                FROM leagues
                WHERE league_id = $1
                FOR UPDATE
            """, league_id)
            if not league:
                raise HTTPException(status_code=404, detail="Liga no encontrada")
            if league["created_by"] != user["user_id"]:
                raise HTTPException(status_code=403, detail="Solo el comisionado puede editar la liga")

            updates = []
            params = [league_id]
            param_index = 2

            if body.league_name is not None:
                league_name = body.league_name.strip()
                if len(league_name) < 3:
                    raise HTTPException(status_code=400, detail="El nombre de la liga debe tener al menos 3 caracteres")
                updates.append(f"league_name = ${param_index}")
                params.append(league_name)
                param_index += 1

            if body.max_teams is not None:
                if body.max_teams < 4 or body.max_teams > 10:
                    raise HTTPException(status_code=400, detail="El maximo de equipos debe estar entre 4 y 10")
                member_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM league_members WHERE league_id = $1",
                    league_id,
                )
                if body.max_teams < member_count:
                    raise HTTPException(
                        status_code=400,
                        detail=f"No puedes bajar el maximo por debajo de los miembros actuales ({member_count})",
                    )
                updates.append(f"max_teams = ${param_index}")
                params.append(body.max_teams)
                param_index += 1

            if not updates:
                raise HTTPException(status_code=400, detail="No se enviaron cambios para guardar")

            row = await conn.fetchrow(
                f"""
                UPDATE leagues
                SET {", ".join(updates)}
                WHERE league_id = $1
                RETURNING league_id, league_name, max_teams, scoring_type, draft_status, draft_date, created_by, created_at
                """
                ,
                *params,
            )

    return dict(row)


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


@router.post("/leagues/{league_id}/draft/reseed")
async def reseed_draft_order(league_id: int, user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            league = await conn.fetchrow("""
                SELECT league_id, draft_status, created_by
                FROM leagues
                WHERE league_id = $1
                FOR UPDATE
            """, league_id)
            if not league:
                raise HTTPException(status_code=404, detail="Liga no encontrada")
            if league["created_by"] != user["user_id"]:
                raise HTTPException(status_code=403, detail="Solo el comisionado puede rehacer el orden del draft")
            if league["draft_status"] != "pending":
                raise HTTPException(status_code=400, detail="Solo puedes rehacer el orden antes de iniciar el draft")

            picks = await conn.fetchval(
                "SELECT COUNT(*) FROM draft_picks WHERE league_id = $1",
                league_id,
            )
            if picks:
                raise HTTPException(status_code=400, detail="La liga ya tiene picks registrados")

            teams = await _get_draft_teams(conn, league_id)
            if len(teams) < 2:
                raise HTTPException(status_code=400, detail="Se necesitan al menos 2 equipos para rehacer el orden")

            shuffled = teams[:]
            _random.shuffle(shuffled)
            base_time = shuffled[0]["created_at"] if shuffled and shuffled[0]["created_at"] else None
            for index, team in enumerate(shuffled, start=1):
                await conn.execute(
                    """
                    UPDATE fantasy_teams
                    SET rank_in_league = $2,
                        created_at = COALESCE($3, created_at) + ($4::int * INTERVAL '1 second')
                    WHERE fantasy_team_id = $1
                    """,
                    team["fantasy_team_id"],
                    index,
                    base_time,
                    index,
                )

            state = await _build_draft_state(conn, league_id)

    return {
        "message": "Orden del draft rehecho",
        "draft_state": state,
    }


@router.get("/leagues/{league_id}/leaderboard")
async def league_leaderboard(league_id: int):
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT * FROM v_league_leaderboard
        WHERE league_id = $1
        ORDER BY league_rank
    """, league_id)
    return [dict(r) for r in rows]


@router.delete("/leagues/{league_id}")
async def dissolve_league(league_id: int, user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            league = await conn.fetchrow("""
                SELECT league_id, created_by, league_name
                FROM leagues
                WHERE league_id = $1
                FOR UPDATE
            """, league_id)
            if not league:
                raise HTTPException(status_code=404, detail="Liga no encontrada")
            if league["created_by"] != user["user_id"]:
                raise HTTPException(status_code=403, detail="Solo el comisionado puede disolver la liga")

            team_count = await conn.fetchval(
                "SELECT COUNT(*) FROM fantasy_teams WHERE league_id = $1",
                league_id,
            )
            member_count = await conn.fetchval(
                "SELECT COUNT(*) FROM league_members WHERE league_id = $1",
                league_id,
            )

            await conn.execute("DELETE FROM draft_picks WHERE league_id = $1", league_id)
            await conn.execute("DELETE FROM fantasy_teams WHERE league_id = $1", league_id)
            await conn.execute("DELETE FROM league_members WHERE league_id = $1", league_id)
            deleted = await conn.execute("DELETE FROM leagues WHERE league_id = $1", league_id)
            if deleted == "DELETE 0":
                raise HTTPException(status_code=404, detail="Liga no encontrada")

    return {
        "message": "Liga disuelta",
        "league_id": league_id,
        "league_name": league["league_name"],
        "deleted_teams": team_count,
        "deleted_members": member_count,
    }


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


@router.get("/teams/{team_id}/transactions")
async def get_team_transactions(team_id: int, limit: int = 15, user=Depends(get_current_user)):
    pool = await get_pool()
    team = await pool.fetchrow("""
        SELECT ft.fantasy_team_id
        FROM fantasy_teams ft
        JOIN league_members lm ON lm.league_id = ft.league_id
        WHERE ft.fantasy_team_id = $1
          AND lm.user_id = $2
    """, team_id, user["user_id"])
    if not team:
        raise HTTPException(status_code=403, detail="No tienes acceso a este equipo")

    rows = await pool.fetch("""
        SELECT tx.transaction_id, tx.transaction_type, tx.transaction_date,
               ft.fantasy_team_id, ft.team_name,
               l.league_id, l.league_name,
               p.player_id,
               p.first_name || ' ' || p.last_name AS player_name,
               p.position,
               t.abbreviation AS nba_team
        FROM transactions tx
        JOIN fantasy_teams ft ON tx.fantasy_team_id = ft.fantasy_team_id
        JOIN leagues l ON ft.league_id = l.league_id
        JOIN players p ON tx.player_id = p.player_id
        JOIN nba_teams t ON p.team_id = t.team_id
        WHERE tx.fantasy_team_id = $1
        ORDER BY tx.transaction_date DESC, tx.transaction_id DESC
        LIMIT $2
    """, team_id, limit)
    return [dict(r) for r in rows]


@router.get("/players/{player_id}/exposure")
async def get_player_exposure(player_id: int, user=Depends(get_current_user)):
    pool = await get_pool()
    exists = await pool.fetchval(
        "SELECT 1 FROM players WHERE player_id = $1",
        player_id,
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Jugador no encontrado")

    rows = await pool.fetch("""
        SELECT l.league_id, l.league_name, l.draft_status,
               ft.fantasy_team_id, ft.team_name,
               rp.roster_slot, rp.is_active, rp.acquired_via, rp.acquired_at
        FROM roster_players rp
        JOIN fantasy_teams ft ON rp.fantasy_team_id = ft.fantasy_team_id
        JOIN leagues l ON ft.league_id = l.league_id
        WHERE rp.player_id = $1
          AND ft.user_id = $2
        ORDER BY l.created_at DESC, rp.acquired_at DESC
    """, player_id, user["user_id"])
    return [dict(r) for r in rows]


@router.get("/leagues/{league_id}/draft")
async def get_draft_state(league_id: int, _user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await _build_draft_state(conn, league_id)


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

    member_count = await pool.fetchval(
        "SELECT COUNT(*) FROM league_members WHERE league_id = $1",
        league_id,
    )
    team_count = await pool.fetchval(
        "SELECT COUNT(*) FROM fantasy_teams WHERE league_id = $1",
        league_id,
    )
    if team_count < 2:
        raise HTTPException(status_code=400, detail="Se necesitan al menos 2 equipos para iniciar el draft")
    if member_count != team_count:
        raise HTTPException(status_code=400, detail="Todos los miembros de la liga deben crear su equipo antes de iniciar el draft")

    await pool.execute(
        "UPDATE leagues SET draft_status = 'in_progress', draft_date = NOW() WHERE league_id = $1",
        league_id,
    )
    return {"message": "Draft iniciado"}


@router.post("/leagues/{league_id}/draft/pick")
async def make_pick(league_id: int, body: DraftPick, user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            league = await conn.fetchrow(
                "SELECT draft_status FROM leagues WHERE league_id = $1 FOR UPDATE",
                league_id,
            )
            if not league or league["draft_status"] != "in_progress":
                raise HTTPException(status_code=400, detail="El draft no esta activo")

            team = await conn.fetchrow(
                "SELECT fantasy_team_id FROM fantasy_teams WHERE league_id = $1 AND user_id = $2",
                league_id, user["user_id"],
            )
            if not team:
                raise HTTPException(status_code=403, detail="No tienes equipo en esta liga")

            player_team = await conn.fetchrow(
                """SELECT t.is_eliminated, t.abbreviation
                   FROM players p JOIN nba_teams t ON p.team_id = t.team_id
                   WHERE p.player_id = $1""",
                body.player_id,
            )
            if not player_team:
                raise HTTPException(status_code=404, detail="Jugador no existe")
            if player_team["is_eliminated"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"{player_team['abbreviation']} no esta en playoffs — jugador no draftable",
                )

            draft_state = await _build_draft_state(conn, league_id)
            if draft_state["next_pick_number"] is None or not draft_state["on_the_clock"]:
                raise HTTPException(status_code=400, detail="El draft ya completo todos sus picks")
            if draft_state["on_the_clock"]["fantasy_team_id"] != team["fantasy_team_id"]:
                raise HTTPException(
                    status_code=403,
                    detail=f"No es tu turno. En el reloj esta {draft_state['on_the_clock']['team_name']}",
                )

            roster_size = await conn.fetchval(
                "SELECT COUNT(*) FROM roster_players WHERE fantasy_team_id = $1 AND released_at IS NULL",
                team["fantasy_team_id"],
            )
            if roster_size >= len(DRAFT_SLOTS):
                raise HTTPException(status_code=400, detail="Tu roster esta lleno")
            slot = DRAFT_SLOTS[roster_size]

            try:
                await conn.execute(
                    """INSERT INTO draft_picks (league_id, fantasy_team_id, player_id, round_number, pick_number)
                       VALUES ($1, $2, $3, $4, $5)""",
                    league_id,
                    team["fantasy_team_id"],
                    body.player_id,
                    draft_state["current_round"],
                    draft_state["next_pick_number"],
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

            is_final_pick = draft_state["next_pick_number"] == draft_state["total_slots"]
            if is_final_pick:
                await conn.execute(
                    "UPDATE leagues SET draft_status = 'completed' WHERE league_id = $1",
                    league_id,
                )

    return {
        "pick_number": draft_state["next_pick_number"],
        "round": draft_state["current_round"],
        "player_id": body.player_id,
        "slot": slot,
        "draft_completed": is_final_pick,
    }


@router.post("/leagues/{league_id}/draft/complete")
async def complete_draft(league_id: int, user=Depends(get_current_user)):
    pool = await get_pool()
    league = await pool.fetchrow(
        "SELECT draft_status, created_by FROM leagues WHERE league_id = $1", league_id
    )
    if not league or league["created_by"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Solo el comisionado puede completar el draft")
    if league["draft_status"] != "in_progress":
        raise HTTPException(status_code=400, detail="El draft no esta en curso")

    async with pool.acquire() as conn:
        draft_state = await _build_draft_state(conn, league_id)
    if draft_state["total_picks"] < draft_state["total_slots"]:
        raise HTTPException(
            status_code=400,
            detail=f"Faltan picks por completar ({draft_state['total_picks']}/{draft_state['total_slots']})",
        )

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

    player_team = await pool.fetchrow(
        """SELECT t.is_eliminated, t.abbreviation
           FROM players p JOIN nba_teams t ON p.team_id = t.team_id
           WHERE p.player_id = $1""",
        body.player_id,
    )
    if not player_team:
        raise HTTPException(status_code=404, detail="Jugador no existe")
    if player_team["is_eliminated"]:
        raise HTTPException(
            status_code=400,
            detail=f"{player_team['abbreviation']} no esta en playoffs — jugador no agregable",
        )

    async with pool.acquire() as conn:
        async with conn.transaction():
            occupied = await conn.fetchval(
                """SELECT 1
                   FROM roster_players
                   WHERE fantasy_team_id = $1
                     AND roster_slot = $2::roster_slot_enum
                     AND released_at IS NULL
                   LIMIT 1""",
                team_id, body.roster_slot,
            )
            if occupied:
                raise HTTPException(status_code=409, detail="Ese slot ya esta ocupado")

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


@router.post("/teams/{team_id}/roster/move")
async def move_roster_player(team_id: int, body: MoveRosterPlayer, user=Depends(get_current_user)):
    if body.target_slot not in DRAFT_SLOTS:
        raise HTTPException(status_code=400, detail="Slot destino invalido")

    pool = await get_pool()
    team = await pool.fetchrow(
        "SELECT user_id FROM fantasy_teams WHERE fantasy_team_id = $1",
        team_id,
    )
    if not team or team["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="No es tu equipo")

    async with pool.acquire() as conn:
        async with conn.transaction():
            source = await conn.fetchrow("""
                SELECT player_id, roster_slot
                FROM roster_players
                WHERE fantasy_team_id = $1 AND player_id = $2 AND released_at IS NULL
                FOR UPDATE
            """, team_id, body.player_id)
            if not source:
                raise HTTPException(status_code=404, detail="Jugador no esta en tu roster")
            if source["roster_slot"] == body.target_slot:
                return {"message": "Sin cambios", "player_id": body.player_id, "target_slot": body.target_slot}

            target = await conn.fetchrow("""
                SELECT player_id, roster_slot
                FROM roster_players
                WHERE fantasy_team_id = $1 AND roster_slot = $2::roster_slot_enum AND released_at IS NULL
                FOR UPDATE
            """, team_id, body.target_slot)

            await conn.execute(
                """UPDATE roster_players
                   SET roster_slot = $3::roster_slot_enum
                   WHERE fantasy_team_id = $1 AND player_id = $2 AND released_at IS NULL""",
                team_id, body.player_id, body.target_slot,
            )
            swapped_player_id = None
            if target:
                swapped_player_id = target["player_id"]
                await conn.execute(
                    """UPDATE roster_players
                       SET roster_slot = $3::roster_slot_enum
                       WHERE fantasy_team_id = $1 AND player_id = $2 AND released_at IS NULL""",
                    team_id, target["player_id"], source["roster_slot"],
                )

    return {
        "message": "Roster actualizado",
        "player_id": body.player_id,
        "target_slot": body.target_slot,
        "swapped_player_id": swapped_player_id,
    }


@router.post("/teams/{team_id}/roster/apply-lineup")
async def apply_suggested_lineup(team_id: int, user=Depends(get_current_user)):
    pool = await get_pool()
    team = await pool.fetchrow(
        "SELECT user_id FROM fantasy_teams WHERE fantasy_team_id = $1",
        team_id,
    )
    if not team or team["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="No es tu equipo")

    async with pool.acquire() as conn:
        async with conn.transaction():
            lineup = await build_lineup_recommendation(conn, team_id, include_commentary=False)
            assignments = {player["player_id"]: player["recommended_slot"] for player in lineup["lineup"] if player.get("recommended_slot")}
            if len(assignments) != len(DRAFT_SLOTS):
                raise HTTPException(status_code=400, detail="La alineacion sugerida no pudo asignar todos los slots del roster")

            for player_id, slot in assignments.items():
                await conn.execute(
                    """UPDATE roster_players
                       SET roster_slot = $3::roster_slot_enum
                       WHERE fantasy_team_id = $1 AND player_id = $2 AND released_at IS NULL""",
                    team_id, player_id, slot,
                )

            refreshed = await build_lineup_recommendation(conn, team_id, include_commentary=False)

    starter_count = sum(1 for player in refreshed["lineup"] if player["recommended_role"] == "starter")
    bench_count = sum(1 for player in refreshed["lineup"] if player["recommended_role"] == "bench")
    unavailable_count = sum(1 for player in refreshed["lineup"] if player.get("availability") != "active")
    return {
        "message": "Alineacion aplicada",
        "starter_slots": STARTER_SLOTS,
        "bench_slots": BENCH_SLOTS,
        "starters": starter_count,
        "bench": bench_count,
        "unavailable": unavailable_count,
        "lineup": refreshed["lineup"],
    }


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
                """UPDATE roster_players
                   SET is_active = FALSE,
                       released_at = NOW()
                   WHERE fantasy_team_id = $1
                     AND player_id = $2
                     AND released_at IS NULL""",
                team_id, player_id,
            )
            if deleted == "UPDATE 0":
                raise HTTPException(status_code=404, detail="Jugador no esta en tu roster")

            await conn.execute(
                """INSERT INTO transactions (fantasy_team_id, player_id, transaction_type)
                   VALUES ($1, $2, 'drop')""",
                team_id, player_id,
            )
    return {"message": "Jugador dropeado"}
