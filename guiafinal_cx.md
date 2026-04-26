# Guia Final CX

## Objetivo

Este documento resume, de forma profunda pero defendible, todo lo que debes entender del proyecto desde la perspectiva de la rúbrica de **Bases de Datos**. La idea no es solo describir archivos, sino entender:

- qué problema resuelve cada objeto,
- por qué existe,
- qué regla garantiza,
- cómo se relaciona con el resto del sistema,
- y cómo defenderlo oralmente frente al profesor.

---

## 1. Vista General del Proyecto

El proyecto tiene cuatro capas lógicas:

1. **Capa NBA real**
   - equipos NBA
   - jugadores
   - partidos
   - estadísticas reales por juego

2. **Capa fantasy**
   - ligas
   - miembros de liga
   - equipos fantasy
   - roster
   - draft
   - transacciones

3. **Capa derivada / analítica**
   - fantasy points
   - total_points
   - vistas de ranking y reportes

4. **Capa extendida IA/ML**
   - predicciones
   - scouting reports

La mejor forma de explicarlo en defensa es:

> Primero modelo los datos reales del dominio NBA.  
> Luego construyo el dominio fantasy sobre ese modelo.  
> Después agrego reglas de integridad, lógica transaccional y automatización dentro de PostgreSQL.  
> Finalmente construyo reportes, vistas y extensiones analíticas sobre la base relacional.

---

## 2. Tablas Principales

Las tablas están definidas principalmente en `data/schema.sql`.

### 2.1 `users`

Representa los usuarios del sistema.

Guarda:

- identidad del usuario
- username
- email
- password hash
- último login

Claves importantes:

- `user_id` es PK
- `username` es `UNIQUE`
- `email` es `UNIQUE`

Cómo defenderla:

- separa identidad/autenticación del resto del dominio
- no mezcla datos fantasy ni deportivos con credenciales
- el password no se guarda plano, se guarda como hash

---

### 2.2 `nba_teams`

Representa los equipos reales NBA.

Guarda:

- nombre del equipo
- conferencia
- seed de playoffs
- estado de eliminación
- ronda de eliminación

Cómo defenderla:

- modela el estado competitivo real del torneo
- no representa ownership fantasy
- es clave para saber si un jugador sigue disponible competitivamente

---

### 2.3 `team_elimination_log`

Tabla de auditoría para cambios de eliminación.

Guarda:

- `team_id`
- valor anterior y nuevo de `is_eliminated`
- ronda anterior y nueva
- `changed_at`

Cómo defenderla:

- audita cambios importantes del estado competitivo
- justifica el trigger de eliminación
- muestra uso de auditoría en base de datos

---

### 2.4 `players`

Representa jugadores NBA.

Guarda:

- identidad del jugador
- equipo actual
- posición
- datos base del jugador

Claves:

- FK hacia `nba_teams`

Cómo defenderla:

- es la entidad central del dominio deportivo
- su posición luego se usa en reglas de roster y lineup

---

### 2.5 `games`

Representa partidos de playoffs.

Guarda:

- local y visita
- fecha
- estado del partido
- ronda
- marcador

Cómo defenderla:

- es la dimensión temporal/competitiva del sistema
- conecta el mundo real NBA con scoring fantasy y analítica

---

### 2.6 `player_game_stats`

Esta es una de las tablas más importantes del proyecto.

Qué representa:

- la relación entre un jugador y un partido específico

Por qué no basta con `players` o `games`:

- un jugador participa en muchos partidos
- un partido tiene muchos jugadores
- la relación es **muchos a muchos**

Además, la relación tiene atributos propios:

- puntos
- rebotes
- asistencias
- robos
- bloqueos
- turnovers
- triples
- minutos
- `fantasy_points`

Cómo defenderla:

- es una **tabla asociativa con atributos propios**
- está perfectamente justificada en términos de normalización
- los atributos dependen de la combinación `(player_id, game_id)`, no de solo una tabla padre

Esto te sirve muchísimo si te preguntan por modelo relacional o normalización.

---

### 2.7 `leagues`

Representa ligas fantasy.

Guarda:

- nombre
- creador
- tamaño máximo
- scoring type
- estado del draft

Cómo defenderla:

- encapsula configuración global por liga
- permite múltiples ligas independientes dentro del sistema

---

### 2.8 `league_members`

Tabla intermedia entre `users` y `leagues`.

