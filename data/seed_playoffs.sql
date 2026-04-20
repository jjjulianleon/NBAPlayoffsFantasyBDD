-- =============================================================
-- Playoff Hoops — Seed de equipos en playoffs 2025-26
-- Idempotente: reaplicable sin efectos secundarios.
-- Ejecutar después de seed_kaggle.py para restringir el pool
-- de jugadores fantasy a los 16 equipos de playoff.
--
-- Uso:
--   PGPASSWORD=playoff_dev psql -h localhost -U playoff \
--     -d playoff_hoops -f data/seed_playoffs.sql
-- =============================================================

SET search_path = public;

BEGIN;

-- 1) Reset: todos los equipos pasan a "eliminado" sin seed.
UPDATE nba_teams
   SET playoff_seed     = NULL,
       is_eliminated    = TRUE,
       eliminated_round = NULL;

-- 2) East — 8 clasificados (top 6 + ganadores play-in)
UPDATE nba_teams SET playoff_seed = 1, is_eliminated = FALSE WHERE abbreviation = 'DET';
UPDATE nba_teams SET playoff_seed = 2, is_eliminated = FALSE WHERE abbreviation = 'BOS';
UPDATE nba_teams SET playoff_seed = 3, is_eliminated = FALSE WHERE abbreviation = 'NYK';
UPDATE nba_teams SET playoff_seed = 4, is_eliminated = FALSE WHERE abbreviation = 'CLE';
UPDATE nba_teams SET playoff_seed = 5, is_eliminated = FALSE WHERE abbreviation = 'ATL';
UPDATE nba_teams SET playoff_seed = 6, is_eliminated = FALSE WHERE abbreviation = 'TOR';
UPDATE nba_teams SET playoff_seed = 7, is_eliminated = FALSE WHERE abbreviation = 'PHI';  -- ganó 7-8 vs ORL
UPDATE nba_teams SET playoff_seed = 8, is_eliminated = FALSE WHERE abbreviation = 'ORL';  -- ganó play-in final vs CHA

-- 3) West — 8 clasificados (top 6 + ganadores play-in)
UPDATE nba_teams SET playoff_seed = 1, is_eliminated = FALSE WHERE abbreviation = 'OKC';
UPDATE nba_teams SET playoff_seed = 2, is_eliminated = FALSE WHERE abbreviation = 'SAS';
UPDATE nba_teams SET playoff_seed = 3, is_eliminated = FALSE WHERE abbreviation = 'DEN';
UPDATE nba_teams SET playoff_seed = 4, is_eliminated = FALSE WHERE abbreviation = 'LAL';
UPDATE nba_teams SET playoff_seed = 5, is_eliminated = FALSE WHERE abbreviation = 'HOU';
UPDATE nba_teams SET playoff_seed = 6, is_eliminated = FALSE WHERE abbreviation = 'MIN';
UPDATE nba_teams SET playoff_seed = 7, is_eliminated = FALSE WHERE abbreviation = 'POR';
UPDATE nba_teams SET playoff_seed = 8, is_eliminated = FALSE WHERE abbreviation = 'PHX';

-- 4) Validación: deben quedar exactamente 16 equipos activos (8 por conferencia).
DO $$
DECLARE
    east_count  INT;
    west_count  INT;
BEGIN
    SELECT COUNT(*) INTO east_count
      FROM nba_teams WHERE NOT is_eliminated AND conference = 'East';
    SELECT COUNT(*) INTO west_count
      FROM nba_teams WHERE NOT is_eliminated AND conference = 'West';
    IF east_count <> 8 OR west_count <> 8 THEN
        RAISE EXCEPTION 'seed_playoffs: se esperaban 8 East / 8 West, hay % / %', east_count, west_count;
    END IF;
END $$;

COMMIT;

-- Verificación visual rápida
SELECT conference, playoff_seed, abbreviation, full_name
  FROM nba_teams
 WHERE NOT is_eliminated
 ORDER BY conference, playoff_seed;
