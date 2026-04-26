#!/bin/bash
# =============================================================
# Playoff Hoops — Database Initialization Script
# Runs automatically on first 'docker compose up' via
# PostgreSQL's /docker-entrypoint-initdb.d/ mechanism.
#
# Order matters: schema → procedures → triggers → views
# =============================================================

set -e

echo "=== Playoff Hoops: Initializing database ==="

SQL_DIR="/sql-data"

echo "  [1/4] Creating schema (tables + ENUM types)..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -f "$SQL_DIR/schema.sql"

echo "  [2/4] Creating stored procedures..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -f "$SQL_DIR/procedures.sql"

echo "  [3/4] Creating triggers..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -f "$SQL_DIR/triggers.sql"

echo "  [4/4] Creating analytical views..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -f "$SQL_DIR/views.sql"

echo "=== Database initialization complete ==="
echo "    Tables, procedures, triggers, and views are ready."
echo "    Run 'python data/seed_synthetic.py' inside the backend"
echo "    container to load sample data."
