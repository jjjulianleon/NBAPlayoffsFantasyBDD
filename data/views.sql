-- =============================================================
-- Playoff Hoops — Views (PostgreSQL 16)
-- 6 vistas analíticas (rúbrica exige mínimo 5)
-- =============================================================

SET search_path = public;

DROP VIEW IF EXISTS v_league_leaderboard   CASCADE;
DROP VIEW IF EXISTS v_player_performance   CASCADE;
DROP VIEW IF EXISTS v_hot_cold_players     CASCADE;
DROP VIEW IF EXISTS v_roster_detail        CASCADE;
DROP VIEW IF EXISTS v_daily_scoring        CASCADE;
DROP VIEW IF EXISTS v_prediction_accuracy  CASCADE;

-- =============================================================
-- VIEW 1: Tabla de posiciones por liga
-- Reporte principal de cualquier liga: ranking en tiempo real
-- =============================================================
CREATE VIEW v_league_leaderboard AS
SELECT
    ft.fantasy_team_id,
    ft.team_name,
    u.username,
    l.league_id,
    l.league_name,
    ft.total_points,
    RANK() OVER (PARTITION BY ft.league_id ORDER BY ft.total_points DESC) AS league_rank,
    COUNT(rp.roster_id) FILTER (WHERE rp.is_active) AS active_roster_size
FROM fantasy_teams ft
JOIN users   u ON ft.user_id   = u.user_id
JOIN leagues l ON ft.league_id = l.league_id
LEFT JOIN roster_players rp ON ft.fantasy_team_id = rp.fantasy_team_id
GROUP BY ft.fantasy_team_id, ft.team_name, u.username, l.league_id, l.league_name, ft.total_points;

-- =============================================================
-- VIEW 2: Performance agregada por jugador (toda la temporada)
-- =============================================================
CREATE VIEW v_player_performance AS
SELECT
    p.player_id,
    p.first_name || ' ' || p.last_name AS player_name,
    p.position,
    t.abbreviation AS team,
    t.is_eliminated,
    COUNT(pgs.stat_id) AS games_played,
    ROUND(AVG(pgs.points)::numeric,         1) AS avg_pts,
    ROUND(AVG(pgs.rebounds)::numeric,       1) AS avg_reb,
    ROUND(AVG(pgs.assists)::numeric,        1) AS avg_ast,
    ROUND(AVG(pgs.steals)::numeric,         1) AS avg_stl,
    ROUND(AVG(pgs.blocks)::numeric,         1) AS avg_blk,
    ROUND(AVG(pgs.fantasy_points)::numeric, 1) AS avg_fantasy_pts,
    ROUND(SUM(pgs.fantasy_points)::numeric, 1) AS total_fantasy_pts
FROM players p
JOIN nba_teams t ON p.team_id = t.team_id
LEFT JOIN player_game_stats pgs ON p.player_id = pgs.player_id
GROUP BY p.player_id, p.first_name, p.last_name, p.position, t.abbreviation, t.is_eliminated;

-- =============================================================
-- VIEW 3: Rachas calientes / frías (últimos 5 partidos vs media)
-- Diferenciador del proyecto: no existe en ESPN/Yahoo
-- =============================================================
CREATE VIEW v_hot_cold_players AS
WITH last5 AS (
    SELECT
        pgs.player_id,
        pgs.points,
        ROW_NUMBER() OVER (PARTITION BY pgs.player_id ORDER BY g.game_date DESC) AS rn
    FROM player_game_stats pgs
    JOIN games g ON pgs.game_id = g.game_id
)
SELECT
    p.player_id,
    p.first_name || ' ' || p.last_name AS player_name,
    t.abbreviation AS team,
    p.season_ppg,
    ROUND(AVG(l.points)::numeric, 1) AS last5_ppg,
    ROUND(((AVG(l.points) - p.season_ppg) / NULLIF(p.season_ppg, 0)) * 100, 1) AS pts_pct_change,
    CASE
        WHEN AVG(l.points) > p.season_ppg * 1.20 THEN 'hot'
        WHEN AVG(l.points) < p.season_ppg * 0.80 THEN 'cold'
        ELSE 'neutral'
    END::streak_status_enum AS streak_status
