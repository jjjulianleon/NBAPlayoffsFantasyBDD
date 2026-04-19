"""
Seed 2024-25 y 2025-26 usando balldontlie.io API.

Alternativa a stats.nba.com (que bloquea IPs agresivamente).
Rate limit free tier: 5 req/min → sleep 13s entre requests.

Mapeo:
- balldontlie player_id ≠ NBA.com player_id → match por (first_name, last_name)
- balldontlie team_id ≠ NBA.com team_id → match por abbreviation
- Season en balldontlie es el año inicial: 2024 = 2024-25, 2025 = 2025-26

Uso:
    nohup python data/seed_balldontlie.py > data/seed_bdl.stdout 2>&1 &
    tail -f data/seed_bdl.log
"""
import os
import time
import logging
import requests
import psycopg
from datetime import datetime

CONN = "host=localhost dbname=playoff_hoops user=playoff password=playoff_dev"
API_KEY = os.environ.get('BALLDONTLIE_KEY', '6f9b696c-2b1f-41f6-860c-a65f9464914c')
BASE_URL = "https://api.balldontlie.io/v1"
SEASONS = [2024, 2025]  # 2024-25, 2025-26
SLEEP = 13  # 5 req/min → 12s mínimo, usar 13 por seguridad
PER_PAGE = 100

logging.basicConfig(
    filename='data/seed_bdl.log',
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
log = logging.getLogger(__name__)
log.addHandler(logging.StreamHandler())

HEADERS = {'Authorization': API_KEY}


def parse_min(m):
    if m is None or m == '':
        return 0
    s = str(m)
    if ':' in s:
        return int(s.split(':')[0])
    try:
        return int(s)
    except Exception:
        return 0


def fetch_page(season, cursor=None, max_retries=5):
    params = {'seasons[]': season, 'per_page': PER_PAGE}
    if cursor is not None:
        params['cursor'] = cursor
    delays = [5, 15, 60, 180, 600]
    for attempt in range(max_retries):
        try:
            r = requests.get(f"{BASE_URL}/stats", params=params, headers=HEADERS, timeout=60)
            if r.status_code == 429:
                wait = delays[attempt] if attempt < len(delays) else 600
                log.warning(f"  429 rate limit; esperando {wait}s")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait = delays[attempt]
            log.warning(f"  request falló ({type(e).__name__}: {e}); esperando {wait}s")
            time.sleep(wait)


def seed_season(conn, season):
    log.info(f"== Seeding season {season}-{(season+1) % 100:02d} ==")

    with conn.cursor() as cur:
        cur.execute("SELECT abbreviation, team_id FROM nba_teams")
        abbr_to_id = dict(cur.fetchall())
        cur.execute("SELECT player_id, LOWER(first_name), LOWER(last_name) FROM players")
        name_to_pid = {}
        for pid, fn, ln in cur.fetchall():
            name_to_pid[(fn, ln)] = pid

    cursor = None
    page = 0
    inserted = 0
    skipped_player = 0
    skipped_team = 0
    games_seen = set()

    while True:
        page += 1
        payload = fetch_page(season, cursor)
        rows = payload.get('data', [])
        if not rows:
            break
        log.info(f"  page {page}: {len(rows)} filas (cursor={cursor})")

        with conn.cursor() as cur:
            for row in rows:
                player = row.get('player') or {}
                fn = (player.get('first_name') or '').strip().lower()
                ln = (player.get('last_name') or '').strip().lower()
                pid = name_to_pid.get((fn, ln))
                if pid is None:
                    skipped_player += 1
                    continue

                game = row.get('game') or {}
                gid = str(game.get('id'))
                gdate_s = game.get('date')
                if not gdate_s:
                    continue
                try:
                    gdate = datetime.strptime(gdate_s[:10], '%Y-%m-%d').date()
                except Exception:
                    continue

                # team abbreviations del game
                home_abbr = (game.get('home_team') or {}).get('abbreviation') if isinstance(game.get('home_team'), dict) else None
                visit_abbr = (game.get('visitor_team') or {}).get('abbreviation') if isinstance(game.get('visitor_team'), dict) else None

                # Fallback: usar IDs home_team_id/visitor_team_id con lookup previo
                home_id = abbr_to_id.get(home_abbr) if home_abbr else None
                away_id = abbr_to_id.get(visit_abbr) if visit_abbr else None

                if home_id is None or away_id is None or home_id == away_id:
                    skipped_team += 1
                    continue

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
                    pid, gid,
                    parse_min(row.get('min')),
                    int(row.get('pts') or 0),
                    int(row.get('reb') or 0),
                    int(row.get('ast') or 0),
                    int(row.get('stl') or 0),
                    int(row.get('blk') or 0),
                    int(row.get('turnover') or 0),
                    int(row.get('fgm') or 0),
                    int(row.get('fga') or 0),
                    int(row.get('fg3m') or 0),
                    int(row.get('fg3a') or 0),
                    int(row.get('ftm') or 0),
                    int(row.get('fta') or 0),
                    0,  # balldontlie no da plus_minus en /stats
                ))
                inserted += 1

        meta = payload.get('meta') or {}
        next_cursor = meta.get('next_cursor')
        if not next_cursor:
            break
        cursor = next_cursor

        if page % 10 == 0:
            log.info(f"  progreso: {inserted} stats, {len(games_seen)} games, skips(player={skipped_player}, team={skipped_team})")
        time.sleep(SLEEP)

    log.info(f"  DONE {season}: {inserted} stats, {len(games_seen)} games, skips(player={skipped_player}, team={skipped_team})")


def main():
    log.info("=" * 60)
    log.info(f"Inicio balldontlie seed: {datetime.now().isoformat()}")
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
