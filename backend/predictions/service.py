from __future__ import annotations

from collections import defaultdict, deque
from math import sqrt

STARTER_SLOTS = ["G1", "G2", "F1", "F2", "C", "UTIL"]
BENCH_SLOTS = ["BN1", "BN2"]


def _avg(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _stddev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = _avg(values)
    variance = sum((value - mean) ** 2 for value in values) / (len(values) - 1)
    return sqrt(max(variance, 0.0))


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _blend_metric(recent_avg: float, overall_avg: float, opponent_avg: float | None, opponent_games: int) -> float:
    if opponent_games >= 2 and opponent_avg is not None:
        return (recent_avg * 0.5) + (opponent_avg * 0.3) + (overall_avg * 0.2)
    return (recent_avg * 0.65) + (overall_avg * 0.35)


def _position_tags(position: str | None) -> set[str]:
    if not position:
        return set()
    return {tag for tag in str(position).replace("/", "-").split("-") if tag}


def _matches_slot(position: str | None, slot: str) -> bool:
    tags = _position_tags(position)
    if slot.startswith("G"):
        return "G" in tags
    if slot.startswith("F"):
        return "F" in tags
    if slot == "C":
        return "C" in tags
    return True


def _pick_best_lineup(candidates: list[dict]) -> dict[str, int]:
    eligible = [candidate for candidate in candidates if not candidate["team_eliminated"] and candidate["opponent"]]
    eligible_map = {candidate["player_id"]: candidate for candidate in eligible}
    best_key = (-1, -1.0)
    best_assignment: dict[str, int] = {}

    def search(
        slot_index: int,
        remaining_ids: list[int],
        current_assignment: dict[str, int],
        score: float,
        assigned_count: int,
    ) -> None:
        nonlocal best_key, best_assignment
        if slot_index == len(STARTER_SLOTS):
            current_key = (assigned_count, score)
            if current_key > best_key:
                best_key = current_key
                best_assignment = current_assignment.copy()
            return

        slot = STARTER_SLOTS[slot_index]
        compatible_ids = [player_id for player_id in remaining_ids if _matches_slot(eligible_map[player_id]["position"], slot)]

        for player_id in compatible_ids:
            current_assignment[slot] = player_id
            next_remaining = [candidate_id for candidate_id in remaining_ids if candidate_id != player_id]
            search(
                slot_index + 1,
                next_remaining,
                current_assignment,
                score + float(eligible_map[player_id]["predicted_fantasy_pts"] or 0),
                assigned_count + 1,
            )
            current_assignment.pop(slot, None)

        search(slot_index + 1, remaining_ids, current_assignment, score, assigned_count)

    remaining = [candidate["player_id"] for candidate in sorted(eligible, key=lambda item: item["predicted_fantasy_pts"], reverse=True)]
    if remaining:
        search(0, remaining, {}, 0.0, 0)
    return best_assignment


def _assign_remaining_slots(results: list[dict], starter_assignment: dict[str, int]) -> dict[int, str]:
    recommended_slot_by_player = {player_id: slot for slot, player_id in starter_assignment.items()}
    assigned_ids = set(recommended_slot_by_player)
    remaining_players = [
        player for player in results
        if player["player_id"] not in assigned_ids
    ]
    remaining_players.sort(
        key=lambda item: (
            0 if (not item["team_eliminated"] and item["opponent"]) else 1,
            -(item["predicted_fantasy_pts"] or 0),
        )
    )

    open_starter_slots = [slot for slot in STARTER_SLOTS if slot not in starter_assignment]
    for slot in open_starter_slots:
        compatible_index = next(
            (index for index, player in enumerate(remaining_players) if _matches_slot(player["position"], slot)),
            None,
        )
        chosen_index = compatible_index if compatible_index is not None else 0
        if not remaining_players:
            break
        player = remaining_players.pop(chosen_index)
        recommended_slot_by_player[player["player_id"]] = slot

    for slot in BENCH_SLOTS:
        if not remaining_players:
            break
        player = remaining_players.pop(0)
        recommended_slot_by_player[player["player_id"]] = slot

    return recommended_slot_by_player


def build_local_scouting_report(player: dict, recent_games: list[dict], streak: str, next_matchup: dict | None, opponent_history: list[dict]) -> str:
    recent_points = [float(game["points"] or 0) for game in recent_games]
    recent_rebounds = [float(game["rebounds"] or 0) for game in recent_games]
    recent_assists = [float(game["assists"] or 0) for game in recent_games]
    recent_fantasy = [float(game["fantasy_points"] or 0) for game in recent_games]

    avg_points = _avg(recent_points)
    avg_rebounds = _avg(recent_rebounds)
    avg_assists = _avg(recent_assists)
    avg_fantasy = _avg(recent_fantasy)
    season_ppg = float(player["season_ppg"] or 0)
    season_rpg = float(player["season_rpg"] or 0)
    season_apg = float(player["season_apg"] or 0)
    delta_points = avg_points - season_ppg

    if delta_points >= 3:
        trend_line = "viene claramente por encima de su media de temporada"
    elif delta_points <= -3:
        trend_line = "está produciendo por debajo de su base de temporada"
    else:
        trend_line = "se mantiene bastante alineado con su línea base"

    streak_line = {
        "hot": "La tendencia reciente es caliente y el volumen ofensivo está subiendo.",
        "cold": "La tendencia reciente es fría y conviene vigilar eficiencia y minutos.",
        "neutral": "No muestra una racha extrema, pero su piso fantasy sigue siendo útil.",
    }.get(streak, "Su tendencia reciente es estable.")

    matchup_line = ""
    if next_matchup:
        matchup_line = (
            f"Su próximo cruce proyectado sería contra {next_matchup['opponent_team']} "
            f"el {next_matchup['game_date']}. "
        )
        if opponent_history:
            opp_fantasy = _avg([float(game['fantasy_points'] or 0) for game in opponent_history])
            opp_points = _avg([float(game['points'] or 0) for game in opponent_history])
            matchup_line += (
                f"En su historial reciente frente a ese rival promedia {opp_points:.1f} puntos "
                f"y {opp_fantasy:.1f} fantasy points."
            )
        else:
            matchup_line += "No tiene muestra previa reciente contra ese rival en la base actual."

    recommendation = "mantener"
    if streak == "hot" and avg_fantasy >= 30 and avg_points >= season_ppg:
        recommendation = "comprar"
    elif streak == "cold" and avg_points < season_ppg * 0.85:
        recommendation = "vender"

    return (
        f"{player['name']} ({player['position']}, {player['team']}) {trend_line}. "
        f"En sus últimos {len(recent_games)} juegos dejó {avg_points:.1f} puntos, {avg_rebounds:.1f} rebotes, "
        f"{avg_assists:.1f} asistencias y {avg_fantasy:.1f} fantasy points por noche, frente a una base anual de "
        f"{season_ppg:.1f}-{season_rpg:.1f}-{season_apg:.1f}.\n\n"
        f"{streak_line} {matchup_line}".strip()
        + "\n\n"
        + f"Valor fantasy actual: {'alto' if avg_fantasy >= 35 else 'medio' if avg_fantasy >= 25 else 'volátil'}. "
        f"Si mantiene minutos y uso, su rango razonable para el siguiente juego está cerca de "
        f"{max(avg_points - 3, 0):.1f}-{avg_points + 3:.1f} puntos reales y {max(avg_fantasy - 5, 0):.1f}-{avg_fantasy + 5:.1f} fantasy points."
        + "\n\n"
        + f"Recomendación: {recommendation}. "
        + (
            "Vale la pena agresivamente en fantasy de playoffs por su tendencia reciente."
            if recommendation == "comprar"
            else "Conviene aguantarlo salvo que recibas una mejora clara."
            if recommendation == "mantener"
            else "Solo conviene sostenerlo si tu roster necesita volumen y no hay mejor agente libre."
        )
    )


async def backfill_predictions(conn, model_version: str = "heuristic-v1") -> dict:
    rows = await conn.fetch("""
        SELECT
            pgs.player_id,
            pgs.game_id,
            g.game_date,
            p.team_id AS player_team_id,
            CASE
                WHEN p.team_id = g.home_team_id THEN g.away_team_id
                ELSE g.home_team_id
            END AS opponent_team_id,
            pgs.points,
            pgs.rebounds,
            pgs.assists,
            pgs.fantasy_points
        FROM player_game_stats pgs
        JOIN players p ON p.player_id = pgs.player_id
        JOIN games g ON g.game_id = pgs.game_id
        ORDER BY g.game_date ASC, g.game_id ASC, pgs.player_id ASC
    """)

    player_last5: dict[int, deque[dict]] = defaultdict(lambda: deque(maxlen=5))
    player_totals: dict[int, dict[str, float]] = defaultdict(lambda: {
        "games": 0,
        "points": 0.0,
        "rebounds": 0.0,
        "assists": 0.0,
        "fantasy_points": 0.0,
    })
    opponent_last5: dict[tuple[int, int], deque[dict]] = defaultdict(lambda: deque(maxlen=5))
    opponent_totals: dict[tuple[int, int], dict[str, float]] = defaultdict(lambda: {
        "games": 0,
        "points": 0.0,
        "rebounds": 0.0,
        "assists": 0.0,
        "fantasy_points": 0.0,
    })

    prediction_rows: list[tuple] = []

    for row in rows:
        player_id = row["player_id"]
        opponent_key = (player_id, row["opponent_team_id"])
        overall = player_totals[player_id]
        versus = opponent_totals[opponent_key]
        recent_samples = list(player_last5[player_id])
        opponent_samples = list(opponent_last5[opponent_key])

        if overall["games"] >= 3 and recent_samples:
            recent_points = _avg([sample["points"] for sample in recent_samples])
            recent_rebounds = _avg([sample["rebounds"] for sample in recent_samples])
            recent_assists = _avg([sample["assists"] for sample in recent_samples])
            recent_fantasy = _avg([sample["fantasy_points"] for sample in recent_samples])

            overall_points = overall["points"] / overall["games"]
            overall_rebounds = overall["rebounds"] / overall["games"]
            overall_assists = overall["assists"] / overall["games"]
            overall_fantasy = overall["fantasy_points"] / overall["games"]

            opponent_games = versus["games"]
            opponent_points = (versus["points"] / opponent_games) if opponent_games else None
            opponent_rebounds = (versus["rebounds"] / opponent_games) if opponent_games else None
            opponent_assists = (versus["assists"] / opponent_games) if opponent_games else None
            opponent_fantasy = (versus["fantasy_points"] / opponent_games) if opponent_games else None

            predicted_points = round(_blend_metric(recent_points, overall_points, opponent_points, opponent_games), 2)
            predicted_rebounds = round(_blend_metric(recent_rebounds, overall_rebounds, opponent_rebounds, opponent_games), 2)
            predicted_assists = round(_blend_metric(recent_assists, overall_assists, opponent_assists, opponent_games), 2)
            predicted_fantasy = round(_blend_metric(recent_fantasy, overall_fantasy, opponent_fantasy, opponent_games), 2)

            volatility = _stddev([sample["fantasy_points"] for sample in recent_samples])
            confidence = 0.42 + min(overall["games"], 12) * 0.025 + min(opponent_games, 4) * 0.035 - min(volatility / 40.0, 0.22)
            confidence = round(_clamp(confidence, 0.2, 0.95), 3)

            prediction_rows.append((
                player_id,
                row["game_id"],
                predicted_points,
                predicted_rebounds,
                predicted_assists,
                predicted_fantasy,
                confidence,
                model_version,
            ))

        sample = {
            "points": float(row["points"] or 0),
            "rebounds": float(row["rebounds"] or 0),
            "assists": float(row["assists"] or 0),
            "fantasy_points": float(row["fantasy_points"] or 0),
        }
        player_last5[player_id].append(sample)
        opponent_last5[opponent_key].append(sample)
        overall["games"] += 1
        overall["points"] += sample["points"]
        overall["rebounds"] += sample["rebounds"]
        overall["assists"] += sample["assists"]
        overall["fantasy_points"] += sample["fantasy_points"]
        versus["games"] += 1
        versus["points"] += sample["points"]
        versus["rebounds"] += sample["rebounds"]
        versus["assists"] += sample["assists"]
        versus["fantasy_points"] += sample["fantasy_points"]

    if prediction_rows:
        insert_sql = """
            INSERT INTO predictions (
                player_id,
                game_id,
                predicted_points,
                predicted_rebounds,
                predicted_assists,
                predicted_fantasy_pts,
                confidence_score,
                model_version
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (player_id, game_id, model_version) DO UPDATE SET
                predicted_points = EXCLUDED.predicted_points,
                predicted_rebounds = EXCLUDED.predicted_rebounds,
                predicted_assists = EXCLUDED.predicted_assists,
                predicted_fantasy_pts = EXCLUDED.predicted_fantasy_pts,
                confidence_score = EXCLUDED.confidence_score,
                created_at = NOW()
        """
        chunk_size = 1000
        for index in range(0, len(prediction_rows), chunk_size):
            await conn.executemany(insert_sql, prediction_rows[index:index + chunk_size])

    total_predictions = await conn.fetchval(
        "SELECT COUNT(*) FROM predictions WHERE model_version = $1",
        model_version,
    )
    accuracy_rows = await conn.fetchval(
        "SELECT COUNT(*) FROM v_prediction_accuracy WHERE model_version = $1",
        model_version,
    )
    return {
        "model_version": model_version,
        "generated_rows": len(prediction_rows),
        "stored_predictions": total_predictions,
        "accuracy_rows": accuracy_rows,
    }


async def build_lineup_recommendation(conn, fantasy_team_id: int) -> dict:
    roster = await conn.fetch("""
        SELECT rp.player_id, rp.roster_slot, rp.is_active, rp.acquired_via,
               p.first_name || ' ' || p.last_name AS player_name,
               p.position, p.team_id, p.season_ppg,
               t.abbreviation AS team, t.conference, t.playoff_seed, t.is_eliminated
        FROM roster_players rp
        JOIN players p ON rp.player_id = p.player_id
        JOIN nba_teams t ON p.team_id = t.team_id
        WHERE rp.fantasy_team_id = $1
        ORDER BY rp.roster_slot
    """, fantasy_team_id)

    if not roster:
        raise ValueError("Equipo fantasy sin roster")

    seed_map = {
        (row["conference"], row["playoff_seed"]): row["team_id"]
        for row in await conn.fetch("SELECT team_id, conference, playoff_seed FROM nba_teams WHERE NOT is_eliminated")
    }
    seed_abbr = {
        row["team_id"]: row["abbreviation"]
        for row in await conn.fetch("SELECT team_id, abbreviation FROM nba_teams WHERE NOT is_eliminated")
    }

    def opp_seed(seed: int | None) -> int | None:
        return 9 - seed if seed else None

    results = []
    for row in roster:
        player_id = row["player_id"]
        conference = row["conference"]
        seed = row["playoff_seed"]
        opponent_team_id = seed_map.get((conference, opp_seed(seed))) if seed else None
        opponent_abbr = seed_abbr.get(opponent_team_id) if opponent_team_id else None

        recent5 = await conn.fetch("""
            SELECT pgs.points, pgs.rebounds, pgs.assists, pgs.fantasy_points
            FROM player_game_stats pgs
            JOIN games g ON pgs.game_id = g.game_id
            WHERE pgs.player_id = $1
            ORDER BY g.game_date DESC, g.game_id DESC
            LIMIT 5
        """, player_id)

        overall = await conn.fetchrow("""
            SELECT AVG(points) AS pts, AVG(rebounds) AS reb, AVG(assists) AS ast,
                   AVG(fantasy_points) AS fp, COUNT(*) AS games
            FROM player_game_stats
            WHERE player_id = $1
        """, player_id)

        opp_stats = None
        if opponent_team_id:
            opp_stats = await conn.fetchrow("""
                SELECT AVG(pgs.points) AS pts, AVG(pgs.rebounds) AS reb,
                       AVG(pgs.assists) AS ast, AVG(pgs.fantasy_points) AS fp,
                       COUNT(*) AS games
                FROM player_game_stats pgs
                JOIN games g ON pgs.game_id = g.game_id
                JOIN players p ON p.player_id = pgs.player_id
                WHERE pgs.player_id = $1
                  AND $2 = CASE
                      WHEN p.team_id = g.home_team_id THEN g.away_team_id
                      ELSE g.home_team_id
                  END
            """, player_id, opponent_team_id)

        recent_pts = _avg([float(game["points"] or 0) for game in recent5])
        recent_reb = _avg([float(game["rebounds"] or 0) for game in recent5])
        recent_ast = _avg([float(game["assists"] or 0) for game in recent5])
        recent_fp = _avg([float(game["fantasy_points"] or 0) for game in recent5])

        overall_pts = float(overall["pts"] or 0)
        overall_reb = float(overall["reb"] or 0)
        overall_ast = float(overall["ast"] or 0)
        overall_fp = float(overall["fp"] or 0)
        overall_games = int(overall["games"] or 0)

        opp_games = int(opp_stats["games"] or 0) if opp_stats else 0
        opp_pts = float(opp_stats["pts"] or 0) if opp_stats else 0.0
        opp_reb = float(opp_stats["reb"] or 0) if opp_stats else 0.0
        opp_ast = float(opp_stats["ast"] or 0) if opp_stats else 0.0
        opp_fp = float(opp_stats["fp"] or 0) if opp_stats else 0.0

        predicted_points = round(_blend_metric(recent_pts, overall_pts, opp_pts, opp_games), 2)
        predicted_rebounds = round(_blend_metric(recent_reb, overall_reb, opp_reb, opp_games), 2)
        predicted_assists = round(_blend_metric(recent_ast, overall_ast, opp_ast, opp_games), 2)
        predicted_fantasy = round(_blend_metric(recent_fp, overall_fp, opp_fp, opp_games), 2)

        confidence = 0.42 + min(overall_games, 12) * 0.025 + min(opp_games, 4) * 0.035
        if len(recent5) >= 2:
            confidence -= min(_stddev([float(game["fantasy_points"] or 0) for game in recent5]) / 40.0, 0.22)
        confidence = round(_clamp(confidence, 0.2, 0.95), 3)

        results.append({
            "player_id": player_id,
            "player_name": row["player_name"],
            "position": row["position"],
            "team": row["team"],
            "team_eliminated": row["is_eliminated"],
            "roster_slot": row["roster_slot"],
            "is_active": row["is_active"],
            "opponent": opponent_abbr,
            "opponent_team_id": opponent_team_id,
            "predicted_points": predicted_points,
            "predicted_rebounds": predicted_rebounds,
            "predicted_assists": predicted_assists,
            "predicted_fantasy_pts": predicted_fantasy,
            "confidence": confidence,
            "sample_recent": len(recent5),
            "sample_overall": overall_games,
            "sample_vs_opp": opp_games,
        })

    starter_assignment = _pick_best_lineup(results)
    recommended_slot_by_player = _assign_remaining_slots(results, starter_assignment)

    current_starter_ids = {player["player_id"] for player in results if player["roster_slot"] in STARTER_SLOTS}
    recommended_starter_ids = {
        player_id for player_id, slot in recommended_slot_by_player.items() if slot in STARTER_SLOTS
    }

    for player in results:
        recommended_slot = recommended_slot_by_player.get(player["player_id"])
        player["recommended_slot"] = recommended_slot
        if player["player_id"] in recommended_starter_ids:
            player["recommended_role"] = "starter"
        else:
            player["recommended_role"] = "bench"
        player["availability"] = "unavailable" if player["team_eliminated"] or not player["opponent"] else "active"
        player["current_role"] = "starter" if player["player_id"] in current_starter_ids else "bench"
        player["needs_change"] = player["roster_slot"] != recommended_slot if recommended_slot else False
        player["slot_fit"] = _matches_slot(player["position"], recommended_slot) if recommended_slot else False

    results.sort(key=lambda item: (
        0 if item["recommended_role"] == "starter" else 1 if item["recommended_role"] == "bench" else 2,
        STARTER_SLOTS.index(item["recommended_slot"]) if item["recommended_slot"] in STARTER_SLOTS else 99,
        -(item["predicted_fantasy_pts"] or 0),
    ))

    current_projected_total = round(
        sum(float(player["predicted_fantasy_pts"] or 0) for player in results if player["roster_slot"] in STARTER_SLOTS),
        2,
    )
    recommended_projected_total = round(
        sum(float(player["predicted_fantasy_pts"] or 0) for player in results if player["recommended_slot"] in STARTER_SLOTS),
        2,
    )
    recommended_starters = [player for player in results if player["recommended_slot"] in STARTER_SLOTS]
    active_players = sum(1 for player in results if player["availability"] == "active")

    return {
        "fantasy_team_id": fantasy_team_id,
        "model_version": "heuristic-v1-live",
        "opponent_rule": "R1 bracket (seed 1-8, 2-7, 3-6, 4-5)",
        "starter_slots": STARTER_SLOTS,
        "bench_slots": BENCH_SLOTS,
        "suggested_changes": sum(1 for player in results if player["needs_change"]),
        "validation": {
            "current_projected_total": current_projected_total,
            "recommended_projected_total": recommended_projected_total,
            "projected_gain": round(recommended_projected_total - current_projected_total, 2),
            "recommended_starters": len(recommended_starters),
            "active_players": active_players,
            "forced_out_of_position": sum(1 for player in recommended_starters if not player["slot_fit"]),
            "forced_unavailable_starters": sum(1 for player in recommended_starters if player["availability"] != "active"),
        },
        "lineup": results,
    }
