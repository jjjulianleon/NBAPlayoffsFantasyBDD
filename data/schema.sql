-- =============================================================
-- Playoff Hoops — Schema (PostgreSQL 16)
-- Universidad San Francisco de Quito — CMP 4002 Bases de Datos
-- BCNF compliant. 10 entity tables + 3 M:M junction tables.
-- =============================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
SET search_path = public;

-- =============================================================
-- ENUM TYPES
-- =============================================================
CREATE TYPE conference_enum    AS ENUM ('East', 'West');
CREATE TYPE game_status_enum   AS ENUM ('scheduled', 'live', 'final');
CREATE TYPE draft_status_enum  AS ENUM ('pending', 'in_progress', 'completed');
CREATE TYPE scoring_type_enum  AS ENUM ('points', 'categories');
CREATE TYPE member_role_enum   AS ENUM ('commissioner', 'member');
CREATE TYPE roster_slot_enum   AS ENUM ('G1', 'G2', 'F1', 'F2', 'C', 'UTIL', 'BN1', 'BN2');
CREATE TYPE acquired_via_enum  AS ENUM ('draft', 'free_agent', 'trade');
CREATE TYPE txn_type_enum      AS ENUM ('add', 'drop', 'trade');
CREATE TYPE streak_status_enum AS ENUM ('hot', 'neutral', 'cold');

-- =============================================================
-- 1. USERS  (autenticación y perfil)
-- =============================================================
CREATE TABLE users (
    user_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username       VARCHAR(50)  UNIQUE NOT NULL,
    email          VARCHAR(100) UNIQUE NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,           -- bcrypt
    display_name   VARCHAR(100),
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_login     TIMESTAMP
);

-- =============================================================
-- 2. NBA_TEAMS  (equipos NBA reales)
-- =============================================================
CREATE TABLE nba_teams (
    team_id          INT PRIMARY KEY,                -- ID oficial NBA
    abbreviation     VARCHAR(3)   NOT NULL UNIQUE,
    full_name        VARCHAR(100) NOT NULL,
    conference       conference_enum NOT NULL,
    playoff_seed     SMALLINT,
    is_eliminated    BOOLEAN NOT NULL DEFAULT FALSE,
    eliminated_round SMALLINT,
    CONSTRAINT chk_seed CHECK (playoff_seed BETWEEN 1 AND 16),
    CONSTRAINT chk_round CHECK (eliminated_round BETWEEN 1 AND 4)
);

