-- =============================================================
-- Playoff Hoops — Triggers (PostgreSQL 16)
-- Mantienen consistencia de derivados (total_points, eliminados)
-- =============================================================

SET search_path = public;

-- =============================================================
-- TRIGGER 1: recalcular fantasy_points cada vez que se inserta
-- una fila en player_game_stats (cierra el ciclo: stats → puntos)
-- =============================================================
CREATE OR REPLACE FUNCTION trg_fn_calc_fp_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_round SMALLINT;
BEGIN
    SELECT playoff_round INTO v_round FROM games WHERE game_id = NEW.game_id;

    NEW.fantasy_points := fn_compute_fantasy_pts(
        NEW.points, NEW.rebounds, NEW.assists,
        NEW.steals, NEW.blocks, NEW.turnovers,
        NEW.three_made, v_round
    );
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_calc_fp_on_insert ON player_game_stats;
CREATE TRIGGER trg_calc_fp_on_insert
BEFORE INSERT ON player_game_stats
FOR EACH ROW EXECUTE FUNCTION trg_fn_calc_fp_on_insert();

-- =============================================================
-- TRIGGER 2: actualizar total_points de fantasy_teams cuando
-- cambia fantasy_points en player_game_stats
-- =============================================================
CREATE OR REPLACE FUNCTION trg_fn_update_team_points()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE fantasy_teams ft
       SET total_points = COALESCE((
           SELECT SUM(pgs.fantasy_points)
             FROM roster_players rp
             JOIN player_game_stats pgs ON rp.player_id = pgs.player_id
            WHERE rp.fantasy_team_id = ft.fantasy_team_id
              AND rp.is_active
       ), 0)
     WHERE ft.fantasy_team_id IN (
         SELECT rp.fantasy_team_id
           FROM roster_players rp
          WHERE rp.player_id = NEW.player_id
            AND rp.is_active
     );
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_update_team_points ON player_game_stats;
CREATE TRIGGER trg_update_team_points
AFTER INSERT OR UPDATE OF fantasy_points ON player_game_stats
FOR EACH ROW EXECUTE FUNCTION trg_fn_update_team_points();

-- =============================================================
-- TRIGGER 3: cuando un equipo NBA es eliminado del playoff,
-- desactivar automáticamente sus jugadores en todos los rosters
-- =============================================================
CREATE OR REPLACE FUNCTION trg_fn_eliminate_team()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_eliminated = TRUE AND OLD.is_eliminated = FALSE THEN
        UPDATE roster_players rp
           SET is_active = FALSE
          FROM players p
         WHERE rp.player_id = p.player_id
           AND p.team_id    = NEW.team_id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_eliminate_team ON nba_teams;
CREATE TRIGGER trg_eliminate_team
AFTER UPDATE OF is_eliminated ON nba_teams
FOR EACH ROW EXECUTE FUNCTION trg_fn_eliminate_team();

-- =============================================================
-- TRIGGER 4: validar tamaño de roster (máx 8 por equipo fantasy)
-- =============================================================
CREATE OR REPLACE FUNCTION trg_fn_check_roster_size()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
      FROM roster_players
     WHERE fantasy_team_id = NEW.fantasy_team_id;

    IF v_count >= 8 THEN
        RAISE EXCEPTION 'Roster lleno (max 8) para fantasy_team_id=%', NEW.fantasy_team_id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_check_roster_size ON roster_players;
CREATE TRIGGER trg_check_roster_size
BEFORE INSERT ON roster_players
FOR EACH ROW EXECUTE FUNCTION trg_fn_check_roster_size();

-- =============================================================
-- TRIGGER 5: actualizar last_login al loguearse (lo dispara el backend
-- haciendo UPDATE users SET last_login=NOW() WHERE user_id=...)
-- Aquí simplemente validamos que no se pueda poner last_login futuro
-- =============================================================
CREATE OR REPLACE FUNCTION trg_fn_validate_last_login()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.last_login IS NOT NULL AND NEW.last_login > NOW() THEN
        RAISE EXCEPTION 'last_login no puede ser futuro';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_last_login ON users;
CREATE TRIGGER trg_validate_last_login
BEFORE UPDATE OF last_login ON users
FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_last_login();
