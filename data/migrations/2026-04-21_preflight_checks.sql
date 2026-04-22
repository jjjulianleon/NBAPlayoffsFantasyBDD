-- Preflight checks for safe roster/integrity migration.
-- Run this first against the current database. Any returned rows are blockers
-- or conditions you should review before applying the migration.

SET search_path = public;

-- 1. Current roster duplicates by active player.
SELECT
    'duplicate_active_player' AS check_name,
    fantasy_team_id,
    player_id,
    COUNT(*) AS duplicate_count
FROM roster_players
WHERE is_active = TRUE
GROUP BY fantasy_team_id, player_id
HAVING COUNT(*) > 1;

-- 2. Current roster duplicates by active slot.
SELECT
    'duplicate_active_slot' AS check_name,
    fantasy_team_id,
    roster_slot,
    COUNT(*) AS duplicate_count
FROM roster_players
WHERE is_active = TRUE
GROUP BY fantasy_team_id, roster_slot
HAVING COUNT(*) > 1;

-- 3. Fantasy teams without matching league membership.
SELECT
    'orphan_fantasy_team_without_membership' AS check_name,
    ft.fantasy_team_id,
    ft.league_id,
    ft.user_id
FROM fantasy_teams ft
LEFT JOIN league_members lm
  ON lm.league_id = ft.league_id
 AND lm.user_id = ft.user_id
WHERE lm.member_id IS NULL;

-- 4. Draft picks whose fantasy team does not belong to the same league.
SELECT
    'draft_pick_league_mismatch' AS check_name,
    dp.pick_id,
    dp.league_id AS draft_league_id,
    dp.fantasy_team_id,
    ft.league_id AS team_league_id
FROM draft_picks dp
JOIN fantasy_teams ft
  ON ft.fantasy_team_id = dp.fantasy_team_id
WHERE ft.league_id <> dp.league_id;

-- 5. Inactive roster rows that would need released_at backfill.
SELECT
    'inactive_rows_missing_release' AS check_name,
    COUNT(*) AS row_count
FROM roster_players
WHERE is_active = FALSE;

-- 6. Current roster sizes over limit.
SELECT
    'roster_size_over_limit' AS check_name,
    fantasy_team_id,
    COUNT(*) AS active_rows
FROM roster_players
WHERE is_active = TRUE
GROUP BY fantasy_team_id
HAVING COUNT(*) > 8;

-- 7. Snapshot of current standings source.
SELECT
    'standings_snapshot' AS check_name,
    fantasy_team_id,
    team_name,
    total_points
FROM fantasy_teams
ORDER BY total_points DESC, fantasy_team_id ASC;
