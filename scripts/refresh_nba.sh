#!/usr/bin/env bash
# Refresh diario de datos NBA desde Kaggle.
# Diseñado para correr tanto manual como desde cron.
#
# Solo descarga si el dataset cambió (sin --force).
# Kaggle compara la versión local vs remota y salta si ya es la última.

set -euo pipefail

PROJECT_DIR="/home/jjulianleon/University/8vo Semestre/Bases de Datos/ProyectoFinal/playoff-hoops"
VENV="$PROJECT_DIR/venv"
KAGGLE_DIR="$PROJECT_DIR/data/kaggle"
KAGGLE="$VENV/bin/kaggle"
PYTHON="$VENV/bin/python"
LOG_FILE="$PROJECT_DIR/data/refresh.log"

# Cron no carga .bashrc — poner PATH, HOME y KAGGLE_CONFIG_DIR explícitos
export PATH="$VENV/bin:/usr/local/bin:/usr/bin"
export HOME="/home/jjulianleon"
export KAGGLE_CONFIG_DIR="$HOME/.kaggle"

cd "$PROJECT_DIR"

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
PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops <<'SQL' 2>&1 | tee -a "$LOG_FILE"
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
PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops <<'SQL' 2>&1 | tee -a "$LOG_FILE"
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
      AND g.game_date >= '2025-04-01'
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
