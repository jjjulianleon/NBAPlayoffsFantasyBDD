"""
Seed 2024-25 y 2025-26 desde dataset Kaggle (eoinamoore/historical-nba-data).

Ventajas sobre nba_api/balldontlie:
- Cero rate limiting (es un CSV local)
- personId y hometeamId/awayteamId = IDs NBA.com = los que ya tenemos cargados
- Actualizado diariamente

Uso:
    # Asume que ya descomprimiste el zip en data/kaggle/
    python data/seed_kaggle.py
"""
import logging
import psycopg
import pandas as pd
import time
from datetime import datetime, timedelta

CONN = "host=localhost dbname=playoff_hoops user=playoff password=playoff_dev"
KAGGLE_DIR = "data/kaggle"
# Cargar todo lo de las dos temporadas: arrancan en octubre
CUTOFF_DATE = "2024-10-01"
BATCH_SIZE = 2000

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
log = logging.getLogger(__name__)


def build_team_name_map(conn):
    """city+name → team_id desde nba_teams (usamos full_name que contiene ambos)."""
    with conn.cursor() as cur:
        cur.execute("SELECT team_id, full_name FROM nba_teams")
        name_to_id = {}
        for tid, full in cur.fetchall():
            name_to_id[full.strip().lower()] = tid
    return name_to_id


def load_missing_players(conn, known_player_ids, name_to_team):
    """Detecta personIds en PlayerStatistics (>=cutoff) que no están en players;
    los inserta usando Players.csv + nombre de equipo del último game."""
    log.info("== Detectando jugadores faltantes ==")
    stats_path = f"{KAGGLE_DIR}/PlayerStatistics.csv"

    # Scan de PlayerStatistics: recolectar (personId → ultima_fecha, team_city, team_name)
    latest_team = {}
    for chunk in pd.read_csv(
        stats_path,
        chunksize=100000,
        parse_dates=['gameDateTimeEst'],
        usecols=['personId', 'gameDateTimeEst', 'playerteamCity', 'playerteamName'],
        low_memory=False,
    ):
        chunk = chunk[chunk['gameDateTimeEst'] >= CUTOFF_DATE]
        if chunk.empty:
            continue
        for _, r in chunk.iterrows():
            pid = int(r['personId'])
            if pid in known_player_ids:
                continue
            prev = latest_team.get(pid)
            if prev is None or r['gameDateTimeEst'] > prev[0]:
                latest_team[pid] = (r['gameDateTimeEst'], r['playerteamCity'], r['playerteamName'])

    log.info(f"  {len(latest_team)} personIds no están en players")
    if not latest_team:
        return

    # Cargar Players.csv para nombres y posición
    players_df = pd.read_csv(f"{KAGGLE_DIR}/Players.csv", low_memory=False)
    players_df = players_df[players_df['personId'].isin(latest_team.keys())]
    log.info(f"  {len(players_df)} coinciden con Players.csv")

    rows = []
    for _, r in players_df.iterrows():
        pid = int(r['personId'])
        fn = str(r['firstName'])[:50] if pd.notna(r['firstName']) else 'Unknown'
        ln = str(r['lastName'])[:50] if pd.notna(r['lastName']) else str(pid)
        # Posición: comparar contra '1' (CSV tiene strings '0','1','false',NaN)
        is_g = str(r.get('guard', '')).strip() == '1'
        is_f = str(r.get('forward', '')).strip() == '1'
        is_c = str(r.get('center', '')).strip() == '1'
        if is_g and is_f:
            pos = 'G-F'
        elif is_f and is_c:
            pos = 'F-C'
        elif is_g:
            pos = 'G'
        elif is_f:
            pos = 'F'
        elif is_c:
            pos = 'C'
        else:
            pos = 'G'  # fallback for players with no position flag

        _, city, name = latest_team[pid]
        full = f"{city} {name}".strip().lower() if pd.notna(city) and pd.notna(name) else None
        team_id = name_to_team.get(full) if full else None
        if team_id is None:
            continue  # sin equipo no podemos cumplir NOT NULL; su stat se saltará luego

        rows.append((pid, fn, ln, team_id, pos, 0.0, 0.0, 0.0))

    inserted = 0
    with conn.cursor() as cur:
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i:i+BATCH_SIZE]
            cur.executemany("""
                INSERT INTO players (player_id, first_name, last_name, team_id,
                                     position, season_ppg, season_rpg, season_apg)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (player_id) DO UPDATE SET
                    position = EXCLUDED.position,
                    team_id  = EXCLUDED.team_id
            """, batch)
            inserted += len(batch)

    skipped_no_team = len(latest_team) - len(rows)
    log.info(f"  Players insertados: {inserted} (skip sin team match: {skipped_no_team})")


