# Guion Defensa Final

## Objetivo

Este documento está pensado para practicar la defensa oral del proyecto.  
Incluye:

- un guion de exposición de 5 a 7 minutos,
- preguntas probables del profesor,
- respuestas cortas y defendibles,
- y una estrategia para demo.

---

## 1. Guion Oral de 5 a 7 Minutos

### Apertura

Buenos días.  
Mi proyecto consiste en una aplicación de fantasy basketball enfocada en los playoffs de la NBA.  
Desde la perspectiva de la materia, el punto central no fue solamente construir una interfaz, sino diseñar una base de datos relacional sólida, con integridad, lógica transaccional y reportes útiles para el negocio fantasy.

La idea general del sistema es combinar dos dominios:

- el dominio real de NBA, con equipos, jugadores, partidos y estadísticas,
- y el dominio fantasy, con ligas, miembros, equipos fantasy, draft, rosters y transacciones.

Sobre ese modelo construí reglas de negocio dentro de PostgreSQL usando constraints, procedures, triggers y vistas analíticas.

---

### Modelo de Datos

Primero, el modelo relacional se divide en entidades principales y relaciones intermedias.

Entre las entidades base están:

- `users`
- `nba_teams`
- `players`
- `games`
- `leagues`
- `fantasy_teams`

Luego, las relaciones muchos-a-muchos se resolvieron con tablas intermedias completas, no como simples vínculos.

Por ejemplo:

- `league_members` relaciona usuarios con ligas y además guarda rol y fecha de ingreso,
- `player_game_stats` relaciona jugadores con partidos y guarda estadísticas detalladas,
- `roster_players` relaciona equipos fantasy con jugadores y además guarda slot, estado activo, forma de adquisición y ventana temporal de tenencia.

Eso es importante porque no son relaciones vacías; tienen atributos propios y por eso merecen tablas completas.

---

### Integridad y Reglas del Esquema

El esquema no depende solo del backend para validarse.  
La base de datos impone reglas directamente.

Por ejemplo:

- un usuario no puede tener dos equipos fantasy en la misma liga,
- un fantasy team solo puede existir si el usuario pertenece a esa liga,
- un jugador no puede ser drafteado dos veces en una misma liga,
- un roster no puede tener dos jugadores activos en el mismo slot,
- y el roster mantiene historial de ownership mediante fechas de adquisición y liberación.

Esto se garantiza con:

- claves primarias,
- foráneas,
- restricciones `UNIQUE`,
- `CHECK`,
- `ENUM`,
- e índices parciales.

Entonces, si el backend fallara o hubiera más de un cliente consumiendo la misma base, la integridad seguiría protegida a nivel de PostgreSQL.

---

### Procedures y Lógica Transaccional

Además del esquema, implementé procedures para operaciones transaccionales importantes.

Los tres ejemplos principales que ya se usan en runtime son:

- `sp_register_user`
- `sp_create_league`
- `sp_make_draft_pick`

La idea aquí es que el backend no haga solamente `INSERT` y `UPDATE` sueltos, sino que ciertas operaciones críticas estén encapsuladas en la base de datos como unidades atómicas de negocio.

Por ejemplo:

- al crear una liga, en la misma operación se crea también la membresía del commissioner,
- y al hacer un draft pick, en una misma unidad se registra el pick, se agrega el jugador al roster y se inserta la transacción de tipo `add`.

Eso permite defender que sí existe uso real de modificadores transaccionales dentro del motor de base de datos.

---

### Triggers y Consistencia Automática

También utilicé triggers para mantener consistencia automática.

Uno de los más importantes es el cálculo de `fantasy_points`, que se sincroniza automáticamente cuando cambian las estadísticas de un jugador en un partido.

Otro punto fuerte es el recálculo de `total_points` para los equipos fantasy, tanto cuando cambian estadísticas reales como cuando cambia el roster.  
Eso es importante porque el puntaje fantasy depende no solo del jugador, sino también de si ese jugador pertenecía a ese equipo en ese momento.

