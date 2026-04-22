SET search_path = public;

CREATE TABLE IF NOT EXISTS team_elimination_log (
    log_id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id                 INT NOT NULL,
    previous_is_eliminated  BOOLEAN,
    new_is_eliminated       BOOLEAN NOT NULL,
    previous_round          SMALLINT,
    new_round               SMALLINT,
    changed_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_tel_team FOREIGN KEY (team_id) REFERENCES nba_teams(team_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tel_team_changed_at
    ON team_elimination_log(team_id, changed_at DESC);
