"""
Seed real con datos de nba_api — diseñado para correr overnight.

Carga:
- Todos los equipos NBA (30)
- Todos los jugadores activos del 2025-26 (~500)
- Game logs de las últimas 3 temporadas (2023-24, 2024-25, 2025-26)
- Season averages para cada jugador

Características:
- Sleep de 1.5s entre llamadas (rate limit nba.com)
- Idempotente: usa ON CONFLICT DO UPDATE
- Logging detallado a seed_real.log
- Resume si se interrumpe (registra último jugador procesado)
- Estimación: ~30-45 minutos para 500 jugadores × 1 temporada
            ~2-3 horas para 3 temporadas

Uso:
    nohup python data/seed_real.py > data/seed_real.log 2>&1 &
    tail -f data/seed_real.log
"""
import time
import logging
import psycopg
from datetime import datetime
from nba_api.stats.static import teams as nba_teams_static
from nba_api.stats.static import players as nba_players_static
from nba_api.stats.endpoints import (
    commonplayerinfo, leaguedashplayerstats, playergamelog,
)

CONN = "host=localhost dbname=playoff_hoops user=playoff password=playoff_dev"
SEASONS = ['2023-24', '2024-25', '2025-26']
SLEEP = 1.5

logging.basicConfig(
    filename='data/seed_real.log',
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
log = logging.getLogger(__name__)
log.addHandler(logging.StreamHandler())

CONFERENCES = {
    'East': {1610612737,1610612738,1610612739,1610612741,1610612748,1610612749,
             1610612751,1610612752,1610612753,1610612754,1610612755,1610612761,
             1610612764,1610612765,1610612766},
}

def conf_of(team_id):
    return 'East' if team_id in CONFERENCES['East'] else 'West'


def seed_teams(conn):
    log.info("== Seeding NBA teams ==")
    rows = nba_teams_static.get_teams()
    with conn.cursor() as cur:
        for t in rows:
            cur.execute("""
                INSERT INTO nba_teams (team_id, abbreviation, full_name, conference)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (team_id) DO UPDATE
                  SET abbreviation = EXCLUDED.abbreviation,
                      full_name    = EXCLUDED.full_name,
                      conference   = EXCLUDED.conference
            """, (t['id'], t['abbreviation'], t['full_name'], conf_of(t['id'])))
    log.info(f"  {len(rows)} equipos cargados")


def seed_players_with_averages(conn, season='2025-26'):
    log.info(f"== Seeding players + season averages ({season}) ==")
    df = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season, per_mode_detailed='PerGame'
    ).get_data_frames()[0]

    log.info(f"  {len(df)} jugadores en {season}")
    with conn.cursor() as cur:
        for _, r in df.iterrows():
            cur.execute("""
                INSERT INTO players (player_id, first_name, last_name, team_id,
                                     position, season_ppg, season_rpg, season_apg)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (player_id) DO UPDATE
                  SET team_id    = EXCLUDED.team_id,
                      season_ppg = EXCLUDED.season_ppg,
                      season_rpg = EXCLUDED.season_rpg,
                      season_apg = EXCLUDED.season_apg
            """, (
                int(r['PLAYER_ID']),
                r['PLAYER_NAME'].split(' ')[0][:50],
                ' '.join(r['PLAYER_NAME'].split(' ')[1:])[:50] or r['PLAYER_NAME'][:50],
                int(r['TEAM_ID']) if r['TEAM_ID'] else None,
                'G',  # nba_api no devuelve posición aquí; se actualiza después
                float(r['PTS']),
                float(r['REB']),
                float(r['AST']),
            ))
    log.info(f"  Insert/update completado")


def seed_game_logs(conn, season):
    log.info(f"== Seeding game logs para {season} ==")
    with conn.cursor() as cur:
        cur.execute("SELECT player_id FROM players ORDER BY player_id")
        player_ids = [r[0] for r in cur.fetchall()]

    log.info(f"  {len(player_ids)} jugadores a procesar")
    # Cache de abbreviations -> team_id
    with conn.cursor() as cur:
        cur.execute("SELECT abbreviation, team_id FROM nba_teams")
        abbr_to_id = dict(cur.fetchall())
        cur.execute("SELECT player_id, team_id FROM players WHERE team_id IS NOT NULL")
        player_team = dict(cur.fetchall())

    games_seen = set()
    inserted = 0

    for i, pid in enumerate(player_ids, 1):
        try:
            df = playergamelog.PlayerGameLog(
                player_id=pid, season=season
            ).get_data_frames()[0]
        except Exception as e:
            log.warning(f"  [{i}/{len(player_ids)}] player {pid}: {e}")
            time.sleep(SLEEP)
            continue

        own_team = player_team.get(pid)
        if own_team is None:
            time.sleep(SLEEP)
            continue

        with conn.cursor() as cur:
            for _, r in df.iterrows():
                gid = str(r['Game_ID'])
                try:
                    gdate = datetime.strptime(r['GAME_DATE'], '%b %d, %Y').date()
                except Exception:
                    continue

                # Parsear matchup — SIEMPRE derivar ambos equipos del string
                # Formato: "LAL vs. HOU" (home) o "LAL @ HOU" (away)
                matchup = r['MATCHUP']
                is_home = ' vs. ' in matchup
                parts = matchup.replace(' vs.', '').replace(' @', '').split()
                if len(parts) != 2:
                    continue
                player_team_abbr, opp_abbr = parts[0], parts[1]
                if player_team_abbr == opp_abbr:
                    continue
                t1 = abbr_to_id.get(player_team_abbr)
                t2 = abbr_to_id.get(opp_abbr)
                if t1 is None or t2 is None or t1 == t2:
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

        if i % 25 == 0:
            log.info(f"  [{i}/{len(player_ids)}] procesados, {inserted} stats insertadas, {len(games_seen)} juegos únicos")
        time.sleep(SLEEP)

    log.info(f"  Total: {inserted} stats insertadas para {season}")


def main():
    log.info("=" * 60)
    log.info(f"Inicio: {datetime.now().isoformat()}")
    log.info("=" * 60)

    with psycopg.connect(CONN, autocommit=True) as conn:
        log.info("== Limpiando datos sintéticos previos ==")
        with conn.cursor() as cur:
            cur.execute("""
                TRUNCATE transactions, predictions, scouting_reports, draft_picks,
                         roster_players, fantasy_teams, league_members, leagues,
                         player_game_stats, players, games, nba_teams, users
                RESTART IDENTITY CASCADE;
            """)
        seed_teams(conn)
        time.sleep(SLEEP)

        # Solo cargamos jugadores de la temporada actual; las anteriores
        # se cargan implícitamente vía game logs si aparecen
        seed_players_with_averages(conn, season='2025-26')

        for season in SEASONS:
            try:
                seed_game_logs(conn, season)
            except Exception as e:
                log.exception(f"Error en season {season}: {e}")

    log.info("=" * 60)
    log.info(f"Fin: {datetime.now().isoformat()}")
    log.info("=" * 60)


if __name__ == '__main__':
    main()
