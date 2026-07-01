-- Folio Web: global identity store
-- No repo-derived content stored here. GitHub is canonical for all repo data.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,        -- internal uuid
  github_id     INTEGER UNIQUE NOT NULL, -- GitHub user id (stable, numeric)
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,        -- opaque session id
  user_id       TEXT NOT NULL REFERENCES users(id),
  expires_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS installations (
  id                TEXT PRIMARY KEY,    -- internal uuid
  user_id           TEXT NOT NULL REFERENCES users(id),
  installation_id   INTEGER NOT NULL,    -- GitHub App installation id
  account_id        INTEGER,             -- GitHub account id (org/user)
  created_at        INTEGER NOT NULL,
  UNIQUE(user_id, installation_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state            TEXT PRIMARY KEY,
  user_id          TEXT,
  code_verifier    TEXT NOT NULL,
  return_to        TEXT,
  expires_at       INTEGER NOT NULL
);
