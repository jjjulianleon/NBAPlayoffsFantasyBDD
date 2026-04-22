-- Safe, non-destructive migration for:
-- 1. historical roster ownership via released_at
-- 2. points recalculation using ownership windows
-- 3. stronger league/team/member integrity
-- 4. active-slot uniqueness enforced at end of transaction
--
-- Run only after reviewing 2026-04-21_preflight_checks.sql.

BEGIN;

SET search_path = public;

-- -----------------------------------------------------------------
-- Guard rails: abort early if current data violates new invariants.
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM roster_players
        WHERE is_active = TRUE
        GROUP BY fantasy_team_id, player_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Migration aborted: duplicate active player rows exist in roster_players';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM roster_players
        WHERE is_active = TRUE
        GROUP BY fantasy_team_id, roster_slot
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Migration aborted: duplicate active slots exist in roster_players';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM fantasy_teams ft
        LEFT JOIN league_members lm
          ON lm.league_id = ft.league_id
         AND lm.user_id = ft.user_id
        WHERE lm.member_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Migration aborted: fantasy_teams without matching league_members rows exist';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM draft_picks dp
        JOIN fantasy_teams ft ON ft.fantasy_team_id = dp.fantasy_team_id
        WHERE ft.league_id <> dp.league_id
    ) THEN
        RAISE EXCEPTION 'Migration aborted: draft_picks contains league/team mismatches';
    END IF;
END $$;

-- -----------------------------------------------------------------
-- Core schema changes
-- -----------------------------------------------------------------
ALTER TABLE roster_players
    ADD COLUMN IF NOT EXISTS released_at TIMESTAMP;

-- Best-effort backfill for pre-existing inactive rows.
UPDATE roster_players
   SET released_at = NOW()
 WHERE is_active = FALSE
   AND released_at IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'uq_team_player'
           AND conrelid = 'roster_players'::regclass
    ) THEN
        ALTER TABLE roster_players DROP CONSTRAINT uq_team_player;
    END IF;
END $$;

ALTER TABLE fantasy_teams
    ADD CONSTRAINT uq_ft_league_team UNIQUE (league_id, fantasy_team_id);

ALTER TABLE fantasy_teams
    ADD CONSTRAINT fk_ft_member
    FOREIGN KEY (league_id, user_id)
    REFERENCES league_members(league_id, user_id);

