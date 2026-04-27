#!/usr/bin/env bash
# Refresh diario de datos NBA desde Kaggle.
# Diseñado para correr tanto manual como desde cron.
# Funciona tanto en local como dentro de Docker.
#
# Solo descarga si el dataset cambió (sin --force).
# Kaggle compara la versión local vs remota y salta si ya es la última.

set -euo pipefail

# Auto-detect project root from this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Inside Docker, use system python/kaggle; locally, use venv
if [ -d "$PROJECT_DIR/venv" ]; then
  PYTHON="$PROJECT_DIR/venv/bin/python"
  KAGGLE="$PROJECT_DIR/venv/bin/kaggle"
else
  PYTHON="$(command -v python3 || command -v python)"
  KAGGLE="$(command -v kaggle || echo "$PROJECT_DIR/venv/bin/kaggle")"
fi

KAGGLE_DIR="$PROJECT_DIR/data/kaggle"
LOG_FILE="$PROJECT_DIR/data/refresh.log"

# Cron no carga .bashrc — poner PATH y KAGGLE_CONFIG_DIR explícitos
export PATH="$(dirname "$PYTHON"):${PATH}"
export KAGGLE_CONFIG_DIR="${KAGGLE_CONFIG_DIR:-$HOME/.kaggle}"

cd "$PROJECT_DIR"

# Database connection: prefer DATABASE_URL (Docker sets this), fallback to localhost
DB_URL="${DATABASE_URL:-postgresql://playoff:playoff_dev@localhost:5432/playoff_hoops}"

echo "=== [$(date -Iseconds)] Inicio refresh NBA ===" | tee -a "$LOG_FILE"

# 1. Descargar dataset (SIN --force: salta si ya tienes la ultima version)
echo "→ Verificando dataset Kaggle..." | tee -a "$LOG_FILE"
mkdir -p "$KAGGLE_DIR"
DOWNLOAD_OUTPUT=$("$KAGGLE" datasets download \
  -d eoinamoore/historical-nba-data-and-player-box-scores \
  -p "$KAGGLE_DIR" --unzip 2>&1) || true
echo "$DOWNLOAD_OUTPUT" | tee -a "$LOG_FILE"

if echo "$DOWNLOAD_OUTPUT" | grep -qi "already.*downloaded\|skipping"; then
  echo "→ Dataset sin cambios, solo actualizando scores recientes..." | tee -a "$LOG_FILE"
fi

# 2. Correr seeder incremental (ON CONFLICT DO UPDATE para scores)
echo "→ Ejecutando seed_kaggle.py (incremental)..." | tee -a "$LOG_FILE"
"$PYTHON" "$PROJECT_DIR/data/seed_kaggle.py" 2>&1 | tee -a "$LOG_FILE"

# 3. Recalcular season averages (todas las temporadas activas)
echo "→ Recalculando season_ppg/rpg/apg..." | tee -a "$LOG_FILE"
psql "$DB_URL" <<'SQL' 2>&1 | tee -a "$LOG_FILE"
UPDATE players p SET
  season_ppg = COALESCE(sub.ppg, 0),
  season_rpg = COALESCE(sub.rpg, 0),
  season_apg = COALESCE(sub.apg, 0)
FROM (
  SELECT s.player_id,
         AVG(s.points)::numeric(5,2)   AS ppg,
         AVG(s.rebounds)::numeric(5,2) AS rpg,
         AVG(s.assists)::numeric(5,2)  AS apg
    FROM player_game_stats s
    JOIN games g ON s.game_id = g.game_id
   WHERE g.game_date >= '2024-10-01'
   GROUP BY s.player_id
   HAVING COUNT(*) >= 3
) sub WHERE sub.player_id = p.player_id;
SQL

# 4. Derivar equipos eliminados del bracket de playoffs
echo "→ Actualizando is_eliminated desde bracket..." | tee -a "$LOG_FILE"
psql "$DB_URL" <<'SQL' 2>&1 | tee -a "$LOG_FILE"
-- Derived elimination: a team is eliminated if they lost 4 games in a series
-- against the same opponent in the same playoff round.
WITH game_losers AS (
    SELECT
        g.playoff_round,
        CASE WHEN g.home_score < g.away_score THEN g.home_team_id ELSE g.away_team_id END AS loser_id,
        CASE WHEN g.home_score < g.away_score THEN g.away_team_id ELSE g.home_team_id END AS winner_id
    FROM games g
    WHERE g.status = 'final'
      AND g.playoff_round >= 1
      AND g.home_score <> g.away_score
      AND g.game_date >= '2026-04-18'  -- inicio del round 1 de los playoffs 2025-26
),
series_losses AS (
    SELECT loser_id, playoff_round, winner_id, COUNT(*) AS losses
    FROM game_losers
    GROUP BY loser_id, playoff_round, winner_id
    HAVING COUNT(*) >= 4
)
UPDATE nba_teams
SET is_eliminated = TRUE,
    eliminated_round = sl.playoff_round
FROM series_losses sl
WHERE nba_teams.team_id = sl.loser_id
  AND nba_teams.is_eliminated = FALSE;
SQL

echo "=== [$(date -Iseconds)] Fin refresh NBA ===" | tee -a "$LOG_FILE"
