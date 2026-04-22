-- =============================================================
-- Playoff Hoops — Stored Procedures (PostgreSQL 16/18)
-- TODOS los modificadores (INSERT/UPDATE/DELETE) sobre esquema
-- transaccional con COMMIT explícito. Si cualquier statement
-- falla antes del COMMIT, Postgres ejecuta ROLLBACK automático
-- y propaga la excepción al caller.
--
-- Nota técnica: los procedures que usan COMMIT no pueden tener
-- bloques EXCEPTION porque éstos abren subtransacciones que
-- impiden el control de transacción explícito.
-- =============================================================

SET search_path = public;

-- =============================================================
-- FUNCIÓN AUXILIAR: cálculo puro de fantasy_points (IMMUTABLE)
-- Usada por trigger trg_calc_fp_on_insert y por sp_calculate_*
-- =============================================================
CREATE OR REPLACE FUNCTION fn_compute_fantasy_pts(
    p_pts INT, p_reb INT, p_ast INT, p_stl INT,
    p_blk INT, p_tov INT, p_3m INT, p_round SMALLINT
) RETURNS DECIMAL(7,2) LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_base       DECIMAL(7,2);
    v_dd_count   INT;
    v_multiplier DECIMAL(3,2);
BEGIN
    v_base := (p_pts * 1.0) + (p_reb * 1.2) + (p_ast * 1.5)
            + (p_stl * 2.0) + (p_blk * 2.0) + (p_3m * 0.5)
            - (p_tov * 1.0);

    v_dd_count :=
        (CASE WHEN p_pts >= 10 THEN 1 ELSE 0 END) +
        (CASE WHEN p_reb >= 10 THEN 1 ELSE 0 END) +
        (CASE WHEN p_ast >= 10 THEN 1 ELSE 0 END) +
        (CASE WHEN p_stl >= 10 THEN 1 ELSE 0 END) +
        (CASE WHEN p_blk >= 10 THEN 1 ELSE 0 END);

    IF v_dd_count >= 3 THEN
        v_base := v_base + 3.0;
    ELSIF v_dd_count >= 2 THEN
        v_base := v_base + 1.5;
    END IF;

    v_multiplier := CASE p_round
        WHEN 1 THEN 1.00
        WHEN 2 THEN 1.25
        WHEN 3 THEN 1.50
        WHEN 4 THEN 2.00
        ELSE 1.00
    END;

    RETURN v_base * v_multiplier;
END $$;

-- =============================================================
-- INSERT TRANSACCIONAL #1: registrar usuario nuevo
-- =============================================================
CREATE OR REPLACE PROCEDURE sp_register_user(
    p_username      VARCHAR(50),
    p_email         VARCHAR(100),
    p_password_hash VARCHAR(255),
    p_display_name  VARCHAR(100),
    INOUT p_user_id INT
) LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO users (username, email, password_hash, display_name)
    VALUES (p_username, p_email, p_password_hash, p_display_name)
    RETURNING user_id INTO p_user_id;

    COMMIT;
END $$;

-- =============================================================
-- INSERT TRANSACCIONAL #2: crear liga + agregar al creador
-- Atómico: la liga y la membresía deben crearse juntas o nada.
-- =============================================================
CREATE OR REPLACE PROCEDURE sp_create_league(
    p_league_name VARCHAR(100),
    p_user_id     INT,
    p_max_teams   SMALLINT,
    INOUT p_league_id INT
) LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO leagues (league_name, created_by, max_teams)
    VALUES (p_league_name, p_user_id, p_max_teams)
    RETURNING league_id INTO p_league_id;

    INSERT INTO league_members (league_id, user_id, role)
    VALUES (p_league_id, p_user_id, 'commissioner');

    COMMIT;
END $$;

-- =============================================================
-- INSERT TRANSACCIONAL #3: pick de draft con bloqueo pesimista
-- Usa SELECT FOR UPDATE para evitar doble pick concurrente.
-- =============================================================
CREATE OR REPLACE PROCEDURE sp_make_draft_pick(
    p_league_id       INT,
    p_fantasy_team_id INT,
    p_player_id       INT,
    p_round           SMALLINT,
    p_pick            INT,
    p_slot            roster_slot_enum
) LANGUAGE plpgsql AS $$
    DECLARE v_existing_pick INT;