Representa:

- qué usuarios pertenecen a qué ligas

Por qué es una tabla completa y no solo una FK:

- la relación es muchos a muchos
- además tiene atributos propios:
  - `role`
  - `joined_at`

Cómo defenderla:

- modela la membresía formal del usuario dentro de la liga
- soporta roles como commissioner/member

---

### 2.9 `fantasy_teams`

Representa el equipo fantasy de un usuario dentro de una liga.

Guarda:

- nombre del equipo
- puntos totales
- ranking
- usuario dueño
- liga a la que pertenece

Restricciones importantes:

- `uq_user_league`
- FK compuesta hacia `league_members`

Qué significa eso:

- un usuario solo puede tener un equipo por liga
- un equipo fantasy solo puede existir si ese usuario realmente pertenece a la liga

Cómo defenderla:

- es una excelente muestra de integridad referencial aplicada a reglas de negocio
- la FK compuesta no es redundancia inútil: obliga consistencia entre membresía y ownership fantasy

---

### 2.10 `roster_players`

Otra tabla central del proyecto.

Representa:

- qué jugadores pertenecen al roster de qué equipo fantasy

No es una simple tabla puente. También guarda:

- slot (`G1`, `G2`, `F1`, `F2`, `C`, `UTIL`, `BENCH1`, `BENCH2`)
- si está activo
- cómo fue adquirido
- cuándo fue adquirido
- cuándo fue liberado

Esto es muy importante:

- no borra historial
- guarda la ventana temporal de tenencia

Cómo defenderla:

- permite trazabilidad
- permite scoring histórico correcto
- evita perder información si un jugador entra/sale del roster

Restricciones que debes entender:

- máximo de jugadores activos
- unicidad de jugador activo por equipo
- unicidad de slot activo
- consistencia entre `is_active` y `released_at`

---

### 2.11 `draft_picks`

Representa el historial del draft.

Guarda:

- liga
- fantasy team
- jugador escogido
- ronda
- número global de pick

Restricciones importantes:

- un jugador no puede ser drafteado dos veces en la misma liga
- un número de pick no puede repetirse

Cómo defenderla:

- es el núcleo de integridad del draft
- la garantía fuerte de no duplicidad la da la base de datos, no solo el backend

---

### 2.12 `transactions`

Registra eventos del mundo fantasy.

Tipos comunes:

- add
- drop
- trade

Cómo defenderla:

- sirve como bitácora de cambios
- separa el estado actual del historial de eventos
- aporta trazabilidad y auditoría

---

### 2.13 `predictions`

Tabla derivada para predicciones ML/heurísticas.

Guarda:

- jugador
- juego
- puntos fantasy predichos
- confianza
- versión del modelo

Cómo defenderla:

- no rompe el diseño relacional
- está ligada por FK al dominio principal
- agrega trazabilidad mediante `model_version`
- permite medir precisión con MAE

---

### 2.14 `scouting_reports`

Tabla derivada con reportes generados por IA.

Guarda:

- jugador
- fecha del reporte
- contenido generado

Cómo defenderla:

- es un dato derivado cacheado
- se mantiene normalizado
- evita regeneraciones innecesarias

---

## 3. Normalización y Diseño Relacional

Lo que debes saber explicar:

- las entidades reales están separadas de las entidades fantasy
- las relaciones muchos-a-muchos se modelan con tablas intermedias
- cuando la relación tiene atributos propios, merece una tabla completa
- los datos derivados no se mezclan con los datos base

Ejemplos más fuertes:

- `player_game_stats`
- `league_members`
- `roster_players`

Forma correcta de defenderlo:

> El diseño busca que cada tabla represente una entidad o una relación bien definida, y que sus atributos dependan de su clave.  
> Las relaciones M:M con atributos propios se modelan como tablas completas para preservar normalización y semántica del negocio.

---

## 4. Constraints e Integridad

Esta sección es crítica para la rúbrica.

### 4.1 Tipos de integridad usados

- `PRIMARY KEY`
- `FOREIGN KEY`
- `UNIQUE`
- `CHECK`
- `ENUM`
- índices parciales

### 4.2 Qué debes saber decir

- **PK**: identifica unívocamente cada fila
- **FK**: garantiza integridad referencial
- **UNIQUE**: evita duplicados lógicos
- **CHECK**: valida reglas de dominio
- **ENUM**: restringe valores válidos
- **índice parcial**: mejora rendimiento y puede reforzar reglas sobre subconjuntos de datos

