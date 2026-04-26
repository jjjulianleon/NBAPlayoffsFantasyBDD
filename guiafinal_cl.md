# 📘 Guía de Defensa — Playoff Hoops

## 0. El problema que resuelves (contexto de la rúbrica)

La rúbrica exige "un sistema completo que solucione una problemática". La tuya es:

> *"Los sistemas fantasy actuales (ESPN, Yahoo) cubren temporada regular. No existe producto fantasy especializado en playoffs NBA que capture su dinámica única: series cortas, eliminaciones, y el hecho de que el valor de cada partido crece conforme avanzan las rondas."*

Tu solución implementa esa dinámica en el modelo: `nba_teams.is_eliminated`, `games.playoff_round`, y un **multiplicador de puntos por ronda** (R1 ×1.0 → Finals ×2.0) que vive tanto en la función `fn_compute_fantasy_pts` como en la vista `v_daily_scoring`.

---

## 1. Tablas (requisito: 8–10 + junctions)

Tienes **11 tablas de entidad + 3 junctions M:M**. Así las tienes que explicar, agrupadas por **dominio**:

### Dominio NBA real (datos fuente)
| # | Tabla | PK | Rol | Atributos clave |
|---|---|---|---|---|
| 1 | `nba_teams` | team_id (ID oficial NBA) | 30 equipos reales | `abbreviation UNIQUE`, `conference ENUM('East','West')`, `playoff_seed`, `is_eliminated`, `eliminated_round` |
| 2 | `players` | player_id (ID NBA) | 791 jugadores | `team_id FK→nba_teams`, `position`, `season_ppg/rpg/apg` (promedio pretemporada) |
| 3 | `games` | game_id (VARCHAR) | 3.778 partidos | `home_team_id/away_team_id FK→nba_teams`, `status ENUM`, `playoff_round` (1=R1…4=Finals) |
| 4 | `team_elimination_log` | log_id | **auditoría** de cambios de eliminación | Poblada por trigger, no por el usuario |

### Dominio fantasy (lo que crea el usuario)
| # | Tabla | PK | Rol | Atributos clave |
|---|---|---|---|---|
| 5 | `users` | user_id | Autenticación | `username UNIQUE`, `email UNIQUE`, `password_hash` (bcrypt) |
| 6 | `leagues` | league_id | Liga fantasy | `created_by FK→users`, `max_teams`, `draft_status ENUM`, `scoring_type ENUM` |
| 7 | `fantasy_teams` | fantasy_team_id | Equipo fantasy | `UNIQUE(user_id, league_id)` — un usuario = un team por liga |
| 8 | `draft_picks` | pick_id | Historial de draft | `UNIQUE(league_id, player_id)` — un jugador solo se drafta una vez por liga |
| 9 | `transactions` | transaction_id | Log de add/drop/trade | Auditoría de movimientos de roster |

### Dominio IA / diferenciador
| # | Tabla | PK | Rol | Atributos clave |
|---|---|---|---|---|
| 10 | `predictions` | prediction_id | Predicciones del modelo XGBoost | `UNIQUE(player_id, game_id, model_version)` |
| 11 | `scouting_reports` | report_id | Textos generados por Claude | `UNIQUE(player_id, report_date)` — caché |

### Junctions M:M (no cuentan en las 8-10)
| Junction | Conecta | Por qué no es "diccionario" |
|---|---|---|
| `player_game_stats` | players ↔ games | Tiene **15 atributos estadísticos propios** (puntos, rebotes, fantasy_points, plus_minus…) |
| `league_members` | users ↔ leagues | Tiene `role ENUM` y `joined_at` |
| `roster_players` | fantasy_teams ↔ players | Tiene `roster_slot`, `is_active`, `acquired_via`, `acquired_at`, `released_at` |

**Frase para defensa:** *"La rúbrica pide 8-10 tablas sin contar M:M. Tengo 11 entidades + 3 junctions que sí cumplen la exigencia de la rúbrica porque **no son diccionarios**: cada junction tiene atributos propios que no existirían en ninguna de las dos entidades padres."*