BEGIN
    -- Bloqueo pesimista: lock las filas relevantes
    PERFORM 1 FROM draft_picks
     WHERE league_id = p_league_id
       FOR UPDATE;

    SELECT pick_id INTO v_existing_pick
      FROM draft_picks
     WHERE league_id = p_league_id AND player_id = p_player_id
     LIMIT 1;

    IF v_existing_pick IS NOT NULL THEN
        RAISE EXCEPTION 'Player % already drafted in league %', p_player_id, p_league_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM fantasy_teams
         WHERE fantasy_team_id = p_fantasy_team_id
           AND league_id = p_league_id
    ) THEN
        RAISE EXCEPTION 'Fantasy team % does not belong to league %', p_fantasy_team_id, p_league_id;
    END IF;

    INSERT INTO draft_picks (league_id, fantasy_team_id, player_id, round_number, pick_number)
    VALUES (p_league_id, p_fantasy_team_id, p_player_id, p_round, p_pick);

    INSERT INTO roster_players (fantasy_team_id, player_id, roster_slot, acquired_via)
    VALUES (p_fantasy_team_id, p_player_id, p_slot, 'draft');

    COMMIT;
END $$;

-- =============================================================
-- UPDATE TRANSACCIONAL #1: actualizar stats + recalcular puntos
-- =============================================================
CREATE OR REPLACE PROCEDURE sp_update_player_game_stats(
    p_stat_id    INT,
    p_points     INT,
    p_rebounds   INT,
    p_assists    INT,
    p_steals     INT,
    p_blocks     INT,
    p_turnovers  INT,
    p_three_made INT
) LANGUAGE plpgsql AS $$
DECLARE
    v_round SMALLINT;
    v_fp    DECIMAL(7,2);
BEGIN
    UPDATE player_game_stats
       SET points     = p_points,
           rebounds   = p_rebounds,
           assists    = p_assists,
           steals     = p_steals,
           blocks     = p_blocks,
           turnovers  = p_turnovers,
           three_made = p_three_made
     WHERE stat_id = p_stat_id;

    SELECT g.playoff_round INTO v_round
      FROM player_game_stats pgs
      JOIN games g ON pgs.game_id = g.game_id
     WHERE pgs.stat_id = p_stat_id;

    v_fp := fn_compute_fantasy_pts(p_points, p_rebounds, p_assists,
                                    p_steals, p_blocks, p_turnovers,
                                    p_three_made, v_round);

    UPDATE player_game_stats
       SET fantasy_points = v_fp
     WHERE stat_id = p_stat_id;

    COMMIT;
END $$;

