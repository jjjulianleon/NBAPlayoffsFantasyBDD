================================================================
  PLAYOFF HOOPS — Fantasy Basketball NBA Playoffs
  USFQ — CMP 4002 Bases de Datos — Proyecto Final 2025/2026
  Autor: Julian Leon
================================================================

DESCRIPCION
-----------
Aplicacion fantasy basketball especializada en playoffs NBA.
Permite crear ligas, draftear jugadores reales, ver estadisticas en
tiempo real y generar reportes con IA. Datos reales de Kaggle
(2023-24, 2024-25, 2025-26) — 791 jugadores, 3.794 partidos,
89.053 box scores.


REQUISITOS DEL SISTEMA
----------------------

  Opcion A (Docker — recomendado):
  - Docker 20+ y Docker Compose v2+
  - (Nada mas)

  Opcion B (manual):
  - PostgreSQL 16+
  - Python 3.11+ y pip
  - Node.js 20+ y npm
  - Linux/macOS


================================================================
  INSTALACION CON DOCKER (RECOMENDADO)
================================================================

  Solo 2 comandos:

    cp .env.example .env          # editar OPENAI_API_KEY si se necesita
    docker compose up -d --build

  Esto levanta 3 servicios automaticamente:

    ┌──────────────────────────────────────────────────────────┐
    │  db       → PostgreSQL 16 con schema, triggers, vistas  │
    │  backend  → FastAPI en http://localhost:8000             │
    │  frontend → React + Vite en http://localhost:5173        │
    └──────────────────────────────────────────────────────────┘

  La base de datos se inicializa sola al primer arranque:
  schema.sql → procedures.sql → triggers.sql → views.sql

  Para cargar datos de prueba (8 equipos, 30 jugadores, 4 partidos):

    docker compose exec backend python data/seed_synthetic.py

  Comandos utiles:

    docker compose logs -f       # ver logs
    docker compose down          # apagar
    docker compose down -v       # apagar y borrar datos de BD


================================================================
  INSTALACION MANUAL (sin Docker)
================================================================

  1) BACKEND + BASE DE DATOS
  --------------------------
    cd playoff-hoops
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt

    # Crear DB y usuario en PostgreSQL:
    sudo -u postgres psql <<'EOF'
    CREATE USER playoff WITH PASSWORD 'playoff_dev';
    CREATE DATABASE playoff_hoops OWNER playoff;
    EOF

    # Cargar schema, procedures, triggers y vistas (en ese orden):
    PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops -f data/schema.sql
    PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops -f data/procedures.sql
    PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops -f data/triggers.sql
    PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops -f data/views.sql

    # Cargar datos NBA reales (descarga ~880 MB de Kaggle, primera vez):
    python data/seed_kaggle.py

    # Restringir fantasy a los 16 equipos de playoff actuales:
    PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops -f data/seed_playoffs.sql

    # Variables de entorno (.env en la raiz):
    cp .env.example .env
    # Editar DATABASE_URL a localhost:5432

    # Levantar API:
    uvicorn backend.main:app --reload

  2) FRONTEND
  -----------
    cd frontend
    npm install
    npm run dev
    # Abre http://localhost:5173


================================================================
  COMPONENTES DE BASE DE DATOS (segun rubrica CMP 4002)