---

## 2. Relaciones (requisito: 3 M:M + 5 1:M)

### 3 relaciones muchos-a-muchos
1. **players ↔ games** vía `player_game_stats` — un jugador juega muchos partidos; un partido tiene muchos jugadores.
2. **users ↔ leagues** vía `league_members` — un usuario está en muchas ligas; una liga tiene muchos usuarios.
3. **fantasy_teams ↔ players** vía `roster_players` — un equipo fantasy tiene muchos jugadores; un jugador puede estar en muchos rosters de distintas ligas.

### 7 relaciones uno-a-muchos (tienes más que las 5 exigidas)
1. `nba_teams (1) → players (N)` — un equipo tiene muchos jugadores.
2. `nba_teams (1) → games (N)` — dos FKs: `home_team_id`, `away_team_id`.
3. `users (1) → leagues (N)` — vía `created_by`.
4. `users (1) → fantasy_teams (N)` — un usuario crea teams en distintas ligas.
5. `leagues (1) → fantasy_teams (N)`, `leagues (1) → draft_picks (N)`.
6. `players (1) → predictions (N)` y `players (1) → scouting_reports (N)`.
7. `nba_teams (1) → team_elimination_log (N)`.

**Pregunta trampa típica:** *"¿Por qué `fantasy_teams` no es una junction si conecta users y leagues?"*
*R:* Porque tiene **identidad propia**: `team_name`, `total_points`, `rank_in_league`, `created_at`. Además, **tiene relaciones salientes propias** (hacia `draft_picks`, `roster_players`, `transactions`). Una junction pura (como `league_members`) solo sirve para enlazar — `fantasy_teams` es el centro del dominio fantasy.

---

## 3. Normalización / BCNF (requisito: DER en FNBC)

**Definición corta que debes memorizar:**
> *"Una relación está en BCNF (Forma Normal de Boyce-Codd) si toda dependencia funcional no trivial X→A tiene a X como superllave."*

**Cómo lo demuestras con un ejemplo del proyecto:**

Toma `player_game_stats`:
- PK = `stat_id`
- Candidate key alterna = `(player_id, game_id)` (UNIQUE)
- Dependencias funcionales: `stat_id → todo`, `(player_id, game_id) → todo`
- **No existe** ninguna dependencia del tipo `points → rebounds` o `player_id → game_id`.
- Conclusión: toda DF no trivial tiene como determinante una superllave → BCNF ✅.

**Cómo evitas dependencias transitivas:** no guardas `team_name` en `players` (te llevaría a `players → team_id → team_name`, transitivo). En su lugar haces JOIN a `nba_teams`. Igual con `league_name` en `fantasy_teams`.

**Caso sutil — `fantasy_teams.total_points`:** es un atributo **derivado** (suma de fantasy_points de roster). Se mantiene por trigger. Un crítico podría decir *"eso viola normalización porque es redundante"*. Tu respuesta: *"Es una **materialización controlada** por razones de performance. El trigger garantiza que nunca diverja del valor derivable. Es una decisión de diseño justificada: la alternativa sería recalcular con SUM() en cada lectura del leaderboard, lo cual en una liga activa con 8 teams × 8 jugadores × 100+ partidos es prohibitivo."*

---

## 4. ENUMs, PKs, FKs, restricciones

### ENUMs (9 tipos)
`conference_enum`, `game_status_enum`, `draft_status_enum`, `scoring_type_enum`, `member_role_enum`, `roster_slot_enum`, `acquired_via_enum`, `txn_type_enum`, `streak_status_enum`.

**Por qué ENUMs y no VARCHAR con CHECK:** tipado fuerte a nivel del motor, sin typos posibles, índices más compactos, y la restricción es parte del esquema (no se puede evadir con un INSERT directo).

### PKs
- **Surrogate (IDENTITY):** `users`, `leagues`, `fantasy_teams`, `player_game_stats`, `league_members`, `roster_players`, `draft_picks`, `transactions`, `predictions`, `scouting_reports`, `team_elimination_log`.
- **Natural:** `nba_teams.team_id`, `players.player_id`, `games.game_id` — porque ya existen IDs oficiales de la NBA; no tiene sentido inventar uno nuevo.