También implementé validaciones de tamaño de roster, unicidad de slots activos y auditoría del estado de eliminación de equipos NBA.

Aquí tomé una decisión importante: la eliminación de un equipo NBA no libera automáticamente a un jugador del roster fantasy, porque el estado competitivo real y la propiedad fantasy son conceptos distintos.  
En lugar de alterar ownership, el sistema audita ese cambio en una tabla de log.

---

### Views y Reportes

En la parte analítica, el proyecto incluye varias vistas SQL que responden a casos reales del negocio fantasy.

Entre ellas están:

- ranking de equipos por liga,
- rendimiento agregado de jugadores,
- jugadores hot/cold según tendencia reciente,
- scoring por día,
- y precisión del modelo de predicción mediante MAE.

Estas vistas son importantes porque muestran que la base no es solo transaccional, sino también analítica.  
Además, incluyen agregaciones, CTEs y funciones de ventana como `RANK()` y `ROW_NUMBER()`.

---

### Extensión con Predicción e IA

Como extensión, el sistema incluye tablas como `predictions` y `scouting_reports`.  
No reemplazan el núcleo del proyecto, sino que se apoyan en él.

Estas tablas siguen manteniendo integridad referencial, unicidad y trazabilidad.  
Por ejemplo, las predicciones se pueden comparar con el resultado real mediante la vista `v_prediction_accuracy`, que calcula MAE.

Entonces, incluso la parte de IA y predicción sigue estando integrada correctamente al modelo relacional.

---

### Cierre

En conclusión, el valor principal del proyecto para esta materia está en:

- el diseño del modelo relacional,
- la integridad del esquema,
- la lógica transaccional en PostgreSQL,
- los triggers de consistencia,
- y las vistas analíticas.

El frontend sirve para consumir y demostrar la solución, pero la parte más fuerte del proyecto está en la base de datos y en cómo el backend se apoya en ella para mantener coherencia y trazabilidad.

---

## 2. Preguntas Probables del Profesor

### 1. ¿Por qué `player_game_stats` es una tabla aparte?

Porque modela una relación muchos-a-muchos entre `players` y `games`, y además esa relación tiene atributos propios como puntos, rebotes, asistencias y `fantasy_points`.

---

### 2. ¿Por qué no guardaste las estadísticas en `players`?

Porque las estadísticas no pertenecen al jugador en abstracto, sino a su desempeño en un partido específico.  
Por eso dependen de la combinación jugador-partido.

---

### 3. ¿Qué garantiza que un usuario no tenga dos equipos fantasy en la misma liga?

La restricción `UNIQUE (user_id, league_id)` en `fantasy_teams`.

---

### 4. ¿Por qué `fantasy_teams` referencia a `league_members` con FK compuesta?

Porque no basta con saber usuario y liga por separado.  
La regla de negocio es que un equipo fantasy solo puede existir si ese usuario ya es miembro de esa liga.

---

### 5. ¿Qué evita que un jugador se draftee dos veces?

La restricción `UNIQUE (league_id, player_id)` en `draft_picks`.

---

### 6. ¿Qué evita dos jugadores en el mismo slot activo?

La validación de slots activos a nivel de base de datos, apoyada por índices/reglas y un trigger diferido para permitir swaps en una misma transacción.

---

### 7. ¿Dónde se calcula `fantasy_points`?

En PostgreSQL, mediante una función dedicada, y se sincroniza automáticamente por trigger cuando cambian las estadísticas.

---

### 8. ¿Dónde se recalculan los puntos totales del equipo fantasy?

En triggers que reaccionan tanto a cambios en estadísticas como a cambios en el roster.

---

### 9. ¿Los stored procedures realmente se usan o solo están escritos?

Sí se usan.  
Actualmente se invocan en registro de usuario, creación de liga y draft pick.

---

### 10. ¿Por qué la eliminación de un equipo NBA no libera automáticamente al jugador del roster fantasy?

