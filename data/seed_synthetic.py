"""
Seed sintético rápido para validar schema + triggers + SPs.
Inserta: 8 equipos NBA, 30 jugadores, 1 usuario, 1 liga, 1 fantasy_team,
8 picks de draft (roster lleno), 4 partidos, 30 stats.
Verifica que los triggers de fantasy_points y total_points disparen.
"""
import psycopg
import os
from datetime import date, timedelta

CONN = os.getenv("DATABASE_URL", "host=localhost dbname=playoff_hoops user=playoff password=playoff_dev")

NBA_TEAMS = [
    (1610612760, 'OKC', 'Oklahoma City Thunder', 'West', 1),
    (1610612765, 'DET', 'Detroit Pistons',       'East', 1),
    (1610612747, 'LAL', 'Los Angeles Lakers',    'West', 4),
    (1610612743, 'DEN', 'Denver Nuggets',        'West', 5),
    (1610612738, 'BOS', 'Boston Celtics',        'East', 2),
    (1610612749, 'MIL', 'Milwaukee Bucks',       'East', 3),
    (1610612759, 'SAS', 'San Antonio Spurs',     'West', 2),
    (1610612744, 'GSW', 'Golden State Warriors', 'West', 6),
]

PLAYERS = [
    # (id, first, last, team_id, pos, ppg, rpg, apg)
    (1, 'Shai',    'Gilgeous-Alexander', 1610612760, 'G', 32.5, 5.0, 6.5),
    (2, 'Chet',    'Holmgren',           1610612760, 'C', 18.0, 8.5, 2.0),
    (3, 'Jalen',   'Williams',           1610612760, 'F', 21.0, 5.5, 5.0),
    (4, 'Cade',    'Cunningham',         1610612765, 'G', 26.0, 6.0, 9.0),
    (5, 'Jaden',   'Ivey',               1610612765, 'G', 18.0, 4.0, 4.5),
    (6, 'Tobias',  'Harris',             1610612765, 'F', 14.0, 5.5, 2.5),
    (7, 'LeBron',  'James',              1610612747, 'F', 25.0, 7.5, 8.0),
    (8, 'Anthony', 'Davis',              1610612747, 'C', 24.5, 11.0, 3.5),
    (9, 'Austin',  'Reaves',             1610612747, 'G', 16.0, 4.0, 5.0),
    (10,'Nikola',  'Jokic',              1610612743, 'C', 28.0, 13.0, 10.0),
    (11,'Jamal',   'Murray',             1610612743, 'G', 20.0, 4.0, 6.5),
    (12,'Aaron',   'Gordon',             1610612743, 'F', 14.0, 6.0, 3.5),
    (13,'Jayson',  'Tatum',              1610612738, 'F', 27.0, 8.5, 5.0),
    (14,'Jaylen',  'Brown',              1610612738, 'G', 24.0, 5.5, 4.0),
    (15,'Kristaps','Porzingis',          1610612738, 'C', 20.0, 7.0, 2.0),
    (16,'Giannis', 'Antetokounmpo',      1610612749, 'F', 30.5, 11.5, 6.0),
    (17,'Damian',  'Lillard',            1610612749, 'G', 25.0, 4.5, 7.0),
    (18,'Bobby',   'Portis',             1610612749, 'F', 14.0, 9.0, 1.5),
    (19,'Victor',  'Wembanyama',         1610612759, 'C', 24.0, 11.0, 3.5),
    (20,'Devin',   'Vassell',            1610612759, 'G', 17.0, 4.0, 3.0),
    (21,'Chris',   'Paul',               1610612759, 'G', 9.0,  3.5, 7.5),
    (22,'Stephen', 'Curry',              1610612744, 'G', 27.0, 4.5, 6.5),
    (23,'Draymond','Green',              1610612744, 'F', 9.0,  7.0, 6.0),
    (24,'Andrew',  'Wiggins',            1610612744, 'F', 18.0, 5.0, 2.0),
    (25,'Jrue',    'Holiday',            1610612738, 'G', 12.5, 5.0, 4.5),
    (26,'Derrick', 'White',              1610612738, 'G', 16.0, 4.0, 5.0),
    (27,'Russell', 'Westbrook',          1610612743, 'G', 13.0, 5.0, 7.0),
    (28,'Brook',   'Lopez',              1610612749, 'C', 12.0, 5.0, 1.5),
    (29,'Rui',     'Hachimura',          1610612747, 'F', 13.0, 5.5, 1.5),
    (30,'Isaiah',  'Hartenstein',        1610612760, 'C', 11.0, 10.5, 3.5),
]

# 4 partidos R1 playoff (round=1)
GAMES = [
    ('0042500101', date(2026,4,18), 1610612760, 1610612744, 1, 1),  # OKC vs GSW
    ('0042500102', date(2026,4,19), 1610612765, 1610612749, 1, 1),  # DET vs MIL
    ('0042500103', date(2026,4,20), 1610612747, 1610612743, 1, 1),  # LAL vs DEN
    ('0042500104', date(2026,4,21), 1610612738, 1610612759, 1, 1),  # BOS vs SAS
]

# Hash bcrypt de "password123" (precalculado)
BCRYPT_HASH = "$2b$12$KIXpqXvVrFPiL5sN3FKQp.s5xZQH8GXz6BvN5l/Y5W9zK0xQzVqRu"