### FKs importantes que demuestran diseño cuidado

| FK | Acción | Por qué |
|---|---|---|
| `players.team_id → nba_teams` | `ON DELETE RESTRICT` | No quieres borrar un equipo si tiene jugadores asociados. |
| `league_members.league_id → leagues` | `ON DELETE CASCADE` | Si disuelves la liga, las membresías se borran automáticamente. |
| `roster_players.fantasy_team_id → fantasy_teams` | `ON DELETE CASCADE` | Si eliminas el fantasy team, su roster se borra. |
| `fantasy_teams (league_id, user_id) → league_members (league_id, user_id)` | **FK compuesta** | Garantiza que no puedas crear un fantasy_team si el usuario no es miembro de esa liga. |
| `draft_picks (league_id, fantasy_team_id) → fantasy_teams (league_id, fantasy_team_id)` | **FK compuesta** | Garantiza que el pick se asigne a un team **que pertenece a esa misma liga**. |

### CHECK constraints
- `nba_teams.chk_seed CHECK (playoff_seed BETWEEN 1 AND 16)`
- `nba_teams.chk_round CHECK (eliminated_round BETWEEN 1 AND 4)`
- `games.chk_distinct_teams CHECK (home_team_id <> away_team_id)` → no puedes tener un partido de un equipo contra sí mismo.
- `games.chk_round_range CHECK (playoff_round BETWEEN 1 AND 4)`
- `leagues.chk_max_teams CHECK (max_teams BETWEEN 2 AND 10)`
- `roster_players.chk_roster_active_window CHECK ((is_active=TRUE AND released_at IS NULL) OR (is_active=FALSE AND released_at IS NOT NULL))` → coherencia entre flag y timestamp.

### Índices conscientes
- `idx_players_team`, `idx_pgs_player`, `idx_pgs_game`, `idx_rp_team`, `idx_rp_player`, `idx_games_date`, `idx_games_round`, `idx_tx_team`, `idx_tel_team_changed_at`.
- **Índice parcial único** `uq_rp_active_team_player ON roster_players(fantasy_team_id, player_id) WHERE released_at IS NULL`. Si alguien pregunta por qué: *"Permite mantener el historial de tenencia (un jugador puede ser dropeado y reañadido), pero impide dos entradas activas simultáneas del mismo jugador."*
- **Índice parcial** `idx_rp_active_team_slot WHERE released_at IS NULL` para acelerar la consulta de roster activo por slot.

---

## 5. Las 6 vistas (requisito: mínimo 5)

Para cada vista debes saber: **qué responde, qué técnica SQL usa, qué query la consume.**

### V1. `v_league_leaderboard` — Tabla de posiciones por liga
- **Qué hace:** Lista de fantasy_teams de cada liga con su ranking en tiempo real.
- **Técnicas SQL:** `RANK() OVER (PARTITION BY league_id ORDER BY total_points DESC)`, `COUNT(...) FILTER (WHERE ...)`, `GROUP BY`, LEFT JOIN.
- **Consumida por:** `GET /api/fantasy/leagues/{league_id}/leaderboard` → `Reports.jsx`.
- **Defensa:** *"Uso `RANK()` en vez de `ROW_NUMBER()` porque si dos teams empatan en puntos deben compartir posición. El `FILTER` calcula el tamaño de roster activo sin un segundo JOIN."*

### V2. `v_player_performance` — Promedios de temporada por jugador
- **Qué hace:** Agrega todos los `player_game_stats` de un jugador en promedios.
- **Técnicas:** `AVG`, `SUM`, `COUNT`, `GROUP BY` sobre tres tablas (players + nba_teams + player_game_stats con LEFT JOIN).
- **Consumida por:** `GET /api/players/leaderboard?sort=avg_fantasy_pts`.
- **Defensa:** *"LEFT JOIN porque algunos jugadores aún no tienen partidos (games_played = 0), quiero verlos en la lista."*