### 4.3 Casos importantes que debes memorizar

- un usuario no puede tener dos equipos fantasy en la misma liga
- un jugador no puede ser pickeado dos veces en una misma liga
- un roster no puede tener dos activos en el mismo slot
- un roster mantiene historial, no elimina evidencia de ownership pasado
- un fantasy team solo puede existir si su usuario es miembro de la liga

---

## 5. Procedures

Definidos en `data/procedures.sql`.

Narrativa correcta:

> Los procedures encapsulan operaciones de negocio transaccionales cerca de los datos.  
> El backend orquesta, valida y expone endpoints, pero la atomicidad importante puede vivir dentro de PostgreSQL.

### 5.1 `fn_compute_fantasy_pts`

Función usada para calcular puntos fantasy.

Reglas base:

- puntos = `1.0`
- rebotes = `1.2`
- asistencias = `1.5`
- robos = `2.0`
- bloqueos = `2.0`
- triples = `0.5`
- pérdidas = `-1.0`

Además:

- bonus por doble-doble
- bonus por triple-doble
- multiplicador por ronda de playoffs

Cómo defenderla:

- centraliza la lógica de scoring
- evita que el cálculo quede duplicado en múltiples lugares

---

### 5.2 `sp_register_user`

Qué hace:

- inserta el usuario
- devuelve `user_id`
- cierra la operación transaccional

Cómo defenderla:

- ejemplo simple de alta transaccional
- hoy ya se invoca desde backend

---

### 5.3 `sp_create_league`

Qué hace:

- crea la liga
- crea la membresía del comisionado
- guarda el `scoring_type`

Qué debes remarcar:

- liga y membership deben crearse juntas o no crearse
- eso es atomicidad

---

### 5.4 `sp_make_draft_pick`

Qué hace:

- inserta el draft pick
- agrega al jugador al roster
- registra transacción de tipo `add`

Qué debes decir con precisión:

- la protección fuerte contra picks duplicados viene de la restricción `UNIQUE`
- el procedure añade validación y unidad transaccional
- no debes vender el locking como si fuera la única defensa

---

### 5.5 Otros procedures relevantes

- `sp_update_player_game_stats`
- `sp_calculate_fantasy_points`
- `sp_delete_fantasy_team`
- `sp_drop_roster_player`
- `sp_leave_league`
- `sp_free_agent_swap`

Cómo defenderlos en conjunto:

- encapsulan reglas de modificación del esquema transaccional
- acercan la lógica de negocio a la base
- permiten demostrar uso real de procedures más allá del archivo `.sql`

---

## 6. Triggers

Definidos en `data/triggers.sql`.

Narrativa correcta:

> Los triggers se usan para mantener consistencia automática de datos derivados y validar reglas que no conviene depender solo del backend.

### 6.1 Trigger de cálculo de `fantasy_points`

Qué hace:

- cuando se insertan o actualizan stats de un jugador en un juego
- recalcula automáticamente `fantasy_points`

Por qué sirve:

- evita inconsistencias
- no depende de que el backend recuerde hacerlo siempre

---

### 6.2 Trigger de recalcular `total_points` desde stats

Qué hace:

- cuando cambian stats de un juego
- recalcula puntos de los equipos fantasy afectados

Por qué es fuerte en defensa:

- toma en cuenta ventanas de ownership
- evita asignar puntos a equipos que ya no poseían al jugador en ese momento

Este es uno de los mejores puntos técnicos del proyecto.

---

### 6.3 Trigger de recalcular `total_points` desde roster

Qué hace:

- si cambia el roster
- actualiza `total_points`

Cómo defenderlo:

- mantiene consistencia entre la composición del roster y el puntaje acumulado

---

### 6.4 Trigger de eliminación NBA

Qué hace ahora:

- registra auditoría en `team_elimination_log` cuando cambia `is_eliminated` o `eliminated_round`

Qué debes aclarar:

- la eliminación de un equipo NBA no libera automáticamente al jugador del roster fantasy
- la propiedad fantasy y el estado competitivo real son conceptos distintos

Esa separación conceptual es muy defendible.

---

### 6.5 Trigger de tamaño máximo de roster

Qué hace:

- impide superar el máximo de jugadores activos