-- =============================================================
-- UPDATE TRANSACCIONAL #2: recalcular fantasy_points por stat_id
-- =============================================================
CREATE OR REPLACE PROCEDURE sp_calculate_fantasy_points(p_stat_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_pts INT; v_reb INT; v_ast INT; v_stl INT;
    v_blk INT; v_tov INT; v_3m INT;
    v_round SMALLINT; v_fp DECIMAL(7,2);
BEGIN
    SELECT pgs.points, pgs.rebounds, pgs.assists, pgs.steals,
           pgs.blocks, pgs.turnovers, pgs.three_made, g.playoff_round
      INTO v_pts, v_reb, v_ast, v_stl, v_blk, v_tov, v_3m, v_round
      FROM player_game_stats pgs
      JOIN games g ON pgs.game_id = g.game_id
     WHERE pgs.stat_id = p_stat_id;

    v_fp := fn_compute_fantasy_pts(v_pts, v_reb, v_ast, v_stl,
                                    v_blk, v_tov, v_3m, v_round);

    UPDATE player_game_stats
       SET fantasy_points = v_fp
     WHERE stat_id = p_stat_id;

    COMMIT;
END $$;

-- =============================================================
-- DELETE TRANSACCIONAL #1: eliminar fantasy_team con cascada
-- Loggea cada drop en transactions antes de eliminar el roster.
-- =============================================================
CREATE OR REPLACE PROCEDURE sp_delete_fantasy_team(p_fantasy_team_id INT)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO transactions (fantasy_team_id, player_id, transaction_type)
    SELECT p_fantasy_team_id, player_id, 'drop'
      FROM roster_players
     WHERE fantasy_team_id = p_fantasy_team_id
       AND released_at IS NULL;

    DELETE FROM roster_players WHERE fantasy_team_id = p_fantasy_team_id;
    DELETE FROM draft_picks    WHERE fantasy_team_id = p_fantasy_team_id;
    DELETE FROM fantasy_teams  WHERE fantasy_team_id = p_fantasy_team_id;

    COMMIT;
END $$;

-- =============================================================
-- DELETE TRANSACCIONAL #2: drop de jugador individual del roster
-- =============================================================
CREATE OR REPLACE PROCEDURE sp_drop_roster_player(
    p_fantasy_team_id INT,
    p_player_id       INT
) LANGUAGE plpgsql AS $$
DECLARE v_exists INT;
BEGIN
    SELECT COUNT(*) INTO v_exists
      FROM roster_players
     WHERE fantasy_team_id = p_fantasy_team_id
       AND player_id       = p_player_id
       AND released_at IS NULL;

    IF v_exists = 0 THEN
        RAISE EXCEPTION 'Player % not on roster of team %', p_player_id, p_fantasy_team_id;
    END IF;

    INSERT INTO transactions (fantasy_team_id, player_id, transaction_type)
    VALUES (p_fantasy_team_id, p_player_id, 'drop');

    UPDATE roster_players
       SET is_active = FALSE,
           released_at = NOW()
     WHERE fantasy_team_id = p_fantasy_team_id
       AND player_id       = p_player_id
       AND released_at IS NULL;

    COMMIT;
END $$;

-- =============================================================
-- DELETE TRANSACCIONAL #3: abandonar liga (delete cascading)
-- =============================================================
CREATE OR REPLACE PROCEDURE sp_leave_league(
    p_user_id   INT,
    p_league_id INT
) LANGUAGE plpgsql AS $$
DECLARE v_ft_id INT;
BEGIN
    SELECT fantasy_team_id INTO v_ft_id
      FROM fantasy_teams
     WHERE user_id = p_user_id AND league_id = p_league_id;

    IF v_ft_id IS NOT NULL THEN
        INSERT INTO transactions (fantasy_team_id, player_id, transaction_type)
        SELECT v_ft_id, player_id, 'drop'
          FROM roster_players
         WHERE fantasy_team_id = v_ft_id
           AND released_at IS NULL;

        DELETE FROM roster_players WHERE fantasy_team_id = v_ft_id;
        DELETE FROM draft_picks    WHERE fantasy_team_id = v_ft_id;
        DELETE FROM fantasy_teams  WHERE fantasy_team_id = v_ft_id;
    END IF;

    DELETE FROM league_members
     WHERE user_id = p_user_id AND league_id = p_league_id;

    COMMIT;
END $$;

-- =============================================================
-- TRANSACCIÓN COMPLEJA: swap de free agent (drop + add atómico)
-- =============================================================
CREATE OR REPLACE PROCEDURE sp_free_agent_swap(
    p_fantasy_team_id INT,
    p_drop_player_id  INT,
    p_add_player_id   INT
) LANGUAGE plpgsql AS $$
DECLARE v_slot roster_slot_enum;
BEGIN
    SELECT roster_slot INTO v_slot
      FROM roster_players
     WHERE fantasy_team_id = p_fantasy_team_id
       AND player_id       = p_drop_player_id
       AND released_at IS NULL
       FOR UPDATE;

    IF v_slot IS NULL THEN
        RAISE EXCEPTION 'Player % not on roster', p_drop_player_id;
    END IF;

    UPDATE roster_players
       SET is_active = FALSE,
           released_at = NOW()
     WHERE fantasy_team_id = p_fantasy_team_id
       AND player_id       = p_drop_player_id
       AND released_at IS NULL;

    INSERT INTO roster_players (fantasy_team_id, player_id, roster_slot, acquired_via)
    VALUES (p_fantasy_team_id, p_add_player_id, v_slot, 'free_agent');

    INSERT INTO transactions (fantasy_team_id, player_id, transaction_type) VALUES
        (p_fantasy_team_id, p_drop_player_id, 'drop'),
        (p_fantasy_team_id, p_add_player_id,  'add');

    COMMIT;
END $$;