### V3. `v_hot_cold_players` — Rachas calientes/frías
- **Qué hace:** Compara los últimos 5 partidos de un jugador contra su promedio de temporada. Clasifica `hot` si +20%, `cold` si -20%.
- **Técnicas:** **CTE** (`WITH last5 AS ...`) + **window function** (`ROW_NUMBER() OVER PARTITION BY player_id ORDER BY game_date DESC`) + `GROUP BY` con `HAVING`, CAST a enum, filtros `season_ppg >= 5.0 AND NOT is_eliminated`.
- **Consumida por:** `GET /api/players/hot-cold` → página `HotCold.jsx` y `Reports.jsx`.
- **Defensa:** *"Esta vista es el diferenciador del proyecto — no existe en ESPN ni Yahoo. Uso una CTE para numerar cronológicamente los partidos y filtrar los 5 más recientes sin subqueries correlacionadas."*

### V4. `v_roster_detail` — Composición de roster fantasy
- **Qué hace:** Para cada fantasy_team, lista sus jugadores activos con posición, equipo NBA, si está eliminado, y promedios.
- **Técnicas:** JOIN de 5 tablas (fantasy_teams + users + roster_players + players + nba_teams), filtro `WHERE released_at IS NULL` (solo roster activo).
- **Consumida por:** `GET /api/fantasy/teams/{id}/roster` → `TeamRoster.jsx`.

### V5. `v_daily_scoring` — Scoring ajustado por ronda
- **Qué hace:** Muestra fantasy_points de cada jugador en cada partido, **multiplicado por el factor de ronda** (R1 ×1.0, Semis ×1.25, CF ×1.5, Finals ×2.0).
- **Técnicas:** `CASE WHEN` sobre `playoff_round`, 5 JOINs.
- **Consumida por:** `GET /api/predictions/daily-scoring`.
- **Defensa:** *"Aquí se materializa la dinámica única de playoffs: un partido de Finals vale el doble que uno de R1. Implemento la misma fórmula en `fn_compute_fantasy_pts` para el trigger y en la vista para el reporte — son coherentes por diseño."*

### V6. `v_prediction_accuracy` — MAE del modelo ML
- **Qué hace:** Calcula el Mean Absolute Error del XGBoost comparando `predicted_fantasy_pts` con `fantasy_points` reales.
- **Técnicas:** `AVG(ABS(predicted - real))`, JOIN doble.
- **Consumida por:** `GET /api/predictions/accuracy` → admin y Reports.

**Frase de cierre sobre vistas:** *"Las vistas encapsulan lógica de reporte que de otra forma viviría duplicada en el backend. El frontend consume las vistas vía queries parametrizadas — cambio la lógica en `views.sql` y el frontend no se entera."*

---

## 6. Stored Procedures (requisito: modificadores en esquema transaccional)

Tienes **8 procedures**. Tres se invocan desde el backend (demostrable en demo), cinco existen como infraestructura.

### Agrupación por tipo de modificador

| Tipo | Procedure | Invocado desde |
|---|---|---|
| **INSERT transaccional** | `sp_register_user` | `auth/router.py:42` ✅ |
| **INSERT transaccional** | `sp_create_league` | `fantasy/router.py:162` ✅ |
| **INSERT + lock** | `sp_make_draft_pick` | `fantasy/router.py:589` ✅ |
| **UPDATE transaccional** | `sp_update_player_game_stats` | disponible vía psql |
| **UPDATE** | `sp_calculate_fantasy_points` | disponible |
| **DELETE cascada** | `sp_delete_fantasy_team` | disponible |
| **DELETE + audit** | `sp_drop_roster_player` | disponible |
| **DELETE + cascade** | `sp_leave_league` | disponible |
| **Transacción compleja (DELETE+INSERT atómico)** | `sp_free_agent_swap` | disponible |

### Conceptos clave que debes saber explicar

