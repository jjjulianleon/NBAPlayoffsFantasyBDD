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
(2023-24, 2024-25, 2025-26) — 791 jugadores, 3.778 partidos,
88.603 box scores.


REQUISITOS DEL SISTEMA
----------------------
- PostgreSQL 16+ (probado con 18.3)
- Python 3.11+ (probado con 3.13)
- Node.js 20+ y npm
- Linux/macOS (cron opcional para refresh diario)
- Cuenta Kaggle con kaggle.json en ~/.kaggle/ (solo para refresh)
- API key de OpenAI (opcional, para scouting reports y comentarios de lineup)


INSTALACION RAPIDA (3 PASOS)
----------------------------

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

   # Cargar schema, vistas, procedures y triggers:
   PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops -f data/schema.sql
   PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops -f data/views.sql
   PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops -f data/procedures.sql
   PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops -f data/triggers.sql

   # Cargar datos NBA reales (descarga ~880 MB de Kaggle, primera vez):
   python data/seed_kaggle.py

   # Restringir el pool fantasy a los 16 equipos de playoff actuales
   # (idempotente — reaplicable tras cada seed_kaggle):
   PGPASSWORD=playoff_dev psql -h localhost -U playoff -d playoff_hoops -f data/seed_playoffs.sql

   # Variables de entorno (.env en la raiz del proyecto):
   cat > .env <<'EOF'
   DATABASE_URL=postgresql://playoff:playoff_dev@localhost:5432/playoff_hoops
   SECRET_KEY=dev-secret-change-in-prod
   OPENAI_API_KEY=sk-...        # opcional, funciones IA
   OPENAI_LINEUP_MODEL=gpt-5.1  # opcional, comentario del lineup sugerido
   EOF

   # Levantar API en http://localhost:8000:
   uvicorn backend.main:app --reload


2) FRONTEND
-----------
   cd frontend
   npm install
   npm run dev
   # Abre http://localhost:5173


3) (OPCIONAL) ACTUALIZACION AUTOMATICA DE PARTIDOS
--------------------------------------------------
   # Cron job que actualiza scores y nuevos partidos cada dia a las 8 AM:
   crontab -e
   # Agregar la linea:
   0 8 * * * /home/<usuario>/.local/bin/refresh-nba.sh >> /ruta/al/proyecto/playoff-hoops/data/refresh.log 2>&1

   # El wrapper /home/<usuario>/.local/bin/refresh-nba.sh debe contener:
   #   #!/usr/bin/env bash
   #   exec "/ruta/al/proyecto/playoff-hoops/scripts/refresh_nba.sh"


DEPENDENCIAS PYTHON (requirements.txt)
--------------------------------------
- fastapi              API REST asincrona
- uvicorn[standard]    Servidor ASGI
- asyncpg              Driver PostgreSQL async (DRIVER de conexion)
- python-jose[cryptography]   JWT para autenticacion
- bcrypt               Encriptacion de passwords
- pydantic[email]      Validacion de schemas
- python-dotenv        Variables de entorno
- openai               Scouting reports IA + comentario explicativo del lineup
- kaggle               Descarga del dataset NBA
- pandas               Procesamiento del CSV de Kaggle


DEPENDENCIAS FRONTEND (frontend/package.json)
---------------------------------------------
- React 19           UI
- Vite              Bundler + dev server (proxy /api -> :8000)
- Tailwind CSS v4   Estilos
- React Router v7   Navegacion SPA


ESTRUCTURA DEL PROYECTO
-----------------------
playoff-hoops/
+-- backend/             FastAPI app
|   +-- auth/            Registro, login, JWT, bcrypt
|   +-- players/         Endpoints de jugadores y rachas
|   +-- fantasy/         Ligas, equipos, draft, roster
|   +-- predictions/     Partidos, scoring diario, scouting IA
|   +-- main.py          Entry point + CORS + lifespan
|   +-- database.py      Pool asyncpg
|   +-- config.py        Variables de entorno
+-- frontend/            React SPA
|   +-- src/pages/       13 pantallas (Login, Players, Reports, etc)
|   +-- src/AuthContext  JWT en localStorage
|   +-- src/api.js       Cliente HTTP
+-- data/
|   +-- schema.sql       13 tablas + ENUMs + indices
|   +-- views.sql        6 vistas analiticas
|   +-- procedures.sql   9 stored procedures + 1 funcion
|   +-- triggers.sql     5 triggers
|   +-- seed_kaggle.py   Carga incremental desde Kaggle
+-- scripts/
|   +-- refresh_nba.sh   Job diario de actualizacion
+-- docs/
|   +-- DER.pdf          Diagrama Entidad-Relacion
|   +-- informe.pdf      Informe completo del proyecto
+-- requirements.txt
+-- README.txt           (este archivo)


USO TIPICO
----------
1. Abre http://localhost:5173
2. Click "Registrate" y crea tu cuenta (password se encripta con bcrypt)
3. "Mis Ligas" -> "Nueva Liga" -> dale un nombre
4. "Crear Equipo" en la liga
5. "Iniciar Draft" (solo el comisionado)
6. "Ir al Draft" y selecciona 8 jugadores
7. "Completar Draft"
8. Navega "Jugadores", "Rachas", "Partidos", "Reportes"
9. En la ficha de un jugador, click "Scouting Report (IA)"
   genera analisis IA del jugador
10. En "Mi Equipo", revisa la alineacion sugerida y su comentario explicativo IA


PUERTOS Y URLs
--------------
- Backend API:    http://localhost:8000  (docs en /docs y /redoc)
- Frontend dev:   http://localhost:5173
- Health check:   http://localhost:8000/api/health
- PostgreSQL:     localhost:5432 (db: playoff_hoops)


TROUBLESHOOTING
---------------
- "ModuleNotFoundError": activar el venv y `pip install -r requirements.txt`
- "connection refused" en PostgreSQL: verifica que el servicio este corriendo
  (sudo systemctl status postgresql)
- Frontend en blanco: revisar consola del navegador, verificar que el
  backend este corriendo en :8000
- Scouting report falla: necesita OPENAI_API_KEY valida en .env
- Cron no corre: verificar permisos del wrapper (chmod +x) y que la ruta
  no contenga espacios sin escapar


CREDITOS DE DATOS
-----------------
Dataset Kaggle: eoinamoore/historical-nba-data-and-player-box-scores
Equipos NBA: oficiales (IDs nba_api de stats.nba.com)


USO DE GEN AI (declaracion etica)
---------------------------------
Ver seccion "Declaracion de Uso de IA Generativa" del informe.pdf
para detalle completo de prompts y herramientas usadas.