ALTER TABLE roster_players
    ADD CONSTRAINT chk_roster_active_window CHECK (
        (is_active = TRUE  AND released_at IS NULL) OR
        (is_active = FALSE AND released_at IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_rp_player ON roster_players(player_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rp_active_team_player
    ON roster_players(fantasy_team_id, player_id)
    WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rp_active_team_slot
    ON roster_players(fantasy_team_id, roster_slot)
    WHERE released_at IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'fk_dp_league'
           AND conrelid = 'draft_picks'::regclass
    ) THEN
        ALTER TABLE draft_picks DROP CONSTRAINT fk_dp_league;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'fk_dp_team'
           AND conrelid = 'draft_picks'::regclass
    ) THEN
        ALTER TABLE draft_picks DROP CONSTRAINT fk_dp_team;
    END IF;
END $$;

ALTER TABLE draft_picks
    ADD CONSTRAINT fk_dp_team_in_league
    FOREIGN KEY (league_id, fantasy_team_id)
    REFERENCES fantasy_teams(league_id, fantasy_team_id)
    ON DELETE CASCADE;

-- -----------------------------------------------------------------
-- Recreated functions/triggers for correct scoring semantics
-- -----------------------------------------------------------------
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

DROP TRIGGER IF EXISTS trg_calc_fp_on_insert ON player_game_stats;
DROP TRIGGER IF EXISTS trg_sync_fantasy_points ON player_game_stats;
CREATE TRIGGER trg_sync_fantasy_points
BEFORE INSERT OR UPDATE OF points, rebounds, assists, steals, blocks, turnovers, three_made, game_id
ON player_game_stats
FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_fantasy_points();

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

DROP TRIGGER IF EXISTS trg_update_team_points ON player_game_stats;
DROP TRIGGER IF EXISTS trg_sync_team_points_from_stats ON player_game_stats;
CREATE TRIGGER trg_sync_team_points_from_stats
AFTER INSERT OR UPDATE OR DELETE ON player_game_stats
FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_team_points_from_stats();

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

CREATE OR REPLACE FUNCTION trg_fn_eliminate_team()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RETURN NEW;
END $$;

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

-- -----------------------------------------------------------------
-- Recreate views that depend on active roster semantics.
-- -----------------------------------------------------------------
CREATE OR REPLACE VIEW v_league_leaderboard AS
SELECT
    ft.fantasy_team_id,
    ft.team_name,
    u.username,
    l.league_id,
    l.league_name,
    ft.total_points,
    RANK() OVER (PARTITION BY ft.league_id ORDER BY ft.total_points DESC) AS league_rank,
    COUNT(rp.roster_id) FILTER (WHERE rp.is_active AND rp.released_at IS NULL) AS active_roster_size
FROM fantasy_teams ft
JOIN users u ON ft.user_id = u.user_id
JOIN leagues l ON ft.league_id = l.league_id
LEFT JOIN roster_players rp ON ft.fantasy_team_id = rp.fantasy_team_id
GROUP BY ft.fantasy_team_id, ft.team_name, u.username, l.league_id, l.league_name, ft.total_points;

CREATE OR REPLACE VIEW v_roster_detail AS
SELECT
    ft.league_id,
    ft.fantasy_team_id,
    ft.team_name,
    u.username,
    rp.player_id,
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
JOIN users u ON ft.user_id = u.user_id
JOIN roster_players rp ON ft.fantasy_team_id = rp.fantasy_team_id
JOIN players p ON rp.player_id = p.player_id
JOIN nba_teams t ON p.team_id = t.team_id
WHERE rp.released_at IS NULL;

-- -----------------------------------------------------------------
-- Recreate procedures affected by historical roster ownership.
-- -----------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_make_draft_pick(
    p_league_id       INT,
    p_fantasy_team_id INT,
    p_player_id       INT,
    p_round           SMALLINT,
    p_pick            INT,
    p_slot            roster_slot_enum
) LANGUAGE plpgsql AS $$
DECLARE
    v_existing_pick INT;
BEGIN
    PERFORM 1
      FROM draft_picks
     WHERE league_id = p_league_id
       FOR UPDATE;

    SELECT pick_id INTO v_existing_pick
      FROM draft_picks
     WHERE league_id = p_league_id
       AND player_id = p_player_id
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

CREATE OR REPLACE PROCEDURE sp_drop_roster_player(
    p_fantasy_team_id INT,
    p_player_id       INT
) LANGUAGE plpgsql AS $$
DECLARE
    v_exists INT;
BEGIN
    SELECT COUNT(*) INTO v_exists
      FROM roster_players
     WHERE fantasy_team_id = p_fantasy_team_id
       AND player_id = p_player_id
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
       AND player_id = p_player_id
       AND released_at IS NULL;

    COMMIT;
END $$;

CREATE OR REPLACE PROCEDURE sp_free_agent_swap(
    p_fantasy_team_id INT,
    p_drop_player_id  INT,
    p_add_player_id   INT
) LANGUAGE plpgsql AS $$
DECLARE
    v_slot roster_slot_enum;
BEGIN
    SELECT roster_slot INTO v_slot
      FROM roster_players
     WHERE fantasy_team_id = p_fantasy_team_id
       AND player_id = p_drop_player_id
       AND released_at IS NULL
       FOR UPDATE;

    IF v_slot IS NULL THEN
        RAISE EXCEPTION 'Player % not on roster', p_drop_player_id;
    END IF;

    UPDATE roster_players
       SET is_active = FALSE,
           released_at = NOW()
     WHERE fantasy_team_id = p_fantasy_team_id
       AND player_id = p_drop_player_id
       AND released_at IS NULL;

    INSERT INTO roster_players (fantasy_team_id, player_id, roster_slot, acquired_via)
    VALUES (p_fantasy_team_id, p_add_player_id, v_slot, 'free_agent');

    INSERT INTO transactions (fantasy_team_id, player_id, transaction_type) VALUES
        (p_fantasy_team_id, p_drop_player_id, 'drop'),
        (p_fantasy_team_id, p_add_player_id, 'add');

    COMMIT;
END $$;

-- -----------------------------------------------------------------
-- Recalculate all teams at the end so standings remain consistent.
-- -----------------------------------------------------------------
DO $$
DECLARE
    v_team RECORD;
BEGIN
    FOR v_team IN SELECT fantasy_team_id FROM fantasy_teams LOOP
        PERFORM fn_recalculate_team_points(v_team.fantasy_team_id);
    END LOOP;
END $$;

COMMIT;