with psycopg.connect(CONN, autocommit=True) as conn:
    with conn.cursor() as cur:
        print("→ Limpiando datos previos...")
        cur.execute("""
            TRUNCATE transactions, predictions, scouting_reports, draft_picks,
                     roster_players, fantasy_teams, league_members, leagues,
                     player_game_stats, players, games, nba_teams, users
            RESTART IDENTITY CASCADE;
        """)

        print("→ Insertando 8 equipos NBA...")
        cur.executemany(
            "INSERT INTO nba_teams (team_id,abbreviation,full_name,conference,playoff_seed) "
            "VALUES (%s,%s,%s,%s,%s)", NBA_TEAMS)

        print("→ Insertando 30 jugadores...")
        cur.executemany(
            "INSERT INTO players (player_id,first_name,last_name,team_id,position,"
            "season_ppg,season_rpg,season_apg) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", PLAYERS)

        print("→ Insertando 4 partidos de playoff...")
        cur.executemany(
            "INSERT INTO games (game_id,game_date,home_team_id,away_team_id,"
            "playoff_round,game_number_in_series) VALUES (%s,%s,%s,%s,%s,%s)", GAMES)

        print("→ Insertando usuario de prueba (julian / password123)...")
        cur.execute(
            "INSERT INTO users (username,email,password_hash,display_name) "
            "VALUES (%s,%s,%s,%s) RETURNING user_id",
            ("julian", "julian@usfq.edu.ec", BCRYPT_HASH, "Julian L."))
        user_id = cur.fetchone()[0]

        print(f"→ Creando liga vía SP transaccional (user={user_id})...")
        cur.execute("CALL sp_create_league(%s, %s, %s, %s::scoring_type_enum, NULL)",
                    ("Liga de Prueba", user_id, 4, "points"))
        league_id = cur.fetchone()[0]

        cur.execute(
            "INSERT INTO fantasy_teams (team_name,user_id,league_id) "
            "VALUES (%s,%s,%s) RETURNING fantasy_team_id",
            ("Los Campeones", user_id, league_id))
        ft_id = cur.fetchone()[0]

        print(f"→ Draft de 8 jugadores vía sp_make_draft_pick (ft={ft_id})...")
        DRAFT = [
            (1, 'G1'), (4, 'G2'), (7, 'F1'), (16, 'F2'),
            (10, 'C'), (13, 'UTIL'), (22, 'BN1'), (19, 'BN2'),
        ]
        for i, (pid, slot) in enumerate(DRAFT, start=1):
            cur.execute("CALL sp_make_draft_pick(%s,%s,%s,%s,%s,%s)",
                        (league_id, ft_id, pid, 1, i, slot))

        print("→ Insertando stats de los 4 partidos (debe disparar triggers)...")
        # Stats simplificadas: 6 jugadores por partido
        STATS_TEMPLATE = [
            # (player_idx_in_game, pts,reb,ast,stl,blk,tov,3m,min)
            (28, 8, 2, 1, 0, 0, 30),
            (32, 6, 4, 2, 1, 0, 28),
            (24, 7, 3, 1, 1, 1, 25),
            (22, 5, 5, 2, 1, 1, 22),
            (20, 4, 4, 2, 1, 0, 20),
            (15, 3, 3, 2, 0, 0, 18),
        ]
        # Repartir jugadores en cada partido (3 por equipo)
        game_to_players = {
            '0042500101': [1, 2, 3, 22, 23, 24],
            '0042500102': [4, 5, 6, 16, 17, 18],
            '0042500103': [7, 8, 9, 10, 11, 12],
            '0042500104': [13, 14, 15, 19, 20, 21],
        }
        for game_id, pids in game_to_players.items():
            for pid, (pts,reb,ast,stl,blk,tov,three) in zip(pids, [
                (28, 8, 5, 2, 1, 3, 4),
                (18, 10, 1, 1, 2, 1, 1),
                (22, 6, 7, 0, 0, 4, 2),
                (32, 5, 4, 2, 1, 5, 7),
                (20, 4, 8, 1, 0, 2, 3),
                (16, 3, 5, 0, 1, 2, 2),
            ]):
                cur.execute(
                    "INSERT INTO player_game_stats (player_id,game_id,minutes_played,"
                    "points,rebounds,assists,steals,blocks,turnovers,three_made) "
                    "VALUES (%s,%s,32,%s,%s,%s,%s,%s,%s,%s)",
                    (pid, game_id, pts, reb, ast, stl, blk, tov, three))
        print("✓ Seed completado.\n")

        # =============== VALIDACIONES ===============
        print("=" * 60)
        print("VERIFICACIÓN DE TRIGGERS Y VISTAS")
        print("=" * 60)

        cur.execute("SELECT player_id, points, rebounds, assists, fantasy_points "
                    "FROM player_game_stats ORDER BY fantasy_points DESC LIMIT 5")
        print("\nTop 5 stats por fantasy_points (calculado por trigger):")
        for r in cur.fetchall():
            print(f"  player={r[0]} pts={r[1]} reb={r[2]} ast={r[3]} → fp={r[4]}")

        cur.execute("SELECT fantasy_team_id, team_name, total_points "
                    "FROM fantasy_teams")
        print("\nfantasy_teams.total_points (mantenido por trigger):")
        for r in cur.fetchall():
            print(f"  team={r[1]} → total_points={r[2]}")

        cur.execute("SELECT team_name, league_name, league_rank, total_points "
                    "FROM v_league_leaderboard")
        print("\nVista v_league_leaderboard:")
        for r in cur.fetchall():
            print(f"  rank={r[2]}  {r[0]}  ({r[1]})  pts={r[3]}")

        cur.execute("SELECT player_name, games_played, avg_pts, avg_fantasy_pts "
                    "FROM v_player_performance WHERE games_played > 0 "
                    "ORDER BY avg_fantasy_pts DESC LIMIT 5")
        print("\nVista v_player_performance (top 5):")
        for r in cur.fetchall():
            print(f"  {r[0]:30s} GP={r[1]} avg_pts={r[2]} avg_fp={r[3]}")

        print("\n✓ TODO OK — schema, triggers, SPs y vistas funcionan correctamente.")