Porque el ownership fantasy y el estado competitivo real del jugador son conceptos distintos.  
Eliminarlo automáticamente mezclaba dos reglas de negocio que debían mantenerse separadas.

---

### 11. ¿Qué es MAE?

Mean Absolute Error.  
Es el promedio del error absoluto entre la predicción y el valor real.

---

### 12. ¿Qué significa un MAE de 1.9?

Que el modelo se equivoca en promedio por 1.9 fantasy points.

---

### 13. ¿Por qué hay tablas como `predictions` o `scouting_reports` en un proyecto de BD?

Porque son extensiones analíticas/derivadas del modelo principal, pero siguen manteniendo integridad referencial, unicidad y trazabilidad.

---

### 14. ¿Qué ventaja tiene usar triggers en lugar de hacerlo todo desde backend?

Que la consistencia no depende de una sola aplicación cliente.  
La base protege las reglas incluso si en el futuro hubiera otro consumidor o proceso escribiendo datos.

---

### 15. ¿Qué parte consideras más fuerte del proyecto para esta materia?

El diseño relacional, la integridad fuerte del esquema, el uso real de procedures, los triggers de consistencia y las vistas analíticas.

---

## 3. Preguntas Más Difíciles con Respuesta Estratégica

### ¿El draft es completamente seguro frente a concurrencia?

La garantía fuerte la da la base de datos mediante la restricción única sobre `(league_id, player_id)`.  
El procedure agrega validación lógica y unidad transaccional, pero la protección definitiva contra duplicidad la da el constraint.

---

### ¿Por qué no dejaste toda la lógica en backend?

Porque la integridad crítica debe vivir también cerca de los datos.  
El backend orquesta y valida, pero la base debe ser capaz de proteger la consistencia del negocio por sí misma.

---

### ¿Por qué guardas historial en `roster_players` en vez de borrar filas?

Porque necesito trazabilidad y scoring histórico correcto.  
Si borro filas, pierdo evidencia de cuándo un jugador perteneció a un equipo y eso afectaría cálculos y auditoría.

---

### ¿La IA es el centro del proyecto?

No.  
La IA es una capa extendida. El núcleo del proyecto sigue siendo el modelo relacional, la integridad y la lógica de base de datos.

---

## 4. Estrategia para Demo

Orden recomendado para mostrar el proyecto:

1. explicar brevemente el problema del negocio
2. mostrar el modelo relacional
3. enseñar tablas clave
4. enseñar procedures importantes
5. enseñar triggers importantes
6. enseñar vistas y reportes
7. recién después mostrar la app funcionando

Si el profesor pide evidencia concreta, muestra:

- `data/schema.sql`
- `data/procedures.sql`
- `data/triggers.sql`
- `data/views.sql`
- endpoints que llaman `CALL ...`

---

## 5. Qué No Debes Hacer en la Defensa

- no abras hablando primero del frontend
- no vendas la app como si el valor principal fuera la UI
- no pongas la IA como centro del proyecto
- no digas que “todo lo hace Python”
- no digas que el control de concurrencia del draft depende solo del procedure

Lo correcto es:

- primero base de datos
- luego backend como orquestador
- después frontend como interfaz de consumo

---

## 6. Mini Checklist Antes de Exponer

- saber explicar cada tabla principal
- saber explicar al menos 3 relaciones muchos-a-muchos
- saber explicar 3 constraints importantes
- saber explicar 3 procedures reales
- saber explicar 3 triggers reales
- saber explicar 3 vistas reales
- saber definir MAE
- saber justificar por qué la eliminación NBA no altera ownership fantasy

---

## 7. Cierre de Estudio

Si quieres practicar bien, usa este documento así:

1. lee el guion en voz alta
2. cronometra que dure entre 5 y 7 minutos
3. responde las preguntas sin leer
4. vuelve a revisar `guiafinal_cx.md`
5. repite hasta que puedas explicarlo con tus propias palabras
