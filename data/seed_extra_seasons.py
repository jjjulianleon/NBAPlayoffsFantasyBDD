"""
Seed incremental para 2024-25 y 2025-26 usando PlayerGameLogs (bulk).

A diferencia de PlayerGameLog (singular, 1 request por jugador), PlayerGameLogs
devuelve TODOS los jugadores de una temporada en UNA sola llamada.
~2 requests totales en vez de ~900.

Uso:
    nohup python data/seed_extra_seasons.py > data/seed_extra.stdout 2>&1 &
    tail -f data/seed_extra.log
"""
import time
import logging
import psycopg
from datetime import datetime
from nba_api.stats.endpoints import playergamelogs
from nba_api.stats.library.http import NBAStatsHTTP

CONN = "host=localhost dbname=playoff_hoops user=playoff password=playoff_dev"
SEASONS = ['2024-25', '2025-26']
TIMEOUT = 90

NBAStatsHTTP.headers = {
    'Host': 'stats.nba.com',
    'User-Agent': ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'),
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.nba.com/',
    'Origin': 'https://www.nba.com',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
    'Connection': 'keep-alive',
}

logging.basicConfig(
    filename='data/seed_extra.log',
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
log = logging.getLogger(__name__)
log.addHandler(logging.StreamHandler())


def fetch_season_bulk(season, max_retries=5):
    """Una sola llamada para toda la temporada, con backoff."""
    delays = [10, 30, 90, 300, 600]
    for attempt in range(max_retries):
        try:
            log.info(f"  → PlayerGameLogs(season={season}) attempt {attempt+1}")
            df = playergamelogs.PlayerGameLogs(
                season_nullable=season,
                season_type_nullable='Regular Season',
                timeout=TIMEOUT,
            ).get_data_frames()[0]
            log.info(f"  ← {len(df)} filas recibidas")
            return df
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait = delays[attempt]
            log.warning(f"  {season} attempt {attempt+1} falló ({type(e).__name__}: {e}); esperando {wait}s")
            time.sleep(wait)


def seed_season(conn, season):
    log.info(f"== Seeding {season} (bulk) ==")

    with conn.cursor() as cur:
        cur.execute("SELECT abbreviation, team_id FROM nba_teams")
        abbr_to_id = dict(cur.fetchall())
        cur.execute("SELECT player_id FROM players")
        known_players = {r[0] for r in cur.fetchall()}

    df = fetch_season_bulk(season)

    games_seen = set()
    inserted = 0
    skipped_unknown_player = 0
    skipped_bad_matchup = 0

    with conn.cursor() as cur:
        for _, r in df.iterrows():
            pid = int(r['PLAYER_ID'])
            if pid not in known_players:
                skipped_unknown_player += 1
                continue

            gid = str(r['GAME_ID'])
            try:
                gdate = datetime.strptime(r['GAME_DATE'][:10], '%Y-%m-%d').date()
            except Exception:
                try:
                    gdate = datetime.strptime(r['GAME_DATE'], '%b %d, %Y').date()
                except Exception:
                    continue

            matchup = r['MATCHUP']
            is_home = ' vs. ' in matchup
            parts = matchup.replace(' vs.', '').replace(' @', '').split()
            if len(parts) != 2:
                skipped_bad_matchup += 1
                continue
            t1 = abbr_to_id.get(parts[0])
            t2 = abbr_to_id.get(parts[1])
            if t1 is None or t2 is None or t1 == t2:
                skipped_bad_matchup += 1
                continue
            home_id = t1 if is_home else t2
            away_id = t2 if is_home else t1

            if gid not in games_seen:
                cur.execute("""
                    INSERT INTO games (game_id, game_date, home_team_id, away_team_id,
                                       status, playoff_round)
                    VALUES (%s, %s, %s, %s, 'final', 1)
                    ON CONFLICT (game_id) DO NOTHING
                """, (gid, gdate, home_id, away_id))
                games_seen.add(gid)

            cur.execute("""
                INSERT INTO player_game_stats
                  (player_id, game_id, minutes_played, points, rebounds, assists,
                   steals, blocks, turnovers, fg_made, fg_attempted,
                   three_made, three_attempted, ft_made, ft_attempted, plus_minus)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (player_id, game_id) DO NOTHING
            """, (
                pid, gid, int(r['MIN']), int(r['PTS']), int(r['REB']),
                int(r['AST']), int(r['STL']), int(r['BLK']), int(r['TOV']),
                int(r['FGM']), int(r['FGA']), int(r['FG3M']), int(r['FG3A']),
                int(r['FTM']), int(r['FTA']), int(r['PLUS_MINUS'] or 0),
            ))
            inserted += 1

    log.info(f"  {season}: {inserted} stats, {len(games_seen)} games nuevos")
    log.info(f"  (skip: {skipped_unknown_player} jugadores desconocidos, {skipped_bad_matchup} matchups inválidos)")


def main():
    log.info("=" * 60)
    log.info(f"Inicio bulk seed: {datetime.now().isoformat()}")
    log.info("=" * 60)
    with psycopg.connect(CONN, autocommit=True) as conn:
        for season in SEASONS:
            try:
                seed_season(conn, season)
            except Exception as e:
                log.exception(f"Error en {season}: {e}")
            time.sleep(5)
    log.info(f"Fin: {datetime.now().isoformat()}")


if __name__ == '__main__':
    main()