**(a) Por qué los procedures tienen `COMMIT` explícito y no bloque EXCEPTION:**
PostgreSQL no permite `BEGIN…EXCEPTION` junto con `COMMIT` dentro del mismo procedure — los bloques EXCEPTION abren subtransacciones que impiden el control explícito. Por eso el patrón es: ejecutar todos los statements → `COMMIT`. Si cualquier statement falla antes del COMMIT, Postgres hace **ROLLBACK automático** y propaga la excepción al caller (FastAPI la convierte en HTTP 500/409).

**(b) Atomicidad multi-tabla (`sp_create_league`):**
```
INSERT INTO leagues (...) RETURNING league_id → p_league_id;
INSERT INTO league_members (league_id, user_id, 'commissioner');
COMMIT;
```
Si el segundo INSERT falla (por ejemplo, porque el user_id no existe), el primero también se revierte. **Nunca tendrás una liga sin comisionado.**

**(c) Bloqueo en `sp_make_draft_pick`:**
```
PERFORM 1 FROM draft_picks WHERE league_id = $1 FOR UPDATE;
SELECT pick_id WHERE league_id = $1 AND player_id = $2;
IF found THEN RAISE EXCEPTION;
INSERT INTO draft_picks ...;
INSERT INTO roster_players ...;
COMMIT;
```
La protección real es el `UNIQUE(league_id, player_id)` en `draft_picks`. El `FOR UPDATE` serializa los intentos concurrentes. Si dos drafts simultáneos del mismo jugador llegan, uno gana y el otro recibe violación de UNIQUE → rollback automático → HTTP error en el frontend.

**(d) Transacción compleja — `sp_free_agent_swap`:**
Drop + Add en el mismo slot **dentro de una única transacción**. El constraint trigger DEFERRABLE (ver triggers) permite que temporalmente haya dos jugadores en el mismo slot mientras la transacción está abierta; la validación corre al COMMIT.

---

## 7. Triggers (7 triggers, 5 útiles + 2 validadores)

### T1. `trg_sync_fantasy_points` (BEFORE INSERT/UPDATE en `player_game_stats`)
- **Qué hace:** Antes de guardar una fila de stats, llama a `fn_compute_fantasy_pts` y escribe el resultado en `NEW.fantasy_points`.
- **Por qué BEFORE y no AFTER:** Porque queremos **modificar NEW** antes de persistir. AFTER no puede cambiar la fila.
- **Defensa:** *"Garantiza que `fantasy_points` nunca diverja de la fórmula. El backend puede insertar solo los stats base; el trigger calcula el derivado."*

### T2. `trg_sync_team_points_from_stats` (AFTER INSERT/UPDATE/DELETE en `player_game_stats`)
- **Qué hace:** Cuando cambian stats de un jugador, recalcula `total_points` de todos los fantasy_teams que tenían a ese jugador **durante esa fecha de partido** (usando `acquired_at` / `released_at`).
- **Por qué ventanas de tenencia:** Un jugador dropeado en la fecha X no debe otorgar puntos por un partido posterior, y un pickup no debe llevarse puntos retroactivos.

### T3. `trg_sync_team_points_from_roster` (AFTER INSERT/UPDATE/DELETE en `roster_players`)
- **Qué hace:** Cuando el roster cambia, recalcula `total_points` del team afectado.
- Combinado con T2 hace que `fantasy_teams.total_points` sea **siempre consistente**.

### T4. `trg_eliminate_team` (AFTER UPDATE de `is_eliminated` o `eliminated_round` en `nba_teams`)
- **Qué hace:** Inserta una fila en `team_elimination_log` con estado anterior/nuevo y timestamp.
- **Defensa:** *"Es un trigger de auditoría. Cada vez que el admin marca un equipo como eliminado, queda registrado quién/cuándo cambió. No modifica datos, solo los observa."*

### T5. `trg_check_roster_size` (BEFORE INSERT/UPDATE en `roster_players`)
- **Qué hace:** Cuenta jugadores activos del team; si hay ≥ 8, lanza excepción `'Roster lleno'`.
- **Por qué es un trigger y no un CHECK:** Porque un CHECK solo puede mirar la fila que se inserta, no hacer `COUNT(*)` en la misma tabla.