================================================================

  TABLAS (14 total: 11 entidades + 3 junctions M:M)
  --------------------------------------------------
  Dominio NBA real:
    1. nba_teams            30 equipos NBA con playoff_seed e is_eliminated
    2. players              791 jugadores con posicion y promedios
    3. games                3.794 partidos con playoff_round (1-4)
    4. team_elimination_log Auditoria de eliminaciones (trigger)

  Dominio fantasy:
    5. users                Autenticacion con bcrypt
    6. leagues              Ligas con scoring_type ENUM
    7. fantasy_teams        Equipos fantasy con total_points
    8. draft_picks          Historial de draft
    9. transactions         Log de movimientos de roster

  Dominio IA:
   10. predictions          Predicciones del modelo XGBoost
   11. scouting_reports     Textos generados por IA (cache)

  Junctions M:M (con atributos propios):
   12. player_game_stats    players <-> games (15 atributos estadisticos)
   13. league_members       users <-> leagues (role ENUM, joined_at)
   14. roster_players       fantasy_teams <-> players (slot, active, acquired_via)

  RELACIONES
  ----------
  3 relaciones muchos-a-muchos:
    - players <-> games          via player_game_stats
    - users <-> leagues          via league_members
    - fantasy_teams <-> players  via roster_players

  7+ relaciones uno-a-muchos:
    - nba_teams -> players, games, team_elimination_log
    - users -> leagues, fantasy_teams
    - leagues -> fantasy_teams, draft_picks
    - players -> predictions, scouting_reports

  ENUMS (9 tipos)
  ----------------
  conference_enum, game_status_enum, draft_status_enum,
  scoring_type_enum, member_role_enum, roster_slot_enum,
  acquired_via_enum, txn_type_enum, streak_status_enum

  VISTAS ANALITICAS (6 — rubrica pide minimo 5)
  -----------------------------------------------
    1. v_league_leaderboard   Ranking por liga con RANK() OVER + FILTER
    2. v_player_performance   Promedios de temporada con AVG/SUM/COUNT
    3. v_hot_cold_players     Rachas ultimos 5 vs media (CTE + ROW_NUMBER)
    4. v_roster_detail        Composicion de roster (JOIN de 5 tablas)
    5. v_daily_scoring        Scoring con multiplicador por ronda (CASE WHEN)
    6. v_prediction_accuracy  MAE del modelo ML (AVG(ABS(...)))

  STORED PROCEDURES (9 procedures + 1 funcion)
  ----------------------------------------------
    - sp_register_user         INSERT transaccional con bcrypt
    - sp_create_league         INSERT atomico liga + membership
    - sp_make_draft_pick       INSERT con FOR UPDATE (bloqueo concurrente)
    - sp_update_player_game_stats  UPDATE transaccional
    - sp_calculate_fantasy_points  UPDATE batch
    - sp_delete_fantasy_team   DELETE cascada
    - sp_drop_roster_player    DELETE con auditoria
    - sp_leave_league          DELETE con cascade
    - sp_free_agent_swap       DELETE+INSERT atomico (swap en misma tx)
    - fn_compute_fantasy_pts   FUNCTION IMMUTABLE de formula de puntos

  TRIGGERS (7)
  -------------
    1. trg_sync_fantasy_points          BEFORE INSERT/UPDATE → calcula fantasy_points
    2. trg_sync_team_points_from_stats  AFTER INSERT/UPDATE/DELETE → recalcula total_points
    3. trg_sync_team_points_from_roster AFTER INSERT/UPDATE/DELETE → sincroniza roster
    4. trg_eliminate_team               AFTER UPDATE → auditoria en team_elimination_log
    5. trg_check_roster_size            BEFORE INSERT/UPDATE → valida maximo 8 jugadores
    6. trg_check_unique_active_slot     CONSTRAINT TRIGGER DEFERRABLE → permite swaps atomicos
    7. trg_validate_last_login          BEFORE UPDATE → sanity check

  INDICES
  -------
  9 indices optimizados + 2 indices parciales:
    - uq_rp_active_team_player  (parcial, WHERE released_at IS NULL)
    - idx_rp_active_team_slot   (parcial, para roster activo)

  NORMALIZACION
  --------------
  Todas las tablas cumplen BCNF (Boyce-Codd Normal Form).
  No hay dependencias transitivas. El unico atributo derivado
  (fantasy_teams.total_points) se mantiene consistente via trigger.

  AUTENTICACION
  --------------
  - Passwords: bcrypt con salt unico por password (cost >= 12)
  - Sesiones: JWT firmado con HS256, expiracion 24h
  - Driver: asyncpg con prepared statements (inmune a SQL injection)


================================================================
  ESTRUCTURA DEL PROYECTO
================================================================

  playoff-hoops/
  ├── backend/                  FastAPI app (Python)
  │   ├── auth/                 Registro, login, JWT, bcrypt
  │   ├── players/              Endpoints de jugadores y rachas
  │   ├── fantasy/              Ligas, equipos, draft, roster
  │   ├── predictions/          Partidos, scoring diario, scouting IA
  │   ├── admin/                Panel de administracion
  │   ├── data_sync/            Sincronizacion de datos NBA
  │   ├── main.py               Entry point + CORS + lifespan
  │   ├── database.py           Pool asyncpg
  │   ├── config.py             Variables de entorno
  │   └── Dockerfile            Imagen Docker del backend
  ├── frontend/                 React SPA (Vite + Tailwind v4)
  │   ├── src/pages/            13 paginas (Login, Players, Reports...)
  │   ├── src/components/       17 componentes reutilizables
  │   ├── src/lib/              Utilidades y datos de equipos
  │   ├── src/api.js            Cliente HTTP
  │   ├── src/AuthContext.jsx   Proveedor de autenticacion
  │   └── Dockerfile            Imagen Docker del frontend
  ├── data/                     SQL y scripts de datos
  │   ├── schema.sql            14 tablas + 9 ENUMs + indices
  │   ├── procedures.sql        9 stored procedures + 1 funcion
  │   ├── triggers.sql          7 triggers
  │   ├── views.sql             6 vistas analiticas
  │   ├── seed_kaggle.py        Carga incremental desde Kaggle
  │   ├── seed_synthetic.py     Datos de prueba rapidos
  │   ├── seed_playoffs.sql     Configuracion de 16 equipos playoff
  │   └── migrations/           Migraciones historicas
  ├── scripts/
  │   ├── refresh_nba.sh        Job diario de actualizacion
  │   └── run_refresh.py        Orquestador del refresh
  ├── docs/
  │   ├── DER.png               Diagrama Entidad-Relacion (Mermaid)
  │   ├── DER.pdf               DER en formato PDF
  │   ├── DER.md                Documentacion del DER
  │   ├── der.mmd               Fuente Mermaid del DER
  │   └── der_tablas.pdf/.tex   Tablas del DER en LaTeX
  ├── docker/
  │   └── init-db.sh            Script de inicializacion de BD
  ├── docker-compose.yml        Orquestacion de 3 servicios
  ├── .env.example              Template de variables de entorno
  ├── .dockerignore             Exclusiones para Docker build
  ├── requirements.txt          Dependencias Python
  └── README.txt                Este archivo


