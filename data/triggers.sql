-- =============================================================
-- Playoff Hoops — Triggers (PostgreSQL 16)
-- Mantienen consistencia de derivados (total_points, eliminados)
-- =============================================================

SET search_path = public;

-- =============================================================
-- HELPER: recalcular total_points de un fantasy team usando
-- ventanas de tenencia (acquired_at/released_at) para evitar
-- puntos retroactivos por free agents y conservar histórico.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_recalculate_team_points(p_fantasy_team_id INT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    UPDATE fantasy_teams ft
       SET total_points = COALESCE((
           SELECT ROUND(SUM(pgs.fantasy_points)::numeric, 2)
             FROM roster_players rp
             JOIN player_game_stats pgs ON rp.player_id = pgs.player_id
             JOIN games g ON pgs.game_id = g.game_id
            WHERE rp.fantasy_team_id = p_fantasy_team_id
              AND g.game_date >= rp.acquired_at::date
              AND (rp.released_at IS NULL OR g.game_date <= rp.released_at::date)
       ), 0)
     WHERE ft.fantasy_team_id = p_fantasy_team_id;
END $$;

-- =============================================================
-- TRIGGER 1: recalcular fantasy_points al insertar o actualizar
-- stats base (cierra el ciclo: stats → puntos)
-- =============================================================
CREATE OR REPLACE FUNCTION trg_fn_sync_fantasy_points()
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

DROP TRIGGER IF EXISTS trg_sync_fantasy_points ON player_game_stats;
CREATE TRIGGER trg_sync_fantasy_points
BEFORE INSERT OR UPDATE OF points, rebounds, assists, steals, blocks, turnovers, three_made, game_id
ON player_game_stats
FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_fantasy_points();

-- =============================================================
-- TRIGGER 2: recalcular total_points cuando entran/cambian stats
-- =============================================================
CREATE OR REPLACE FUNCTION trg_fn_sync_team_points_from_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_game_date DATE;
    v_team RECORD;
BEGIN
    IF TG_OP <> 'DELETE' THEN
        SELECT game_date INTO v_game_date FROM games WHERE game_id = NEW.game_id;

        FOR v_team IN
            SELECT DISTINCT rp.fantasy_team_id
              FROM roster_players rp
             WHERE rp.player_id = NEW.player_id
               AND v_game_date >= rp.acquired_at::date
               AND (rp.released_at IS NULL OR v_game_date <= rp.released_at::date)
        LOOP
            PERFORM fn_recalculate_team_points(v_team.fantasy_team_id);
        END LOOP;
    END IF;

    IF TG_OP <> 'INSERT' THEN
        SELECT game_date INTO v_game_date FROM games WHERE game_id = OLD.game_id;

        FOR v_team IN
            SELECT DISTINCT rp.fantasy_team_id
              FROM roster_players rp
             WHERE rp.player_id = OLD.player_id
               AND v_game_date >= rp.acquired_at::date
               AND (rp.released_at IS NULL OR v_game_date <= rp.released_at::date)
        LOOP
            PERFORM fn_recalculate_team_points(v_team.fantasy_team_id);
        END LOOP;
    END IF;

    RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sync_team_points_from_stats ON player_game_stats;
CREATE TRIGGER trg_sync_team_points_from_stats
AFTER INSERT OR UPDATE OR DELETE ON player_game_stats
FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_team_points_from_stats();

-- =============================================================
-- TRIGGER 3: recalcular total_points cuando cambia el roster
-- =============================================================
CREATE OR REPLACE FUNCTION trg_fn_sync_team_points_from_roster()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'DELETE' THEN
        PERFORM fn_recalculate_team_points(NEW.fantasy_team_id);
    END IF;

    IF TG_OP <> 'INSERT' AND (TG_OP <> 'UPDATE' OR OLD.fantasy_team_id <> NEW.fantasy_team_id) THEN
        PERFORM fn_recalculate_team_points(OLD.fantasy_team_id);
    END IF;

    RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sync_team_points_from_roster ON roster_players;
CREATE TRIGGER trg_sync_team_points_from_roster
AFTER INSERT OR UPDATE OR DELETE ON roster_players
FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_team_points_from_roster();

-- =============================================================
-- TRIGGER 4: cuando un equipo NBA es eliminado del playoff,
-- no se altera la pertenencia al roster fantasy. La disponibilidad
-- competitiva se deriva desde nba_teams.is_eliminated en consultas.
-- =============================================================
CREATE OR REPLACE FUNCTION trg_fn_eliminate_team()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_eliminate_team ON nba_teams;
CREATE TRIGGER trg_eliminate_team
AFTER UPDATE OF is_eliminated ON nba_teams
FOR EACH ROW EXECUTE FUNCTION trg_fn_eliminate_team();

-- =============================================================
-- TRIGGER 5: validar tamaño de roster (máx 8 por equipo fantasy)
-- =============================================================
CREATE OR REPLACE FUNCTION trg_fn_check_roster_size()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_count INT;
BEGIN
    IF NEW.released_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT COUNT(*) INTO v_count
          FROM roster_players
         WHERE fantasy_team_id = NEW.fantasy_team_id
           AND released_at IS NULL
           AND roster_id <> OLD.roster_id;
    ELSE
        SELECT COUNT(*) INTO v_count
          FROM roster_players
         WHERE fantasy_team_id = NEW.fantasy_team_id
           AND released_at IS NULL;
    END IF;

    IF v_count >= 8 THEN
        RAISE EXCEPTION 'Roster lleno (max 8) para fantasy_team_id=%', NEW.fantasy_team_id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_check_roster_size ON roster_players;
CREATE TRIGGER trg_check_roster_size
BEFORE INSERT OR UPDATE OF is_active, released_at ON roster_players
FOR EACH ROW EXECUTE FUNCTION trg_fn_check_roster_size();

-- =============================================================
-- TRIGGER 6: validar unicidad de slot activo al cierre de la
-- transacción, permitiendo swaps temporales dentro del mismo tx
-- =============================================================
CREATE OR REPLACE FUNCTION trg_fn_check_unique_active_slot()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_team_id INT := COALESCE(NEW.fantasy_team_id, OLD.fantasy_team_id);
BEGIN
    IF EXISTS (
        SELECT 1
          FROM roster_players
         WHERE fantasy_team_id = v_team_id
           AND released_at IS NULL
         GROUP BY roster_slot
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'No puede haber dos jugadores activos en el mismo slot para fantasy_team_id=%', v_team_id;
    END IF;

    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_check_unique_active_slot ON roster_players;
CREATE CONSTRAINT TRIGGER trg_check_unique_active_slot
AFTER INSERT OR UPDATE OF roster_slot, is_active, released_at OR DELETE ON roster_players
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION trg_fn_check_unique_active_slot();

-- =============================================================
-- TRIGGER 7: actualizar last_login al loguearse (lo dispara el backend
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
