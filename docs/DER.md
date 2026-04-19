# Playoff Hoops - Diagrama Entidad-Relacion

## DER (Mermaid)

Pegar en https://mermaid.live para visualizar.

```mermaid
erDiagram
    users {
        INT user_id PK
        VARCHAR username UK
        VARCHAR email UK
        VARCHAR password_hash
        VARCHAR display_name
        TIMESTAMP created_at
        TIMESTAMP last_login
    }

    nba_teams {
        INT team_id PK
        VARCHAR abbreviation UK
        VARCHAR full_name
        ENUM conference
        SMALLINT playoff_seed
        BOOLEAN is_eliminated
        SMALLINT eliminated_round
    }

    players {
        INT player_id PK
        VARCHAR first_name
        VARCHAR last_name
        INT team_id FK
        VARCHAR position
        VARCHAR jersey_number
        BOOLEAN is_active
        DECIMAL season_ppg
        DECIMAL season_rpg
        DECIMAL season_apg
    }

    games {
        VARCHAR game_id PK
        DATE game_date
        INT home_team_id FK
        INT away_team_id FK
        INT home_score
        INT away_score
        ENUM status
        SMALLINT playoff_round
        INT series_id
        SMALLINT game_number_in_series
    }

    player_game_stats {
        INT stat_id PK
        INT player_id FK
        VARCHAR game_id FK
        INT minutes_played
        INT points
        INT rebounds
        INT assists
        INT steals
        INT blocks
        INT turnovers
        INT fg_made
        INT fg_attempted
        INT three_made
        INT three_attempted
        INT ft_made
        INT ft_attempted
        INT plus_minus
        DECIMAL fantasy_points
    }

    leagues {
        INT league_id PK
        VARCHAR league_name
        INT created_by FK
        SMALLINT max_teams
        ENUM draft_status
        ENUM scoring_type
        TIMESTAMP created_at
        TIMESTAMP draft_date
    }

    league_members {
        INT member_id PK
        INT league_id FK
        INT user_id FK
        ENUM role
        TIMESTAMP joined_at
    }

    fantasy_teams {
        INT fantasy_team_id PK
        VARCHAR team_name
        INT user_id FK
        INT league_id FK
        DECIMAL total_points
        INT rank_in_league
        TIMESTAMP created_at
    }

    roster_players {
        INT roster_id PK
        INT fantasy_team_id FK
        INT player_id FK
        ENUM roster_slot
        BOOLEAN is_active
        ENUM acquired_via
        TIMESTAMP acquired_at
    }

    draft_picks {
        INT pick_id PK
        INT league_id FK
        INT fantasy_team_id FK
        INT player_id FK
        SMALLINT round_number
        INT pick_number
        TIMESTAMP picked_at
    }

    transactions {
        INT transaction_id PK
        INT fantasy_team_id FK
        INT player_id FK
        ENUM transaction_type
        TIMESTAMP transaction_date
    }

    predictions {
        INT prediction_id PK
        INT player_id FK
        VARCHAR game_id FK
        DECIMAL predicted_points
        DECIMAL predicted_rebounds
        DECIMAL predicted_assists
        DECIMAL predicted_fantasy_pts
        DECIMAL confidence_score
        VARCHAR model_version
        TIMESTAMP created_at
    }

    scouting_reports {
        INT report_id PK
        INT player_id FK
        DATE report_date
        TEXT report_text
        ENUM hot_cold_status
        SMALLINT streak_length
        VARCHAR generated_by
        TIMESTAMP created_at
    }

    %% ===== RELACIONES =====

    %% NBA data layer
    nba_teams ||--o{ players : "tiene"
    nba_teams ||--o{ games : "home_team"
    nba_teams ||--o{ games : "away_team"
    players ||--o{ player_game_stats : "registra"
    games ||--o{ player_game_stats : "contiene"

    %% Fantasy layer
    users ||--o{ leagues : "crea"
    users ||--o{ league_members : "participa"
    leagues ||--o{ league_members : "tiene"
    users ||--o{ fantasy_teams : "posee"
    leagues ||--o{ fantasy_teams : "contiene"
    fantasy_teams ||--o{ roster_players : "alinea"
    players ||--o{ roster_players : "asignado_a"
    fantasy_teams ||--o{ draft_picks : "selecciona"
    leagues ||--o{ draft_picks : "organiza"
    players ||--o{ draft_picks : "elegido_en"
    fantasy_teams ||--o{ transactions : "ejecuta"
    players ||--o{ transactions : "involucrado"

    %% ML/AI layer
    players ||--o{ predictions : "prediccion_de"
    games ||--o{ predictions : "para_juego"
    players ||--o{ scouting_reports : "evaluado_en"
```

## Relaciones M:M con atributos (NO diccionarios)

| Junction | Entidad A | Entidad B | Atributos propios |
|----------|-----------|-----------|-------------------|
| player_game_stats | players | games | 15 attrs: minutes, pts, reb, ast, stl, blk, tov, fg_m/a, 3p_m/a, ft_m/a, +/-, fantasy_pts |
| league_members | users | leagues | role (commissioner/member), joined_at |
| roster_players | fantasy_teams | players | roster_slot (G1/G2/F1/F2/C/UTIL/BN1/BN2), is_active, acquired_via (draft/FA/trade), acquired_at |

## Cardinalidades

| Relacion | Cardinalidad | Descripcion |
|----------|-------------|-------------|
| nba_teams → players | 1:N | Un equipo tiene muchos jugadores |
| nba_teams → games (home) | 1:N | Un equipo juega muchos partidos como local |
| nba_teams → games (away) | 1:N | Un equipo juega muchos partidos como visitante |
| players ↔ games | M:N | Via player_game_stats (15 attrs) |
| users → leagues | 1:N | Un usuario crea muchas ligas |
| users ↔ leagues | M:N | Via league_members (role, joined_at) |
| users → fantasy_teams | 1:N | Un usuario tiene equipos fantasy |
| leagues → fantasy_teams | 1:N | Una liga contiene equipos |
| fantasy_teams ↔ players | M:N | Via roster_players (slot, via, active) |
| leagues → draft_picks | 1:N | Una liga tiene picks de draft |
| fantasy_teams → draft_picks | 1:N | Un equipo hace picks |
| fantasy_teams → transactions | 1:N | Un equipo ejecuta transacciones |
| players → predictions | 1:N | Un jugador tiene predicciones |
| games → predictions | 1:N | Un juego tiene predicciones |
| players → scouting_reports | 1:N | Un jugador tiene reportes |