Cómo defenderlo:

- la regla vive en base de datos, no solo en frontend/backend

---

### 6.6 Trigger de unicidad de slot activo

Qué hace:

- impide dos jugadores activos en el mismo slot

Por qué es interesante:

- es diferido
- eso permite swaps dentro de una misma transacción sin fallar a mitad del proceso

Este detalle es muy bueno para impresionar en defensa si lo explicas bien.

---

### 6.7 Trigger de validación de `last_login`

Qué hace:

- evita fechas futuras inválidas

Cómo defenderlo:

- es una validación simple de consistencia temporal

---

## 7. Views

Definidas en `data/views.sql`.

Las vistas son muy importantes porque normalmente la rúbrica pide reportes SQL o evidencia analítica.

### 7.1 `v_league_leaderboard`

Qué hace:

- muestra ranking de equipos fantasy dentro de cada liga

Aspecto técnico defendible:

- usa `RANK()`

Qué demuestra:

- uso de window functions
- reporte de negocio real

---

### 7.2 `v_player_performance`

Qué hace:

- resume rendimiento agregado por jugador

Qué demuestra:

- agregación analítica sobre datos base

---

### 7.3 `v_hot_cold_players`

Qué hace:

- compara el rendimiento reciente del jugador frente a su promedio
- clasifica en `hot`, `cold` o `neutral`

Aspectos técnicos defendibles:

- CTE
- `ROW_NUMBER()`
- comparación entre tendencia reciente y promedio histórico

---

### 7.4 `v_roster_detail`

Qué hace:

- presenta detalle enriquecido del roster fantasy actual

Qué demuestra:

- composición útil para consumo por backend/frontend

---

### 7.5 `v_daily_scoring`

Qué hace:

- resume scoring por juego y por fecha

Qué demuestra:

- reglas analíticas expresadas directamente en SQL

---

### 7.6 `v_prediction_accuracy`

Qué hace:

- compara predicción vs resultado real
- calcula MAE

Qué es MAE:

- `Mean Absolute Error`
- `AVG(ABS(prediccion - resultado_real))`

Interpretación:

- `0` es perfecto
- mientras más bajo, mejor
- un valor como `1.9` significa error promedio de 1.9 fantasy points

Esto te sirve si te preguntan por la sección de reportes.

---

## 8. Flujo Backend -> Base de Datos

Esta parte también debes saberla explicar.

### 8.1 Registro de usuario

Flujo:

1. el frontend manda request
2. FastAPI valida
3. se hashea la contraseña
4. backend llama `CALL sp_register_user(...)`
5. PostgreSQL inserta y devuelve `user_id`

Qué defender:

- el backend no hace solo `INSERT` suelto
- ya existe uso real de procedure

---

### 8.2 Crear liga

Flujo:

1. frontend manda datos de nueva liga
2. backend valida al usuario
3. backend llama `CALL sp_create_league(...)`
4. PostgreSQL crea liga y membresía del commissioner en una sola unidad transaccional

Qué defender:

- es un ejemplo claro de atomicidad

---

### 8.3 Draft pick

Flujo:

1. backend valida estado del draft, ownership del equipo y elegibilidad del jugador
2. calcula slot
3. llama `CALL sp_make_draft_pick(...)`
4. PostgreSQL registra pick, roster y transacción

Cómo decirlo bien:

> frontend -> FastAPI -> asyncpg -> CALL procedure -> PostgreSQL -> commit

---

## 9. IA/ML dentro de un Proyecto de BD

Esto puede salir en defensa.

Qué debes decir:

- el núcleo del proyecto sigue siendo relacional
- `predictions` y `scouting_reports` son extensiones derivadas
- ambas mantienen integridad referencial
- ambas usan claves y restricciones consistentes

Forma correcta de defenderlo:

> No reemplazan la base de datos relacional; la extienden con datos derivados y analíticos manteniendo integridad, trazabilidad y versionado.

---

## 10. Preguntas Probables del Profesor

### 1. ¿Por qué `player_game_stats` es una tabla aparte?

Porque modela una relación muchos-a-muchos entre jugador y partido, y además esa relación tiene atributos propios como puntos, rebotes y fantasy points.

### 2. ¿Dónde garantizas que un usuario no tenga dos equipos en la misma liga?

Con la restricción `UNIQUE` en `fantasy_teams` sobre `(user_id, league_id)`.

