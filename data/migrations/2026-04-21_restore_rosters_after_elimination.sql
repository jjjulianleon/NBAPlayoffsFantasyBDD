BEGIN;

SET search_path = public;

-- The original elimination trigger incorrectly treated NBA elimination as
-- a roster drop. Replace it with a no-op trigger so fantasy ownership stays
-- stable and availability is derived from nba_teams.is_eliminated.
CREATE OR REPLACE FUNCTION trg_fn_eliminate_team()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RETURN NEW;
END $$;

-- Repair current roster rows:
-- 1. rows with an explicit drop transaction remain inactive and receive the
--    corresponding released_at timestamp
-- 2. rows without a drop transaction are restored as currently owned players,
--    regardless of NBA elimination status
WITH drop_times AS (
    SELECT
        rp.roster_id,
        MIN(tx.transaction_date) AS drop_at
    FROM roster_players rp
    JOIN transactions tx
      ON tx.fantasy_team_id = rp.fantasy_team_id
     AND tx.player_id = rp.player_id
     AND tx.transaction_type = 'drop'
     AND tx.transaction_date >= rp.acquired_at
    GROUP BY rp.roster_id
)
UPDATE roster_players rp
   SET is_active = FALSE,
       released_at = dt.drop_at
  FROM drop_times dt
 WHERE rp.roster_id = dt.roster_id;

UPDATE roster_players rp
   SET is_active = TRUE,
       released_at = NULL
 WHERE NOT EXISTS (
    SELECT 1
      FROM transactions tx
     WHERE tx.fantasy_team_id = rp.fantasy_team_id
       AND tx.player_id = rp.player_id
       AND tx.transaction_type = 'drop'
       AND tx.transaction_date >= rp.acquired_at
 );

-- Recalculate totals after the ownership repair.
DO $$
DECLARE
    v_team RECORD;
BEGIN
    FOR v_team IN SELECT fantasy_team_id FROM fantasy_teams LOOP
        PERFORM fn_recalculate_team_points(v_team.fantasy_team_id);
    END LOOP;
END $$;

COMMIT;