-- =============================================================
-- 3. PLAYERS  (jugadores NBA)
-- =============================================================
CREATE TABLE players (
    player_id      INT PRIMARY KEY,                  -- ID oficial NBA
    first_name     VARCHAR(50) NOT NULL,
    last_name      VARCHAR(50) NOT NULL,
    team_id        INT NOT NULL,
    position       VARCHAR(5) NOT NULL,              -- G, F, C, G-F, F-C
    jersey_number  VARCHAR(3),
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    season_ppg     DECIMAL(5,2) NOT NULL DEFAULT 0,
    season_rpg     DECIMAL(5,2) NOT NULL DEFAULT 0,
    season_apg     DECIMAL(5,2) NOT NULL DEFAULT 0,
    CONSTRAINT fk_player_team FOREIGN KEY (team_id)
        REFERENCES nba_teams(team_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX idx_players_team ON players(team_id);

-- =============================================================
-- 4. GAMES  (partidos NBA de playoff)
-- =============================================================
CREATE TABLE games (
    game_id              VARCHAR(20) PRIMARY KEY,    -- ID oficial NBA
    game_date            DATE NOT NULL,
    home_team_id         INT NOT NULL,
    away_team_id         INT NOT NULL,
    home_score           INT NOT NULL DEFAULT 0,
    away_score           INT NOT NULL DEFAULT 0,
    status               game_status_enum NOT NULL DEFAULT 'scheduled',
    playoff_round        SMALLINT NOT NULL,          -- 1=R1, 2=Semis, 3=ConfFinals, 4=Finals
    series_id            INT,
    game_number_in_series SMALLINT,
    CONSTRAINT chk_round_range CHECK (playoff_round BETWEEN 1 AND 4),
    CONSTRAINT chk_distinct_teams CHECK (home_team_id <> away_team_id),
    CONSTRAINT fk_game_home FOREIGN KEY (home_team_id) REFERENCES nba_teams(team_id),
    CONSTRAINT fk_game_away FOREIGN KEY (away_team_id) REFERENCES nba_teams(team_id)
);
CREATE INDEX idx_games_date ON games(game_date);
CREATE INDEX idx_games_round ON games(playoff_round);

-- =============================================================
-- 5. PLAYER_GAME_STATS  [JUNCTION M:M players <-> games]
--    NO es diccionario: 15 atributos propios estadísticos
-- =============================================================
CREATE TABLE player_game_stats (
    stat_id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id        INT NOT NULL,
    game_id          VARCHAR(20) NOT NULL,
    minutes_played   INT NOT NULL DEFAULT 0,
    points           INT NOT NULL DEFAULT 0,
    rebounds         INT NOT NULL DEFAULT 0,
    assists          INT NOT NULL DEFAULT 0,
    steals           INT NOT NULL DEFAULT 0,
    blocks           INT NOT NULL DEFAULT 0,
    turnovers        INT NOT NULL DEFAULT 0,
    fg_made          INT NOT NULL DEFAULT 0,
    fg_attempted     INT NOT NULL DEFAULT 0,
    three_made       INT NOT NULL DEFAULT 0,
    three_attempted  INT NOT NULL DEFAULT 0,
    ft_made          INT NOT NULL DEFAULT 0,
    ft_attempted     INT NOT NULL DEFAULT 0,
    plus_minus       INT NOT NULL DEFAULT 0,
    fantasy_points   DECIMAL(7,2) NOT NULL DEFAULT 0,
    CONSTRAINT uq_player_game UNIQUE (player_id, game_id),
    CONSTRAINT fk_pgs_player FOREIGN KEY (player_id) REFERENCES players(player_id),
    CONSTRAINT fk_pgs_game   FOREIGN KEY (game_id)   REFERENCES games(game_id)
);
CREATE INDEX idx_pgs_player ON player_game_stats(player_id);
CREATE INDEX idx_pgs_game   ON player_game_stats(game_id);

-- =============================================================
-- 6. LEAGUES  (ligas fantasy)
-- =============================================================
CREATE TABLE leagues (
    league_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    league_name   VARCHAR(100) NOT NULL,
    created_by    INT NOT NULL,
    max_teams     SMALLINT NOT NULL DEFAULT 8,
    draft_status  draft_status_enum NOT NULL DEFAULT 'pending',
    scoring_type  scoring_type_enum NOT NULL DEFAULT 'points',
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    draft_date    TIMESTAMP,
    CONSTRAINT chk_max_teams CHECK (max_teams BETWEEN 2 AND 10),
    CONSTRAINT fk_league_creator FOREIGN KEY (created_by) REFERENCES users(user_id)
);

-- =============================================================
-- 7. LEAGUE_MEMBERS  [JUNCTION M:M users <-> leagues]
--    NO es diccionario: tiene rol y fecha de unión
-- =============================================================
CREATE TABLE league_members (
    member_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    league_id   INT NOT NULL,
    user_id     INT NOT NULL,
    role        member_role_enum NOT NULL DEFAULT 'member',
    joined_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_league_user UNIQUE (league_id, user_id),
    CONSTRAINT fk_lm_league FOREIGN KEY (league_id) REFERENCES leagues(league_id) ON DELETE CASCADE,
    CONSTRAINT fk_lm_user   FOREIGN KEY (user_id)   REFERENCES users(user_id)
);

-- =============================================================
-- 8. FANTASY_TEAMS  (equipo fantasy: uno por user por liga)
-- =============================================================
CREATE TABLE fantasy_teams (
    fantasy_team_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_name       VARCHAR(100) NOT NULL,
    user_id         INT NOT NULL,
    league_id       INT NOT NULL,
    total_points    DECIMAL(10,2) NOT NULL DEFAULT 0,    -- mantenido por trigger
    rank_in_league  INT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_league UNIQUE (user_id, league_id),
    CONSTRAINT fk_ft_user   FOREIGN KEY (user_id)   REFERENCES users(user_id),
    CONSTRAINT fk_ft_league FOREIGN KEY (league_id) REFERENCES leagues(league_id)
);
CREATE INDEX idx_ft_league ON fantasy_teams(league_id);

-- =============================================================
-- 9. ROSTER_PLAYERS  [JUNCTION M:M fantasy_teams <-> players]
--    NO es diccionario: slot, estado, origen, fecha
-- =============================================================
CREATE TABLE roster_players (
    roster_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fantasy_team_id  INT NOT NULL,
    player_id        INT NOT NULL,
    roster_slot      roster_slot_enum NOT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    acquired_via     acquired_via_enum NOT NULL DEFAULT 'draft',
    acquired_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_team_player UNIQUE (fantasy_team_id, player_id),
    CONSTRAINT fk_rp_team   FOREIGN KEY (fantasy_team_id) REFERENCES fantasy_teams(fantasy_team_id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_player FOREIGN KEY (player_id)       REFERENCES players(player_id)
);
CREATE INDEX idx_rp_team ON roster_players(fantasy_team_id);

-- =============================================================
-- 10. DRAFT_PICKS  (historial de draft)
-- =============================================================
CREATE TABLE draft_picks (
    pick_id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    league_id        INT NOT NULL,
    fantasy_team_id  INT NOT NULL,
    player_id        INT NOT NULL,
    round_number     SMALLINT NOT NULL,
    pick_number      INT NOT NULL,
    picked_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_league_player UNIQUE (league_id, player_id),
    CONSTRAINT uq_league_pick UNIQUE (league_id, pick_number),
    CONSTRAINT fk_dp_league FOREIGN KEY (league_id)       REFERENCES leagues(league_id) ON DELETE CASCADE,
    CONSTRAINT fk_dp_team   FOREIGN KEY (fantasy_team_id) REFERENCES fantasy_teams(fantasy_team_id) ON DELETE CASCADE,
    CONSTRAINT fk_dp_player FOREIGN KEY (player_id)       REFERENCES players(player_id)
);

-- =============================================================
-- 11. TRANSACTIONS  (log de movimientos de roster)
-- =============================================================
CREATE TABLE transactions (
    transaction_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fantasy_team_id   INT NOT NULL,
    player_id         INT NOT NULL,
    transaction_type  txn_type_enum NOT NULL,
    transaction_date  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_tx_team   FOREIGN KEY (fantasy_team_id) REFERENCES fantasy_teams(fantasy_team_id) ON DELETE CASCADE,
    CONSTRAINT fk_tx_player FOREIGN KEY (player_id)       REFERENCES players(player_id)
);
CREATE INDEX idx_tx_team ON transactions(fantasy_team_id);

-- =============================================================
-- 12. PREDICTIONS  (predicciones ML guardadas)
-- =============================================================
CREATE TABLE predictions (
    prediction_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id             INT NOT NULL,
    game_id               VARCHAR(20) NOT NULL,
    predicted_points      DECIMAL(6,2),
    predicted_rebounds    DECIMAL(5,2),
    predicted_assists     DECIMAL(5,2),
    predicted_fantasy_pts DECIMAL(7,2),
    confidence_score      DECIMAL(4,3),
    model_version         VARCHAR(20) NOT NULL,
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pred_player_game UNIQUE (player_id, game_id, model_version),
    CONSTRAINT fk_pred_player FOREIGN KEY (player_id) REFERENCES players(player_id),
    CONSTRAINT fk_pred_game   FOREIGN KEY (game_id)   REFERENCES games(game_id)
);

-- =============================================================
-- 13. SCOUTING_REPORTS  (reportes generados por LLM, cacheados)
-- =============================================================
CREATE TABLE scouting_reports (
    report_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id        INT NOT NULL,
    report_date      DATE NOT NULL,
    report_text      TEXT NOT NULL,
    hot_cold_status  streak_status_enum NOT NULL DEFAULT 'neutral',
    streak_length    SMALLINT NOT NULL DEFAULT 0,
    generated_by     VARCHAR(50) NOT NULL DEFAULT 'claude-haiku-3.5',
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_report_player_date UNIQUE (player_id, report_date),
    CONSTRAINT fk_sr_player FOREIGN KEY (player_id) REFERENCES players(player_id)
);

-- =============================================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- =============================================================
COMMENT ON TABLE users             IS 'Usuarios del sistema con autenticación bcrypt';
COMMENT ON TABLE nba_teams         IS 'Equipos NBA reales — fuente: nba_api';
COMMENT ON TABLE players           IS 'Jugadores NBA — fuente: nba_api';
COMMENT ON TABLE games             IS 'Partidos de playoff';
COMMENT ON TABLE player_game_stats IS 'Junction M:M players<->games con 15 atributos estadísticos';
COMMENT ON TABLE leagues           IS 'Ligas fantasy creadas por usuarios';
COMMENT ON TABLE league_members    IS 'Junction M:M users<->leagues con rol y fecha';
COMMENT ON TABLE fantasy_teams     IS 'Equipo fantasy de un usuario en una liga';
COMMENT ON TABLE roster_players    IS 'Junction M:M fantasy_teams<->players con slot y origen';
COMMENT ON TABLE draft_picks       IS 'Historial inmutable de picks del draft';
COMMENT ON TABLE transactions      IS 'Log de altas/bajas/trades de roster';
COMMENT ON TABLE predictions       IS 'Predicciones del modelo XGBoost';
COMMENT ON TABLE scouting_reports  IS 'Reportes natural-language generados por Claude Haiku';