### 3. ¿Por qué `fantasy_teams` tiene FK compuesta a `league_members`?

Para asegurar que un equipo fantasy solo pueda existir si ese usuario realmente es miembro de esa liga.

### 4. ¿Qué evita que un jugador se draftee dos veces?

La restricción `UNIQUE (league_id, player_id)` en `draft_picks`.

### 5. ¿Qué evita dos jugadores en el mismo slot activo?

Las reglas de unicidad/validación sobre slots activos y el trigger diferido correspondiente.

### 6. ¿Dónde se calcula `fantasy_points`?

En PostgreSQL, mediante `fn_compute_fantasy_pts`, y se sincroniza automáticamente por trigger.

### 7. ¿Dónde se recalculan los puntos totales del equipo fantasy?

En triggers que reaccionan a cambios en stats y roster.

### 8. ¿Los procedures realmente se usan en runtime?

Sí, al menos en registro, creación de liga y draft pick.

### 9. ¿Por qué no se libera automáticamente a un jugador cuando su equipo NBA queda eliminado?

Porque la propiedad fantasy y la disponibilidad competitiva real son conceptos distintos. La eliminación afecta disponibilidad, no ownership.

### 10. ¿Por qué existen `predictions` y `scouting_reports` en un proyecto de bases de datos?

Porque son tablas derivadas con valor analítico, integradas al modelo relacional por FK, unicidad y trazabilidad.

---

## 11. Respuestas Cortas para Conceptos Clave

### ¿Qué es MAE?

Error absoluto medio entre predicción y realidad.

### ¿Qué significa un MAE de 1.9?

Que el modelo se equivoca en promedio por 1.9 fantasy points.

### ¿Qué significa `Ganancia proyectada = 0.0`?

Que la alineación sugerida y la alineación actual proyectan el mismo total.

### ¿Qué significa `0 fuera de posición, 0 sin rival activo`?

Que la alineación sugerida no rompe reglas de slots y todos los titulares recomendados tienen rival/disponibilidad competitiva.

---

## 12. Qué Debes Memorizar Sí o Sí

- `player_game_stats` es una M:M con atributos propios
- `league_members` es una M:M con atributos propios
- `roster_players` guarda estado actual e historial
- `fantasy_points` se calculan con función en PostgreSQL
- `total_points` se recalculan con triggers
- el draft evita duplicados con constraints, no solo con backend
- `fantasy_teams` usa integridad referencial fuerte con FK compuesta
- los procedures clave ya se usan realmente desde backend
- las vistas cubren ranking, rendimiento, tendencia, scoring y precisión del modelo
- la eliminación NBA no altera ownership fantasy; ahora se audita

---

## 13. Cómo Estudiarlo

Orden recomendado:

1. `data/schema.sql`
2. `data/procedures.sql`
3. `data/triggers.sql`
4. `data/views.sql`
5. flujos del backend de register, create league y make draft pick

No intentes memorizar cada línea. Enfócate en:

- qué problema resuelve cada objeto
- qué integridad garantiza
- qué pasaría si no existiera

---

## 14. Fórmula de Defensa Oral

Si el profesor te pregunta por cualquier objeto, responde con esta estructura:

1. **Para qué existe**
2. **Qué regla o problema resuelve**
3. **Cómo se relaciona con otros objetos**
4. **Qué evidencia concreta hay en el esquema/procedure/trigger/view**

Ejemplo:

> `roster_players` existe para modelar la relación entre fantasy team y jugador, pero además guarda slot, adquisición y ventana temporal de tenencia.  
> Eso permite scoring histórico correcto y trazabilidad.  
> Se relaciona con `fantasy_teams`, `players` y los triggers de recalculo de puntos.

---

## 15. Conclusión

La fortaleza real del proyecto, desde la perspectiva de la rúbrica de Bases de Datos, está en:

- el modelo relacional
- la integridad fuerte
- los procedures transaccionales
- los triggers de consistencia
- las vistas analíticas
- la separación correcta entre estado NBA real y lógica fantasy

La estrategia correcta para la defensa es no vender primero la UI ni la IA.  
Primero debes vender:

1. modelo de datos
2. integridad
3. lógica en PostgreSQL
4. reportes/vistas
5. backend como orquestador

Y solo después, si hace falta, mostrar la parte visual o la capa IA como extensión.