### T6. `trg_check_unique_active_slot` (**CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED**)
- **Qué hace:** Al COMMIT, verifica que no haya dos jugadores activos en el mismo slot del mismo team.
- **Por qué DEFERRABLE:** Para permitir swaps. En `sp_free_agent_swap` marcamos al viejo como released_at=NOW() e insertamos al nuevo en el mismo slot — durante la transacción hay dos entradas en el mismo slot; si el trigger corriera inmediatamente, fallaría. Con DEFERRED, la validación corre al final y la swap se completa atómicamente.
- **Defensa (esta pregunta SÍ o SÍ te la van a hacer):** *"Un constraint trigger diferido permite que las invariantes de integridad se validen al cierre de la transacción en vez de después de cada statement. Eso habilita operaciones multi-paso como swaps sin estados inválidos intermedios ni lógica imperativa."*

### T7. `trg_validate_last_login` (BEFORE UPDATE OF last_login en `users`)
- **Qué hace:** Impide escribir `last_login` futuro. Sanity check.

---

## 8. Autenticación con bcrypt (requisito)

### Flujo de registro
1. Frontend envía `username, email, password, display_name` a `POST /api/auth/register`.
2. Backend hace `bcrypt.hashpw(password.encode(), bcrypt.gensalt())` — genera salt aleatorio por password.
3. Backend invoca `CALL sp_register_user(...)` con el hash.
4. El procedure inserta y commitea.
5. Backend genera JWT firmado con `SECRET_KEY` + HS256, expiración 60 min, payload = `{sub: user_id, username, exp}`.

### Flujo de login
1. Frontend envía `username, password` a `POST /api/auth/login`.
2. Backend hace `SELECT password_hash FROM users WHERE username = $1`.
3. `bcrypt.checkpw(plain, hash)` — comparación constant-time (mitiga timing attacks).
4. Si OK: `UPDATE users SET last_login = NOW()` → dispara `trg_validate_last_login`.
5. Emite JWT.

### Por qué bcrypt y no SHA-256
- **Salt único por password:** dos usuarios con el mismo password tienen hash diferente → rainbow tables inútiles.
- **Cost factor configurable:** bcrypt con cost ≥ 12 tarda ~250 ms por hash → brute force a escala es inviable.
- **Comparación constant-time:** `bcrypt.checkpw` no se corto-circuita en el primer byte distinto → inmune a timing attacks.

### Por qué JWT además de bcrypt
JWT resuelve "cómo autenticar pedidos siguientes sin pedir password cada vez". bcrypt resuelve "cómo guardar el password". Son capas distintas.

---

## 9. Driver de conexión (requisito frontend→backend→DB)

- **Driver:** `asyncpg` (binario, puro Python, PostgreSQL-nativo).
- **Pool:** `asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)` — se reusa entre requests.
- **Flujo:** FastAPI endpoint → `pool.acquire()` → `conn.transaction()` → `conn.fetch/execute` → liberación automática.
- **Parametrización:** todas las queries usan `$1`, `$2` — asyncpg las envía como **prepared statements** → inmunidad a SQL injection.

**Pregunta típica:** *"¿Cómo sabes que tu API es segura contra SQL injection?"*
*R:* *"Nunca concateno input del usuario en strings SQL. Uso placeholders parametrizados de asyncpg, que internamente usan el protocolo extendido de PostgreSQL con prepared statements. El único caso con `f-string` arma nombres de columna desde un allowlist hardcodeado — los valores siempre van parametrizados."*

---

## 10. CRUD desde el frontend (requisito)

Cheat-sheet de qué pantalla ejerce qué modificador:

| Pantalla | INSERT | UPDATE | DELETE |
|---|---|---|---|
| `Register.jsx` | `sp_register_user` (crea user) | — | — |
| `Login.jsx` | — | `UPDATE last_login` | — |
| `Profile.jsx` | — | `UPDATE users SET display_name/email` | — |
| `Leagues.jsx` | `sp_create_league`, join league | `UPDATE leagues SET league_name/max_teams` | `DELETE leagues` (dissolve) |
| `Draft.jsx` | `sp_make_draft_pick` (2 inserts atómicos) | — | — |
| `TeamRoster.jsx` | free agent add | UPDATE roster slot | drop (soft-delete `released_at`) |