DEPENDENCIAS PYTHON (requirements.txt)
--------------------------------------
  - fastapi              API REST asincrona
  - uvicorn              Servidor ASGI
  - asyncpg              Driver PostgreSQL async (pool 2-10 conexiones)
  - python-jose          JWT para autenticacion
  - bcrypt               Encriptacion de passwords
  - pydantic             Validacion de schemas + email
  - python-dotenv        Variables de entorno
  - openai               Scouting reports IA
  - kaggle               Descarga del dataset NBA
  - pandas               Procesamiento CSV
  - psycopg[binary]      Driver sync (usado por scripts de seed)


DEPENDENCIAS FRONTEND (frontend/package.json)
---------------------------------------------
  - React 19             UI
  - Vite 8               Bundler + dev server (proxy /api -> :8000)
  - Tailwind CSS v4      Estilos
  - React Router v7      Navegacion SPA
  - Lucide React         Iconos


USO TIPICO
----------
  1. Abre http://localhost:5173
  2. Click "Registrate" y crea tu cuenta (password con bcrypt)
  3. "Mis Ligas" -> "Nueva Liga" -> dale un nombre
  4. "Crear Equipo" en la liga
  5. "Iniciar Draft" (solo el comisionado)
  6. "Ir al Draft" y selecciona 8 jugadores
  7. "Completar Draft"
  8. Navega "Jugadores", "Rachas", "Partidos", "Reportes"
  9. En la ficha de un jugador, click "Scouting Report (IA)"
 10. En "Mi Equipo", revisa la alineacion sugerida


PUERTOS Y URLs
--------------
  - Frontend:      http://localhost:5173
  - Backend API:   http://localhost:8000  (docs en /docs y /redoc)
  - Health check:  http://localhost:8000/api/health
  - PostgreSQL:    localhost:5433 (Docker) o localhost:5432 (local)


CRUD DESDE EL FRONTEND (requisito rubrica)
-------------------------------------------
  | Pantalla      | INSERT                | UPDATE              | DELETE              |
  |---------------|-----------------------|---------------------|---------------------|
  | Register      | sp_register_user      | —                   | —                   |
  | Login         | —                     | UPDATE last_login   | —                   |
  | Profile       | —                     | UPDATE display_name | —                   |
  | Leagues       | sp_create_league      | UPDATE league_name  | DELETE league        |
  | Draft         | sp_make_draft_pick    | —                   | —                   |
  | TeamRoster    | free agent add        | UPDATE roster slot  | soft-delete roster  |


REPORTES SOBRE VISTAS (requisito rubrica)
-------------------------------------------
  La pagina Reports.jsx consume las 6 vistas via endpoints:

  | Reporte             | Vista                 | Endpoint                    |
  |---------------------|-----------------------|-----------------------------|
  | Posiciones de liga  | v_league_leaderboard  | /api/fantasy/leagues/{}/lb  |
  | Promedios temporada | v_player_performance  | /api/players/leaderboard    |
  | Rachas hot/cold     | v_hot_cold_players    | /api/players/hot-cold       |
  | Detalle de roster   | v_roster_detail       | /api/fantasy/teams/{}/roster|
  | Scoring diario      | v_daily_scoring       | /api/predictions/daily      |
  | Precision modelo    | v_prediction_accuracy | /api/predictions/accuracy   |

  Todos los reportes tienen export CSV.


TROUBLESHOOTING
---------------
  Docker:
  - "port already in use 5432": tu PostgreSQL local esta corriendo.
    Docker usa el puerto 5433 para evitar conflicto.
  - "no space left on device": docker system prune -a
  - Reiniciar desde cero: docker compose down -v && docker compose up -d

  Manual:
  - "ModuleNotFoundError": activar el venv y pip install -r requirements.txt
  - "connection refused": verificar que PostgreSQL este corriendo
  - Frontend en blanco: revisar consola del navegador, backend en :8000
  - Scouting report falla: necesita OPENAI_API_KEY valida en .env


CREDITOS DE DATOS
-----------------
  Dataset Kaggle: eoinamoore/historical-nba-data-and-player-box-scores
  Equipos NBA: IDs oficiales de stats.nba.com


USO DE GEN AI (declaracion etica)
---------------------------------
  Ver seccion "Declaracion de Uso de IA Generativa" del informe
  para detalle completo de prompts y herramientas usadas.