def load_games(conn, known_team_ids):
    log.info("== Cargando Games.csv ==")
    games_path = f"{KAGGLE_DIR}/Games.csv"
    df = pd.read_csv(games_path, parse_dates=['gameDateTimeEst'], low_memory=False)
    log.info(f"  Total filas en Games.csv: {len(df)}")

    df = df[df['gameDateTimeEst'] >= CUTOFF_DATE].copy()
    log.info(f"  Después de filtro fecha ({CUTOFF_DATE}): {len(df)}")

    # Filtrar a juegos donde ambos equipos están en nuestra tabla
    df = df[df['hometeamId'].isin(known_team_ids) & df['awayteamId'].isin(known_team_ids)]
    df = df[df['hometeamId'] != df['awayteamId']]
    log.info(f"  Después de filtro team_ids válidos: {len(df)}")

    rows = []
    for _, r in df.iterrows():
        home_score = int(r['homeScore']) if pd.notna(r.get('homeScore')) else 0
        away_score = int(r['awayScore']) if pd.notna(r.get('awayScore')) else 0
        status = 'final' if (home_score > 0 or away_score > 0) else 'scheduled'
        rows.append((
            str(r['gameId']),
            r['gameDateTimeEst'].date(),
            int(r['hometeamId']),
            int(r['awayteamId']),
            home_score,
            away_score,
            status,
            1,  # playoff_round default; refinamos después con gameType
        ))

    inserted = 0
    with conn.cursor() as cur:
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i:i+BATCH_SIZE]
            cur.executemany("""
                INSERT INTO games (game_id, game_date, home_team_id, away_team_id,
                                   home_score, away_score, status, playoff_round)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (game_id) DO UPDATE SET
                    home_score = EXCLUDED.home_score,
                    away_score = EXCLUDED.away_score,
                    status     = EXCLUDED.status
            """, batch)
            inserted += len(batch)
            if (i // BATCH_SIZE) % 5 == 0:
                log.info(f"  games: {inserted}/{len(rows)}")

    log.info(f"  Games DONE: {len(rows)} procesados")
    return set(df['gameId'].astype(str))


def load_player_stats(conn, valid_game_ids, known_player_ids):
    log.info("== Cargando PlayerStatistics.csv (en chunks) ==")
    stats_path = f"{KAGGLE_DIR}/PlayerStatistics.csv"

    total_read = 0
    inserted = 0
    skipped_date = 0
    skipped_game = 0
    skipped_player = 0
    batch = []

    with conn.cursor() as cur:
        for chunk in pd.read_csv(
            stats_path,
            chunksize=50000,
            parse_dates=['gameDateTimeEst'],
            low_memory=False,
        ):
            total_read += len(chunk)

            # Filtros
            chunk = chunk[chunk['gameDateTimeEst'] >= CUTOFF_DATE]
            if chunk.empty:
                continue

            for _, r in chunk.iterrows():
                gid = str(r['gameId'])
                pid = int(r['personId'])

                if gid not in valid_game_ids:
                    skipped_game += 1
                    continue
                if pid not in known_player_ids:
                    skipped_player += 1
                    continue

                # NaN-safe casts
                def gi(v, default=0):
                    try:
                        if pd.isna(v):
                            return default
                        return int(v)
                    except Exception:
                        return default

                batch.append((
                    pid,
                    gid,
                    gi(r['numMinutes']),
                    gi(r['points']),
                    gi(r['reboundsTotal']),
                    gi(r['assists']),
                    gi(r['steals']),
                    gi(r['blocks']),
                    gi(r['turnovers']),
                    gi(r['fieldGoalsMade']),
                    gi(r['fieldGoalsAttempted']),
                    gi(r['threePointersMade']),
                    gi(r['threePointersAttempted']),
                    gi(r['freeThrowsMade']),
                    gi(r['freeThrowsAttempted']),
                    gi(r['plusMinusPoints']),
                ))

                if len(batch) >= BATCH_SIZE:
                    cur.executemany("""
                        INSERT INTO player_game_stats
                          (player_id, game_id, minutes_played, points, rebounds, assists,
                           steals, blocks, turnovers, fg_made, fg_attempted,
                           three_made, three_attempted, ft_made, ft_attempted, plus_minus)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (player_id, game_id) DO NOTHING
                    """, batch)
                    inserted += len(batch)
                    batch = []

            log.info(f"  chunk procesado; total_leido={total_read} insertados={inserted} skipped(game={skipped_game}, player={skipped_player})")

        # Flush final
        if batch:
            cur.executemany("""
                INSERT INTO player_game_stats
                  (player_id, game_id, minutes_played, points, rebounds, assists,
                   steals, blocks, turnovers, fg_made, fg_attempted,
                   three_made, three_attempted, ft_made, ft_attempted, plus_minus)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (player_id, game_id) DO NOTHING
            """, batch)
            inserted += len(batch)

    log.info(f"  Stats DONE: {inserted} insertados")
    log.info(f"  Skipped: date={skipped_date}, game_id_no_valido={skipped_game}, player_id_desconocido={skipped_player}")


def fix_all_positions(conn):
    """Re-parse positions from Players.csv for ALL players in DB.
    Fixes the bool('0')==True bug that set everyone to 'G'."""
    log.info("== Reparando posiciones de jugadores existentes ==")
    players_df = pd.read_csv(f"{KAGGLE_DIR}/Players.csv", low_memory=False)

    with conn.cursor() as cur:
        cur.execute("SELECT player_id FROM players")
        db_ids = {r[0] for r in cur.fetchall()}

    players_df = players_df[players_df['personId'].isin(db_ids)]
    updates = []
    for _, r in players_df.iterrows():
        pid = int(r['personId'])
        is_g = str(r.get('guard', '')).strip() == '1'
        is_f = str(r.get('forward', '')).strip() == '1'
        is_c = str(r.get('center', '')).strip() == '1'
        if is_g and is_f:
            pos = 'G-F'
        elif is_f and is_c:
            pos = 'F-C'
        elif is_g:
            pos = 'G'
        elif is_f:
            pos = 'F'
        elif is_c:
            pos = 'C'
        else:
            pos = 'G'
        updates.append((pos, pid))

    with conn.cursor() as cur:
        cur.executemany(
            "UPDATE players SET position = %s WHERE player_id = %s",
            updates,
        )
    log.info(f"  Posiciones actualizadas: {len(updates)} jugadores")


def backfill_from_nba_api(conn):
    """Fetch jersey numbers AND correct positions from nba_api for players that need them."""
    log.info("== Backfill jersey numbers + positions (nba_api) ==")
    try:
        from nba_api.stats.endpoints import CommonPlayerInfo
    except ImportError:
        log.warning("  nba_api no instalado, saltando backfill")
        return

    with conn.cursor() as cur:
        # Players needing jersey OR position fix (position 'G' with high ppg could be misclassified)
        cur.execute("""
            SELECT player_id FROM players
            WHERE jersey_number IS NULL
               OR (position = 'G' AND season_ppg > 5)
            ORDER BY season_ppg DESC
        """)
        candidates = [r[0] for r in cur.fetchall()]

    log.info(f"  {len(candidates)} jugadores candidatos a backfill")
    if not candidates:
        return

    # Map NBA position strings to our schema
    pos_map = {
        'Guard': 'G', 'Guard-Forward': 'G-F', 'Forward-Guard': 'G-F',
        'Forward': 'F', 'Forward-Center': 'F-C', 'Center-Forward': 'F-C',
        'Center': 'C',
    }

    # Limit to 200 per run to avoid rate limiting
    batch = candidates[:200]
    updated_jersey = 0
    updated_pos = 0
    errors = 0
    for pid in batch:
        try:
            info = CommonPlayerInfo(player_id=pid, timeout=10)
            df = info.get_data_frames()[0]
            if not df.empty:
                row = df.iloc[0]
                # Jersey number
                jersey = str(row.get('JERSEY', '')).strip()
                # Position
                nba_pos = str(row.get('POSITION', '')).strip()
                mapped_pos = pos_map.get(nba_pos)

                updates = []
                params = []
                if jersey and jersey != 'nan':
                    updates.append("jersey_number = %s")
                    params.append(jersey[:3])
                    updated_jersey += 1
                if mapped_pos:
                    updates.append("position = %s")
                    params.append(mapped_pos)
                    updated_pos += 1

                if updates:
                    params.append(pid)
                    with conn.cursor() as cur:
                        cur.execute(
                            f"UPDATE players SET {', '.join(updates)} WHERE player_id = %s",
                            params,
                        )
            time.sleep(0.6)  # rate limit
        except Exception as e:
            errors += 1
            if errors <= 3:
                log.warning(f"  Error para player {pid}: {e}")
            if errors > 20:
                log.warning("  Demasiados errores, deteniendo backfill")
                break
            time.sleep(1)

    log.info(f"  Jersey numbers: {updated_jersey}, posiciones: {updated_pos}, errores: {errors}")


def main():
    log.info("=" * 60)
    log.info(f"Inicio Kaggle seed: {datetime.now().isoformat()}")
    log.info("=" * 60)

    with psycopg.connect(CONN, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT team_id FROM nba_teams")
            known_team_ids = {r[0] for r in cur.fetchall()}
            cur.execute("SELECT player_id FROM players")
            known_player_ids = {r[0] for r in cur.fetchall()}
            # Modo incremental: arrancar desde la última fecha en DB
            cur.execute("SELECT MAX(game_date) FROM games")
            last_date = cur.fetchone()[0]
            if last_date:
                global CUTOFF_DATE
                # Retrocedemos 7 días para capturar scores actualizados
                CUTOFF_DATE = str(last_date - timedelta(days=7))
                log.info(f"  Modo incremental desde {CUTOFF_DATE}")
            log.info(f"  {len(known_team_ids)} teams, {len(known_player_ids)} players en DB")

        name_to_team = build_team_name_map(conn)
        load_missing_players(conn, known_player_ids, name_to_team)

        # Refrescar lista después del auto-insert
        with conn.cursor() as cur:
            cur.execute("SELECT player_id FROM players")
            known_player_ids = {r[0] for r in cur.fetchall()}
            log.info(f"  {len(known_player_ids)} players en DB después de auto-insert")

        # Fix positions for ALL players (reparar bug bool('0')==True)
        fix_all_positions(conn)

        load_games(conn, known_team_ids)

        with conn.cursor() as cur:
            cur.execute("SELECT game_id FROM games")
            all_game_ids = {r[0] for r in cur.fetchall()}

        load_player_stats(conn, all_game_ids, known_player_ids)

        # Backfill jersey numbers + positions from nba_api (rate-limited, 200 per run)
        backfill_from_nba_api(conn)

    log.info(f"Fin: {datetime.now().isoformat()}")


if __name__ == '__main__':
    main()