**Demo sugerida (7 minutos):**
1. Register → login (ves el JWT).
2. Create league → muestra que creó liga + membership atómicamente.
3. Ve a Draft → pick → muestra que insertó en draft_picks + roster_players.
4. Abre Reports → las 6 vistas llenan secciones.
5. Dissolve league → múltiples DELETE en transacción.

---

## 11. Reportes sobre las vistas (requisito)

La página `Reports.jsx` tiene 6 tarjetas, una por vista:

| Tarjeta | Vista | Endpoint |
|---|---|---|
| Posiciones de liga | `v_league_leaderboard` | `/api/fantasy/leagues/{id}/leaderboard` |
| Promedios de temporada | `v_player_performance` | `/api/players/leaderboard` |
| Rachas hot/cold | `v_hot_cold_players` | `/api/players/hot-cold` |
| Analizador de roster | `v_roster_detail` | `/api/fantasy/teams/{id}/roster` |
| Scoring diario | `v_daily_scoring` | `/api/predictions/daily-scoring` |
| Precisión modelo | `v_prediction_accuracy` | `/api/predictions/accuracy` |

Todos tienen **export CSV** (`downloadCsv` en `Reports.jsx:22`). Eso es buen punto: "los reportes son exportables" → profesor contento.

---

## 12. Dos puntos que sí o sí te van a preguntar

### A. *"¿Por qué PostgreSQL y no MySQL como dice la rúbrica?"*
Respuesta preparada:
> *"PostgreSQL implementa un superset del estándar ANSI-SQL que usa MySQL. Nos permitió usar tipos ENUM nativos (en vez de CHECK con strings), índices parciales (para el roster activo), CONSTRAINT TRIGGERS DEFERRABLE (que habilitan swaps atómicos), y funciones IMMUTABLE como `fn_compute_fantasy_pts`. El modelo lógico — DER, normalización BCNF, dependencias funcionales — es el mismo en ambos motores; el esquema es portable renombrando `GENERATED ALWAYS AS IDENTITY` por `AUTO_INCREMENT` y unos pocos detalles de sintaxis."*

### B. *"¿Dónde está la transaccionalidad? Muéstramelo."*
Dos capas simultáneas:
1. **Procedures con COMMIT explícito** (`sp_register_user`, `sp_create_league`, `sp_make_draft_pick`).
2. **Transacciones FastAPI-side** con `async with conn.transaction()` (para flujos más dinámicos como `dissolve_league` que hace 4 DELETEs).

Abre `fantasy/router.py:364-394` (dissolve_league) y `procedures.sql:78-93` (sp_create_league) uno al lado del otro — cubres ambos estilos.

---

## 13. Cheat sheet de números para mencionar durante la presentación

- **13 tablas** (11 entidades + 3 junctions, menos 1 porque team_elimination_log es auditoría)
- **3 relaciones M:M**, **7 relaciones 1:M**
- **9 tipos ENUM**
- **6 vistas analíticas** (excede el mínimo de 5)
- **8 stored procedures transaccionales**
- **7 triggers** (1 es CONSTRAINT TRIGGER DEFERRABLE)
- **791 jugadores, 3.778 partidos, 88.603 box scores** en datos reales
- **bcrypt + JWT** para auth
- **asyncpg** como driver (pool 2–10 conexiones)

---

## 14. Qué tener abierto físicamente en la defensa

1. Terminal 1: `psql playoff_hoops` — para correr `\d nba_teams`, `\dv`, `\df sp_*`.
2. Terminal 2: backend corriendo.
3. Navegador: frontend en `localhost:5173`.
4. Editor: `schema.sql`, `procedures.sql`, `triggers.sql`, `views.sql` en tabs separados.
5. `docs/DER.pdf` abierto en una ventana aparte.