FROM players p
JOIN nba_teams t ON p.team_id = t.team_id
JOIN last5 l    ON p.player_id = l.player_id AND l.rn <= 5
WHERE p.season_ppg >= 5.0  -- excluye jugadores irrelevantes / season_ppg=0
GROUP BY p.player_id, p.first_name, p.last_name, t.abbreviation, p.season_ppg
HAVING COUNT(l.points) >= 3;  -- minimo 3 partidos en los ultimos 5

-- =============================================================
-- VIEW 4: Detalle del roster de cada equipo fantasy
-- =============================================================
CREATE VIEW v_roster_detail AS
SELECT
    ft.fantasy_team_id,
    ft.team_name,
    u.username,
    rp.roster_slot,
    rp.is_active,
    rp.acquired_via,
    p.first_name || ' ' || p.last_name AS player_name,
    p.position,
    t.abbreviation AS nba_team,
    t.is_eliminated,
    p.season_ppg,
    p.season_rpg,
    p.season_apg
FROM fantasy_teams ft
JOIN users          u  ON ft.user_id         = u.user_id
JOIN roster_players rp ON ft.fantasy_team_id = rp.fantasy_team_id
JOIN players        p  ON rp.player_id       = p.player_id
JOIN nba_teams      t  ON p.team_id          = t.team_id;

-- =============================================================
-- VIEW 5: Reporte diario de scoring con multiplicador por ronda
-- Aplica el diferenciador: R1 ×1.0, Semis ×1.25, CF ×1.5, Finals ×2.0
-- =============================================================
CREATE VIEW v_daily_scoring AS
SELECT
    g.game_date,
    g.playoff_round,
    ht.abbreviation || ' vs ' || at.abbreviation AS matchup,
    p.first_name || ' ' || p.last_name AS player_name,
    pgs.points,
    pgs.rebounds,
    pgs.assists,
    pgs.steals,
    pgs.blocks,
    pgs.three_made,
    pgs.turnovers,
    pgs.fantasy_points AS base_fantasy_pts,
    pgs.fantasy_points * CASE g.playoff_round
        WHEN 1 THEN 1.00
        WHEN 2 THEN 1.25
        WHEN 3 THEN 1.50
        WHEN 4 THEN 2.00
    END AS adjusted_fantasy_pts
FROM player_game_stats pgs
JOIN players   p  ON pgs.player_id   = p.player_id
JOIN games     g  ON pgs.game_id     = g.game_id
JOIN nba_teams ht ON g.home_team_id  = ht.team_id
JOIN nba_teams at ON g.away_team_id  = at.team_id;

-- =============================================================
-- VIEW 6: Precisión del modelo ML (predicción vs realidad)
-- Demuestra rigor científico en la diferenciación con IA
-- =============================================================
CREATE VIEW v_prediction_accuracy AS
SELECT
    pr.player_id,
    p.first_name || ' ' || p.last_name AS player_name,
    pr.model_version,
    COUNT(*) AS predictions_made,
    ROUND(AVG(ABS(pr.predicted_fantasy_pts - pgs.fantasy_points))::numeric, 2) AS mae,
    ROUND(AVG(pr.predicted_fantasy_pts)::numeric, 2) AS avg_predicted,
    ROUND(AVG(pgs.fantasy_points)::numeric,        2) AS avg_actual,
    ROUND(AVG(pr.confidence_score)::numeric,       3) AS avg_confidence
FROM predictions pr
JOIN players           p   ON pr.player_id = p.player_id
JOIN player_game_stats pgs ON pr.player_id = pgs.player_id AND pr.game_id = pgs.game_id
GROUP BY pr.player_id, p.first_name, p.last_name, pr.model_version;

-- =============================================================
-- COMENTARIOS
-- =============================================================
COMMENT ON VIEW v_league_leaderboard  IS 'Tabla de posiciones por liga con RANK()';
COMMENT ON VIEW v_player_performance  IS 'Estadísticas agregadas de toda la temporada';
COMMENT ON VIEW v_hot_cold_players    IS 'Detección de rachas: últimos 5 vs media de temporada';
COMMENT ON VIEW v_roster_detail       IS 'Composición completa del roster de cada equipo fantasy';
COMMENT ON VIEW v_daily_scoring       IS 'Scoring diario con multiplicador por ronda de playoff';
COMMENT ON VIEW v_prediction_accuracy IS 'Métrica MAE del modelo XGBoost en producción';
